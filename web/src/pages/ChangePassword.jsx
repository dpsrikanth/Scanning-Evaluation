import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { KeyRound, Lock, Eye, EyeOff, AlertCircle, ShieldAlert, CheckCircle2, GraduationCap } from 'lucide-react';
import { api } from '../services/api';
import './AuthPages.css';

export default function ChangePassword() {
  const [params] = useSearchParams();
  const isForced = params.get('force') === '1';
  const [form, setForm]       = useState({ current: '', next: '', confirm: '' });
  const [showNew, setShowNew] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const [done, setDone]       = useState(false);
  const navigate = useNavigate();

  // Allow first-time login (force=1) or already logged-in users; otherwise redirect to login
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) navigate('/login', { replace: true });
  }, [navigate]);

  const set = f => e => setForm({ ...form, [f]: e.target.value });

  const handleSubmit = async e => {
    e.preventDefault(); setError('');
    if (form.next !== form.confirm) { setError('New passwords do not match'); return; }
    if (form.next.length < 8)      { setError('Password must be at least 8 characters'); return; }
    setLoading(true);
    try {
      await api.auth.changePassword(form.current, form.next);
      const user = JSON.parse(localStorage.getItem('user') || '{}');
      user.userStatus = 'Active';
      localStorage.setItem('user', JSON.stringify(user));
      setDone(true);
      setTimeout(() => navigate('/'), 2000);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };

  return (
    <div className="auth-page">
      <div className="auth-side">
        <div className="auth-side-content">
          <div className="auth-side-logo"><GraduationCap size={36} /></div>
          <h2>{isForced ? 'Action Required' : 'Change Password'}</h2>
          <p>{isForced
            ? 'Your account was created with a temporary password. Please set a permanent password to continue.'
            : 'Choose a strong password to keep your account secure.'}</p>
        </div>
      </div>

      <div className="auth-main">
        <div className="auth-card">
          {done ? (
            <div className="auth-success">
              <div className="auth-success-icon"><CheckCircle2 size={30} /></div>
              <h3>Password Updated!</h3>
              <p>Redirecting to dashboard…</p>
            </div>
          ) : (
            <>
              <div className="auth-card-header">
                <div className="auth-icon-wrap" style={{ background: isForced ? 'linear-gradient(135deg,#d97706,#fbbf24)' : 'linear-gradient(135deg,#0d6e4a,#059669)' }}>
                  {isForced ? <ShieldAlert size={24} /> : <KeyRound size={24} />}
                </div>
                <h1>{isForced ? 'Set Your Password' : 'Change Password'}</h1>
                <p>{isForced ? 'Required before you can continue' : 'Update your account password'}</p>
              </div>

              {isForced && (
                <div className="auth-notice">
                  <ShieldAlert size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                  Your account is currently in <strong>Pending</strong> status. Changing your password will activate it.
                </div>
              )}

              {error && <div className="auth-error"><AlertCircle size={14} /> {error}</div>}

              <form onSubmit={handleSubmit} className="auth-form">
                <div className="auth-field">
                  <label>Current / Temporary Password</label>
                  <div className="input-wrap">
                    <Lock size={15} className="input-icon" />
                    <input type="password" value={form.current} onChange={set('current')}
                      placeholder="Enter current password" required autoFocus />
                  </div>
                </div>

                <div className="auth-field">
                  <label>New Password</label>
                  <div className="input-wrap">
                    <Lock size={15} className="input-icon" />
                    <input type={showNew ? 'text' : 'password'} value={form.next} onChange={set('next')}
                      placeholder="Minimum 8 characters" minLength={8} required />
                    <button type="button" className="input-eye" onClick={() => setShowNew(v => !v)}>
                      {showNew ? <EyeOff size={15}/> : <Eye size={15}/>}
                    </button>
                  </div>
                </div>

                <div className="auth-field">
                  <label>Confirm New Password</label>
                  <div className="input-wrap">
                    <Lock size={15} className="input-icon" />
                    <input type="password" value={form.confirm} onChange={set('confirm')}
                      placeholder="Re-enter new password" required />
                  </div>
                </div>

                <button type="submit" className="auth-submit" disabled={loading}>
                  {loading ? 'Saving…' : 'Change Password'}
                </button>
              </form>

              {!isForced && (
                <div className="auth-footer">
                  <Link to="/">← Back to Dashboard</Link>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
