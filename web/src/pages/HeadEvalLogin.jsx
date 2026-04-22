import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ClipboardList, User, Lock, Eye, EyeOff, ArrowRight, AlertCircle, GraduationCap } from 'lucide-react';
import { api } from '../services/api';
import './AuthPages.css';

export default function HeadEvalLogin() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd]   = useState(false);
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async e => {
    e.preventDefault(); setError(''); setLoading(true);
    try {
      const data = await api.auth.login(username, password, 'eval');
      const { roleName } = data.user;
      if (roleName !== 'Admin' && roleName !== 'HeadEvaluator') {
        throw new Error('Access denied — Head Evaluator or Admin role required');
      }
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      if (data.forcePasswordChange) navigate('/change-password?force=1');
      else navigate('/head-eval/assign');
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };

  return (
    <div className="auth-page">
      <div className="auth-side" style={{ background: 'linear-gradient(160deg,#283593 0%,#303F9F 45%,#3F51B5 100%)' }}>
        <div className="auth-side-content">
          <div className="auth-side-logo"><GraduationCap size={36} /></div>
          <h2>Head Evaluator Portal</h2>
          <p>Manage and assign answer booklets to evaluators for your paper lot.</p>
          <ul className="auth-features">
            {['View unassigned booklet lot','Assign to evaluators in bulk','Monitor evaluation progress','View assignment summary'].map(f => (
              <li key={f}><span>✓</span> {f}</li>
            ))}
          </ul>
        </div>
      </div>

      <div className="auth-main">
        <div className="auth-card">
          <div className="auth-card-header">
            <div className="auth-icon-wrap" style={{ background: 'linear-gradient(135deg,#3F51B5,#5C6BC0)' }}>
              <ClipboardList size={24} />
            </div>
            <h1>Head Evaluator Login</h1>
            <p>Sign in with your Head Evaluator or Admin credentials</p>
          </div>

          {error && <div className="auth-error"><AlertCircle size={14} /> {error}</div>}

          <form onSubmit={handleSubmit} className="auth-form">
            <div className="auth-field">
              <label>Username</label>
              <div className="input-wrap">
                <User size={15} className="input-icon" />
                <input type="text" value={username} onChange={e => setUsername(e.target.value)}
                  placeholder="Enter username" required autoFocus />
              </div>
            </div>
            <div className="auth-field">
              <label>Password</label>
              <div className="input-wrap">
                <Lock size={15} className="input-icon" />
                <input type={showPwd ? 'text' : 'password'} value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Enter password" required />
                <button type="button" className="input-eye" onClick={() => setShowPwd(v => !v)}>
                  {showPwd ? <EyeOff size={15}/> : <Eye size={15}/>}
                </button>
              </div>
            </div>
            <button type="submit" className="auth-submit" disabled={loading}
              style={{ background: 'linear-gradient(135deg,#3F51B5,#5C6BC0)' }}>
              {loading ? 'Signing in…' : <><span>Sign In</span><ArrowRight size={16}/></>}
            </button>
          </form>

          <div className="auth-footer">
            Evaluator? <Link to="/login">Go to Evaluator Login →</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
