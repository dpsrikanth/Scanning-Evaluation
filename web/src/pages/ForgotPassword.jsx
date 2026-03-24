import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Mail, ArrowRight, AlertCircle, GraduationCap } from 'lucide-react';
import { api } from '../services/api';
import './AuthPages.css';

export default function ForgotPassword() {
  const [email, setEmail]     = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const navigate = useNavigate();

  const handleSubmit = async e => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await api.auth.forgotPassword(email);
      navigate('/verify-otp', { state: { userId: data.userId, email } });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-side">
        <div className="auth-side-content">
          <div className="auth-side-logo"><GraduationCap size={36} /></div>
          <h2>Password Recovery</h2>
          <p>Enter your registered email and we'll send a 6-digit OTP to reset your password securely.</p>
        </div>
      </div>

      <div className="auth-main">
        <div className="auth-card">
          <div className="auth-card-header">
            <div className="auth-icon-wrap" style={{ background: 'linear-gradient(135deg,#2563eb,#60a5fa)' }}>
              <Mail size={24} />
            </div>
            <h1>Forgot Password</h1>
            <p>We'll send a verification code to your email</p>
          </div>

          {error && <div className="auth-error"><AlertCircle size={14} /> {error}</div>}

          <form onSubmit={handleSubmit} className="auth-form">
            <div className="auth-field">
              <label>Email Address</label>
              <div className="input-wrap">
                <Mail size={15} className="input-icon" />
                <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="you@university.edu" required autoFocus />
              </div>
            </div>

            <button type="submit" className="auth-submit" disabled={loading}>
              {loading ? 'Sending OTP…' : <><span>Send OTP</span><ArrowRight size={16} /></>}
            </button>
          </form>

          <div className="auth-footer">
            <Link to="/login">← Back to Login</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
