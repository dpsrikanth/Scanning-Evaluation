import { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { ShieldCheck, AlertCircle, GraduationCap } from 'lucide-react';
import { api } from '../services/api';
import './AuthPages.css';

export default function VerifyOtp() {
  const [otp, setOtp]         = useState(['','','','','','']);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError]     = useState('');
  const inputRefs = useRef([]);
  const navigate = useNavigate();
  const { state } = useLocation();

  useEffect(() => {
    if (!state?.userId) navigate('/forgot-password');
    inputRefs.current[0]?.focus();
  }, []);

  const handleChange = (idx, val) => {
    if (!/^\d?$/.test(val)) return;
    const next = [...otp]; next[idx] = val; setOtp(next);
    if (val && idx < 5) inputRefs.current[idx + 1]?.focus();
  };

  const handleKeyDown = (idx, e) => {
    if (e.key === 'Backspace' && !otp[idx] && idx > 0) inputRefs.current[idx - 1]?.focus();
  };

  const handleSubmit = async e => {
    e.preventDefault();
    const code = otp.join('');
    if (code.length < 6) { setError('Enter the full 6-digit OTP'); return; }
    setError(''); setLoading(true);
    try {
      const data = await api.auth.verifyOtp(state.userId, code);
      navigate('/reset-password', { state: { resetToken: data.resetToken } });
    } catch (err) {
      setError(err.message);
    } finally { setLoading(false); }
  };

  const handleResend = async () => {
    setResending(true);
    try {
      await api.auth.forgotPassword(state.email);
      setOtp(['','','','','','']);
      setError('');
      alert('A new OTP has been sent.');
    } catch (err) { setError(err.message); }
    finally { setResending(false); }
  };

  const filled = otp.filter(Boolean).length;

  return (
    <div className="auth-page">
      <div className="auth-side">
        <div className="auth-side-content">
          <div className="auth-side-logo"><GraduationCap size={36} /></div>
          <h2>OTP Verification</h2>
          <p>A 6-digit code was sent to your registered email address. Enter it to continue.</p>
        </div>
      </div>

      <div className="auth-main">
        <div className="auth-card">
          <div className="auth-card-header">
            <div className="auth-icon-wrap" style={{ background: 'linear-gradient(135deg,#7c3aed,#a78bfa)' }}>
              <ShieldCheck size={24} />
            </div>
            <h1>Enter OTP</h1>
            <p>Sent to <strong>{state?.email}</strong></p>
          </div>

          {error && <div className="auth-error"><AlertCircle size={14} /> {error}</div>}

          <form onSubmit={handleSubmit} className="auth-form">
            <p className="otp-hint">Enter the 6-digit code from your email</p>

            <div className="otp-boxes">
              {otp.map((d, i) => (
                <input key={i} ref={el => { inputRefs.current[i] = el; }}
                  type="text" inputMode="numeric" maxLength={1} value={d}
                  className={`otp-box ${d ? 'filled' : ''}`}
                  onChange={e => handleChange(i, e.target.value)}
                  onKeyDown={e => handleKeyDown(i, e)}
                />
              ))}
            </div>

            <div className="otp-progress">
              <div className="otp-prog-bar" style={{ width: `${(filled / 6) * 100}%` }} />
            </div>

            <button type="submit" className="auth-submit" disabled={loading || filled < 6}>
              {loading ? 'Verifying…' : 'Verify OTP'}
            </button>
          </form>

          <div className="auth-resend">
            Didn't receive it?&nbsp;
            <button onClick={handleResend} disabled={resending}>
              {resending ? 'Resending…' : 'Resend OTP'}
            </button>
          </div>

          <div className="auth-footer">
            <Link to="/forgot-password">← Change email</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
