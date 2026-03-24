import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  User, Mail, Shield, MapPin, CalendarDays, KeyRound,
  CheckCircle2, Clock, AlertTriangle, ArrowLeft, Loader2
} from 'lucide-react';
import { api } from '../services/api';
import './Profile.css';

const STATUS_CONFIG = {
  Active:  { label: 'Active',  class: 'badge-green', icon: CheckCircle2 },
  Pending: { label: 'Pending', class: 'badge-amber', icon: Clock },
  default: { label: 'Unknown', class: 'badge-gray',  icon: AlertTriangle },
};

function InfoRow({ icon: Icon, label, value, mono }) {
  return (
    <div className="profile-row">
      <div className="profile-row-icon"><Icon size={15} /></div>
      <div className="profile-row-content">
        <span className="profile-row-label">{label}</span>
        <span className={`profile-row-value ${mono ? 'mono' : ''}`}>{value || '—'}</span>
      </div>
    </div>
  );
}

export default function Profile() {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    api.auth.profile()
      .then(setProfile)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="profile-loader">
      <Loader2 size={28} className="spin" />
      <span>Loading profile…</span>
    </div>
  );

  if (error) return (
    <div className="profile-loader">
      <AlertTriangle size={28} className="text-danger" />
      <span className="text-danger">{error}</span>
    </div>
  );

  const initials = profile.fullName?.split(' ').map(w => w[0]).slice(0, 2).join('') || 'U';
  const statusCfg = STATUS_CONFIG[profile.userStatus] || STATUS_CONFIG.default;
  const StatusIcon = statusCfg.icon;
  const photoUrl = profile.profilePhotoPath ? api.files.profilePhotoUrl(profile.profilePhotoPath) : null;

  return (
    <div className="profile-page page-enter">
      <div className="profile-hero">
        <div className="profile-avatar-lg">
          {photoUrl ? (
            <img src={photoUrl} alt="" className="profile-avatar-img" />
          ) : (
            initials
          )}
        </div>
        <div className="profile-hero-info">
          <h1 className="profile-name">{profile.fullName}</h1>
          <p className="profile-role">{profile.roleName}</p>
          <span className={`badge ${statusCfg.class}`}>
            <StatusIcon size={11} /> {statusCfg.label}
          </span>
        </div>
        <div className="profile-hero-actions">
          <button className="btn btn-primary btn-sm" onClick={() => navigate('/change-password')}>
            <KeyRound size={13} /> Change Password
          </button>
          <button className="btn btn-secondary btn-sm" onClick={() => navigate('/')}>
            <ArrowLeft size={13} /> Dashboard
          </button>
        </div>
      </div>

      <div className="profile-content">
        <div className="card profile-section">
          <div className="profile-section-header">
            <User size={15} />
            <h2>Account Information</h2>
          </div>
          <InfoRow icon={User}        label="Full Name"    value={profile.fullName} />
          <InfoRow icon={User}        label="Username"     value={profile.username} mono />
          <InfoRow icon={Mail}        label="Email"        value={profile.email} />
          <InfoRow icon={Shield}      label="Role"         value={profile.roleName} />
          <InfoRow icon={MapPin}      label="Location ID"  value={profile.locationId?.toString()} />
          <InfoRow icon={CalendarDays} label="Member Since" value={
            profile.createdAt ? new Date(profile.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) : null
          } />
        </div>

        <div className="card profile-section">
          <div className="profile-section-header">
            <Shield size={15} />
            <h2>Security</h2>
          </div>
          <InfoRow icon={CheckCircle2} label="Account Status" value={profile.userStatus} />
          <InfoRow icon={Clock}        label="Last Password Change" value={
            profile.passwordChangedAt ? new Date(profile.passwordChangedAt).toLocaleDateString('en-IN') : 'Never'
          } />
          <div className="profile-security-tip">
            <KeyRound size={13} />
            <span>Use a strong password and change it regularly for account safety.</span>
          </div>
        </div>
      </div>
    </div>
  );
}
