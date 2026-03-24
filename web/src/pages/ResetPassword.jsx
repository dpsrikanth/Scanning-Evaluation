import { useState, useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { KeyRound, Lock, Eye, EyeOff, AlertCircle, CheckCircle2, GraduationCap } from 'lucide-react';
import { api } from '../services/api';
import './AuthPages.css';

export default function ResetPassword() {
  const [newPassword, setNew] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow]       = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const [done, setDone]       = useState(false);
  const navigate = useNavigate();
  const { state } = useLocation();

  useEffect(() => { if (!state?.resetToken) navigate('/forgot-password'); }, []);

  const handleSubmit = async e => {
    e.preventDefault(); setError('');
    if (newPassword !== confirm) { setError('Passwords do not match'); return; }
    if (newPassword.length < 8)  { setError('Password must be at least 8 characters'); return; }
    setLoading(true);
    try {
      await api.auth.resetPassword(state.resetToken, newPassword);
      setDone(true);
      setTimeout(() => navigate('/login'), 2500);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };

  return (
    <div className="auth-page">
      <div className="auth-side">
        <div className="auth-side-content">
          <div className="auth-side-logo"><GraduationCap size={36} /></div>
          <h2>Set New Password</h2>
          <p>Choose a strong password with at least 8 characters including letters and numbers.</p>
        </div>
      </div>

      <div className="auth-main">
        <div className="auth-card">
          {done ? (
            <div className="auth-success">
              <div className="auth-success-icon"><CheckCircle2 size={30} /></div>
              <h3>Password Reset!</h3>
              <p>A confirmation email has been sent. Redirecting to login…</p>
            </div>
          ) : (
            <>
              <div className="auth-card-header">
                <div className="auth-icon-wrap" style={{ background: 'linear-gradient(135deg,#0d6e4a,#059669)' }}>
                  <KeyRound size={24} />
                </div>
                <h1>New Password</h1>
                <p>Set your new account password</p>
              </div>

              {error && <div className="auth-error"><AlertCircle size={14} /> {error}</div>}

              <form onSubmit={handleSubmit} className="auth-form">
                <div className="auth-field">
                  <label>New Password</label>
                  <div className="input-wrap">
                    <Lock size={15} className="input-icon" />
                    <input type={show ? 'text' : 'password'} value={newPassword}
                      onChange={e => setNew(e.target.value)} minLength={8}
                      placeholder="Minimum 8 characters" required autoFocus />
                    <button type="button" className="input-eye" onClick={() => setShow(v => !v)}>
                      {show ? <EyeOff size={15}/> : <Eye size={15}/>}
                    </button>
                  </div>
                </div>

                <div className="auth-field">
                  <label>Confirm Password</label>
                  <div className="input-wrap">
                    <Lock size={15} className="input-icon" />
                    <input type="password" value={confirm}
                      onChange={e => setConfirm(e.target.value)}
                      placeholder="Re-enter password" required />
                  </div>
                </div>

                <p className="pwd-hint">At least 8 characters · Mix of letters and numbers recommended</p>

                <button type="submit" className="auth-submit" disabled={loading}>
                  {loading ? 'Saving…' : 'Set New Password'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
