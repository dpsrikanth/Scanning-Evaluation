import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { GraduationCap, User, Lock, Eye, EyeOff, ArrowRight, AlertCircle } from 'lucide-react';
import { api } from '../services/api';
import SessionContextModal from '../components/SessionContextModal';
import './AuthPages.css';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd]         = useState(false);
  const [error, setError]             = useState('');
  const [loading, setLoading]         = useState(false);
  const [showSession, setShowSession] = useState(false);
  const [pendingNav, setPendingNav]   = useState(null);
  const [scanStaffLogin, setScanStaffLogin] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async e => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const u = username.trim();
      const p = password.trim();
      if (!u) {
        setError('Enter your username.');
        setLoading(false);
        return;
      }
      const data = await api.auth.login(u, p, scanStaffLogin ? 'scan' : 'eval');
      const user = data.user || {};
      if (user.roloName != null && user.roleName == null) user.roleName = user.roloName;
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(user));
      if (data.forcePasswordChange) {
        navigate('/change-password?force=1');
      } else if (user.source === 'scan' && ['VendorQC', 'CustomerQC', 'Operator', 'Admin'].includes(user.roleName)) {
        navigate('/scan-qc');
      } else if (user.roleName === 'Evaluator') {
        // Evaluators go through the session setup (with camera + location)
        setPendingNav('/');
        setShowSession(true);
      } else {
        // Admins, HeadEvaluators, and other roles bypass session setup
        navigate('/');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
    {showSession && (
      <SessionContextModal onComplete={() => { setShowSession(false); navigate(pendingNav || '/'); }} />
    )}
    <div className="auth-page">
      <div className="auth-side">
        <div className="auth-side-content">
          <div className="auth-side-logo"><GraduationCap size={36} /></div>
          <h2>Scanning &amp; Evaluation System</h2>
          <p>A comprehensive platform for managing answer sheet scanning and evaluation workflows.</p>
          <ul className="auth-features">
            {['ADF-based scanner integration','Annotation &amp; marking tools','Head evaluator assignment portal','MIS reports &amp; analytics'].map(f => (
              <li key={f} dangerouslySetInnerHTML={{ __html: `<span>✓</span> ${f}` }} />
            ))}
          </ul>
        </div>
      </div>

      <div className="auth-main">
        <div className="auth-card">
          <div className="auth-card-header">
            <div className="auth-icon-wrap">
              <GraduationCap size={24} />
            </div>
            <h1>Welcome back</h1>
            <p>Admin, head evaluator, and evaluator sign-in. Leave the option below off unless you use the scan-station / QC portal.</p>
          </div>

          {error && (
            <div className="auth-error">
              <AlertCircle size={14} /> {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="auth-form">
            <div className="auth-field">
              <label>Username</label>
              <div className="input-wrap">
                <User size={15} className="input-icon" />
                <input
                  type="text" value={username}
                  onChange={e => setUsername(e.target.value)}
                  placeholder="Enter your username"
                  required autoFocus
                />
              </div>
            </div>

            <div className="auth-field">
              <label>Password</label>
              <div className="input-wrap">
                <Lock size={15} className="input-icon" />
                <input
                  type={showPwd ? 'text' : 'password'} value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  required
                />
                <button type="button" className="input-eye" onClick={() => setShowPwd(v => !v)}>
                  {showPwd ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            <label className="auth-scan-toggle" title="Evaluation accounts (incl. admin) use the main database. Checking this uses the scanner database only.">
              <input
                type="checkbox"
                checked={scanStaffLogin}
                onChange={(e) => setScanStaffLogin(e.target.checked)}
              />
              <span>Scanner staff (operator / vendor QC / customer QC) — not for evaluation admin</span>
            </label>

            <div className="auth-meta">
              <Link to="/forgot-password" className="auth-link">Forgot password?</Link>
            </div>

            <button type="submit" className="auth-submit" disabled={loading}>
              {loading ? 'Signing in…' : <><span>Sign In</span><ArrowRight size={16} /></>}
            </button>
          </form>

          <div className="auth-footer">
            Head evaluator? <Link to="/head-eval/login">Login here →</Link>
          </div>
        </div>
      </div>
    </div>
    </>
  );
}
