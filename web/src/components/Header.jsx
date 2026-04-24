import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Settings, User, KeyRound, LogOut, ChevronDown,
  Timer, Bell, GraduationCap, Menu,
} from 'lucide-react';
import { useSidebar } from '../contexts/SidebarContext';
import { api } from '../services/api';
import './Header.css';

function useCurrentUser() {
  try { return JSON.parse(localStorage.getItem('user') || 'null'); } catch { return null; }
}

function SessionTimer() {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setSeconds(s => s + 1), 1000);
    return () => clearInterval(id);
  }, []);
  const hh = String(Math.floor(seconds / 3600)).padStart(2, '0');
  const mm = String(Math.floor((seconds % 3600) / 60)).padStart(2, '0');
  const ss = String(seconds % 60).padStart(2, '0');
  return (
    <div className="header-timer">
      <Timer size={13} />
      <span>{hh}:{mm}:{ss}</span>
    </div>
  );
}

export default function Header() {
  const { toggle: toggleSidebar } = useSidebar();
  const [menuOpen, setMenuOpen] = useState(false);
  const [showChangePwd, setShowChangePwd] = useState(false);
  const [pwdForm, setPwdForm] = useState({ current: '', next: '', confirm: '' });
  const [pwdError, setPwdError] = useState('');
  const [pwdLoading, setPwdLoading] = useState(false);
  const menuRef = useRef(null);
  const navigate = useNavigate();
  const location = useLocation();
  const user = useCurrentUser();

  useEffect(() => {
    const handler = e => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');
  };

  const handleChangePassword = async e => {
    e.preventDefault();
    setPwdError('');
    if (pwdForm.next !== pwdForm.confirm) { setPwdError('New passwords do not match'); return; }
    if (pwdForm.next.length < 8) { setPwdError('Password must be at least 8 characters'); return; }
    setPwdLoading(true);
    try {
      await api.auth.changePassword(pwdForm.current, pwdForm.next);
      setShowChangePwd(false);
      setPwdForm({ current: '', next: '', confirm: '' });
      alert('Password changed successfully. A confirmation email has been sent.');
    } catch (err) {
      setPwdError(err.message);
    } finally {
      setPwdLoading(false);
    }
  };

  const isEvalPage = location.pathname.startsWith('/evaluate/');
  const initials = user?.fullName?.split(' ').map(w => w[0]).slice(0, 2).join('') || 'U';
  const avatarPhotoUrl = user?.profilePhotoPath ? api.files.profilePhotoUrl(user.profilePhotoPath) : null;

  return (
    <>
      <header className="header">
        <button
          type="button"
          className="header-icon-btn header-menu-btn"
          title="Toggle navigation menu"
          onClick={toggleSidebar}
        >
          <Menu size={18} />
        </button>
        <div className="header-brand">
          <div className="header-logo">
            <GraduationCap size={20} />
          </div>
          <div className="header-brand-text">
            <span className="header-brand-name">Technical University</span>
            <span className="header-brand-sub">Evaluation System</span>
          </div>
        </div>

        <div className="header-right">
          {isEvalPage && <SessionTimer />}

          <button className="header-icon-btn" title="Notifications">
            <Bell size={17} />
            <span className="notif-dot" />
          </button>

          <div className="header-user-menu" ref={menuRef}>
            <button className="header-user-btn" onClick={() => setMenuOpen(v => !v)}>
              <div className="header-avatar">
                {avatarPhotoUrl ? (
                  <img src={avatarPhotoUrl} alt="" className="header-avatar-img" />
                ) : (
                  initials
                )}
              </div>
              <div className="header-user-info">
                <span className="header-user-name">{user?.fullName || 'User'}</span>
                <span className="header-user-role">{user?.roleName}</span>
              </div>
              <ChevronDown size={14} className={`header-chevron ${menuOpen ? 'open' : ''}`} />
            </button>

            {menuOpen && (
              <div className="header-dropdown">
                <div className="dropdown-header">
                  <div className="dropdown-avatar">
                    {avatarPhotoUrl ? (
                      <img src={avatarPhotoUrl} alt="" className="header-avatar-img" />
                    ) : (
                      initials
                    )}
                  </div>
                  <div>
                    <strong>{user?.fullName}</strong>
                    <small>{user?.email || user?.username}</small>
                  </div>
                </div>
                <hr className="dropdown-divider" />

                <button className="dropdown-item" onClick={() => { setMenuOpen(false); navigate('/profile'); }}>
                  <User size={15} /> Profile
                </button>
                <button className="dropdown-item" onClick={() => { setMenuOpen(false); setShowChangePwd(true); }}>
                  <KeyRound size={15} /> Change Password
                </button>
                {user?.roleName === 'Admin' && (
                  <button className="dropdown-item" onClick={() => { setMenuOpen(false); navigate('/admin/settings'); }}>
                    <Settings size={15} /> Admin Settings
                  </button>
                )}

                <hr className="dropdown-divider" />
                <button className="dropdown-item danger" onClick={handleLogout}>
                  <LogOut size={15} /> Logout
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Change Password Modal */}
      {showChangePwd && (
        <div className="modal-backdrop" onClick={() => setShowChangePwd(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-icon-wrap">
                <KeyRound size={20} />
              </div>
              <div>
                <h3 className="modal-title">Change Password</h3>
                <p className="modal-subtitle">Update your account password</p>
              </div>
            </div>

            <form onSubmit={handleChangePassword} className="modal-body">
              <div className="field-group">
                <label className="field-label">Current Password</label>
                <input className="field-input" type="password" value={pwdForm.current}
                  onChange={e => setPwdForm({ ...pwdForm, current: e.target.value })} required />
              </div>
              <div className="field-group">
                <label className="field-label">New Password</label>
                <input className="field-input" type="password" value={pwdForm.next}
                  onChange={e => setPwdForm({ ...pwdForm, next: e.target.value })} minLength={8} required />
              </div>
              <div className="field-group">
                <label className="field-label">Confirm New Password</label>
                <input className="field-input" type="password" value={pwdForm.confirm}
                  onChange={e => setPwdForm({ ...pwdForm, confirm: e.target.value })} required />
              </div>
              {pwdError && <p className="modal-error">{pwdError}</p>}
              <div className="modal-actions">
                <button type="submit" className="btn btn-primary" disabled={pwdLoading}>
                  {pwdLoading ? 'Saving…' : 'Change Password'}
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => setShowChangePwd(false)}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
