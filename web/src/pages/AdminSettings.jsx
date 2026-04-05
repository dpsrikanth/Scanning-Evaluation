import { useState, useEffect, useRef, Fragment } from 'react';
import {
  Settings, Users, Mail, FileText, Plus, KeyRound, Trash2,
  CheckCircle2, AlertCircle, Plug, Loader2, Pencil, Eye,
  ArrowLeft, ToggleLeft, ToggleRight,
  Camera, Activity, Clock, Search, ChevronDown, ChevronUp, Shield,
  X
} from 'lucide-react';
import * as faceapi from 'face-api.js';
import { api } from '../services/api';
import './AdminSettings.css';

const FACE_MODEL_URL = '/face-api-models';
let faceModelsLoaded = false;
let faceModelsLoadError = null;
async function loadFaceModels() {
  if (faceModelsLoaded) return;
  if (faceModelsLoadError) throw faceModelsLoadError;
  try {
    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(FACE_MODEL_URL),
      faceapi.nets.faceLandmark68TinyNet.loadFromUri(FACE_MODEL_URL),
      faceapi.nets.faceRecognitionNet.loadFromUri(FACE_MODEL_URL),
    ]);
    faceModelsLoaded = true;
  } catch (err) {
    faceModelsLoadError = err;
    throw err;
  }
}
// More lenient options so faces are recognized more often: lower scoreThreshold, larger inputSize
function getFaceDetectorOptions() {
  return new faceapi.TinyFaceDetectorOptions({
    inputSize: 224,        // larger = better for bigger faces in image
    scoreThreshold: 0.25,  // lower = more permissive (default 0.5 can miss faces)
  });
}
async function detectFaceInImage(imgElement) {
  await loadFaceModels();
  const opts = getFaceDetectorOptions();
  // Try once with lenient options; if no face, retry with even lower threshold
  let detection = await faceapi.detectSingleFace(imgElement, opts).withFaceLandmarks(true);
  if (!detection) {
    detection = await faceapi
      .detectSingleFace(imgElement, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.15 }))
      .withFaceLandmarks(true);
  }
  return !!detection;
}

const TEMPLATE_TYPES = [
  { id: 'first_login',     label: 'First Login / Welcome',          icon: '👋' },
  { id: 'reset_password',  label: 'Password Reset by Admin',         icon: '🔑' },
  { id: 'change_password', label: 'Password Changed Notification',   icon: '🔒' },
  { id: 'otp',             label: 'OTP for Forgot Password',         icon: '🛡' },
];

const TABS = [
  { id: 'users',      label: 'Users',            icon: Users },
  { id: 'smtp',       label: 'SMTP & Email',     icon: Mail },
  { id: 'templates',  label: 'Email Templates',  icon: FileText },
  { id: 'monitoring', label: 'Monitoring',        icon: Camera },
  { id: 'audit',      label: 'Audit Log',         icon: Activity },
];

function formatAuditPayload(val) {
  if (val == null || val === '') return '';
  if (typeof val === 'object') return JSON.stringify(val, null, 2);
  if (typeof val === 'string') {
    try {
      return JSON.stringify(JSON.parse(val), null, 2);
    } catch {
      return val;
    }
  }
  return String(val);
}

function visibleSettingsTabs() {
  try {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    const role = user.roleName ?? user.roloName;
    return role === 'Admin' ? TABS : TABS.filter((t) => t.id !== 'audit');
  } catch {
    return TABS;
  }
}

export default function AdminSettings() {
  const [activeTab, setActiveTab]         = useState('users');
  const [users, setUsers]                 = useState([]);
  const [usersTotal, setUsersTotal]       = useState(0);
  const [roles, setRoles]                 = useState([]);
  const [locations, setLocations]         = useState([]);
  const [settings, setSettings]           = useState({});
  const [settingsDirty, setSettingsDirty] = useState({});
  const [templates, setTemplates]         = useState([]);
  const [editTemplate, setEditTemplate]   = useState(null);
  const [loading, setLoading]             = useState(false);
  const [msg, setMsg]                     = useState({ text: '', type: '' });
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [newUser, setNewUser]             = useState({ username: '', fullName: '', email: '', roleId: '', locationId: '', profilePhoto: null, photoPreview: null });
  const [faceDetected, setFaceDetected]   = useState(false);
  const [faceCheckInProgress, setFaceCheckInProgress] = useState(false);
  const [faceError, setFaceError]         = useState(null); // e.g. 'models_not_loaded'
  const [showCamera, setShowCamera]       = useState(false);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [smtpTestStatus, setSmtpTestStatus] = useState('');
  const [editUser, setEditUser] = useState(null);
  const [editForm, setEditForm] = useState({ fullName: '', email: '', roleId: '', locationId: '', isActive: 1, userStatus: 'Pending' });
  const [photoUpdateUser, setPhotoUpdateUser] = useState(null);
  const [photoUpdateFile, setPhotoUpdateFile] = useState(null);
  const [photoUpdatePreview, setPhotoUpdatePreview] = useState(null);
  const [photoUpdateSaving, setPhotoUpdateSaving] = useState(false);

  const flash = (text, type = 'success') => { setMsg({ text, type }); setTimeout(() => setMsg({ text: '', type: '' }), 4000); };

  useEffect(() => {
    Promise.all([api.admin.getRoles(), api.admin.getLocations()])
      .then(([r, l]) => {
        setRoles(Array.isArray(r) ? r : []);
        setLocations(Array.isArray(l) ? l : []);
      })
      .catch(() => {});
  }, []);

  // Start/stop camera when showCamera toggles
  useEffect(() => {
    if (!showCamera) return;
    let stream = null;
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } })
      .then(s => {
        stream = s;
        streamRef.current = s;
        if (videoRef.current) videoRef.current.srcObject = s;
      })
      .catch(() => setShowCamera(false));
    return () => {
      stream?.getTracks().forEach(t => t.stop());
      if (streamRef.current) streamRef.current = null;
    };
  }, [showCamera]);

  // Face detection when a profile photo preview is set (file upload or camera capture)
  useEffect(() => {
    const dataUrl = newUser.photoPreview;
    if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) {
      setFaceCheckInProgress(false);
      setFaceError(null);
      return;
    }
    let cancelled = false;
    setFaceError(null);
    const img = new Image();
    img.onload = async () => {
      if (cancelled) return;
      try {
        const hasFace = await detectFaceInImage(img);
        if (!cancelled) setFaceDetected(hasFace);
      } catch (err) {
        if (!cancelled) {
          setFaceDetected(false);
          const msg = err?.message || '';
          const isHtmlResponse = /<!DOCTYPE|is not valid JSON/i.test(msg);
          setFaceError(isHtmlResponse
            ? 'Face detection models are missing. The server returned a page instead of model files. Run the download script in web/public/face-api-models/ (see README) and restart the app.'
            : msg || 'Face check failed');
        }
      } finally {
        if (!cancelled) setFaceCheckInProgress(false);
      }
    };
    img.onerror = () => { if (!cancelled) { setFaceDetected(false); setFaceCheckInProgress(false); setFaceError(null); } };
    img.src = dataUrl;
    return () => { cancelled = true; };
  }, [newUser.photoPreview]);

  // Audit log state
  const [auditLogs, setAuditLogs]         = useState([]);
  const [auditTotal, setAuditTotal]       = useState(0);
  const [auditFilter, setAuditFilter]     = useState({ moduleName: '', actionType: '', dateFrom: '', dateTo: '' });
  const [expandedLog, setExpandedLog]     = useState(null);

  useEffect(() => {
    if (activeTab === 'users')      loadUsers();
    if (activeTab === 'smtp')       loadSettings();
    if (activeTab === 'templates')  loadTemplates();
    if (activeTab === 'monitoring') loadSettings();
    if (activeTab === 'audit')      loadAuditLogs();
  }, [activeTab]);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const d = await api.admin.getUsers({ limit: 100, offset: 0 }) || {};
      setUsers(Array.isArray(d.users) ? d.users : []);
      setUsersTotal(typeof d.total === 'number' ? d.total : 0);
    }
    catch (err) { flash('Error: ' + err.message, 'error'); }
    finally { setLoading(false); }
  };
  const loadSettings = async () => {
    setLoading(true);
    try {
      const rows = await api.admin.getSettings();
      const list = Array.isArray(rows) ? rows : [];
      setSettings(Object.fromEntries(list.map(r => [r.SettingKey, r.SettingValue]))); setSettingsDirty({});
    } catch (err) { flash('Error: ' + err.message, 'error'); }
    finally { setLoading(false); }
  };
  const loadTemplates = async () => {
    setLoading(true);
    try { setTemplates(await api.admin.getTemplates()); }
    catch (err) { flash('Error: ' + err.message, 'error'); }
    finally { setLoading(false); }
  };

  const loadAuditLogs = async (filter = auditFilter) => {
    setLoading(true);
    try {
      const params = { limit: 100, offset: 0 };
      Object.entries(filter).forEach(([k, v]) => {
        if (v !== '' && v != null) params[k] = v;
      });
      const d = await api.auth.activityLogs(params);
      setAuditLogs(d.logs || []);
      setAuditTotal(d.total || 0);
    } catch (err) { flash('Error: ' + err.message, 'error'); }
    finally { setLoading(false); }
  };

  const saveMonitoringSettings = async () => {
    try {
      const monKeys = ['photo_verify_enabled','photo_verify_action','photo_capture_enabled',
        'photo_capture_interval_min','photo_capture_interval_max','min_time_default',
        'min_time_warning_email','tab_switch_flag_threshold'];
      const payload = {};
      monKeys.forEach(k => { if (settingsDirty[k] !== undefined) payload[k] = settingsDirty[k]; });
      if (Object.keys(payload).length === 0) { flash('No changes to save'); return; }
      await api.admin.updateSettings(payload);
      flash('Monitoring settings saved');
      setSettingsDirty({});
      loadSettings();
    } catch (err) { flash('Error: ' + err.message, 'error'); }
  };

  const handleCreateUser = async e => {
    e.preventDefault();
    const selectedRole = roles.find(r => r.RoleID === parseInt(newUser.roleId));
    const isEvaluator = selectedRole?.RoleName === 'Evaluator';
    if (isEvaluator && !newUser.profilePhoto) {
      flash('Profile photo is mandatory for Evaluator role', 'error'); return;
    }
    if (isEvaluator && newUser.profilePhoto && !faceDetected) {
      flash('No face detected in the photo. Please upload or capture a photo that clearly shows the face.', 'error'); return;
    }
    if (isEvaluator && faceCheckInProgress) {
      flash('Please wait while we verify the photo contains a face.', 'error'); return;
    }
    try {
      const fd = new FormData();
      Object.entries(newUser).forEach(([k, v]) => {
        if (k !== 'profilePhoto' && v) fd.append(k, v);
      });
      if (newUser.profilePhoto) fd.append('profilePhoto', newUser.profilePhoto);
      const d = await api.admin.createUser(fd);
      flash(`User created. Temp password: ${d.tempPassword}`);
      setShowCreateUser(false);
      setNewUser({ username: '', fullName: '', email: '', roleId: '', locationId: '', profilePhoto: null, photoPreview: null });
      setFaceDetected(false);
      setFaceCheckInProgress(false);
      setShowCamera(false);
      loadUsers();
    } catch (err) { flash('Error: ' + err.message, 'error'); }
  };

  const handleDeleteUser = async (userId, status) => {
    if (status !== 'Pending') { flash('Only Pending users can be deleted', 'error'); return; }
    if (!window.confirm('Delete this user?')) return;
    try { await api.admin.deleteUser(userId); flash('User deleted'); loadUsers(); }
    catch (err) { flash('Error: ' + err.message, 'error'); }
  };

  const handleResetPassword = async userId => {
    if (!window.confirm("Reset this user's password? A temporary password will be emailed.")) return;
    try { await api.admin.resetPassword(userId); flash('Password reset. Email sent.'); }
    catch (err) { flash('Error: ' + err.message, 'error'); }
  };

  const openEditUser = (u) => {
    setEditUser(u);
    setEditForm({
      fullName: u.FullName || '',
      email: u.Email || '',
      roleId: u.RoleID ?? '',
      locationId: u.LocationID ?? '',
      isActive: u.IsActive ?? 1,
      userStatus: u.UserStatus || 'Pending',
    });
  };
  const saveEditUser = async (e) => {
    e.preventDefault();
    if (!editUser) return;
    try {
      await api.admin.updateUser(editUser.UserID, editForm);
      flash('User updated.');
      setEditUser(null);
      loadUsers();
    } catch (err) { flash('Error: ' + err.message, 'error'); }
  };

  const openPhotoUpdate = (u) => {
    setPhotoUpdateUser(u);
    setPhotoUpdateFile(null);
    setPhotoUpdatePreview(null);
    setPhotoUpdateSaving(false);
  };
  const savePhotoUpdate = async (e) => {
    e.preventDefault();
    if (!photoUpdateUser || !photoUpdateFile) { flash('Select a photo first.', 'error'); return; }
    setPhotoUpdateSaving(true);
    try {
      const fd = new FormData();
      fd.append('profilePhoto', photoUpdateFile);
      await api.admin.uploadPhoto(photoUpdateUser.UserID, fd);
      flash('Photo updated.');
      setPhotoUpdateUser(null);
      setPhotoUpdateFile(null);
      setPhotoUpdatePreview(null);
      loadUsers();
    } catch (err) { flash('Error: ' + err.message, 'error'); }
    finally { setPhotoUpdateSaving(false); }
  };

  const setSetting = (k, v) => {
    setSettings(prev => ({ ...prev, [k]: v }));
    setSettingsDirty(prev => ({ ...prev, [k]: v }));
  };

  const saveSettings = async () => {
    try { await api.admin.updateSettings(settingsDirty); flash('Settings saved'); setSettingsDirty({}); }
    catch (err) { flash('Error: ' + err.message, 'error'); }
  };

  const testSmtp = async () => {
    setSmtpTestStatus('testing');
    try {
      await api.admin.testSmtp({
        smtp_host: settings.smtp_host, smtp_port: settings.smtp_port,
        smtp_secure: settings.smtp_secure, smtp_user: settings.smtp_user,
        smtp_password: settings.smtp_password,
      });
      setSmtpTestStatus('ok');
    } catch (err) { setSmtpTestStatus('fail:' + err.message); }
  };

  const openTemplate = async type => {
    const t = await api.admin.getTemplate(type).catch(() => null);
    setEditTemplate(t || { TemplateType: type, Subject: '', BodyHtml: '', IsActive: 1 });
  };

  const saveTemplate = async () => {
    try {
      await api.admin.updateTemplate(editTemplate.TemplateType, {
        subject: editTemplate.Subject,
        bodyHtml: editTemplate.BodyHtml,
        isActive: editTemplate.IsActive,
      });
      flash('Template saved'); setEditTemplate(null); loadTemplates();
    } catch (err) { flash('Error: ' + err.message, 'error'); }
  };

  const statusBadge = status => {
    const map = { Active: 'badge-green', Pending: 'badge-amber', Suspended: 'badge-red' };
    return <span className={`badge ${map[status] || 'badge-gray'}`}>{status}</span>;
  };

  return (
    <div className="admin-page page-enter">
      <div className="admin-page-header">
        <div className="admin-page-icon"><Settings size={24} /></div>
        <div>
          <h1 className="admin-page-title">Admin Settings</h1>
          <p className="admin-page-subtitle">Manage users, SMTP configuration, and email templates</p>
        </div>
      </div>

      {msg.text && (
        <div className={`admin-flash ${msg.type}`}>
          {msg.type === 'success' ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
          {msg.text}
        </div>
      )}

      {/* Tabs */}
      <div className="admin-tabs">
        {visibleSettingsTabs().map(({ id, label, icon: Icon }) => (
          <button key={id} className={`tab-btn ${activeTab === id ? 'active' : ''}`}
            onClick={() => setActiveTab(id)}>
            <Icon size={15} /> {label}
          </button>
        ))}
      </div>

      {/* ── Users ───────────────────────────────────────────────── */}
      {activeTab === 'users' && (
        <div>
          {/* Create user form */}
          {showCreateUser && (
            <div className="create-user-panel">
              <div className="create-user-panel-header">
                <h3><Plus size={15} /> Create New User</h3>
                <button className="btn btn-ghost btn-sm" onClick={() => setShowCreateUser(false)}>Cancel</button>
              </div>
              <div className="user-form-body">
                <form onSubmit={handleCreateUser} className="user-form-grid">
                  <div className="field-group">
                    <label className="field-label">Username *</label>
                    <input className="field-input" value={newUser.username}
                      onChange={e => setNewUser({ ...newUser, username: e.target.value })} required />
                  </div>
                  <div className="field-group">
                    <label className="field-label">Full Name *</label>
                    <input className="field-input" value={newUser.fullName}
                      onChange={e => setNewUser({ ...newUser, fullName: e.target.value })} required />
                  </div>
                  <div className="field-group">
                    <label className="field-label">Email *</label>
                    <input className="field-input" type="email" value={newUser.email}
                      onChange={e => setNewUser({ ...newUser, email: e.target.value })} required />
                  </div>
                  <div className="field-group">
                    <label className="field-label">Role *</label>
                    <select className="field-input" value={newUser.roleId}
                      onChange={e => setNewUser({ ...newUser, roleId: e.target.value })} required>
                      <option value="">— Select —</option>
                      {roles.map(r => <option key={r.RoleID} value={r.RoleID}>{r.RoleName}</option>)}
                    </select>
                  </div>
                  <div className="field-group">
                    <label className="field-label">Location</label>
                    <select className="field-input" value={newUser.locationId}
                      onChange={e => setNewUser({ ...newUser, locationId: e.target.value })}>
                      <option value="">— None —</option>
                      {locations.map(l => <option key={l.LocationID} value={l.LocationID}>{l.LocationName}</option>)}
                    </select>
                  </div>
                  {/* Profile Photo — mandatory for Evaluator; must contain a detectable face */}
                  <div className="field-group" style={{ gridColumn: '1 / -1' }}>
                    <label className="field-label">
                      Profile Photo (upload or use camera)
                      {roles.find(r => r.RoleID === parseInt(newUser.roleId))?.RoleName === 'Evaluator' && (
                        <span style={{ color: 'var(--color-danger)', marginLeft: 4 }}>* required for Evaluator — face must be visible</span>
                      )}
                    </label>
                    <p className="photo-tip-text">Tip: Face clearly visible, front-facing, good lighting. Avoid heavy cropping or dark images.</p>
                    <div className="photo-upload-row">
                      {newUser.photoPreview && (
                        <>
                          <img src={newUser.photoPreview} alt="Preview" className="photo-preview" />
                          {faceCheckInProgress && (
                            <span className="photo-face-status checking"><Loader2 size={14} className="spin" /> Checking for face…</span>
                          )}
                          {!faceCheckInProgress && faceDetected && (
                            <span className="photo-face-status ok"><CheckCircle2 size={14} /> Face detected</span>
                          )}
                          {!faceCheckInProgress && !faceDetected && newUser.photoPreview && (
                            <span className="photo-face-status fail">
                              <AlertCircle size={14} />
                              {faceError ? `Face check failed: ${faceError}` : 'No face detected — use a clear photo of the face'}
                            </span>
                          )}
                          {faceError && (
                            <p className="photo-face-tip">
                              {faceError.includes('missing')
                                ? <>Run <code>download-face-models.ps1</code> in <code>web/public/face-api-models/</code> (see README), then restart the dev server.</>
                                : faceError}
                            </p>
                          )}
                        </>
                      )}
                      {!showCamera ? (
                        <>
                          <label className="btn btn-secondary photo-upload-btn">
                            <Camera size={13} /> {newUser.profilePhoto ? 'Change Photo' : 'Upload Photo'}
                            <input type="file" accept="image/*" style={{ display: 'none' }}
                              onChange={e => {
                                const file = e.target.files[0];
                                if (!file) return;
                                const reader = new FileReader();
                                reader.onload = ev => {
                                  setNewUser(u => ({ ...u, profilePhoto: file, photoPreview: ev.target.result }));
                                  setFaceCheckInProgress(true);
                                  setFaceDetected(false);
                                };
                                reader.readAsDataURL(file);
                              }} />
                          </label>
                          <button type="button" className="btn btn-secondary photo-upload-btn"
                            onClick={() => {
                              setShowCamera(true);
                              setFaceDetected(false);
                            }}>
                            <Camera size={13} /> Capture from camera
                          </button>
                        </>
                      ) : (
                        <div className="photo-camera-box">
                          <video ref={videoRef} autoPlay playsInline muted className="photo-camera-video" />
                          <div className="photo-camera-actions">
                            <button type="button" className="btn btn-primary btn-sm"
                              onClick={async () => {
                                if (!videoRef.current || !streamRef.current) return;
                                const video = videoRef.current;
                                const canvas = document.createElement('canvas');
                                canvas.width = video.videoWidth;
                                canvas.height = video.videoHeight;
                                canvas.getContext('2d').drawImage(video, 0, 0);
                                streamRef.current.getTracks().forEach(t => t.stop());
                                streamRef.current = null;
                                setShowCamera(false);
                                const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
                                canvas.toBlob(blob => {
                                  const file = new File([blob], 'capture.jpg', { type: 'image/jpeg' });
                                  setNewUser(u => ({ ...u, profilePhoto: file, photoPreview: dataUrl }));
                                  setFaceCheckInProgress(true);
                                  setFaceDetected(false);
                                }, 'image/jpeg', 0.9);
                              }}>
                              Capture
                            </button>
                            <button type="button" className="btn btn-ghost btn-sm" onClick={() => {
                              streamRef.current?.getTracks().forEach(t => t.stop());
                              streamRef.current = null;
                              setShowCamera(false);
                            }}>Cancel</button>
                          </div>
                        </div>
                      )}
                      {newUser.profilePhoto && !showCamera && (
                        <button type="button" className="btn btn-ghost btn-sm"
                          onClick={() => {
                            setNewUser(u => ({ ...u, profilePhoto: null, photoPreview: null }));
                            setFaceDetected(false);
                            setFaceCheckInProgress(false);
                            setFaceError(null);
                          }}>
                          Remove
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="form-actions">
                    <button type="submit" className="btn btn-primary"><Mail size={13} /> Create &amp; Send Welcome Email</button>
                    <button type="button" className="btn btn-secondary" onClick={() => {
                      setShowCamera(false);
                      setFaceDetected(false);
                      setFaceCheckInProgress(false);
                      setFaceError(null);
                      setNewUser({ username: '', fullName: '', email: '', roleId: '', locationId: '', profilePhoto: null, photoPreview: null });
                      setShowCreateUser(false);
                    }}>Cancel</button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Edit User modal */}
          {editUser && (
            <div className="modal-overlay" onClick={() => setEditUser(null)}>
              <div className="modal-card" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                  <h3>Edit user — {editUser.Username}</h3>
                  <button type="button" className="modal-close" onClick={() => setEditUser(null)}><X size={18} /></button>
                </div>
                <form onSubmit={saveEditUser} className="modal-form">
                  <div className="form-grid">
                    <div className="field-group">
                      <label className="field-label">Full name *</label>
                      <input className="field-input" value={editForm.fullName}
                        onChange={e => setEditForm(f => ({ ...f, fullName: e.target.value }))} required />
                    </div>
                    <div className="field-group">
                      <label className="field-label">Email *</label>
                      <input className="field-input" type="email" value={editForm.email}
                        onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))} required />
                    </div>
                    <div className="field-group">
                      <label className="field-label">Role</label>
                      <select className="field-input" value={editForm.roleId}
                        onChange={e => setEditForm(f => ({ ...f, roleId: e.target.value }))}>
                        {roles.map(r => <option key={r.RoleID} value={r.RoleID}>{r.RoleName}</option>)}
                      </select>
                    </div>
                    <div className="field-group">
                      <label className="field-label">Location</label>
                      <select className="field-input" value={editForm.locationId}
                        onChange={e => setEditForm(f => ({ ...f, locationId: e.target.value }))}>
                        <option value="">— None —</option>
                        {locations.map(l => <option key={l.LocationID} value={l.LocationID}>{l.LocationName}</option>)}
                      </select>
                    </div>
                    <div className="field-group">
                      <label className="field-label">Status</label>
                      <select className="field-input" value={editForm.userStatus}
                        onChange={e => setEditForm(f => ({ ...f, userStatus: e.target.value }))}>
                        <option value="Pending">Pending</option>
                        <option value="Active">Active</option>
                        <option value="Suspended">Suspended</option>
                      </select>
                    </div>
                    <div className="field-group">
                      <label className="field-label">Active</label>
                      <select className="field-input" value={editForm.isActive}
                        onChange={e => setEditForm(f => ({ ...f, isActive: parseInt(e.target.value, 10) }))}>
                        <option value={1}>Yes</option>
                        <option value={0}>No</option>
                      </select>
                    </div>
                  </div>
                  <div className="form-actions">
                    <button type="submit" className="btn btn-primary">Save changes</button>
                    <button type="button" className="btn btn-secondary" onClick={() => setEditUser(null)}>Cancel</button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Update photo modal */}
          {photoUpdateUser && (
            <div className="modal-overlay" onClick={() => setPhotoUpdateUser(null)}>
              <div className="modal-card modal-card-sm" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                  <h3>Update photo — {photoUpdateUser.FullName}</h3>
                  <button type="button" className="modal-close" onClick={() => setPhotoUpdateUser(null)}><X size={18} /></button>
                </div>
                <form onSubmit={savePhotoUpdate} className="modal-form">
                  <div className="field-group">
                    <label className="field-label">Profile photo</label>
                    <div className="photo-upload-row">
                      {photoUpdatePreview && (
                        <img src={photoUpdatePreview} alt="Preview" className="photo-preview" />
                      )}
                      <label className="btn btn-secondary photo-upload-btn">
                        <Camera size={13} /> {photoUpdateFile ? 'Change photo' : 'Choose photo'}
                        <input type="file" accept="image/*" style={{ display: 'none' }}
                          onChange={e => {
                            const file = e.target.files[0];
                            if (!file) return;
                            const reader = new FileReader();
                            reader.onload = ev => {
                              setPhotoUpdatePreview(ev.target.result);
                              setPhotoUpdateFile(file);
                            };
                            reader.readAsDataURL(file);
                          }} />
                      </label>
                    </div>
                  </div>
                  <div className="form-actions">
                    <button type="submit" className="btn btn-primary" disabled={!photoUpdateFile || photoUpdateSaving}>
                      {photoUpdateSaving ? <><Loader2 size={14} className="spin" /> Saving…</> : 'Update photo'}
                    </button>
                    <button type="button" className="btn btn-secondary" onClick={() => setPhotoUpdateUser(null)}>Cancel</button>
                  </div>
                </form>
              </div>
            </div>
          )}

          <div className="user-table-wrap">
            <div className="user-table-header">
              <h3><Users size={15} /> All Users <span className="selected-count">{usersTotal}</span></h3>
              <button className="btn btn-primary btn-sm" onClick={() => setShowCreateUser(true)}>
                <Plus size={13} /> New User
              </button>
            </div>

            {loading ? (
              <div className="loading"><Loader2 size={20} className="spin" /> Loading users…</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className="admin-data-table">
                  <thead>
                    <tr>
                      <th>User</th>
                      <th>Email</th>
                      <th>Role</th>
                      <th>Status</th>
                      <th>First Login</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map(u => (
                      <tr key={u.UserID}>
                        <td>
                          <div className="user-cell">
                            <div className="user-mini-avatar">{u.FullName?.[0] || 'U'}</div>
                            <div>
                              <div className="user-cell-name">{u.FullName}</div>
                              <div className="user-cell-uname">@{u.Username}</div>
                            </div>
                          </div>
                        </td>
                        <td>{u.Email || '—'}</td>
                        <td><span className="badge badge-gray">{u.RoleName}</span></td>
                        <td>{statusBadge(u.UserStatus)}</td>
                        <td>
                          {u.IsFirstLogin
                            ? <span className="badge badge-amber"><AlertCircle size={10} /> Pending</span>
                            : <span className="badge badge-green"><CheckCircle2 size={10} /> Done</span>}
                        </td>
                        <td>
                          <div className="table-actions">
                            <button className="btn btn-ghost btn-xs" onClick={() => openEditUser(u)} title="Edit user">
                              <Pencil size={12} />
                            </button>
                            <button className="btn btn-ghost btn-xs" onClick={() => openPhotoUpdate(u)} title="Update photo">
                              <Camera size={12} />
                            </button>
                            <button className="btn btn-secondary btn-xs" onClick={() => handleResetPassword(u.UserID)} title="Reset password">
                              <KeyRound size={12} />
                            </button>
                            {u.UserStatus === 'Pending' && (
                              <button className="btn btn-danger btn-xs" onClick={() => handleDeleteUser(u.UserID, u.UserStatus)} title="Delete user">
                                <Trash2 size={12} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── SMTP ───────────────────────────────────────────────── */}
      {activeTab === 'smtp' && (
        <div>
          <div className="settings-section">
            <div className="settings-section-header">
              <Mail size={15} className="settings-section-icon" />
              <h3>SMTP Configuration</h3>
            </div>
            <div className="settings-form-body">
              {loading ? <div className="loading"><Loader2 size={20} className="spin" /> Loading…</div> : (
                <>
                  <div className="settings-grid">
                    {[
                      ['smtp_host',           'SMTP Host',             'text',     'smtp.gmail.com'],
                      ['smtp_port',           'SMTP Port',             'number',   '587'],
                      ['smtp_user',           'SMTP Username',         'email',    'you@domain.com'],
                      ['smtp_password',       'SMTP Password',         'password', ''],
                      ['smtp_from_name',      'From Name',             'text',     'Scanning & Evaluation'],
                      ['smtp_from_email',     'From Email',            'email',    'noreply@university.edu'],
                      ['app_base_url',        'App Base URL',          'url',      'http://localhost:5173'],
                      ['otp_expiry_minutes',  'OTP Expiry (minutes)',  'number',   '10'],
                    ].map(([key, label, type, placeholder]) => (
                      <div key={key} className="field-group">
                        <label className="field-label">{label}</label>
                        <input className="field-input" type={type} value={settings[key] || ''}
                          placeholder={placeholder}
                          onChange={e => setSetting(key, e.target.value)} />
                      </div>
                    ))}
                  </div>

                  <div className="toggle-row">
                    <div className="toggle-row-info">
                      <span className="toggle-label">Enable Email Sending</span>
                      <span className="toggle-desc">When disabled, no emails are sent (development mode)</span>
                    </div>
                    <button
                      className={`toggle-switch ${settings.email_enabled === '1' ? 'on' : ''}`}
                      onClick={() => setSetting('email_enabled', settings.email_enabled === '1' ? '0' : '1')}
                    />
                  </div>

                  <div className="settings-actions">
                    <button className="btn btn-primary" onClick={saveSettings} disabled={Object.keys(settingsDirty).length === 0}>
                      <CheckCircle2 size={13} /> Save Settings
                    </button>
                    <button className="btn btn-secondary" onClick={testSmtp} disabled={smtpTestStatus === 'testing'}>
                      {smtpTestStatus === 'testing' ? <><Loader2 size={13} className="spin" /> Testing…</> : <><Plug size={13} /> Test SMTP</>}
                    </button>
                    {smtpTestStatus && smtpTestStatus !== 'testing' && (
                      <span className={`badge ${smtpTestStatus === 'ok' ? 'badge-green' : 'badge-red'}`}>
                        {smtpTestStatus === 'ok' ? <><CheckCircle2 size={10} /> Connected</> : <><AlertCircle size={10} /> {smtpTestStatus.replace('fail:', '')}</>}
                      </span>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Templates ──────────────────────────────────────────── */}
      {activeTab === 'templates' && (
        <div>
          {editTemplate ? (
            <div className="settings-section">
              <div className="settings-section-header">
                <FileText size={15} className="settings-section-icon" />
                <h3>Edit: {TEMPLATE_TYPES.find(t => t.id === editTemplate.TemplateType)?.label}</h3>
                <button className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto' }}
                  onClick={() => setEditTemplate(null)}>
                  <ArrowLeft size={13} /> Back
                </button>
              </div>
              <div className="settings-form-body">
                <div className="field-group" style={{ marginBottom: 14 }}>
                  <label className="field-label">Email Subject</label>
                  <input className="field-input" value={editTemplate.Subject}
                    onChange={e => setEditTemplate({ ...editTemplate, Subject: e.target.value })} />
                </div>

                <div className="field-group" style={{ marginBottom: 8 }}>
                  <label className="field-label">Available Variables</label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {editTemplate.TemplateType === 'first_login'    && ['{{fullName}}','{{username}}','{{tempPassword}}','{{loginUrl}}'].map(v => <code key={v} style={{ background: '#f1f5f9', padding: '2px 8px', borderRadius: 4, fontSize: 11 }}>{v}</code>)}
                    {editTemplate.TemplateType === 'reset_password'  && ['{{fullName}}','{{username}}','{{tempPassword}}'].map(v => <code key={v} style={{ background: '#f1f5f9', padding: '2px 8px', borderRadius: 4, fontSize: 11 }}>{v}</code>)}
                    {editTemplate.TemplateType === 'change_password' && ['{{fullName}}','{{newPassword}}','{{changedAt}}'].map(v => <code key={v} style={{ background: '#f1f5f9', padding: '2px 8px', borderRadius: 4, fontSize: 11 }}>{v}</code>)}
                    {editTemplate.TemplateType === 'otp'             && ['{{fullName}}','{{otpCode}}','{{expiryMinutes}}'].map(v => <code key={v} style={{ background: '#f1f5f9', padding: '2px 8px', borderRadius: 4, fontSize: 11 }}>{v}</code>)}
                  </div>
                </div>

                <div className="field-group" style={{ marginBottom: 14 }}>
                  <label className="field-label">HTML Body</label>
                  <textarea className="field-input" style={{ fontFamily: 'var(--font-mono)', fontSize: 12, minHeight: 280, resize: 'vertical', lineHeight: 1.6 }}
                    value={editTemplate.BodyHtml}
                    onChange={e => setEditTemplate({ ...editTemplate, BodyHtml: e.target.value })} />
                </div>

                <div className="toggle-row" style={{ marginBottom: 14 }}>
                  <div className="toggle-row-info">
                    <span className="toggle-label">Template Active</span>
                    <span className="toggle-desc">Inactive templates will not be used for sending emails</span>
                  </div>
                  <button className={`toggle-switch ${editTemplate.IsActive === 1 ? 'on' : ''}`}
                    onClick={() => setEditTemplate({ ...editTemplate, IsActive: editTemplate.IsActive === 1 ? 0 : 1 })} />
                </div>

                <div className="settings-actions">
                  <button className="btn btn-primary" onClick={saveTemplate}><CheckCircle2 size={13} /> Save Template</button>
                  {editTemplate.BodyHtml && (
                    <button className="btn btn-secondary" onClick={() => {
                      const w = window.open('', '_blank');
                      if (!w) {
                        flash('Allow pop-ups to preview email, or use your browser preview.', 'error');
                        return;
                      }
                      const html = editTemplate.BodyHtml
                        .replace('{{fullName}}','John Doe').replace('{{username}}','johndoe')
                        .replace('{{tempPassword}}','TempPass@123').replace('{{loginUrl}}','http://localhost:5173')
                        .replace('{{otpCode}}','123456').replace('{{expiryMinutes}}','10')
                        .replace('{{newPassword}}','NewPass@123').replace('{{changedAt}}', new Date().toLocaleString());
                      w.document.write(html);
                      w.document.close();
                    }}><Eye size={13} /> Preview Email</button>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 12 }}>
              {TEMPLATE_TYPES.map(t => {
                const tmpl = templates.find(x => x.TemplateType === t.id);
                return (
                  <div key={t.id} className="settings-section" style={{ margin: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px' }}>
                      <span style={{ fontSize: 22 }}>{t.icon}</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-text)' }}>{t.label}</div>
                        {tmpl?.Subject
                          ? <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 2 }}>Subject: {tmpl.Subject}</div>
                          : <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 2 }}>No template configured</div>}
                      </div>
                      {tmpl && (
                        <span className={`badge ${tmpl.IsActive ? 'badge-green' : 'badge-red'}`}>
                          {tmpl.IsActive ? 'Active' : 'Inactive'}
                        </span>
                      )}
                      <button className="btn btn-secondary btn-sm" onClick={() => openTemplate(t.id)}>
                        <Pencil size={13} /> Edit
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Monitoring Tab ─────────────────────────────────────────────────────── */}
      {activeTab === 'monitoring' && (
        <div className="settings-section">
          <div className="settings-header">
            <div className="settings-header-icon"><Camera size={17} /></div>
            <div>
              <h3>Evaluator Monitoring Settings</h3>
              <p>Configure face verification, random photo capture, time thresholds and tab-switch detection</p>
            </div>
          </div>

          <div className="settings-body">

            {/* Face Verification */}
            <div className="settings-group-label">Face Verification at Session Start</div>
            <div className="settings-group-block">
              <div className="toggle-row">
                <div className="toggle-row-info">
                  <span className="toggle-label">Enable photo verification</span>
                  <span className="toggle-desc">Compare webcam capture against profile photo before evaluation begins</span>
                </div>
                <button className={`toggle-switch ${(settingsDirty.photo_verify_enabled ?? settings.photo_verify_enabled) === '1' ? 'on' : ''}`}
                  onClick={() => setSetting('photo_verify_enabled',
                    (settingsDirty.photo_verify_enabled ?? settings.photo_verify_enabled) === '1' ? '0' : '1')} />
              </div>
              <div className="field-group" style={{ margin: 0 }}>
                <label className="field-label">Mismatch Action</label>
                <select className="field-input" style={{ maxWidth: 340 }}
                  value={settingsDirty.photo_verify_action ?? settings.photo_verify_action ?? 'warn_continue'}
                  onChange={e => setSetting('photo_verify_action', e.target.value)}>
                  <option value="warn_continue">Warn &amp; Allow to Continue</option>
                  <option value="block">Block Access</option>
                  <option value="flag_notify">Flag &amp; Notify Admin</option>
                  <option value="warn_and_flag">Warn, Flag &amp; Notify</option>
                </select>
              </div>
            </div>

            {/* Random Photo Capture */}
            <div className="settings-group-label">Random Photo Capture</div>
            <div className="settings-group-block">
              <div className="toggle-row">
                <div className="toggle-row-info">
                  <span className="toggle-label">Enable random captures</span>
                  <span className="toggle-desc">Randomly capture evaluator photo at intervals during evaluation</span>
                </div>
                <button className={`toggle-switch ${(settingsDirty.photo_capture_enabled ?? settings.photo_capture_enabled) === '1' ? 'on' : ''}`}
                  onClick={() => setSetting('photo_capture_enabled',
                    (settingsDirty.photo_capture_enabled ?? settings.photo_capture_enabled) === '1' ? '0' : '1')} />
              </div>
              <div className="settings-grid-2">
                <div className="field-group" style={{ margin: 0 }}>
                  <label className="field-label">Min Interval (minutes)</label>
                  <input type="number" className="field-input" min="5" max="120"
                    value={settingsDirty.photo_capture_interval_min ?? settings.photo_capture_interval_min ?? '15'}
                    onChange={e => setSetting('photo_capture_interval_min', e.target.value)} />
                </div>
                <div className="field-group" style={{ margin: 0 }}>
                  <label className="field-label">Max Interval (minutes)</label>
                  <input type="number" className="field-input" min="5" max="120"
                    value={settingsDirty.photo_capture_interval_max ?? settings.photo_capture_interval_max ?? '30'}
                    onChange={e => setSetting('photo_capture_interval_max', e.target.value)} />
                </div>
              </div>
            </div>

            {/* Time Threshold */}
            <div className="settings-group-label">Time Threshold (Red-Flag)</div>
            <div className="settings-group-block">
              <div className="field-group" style={{ margin: 0 }}>
                <label className="field-label">Default minimum seconds per answer sheet</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <input type="number" className="field-input" min="30" max="3600" style={{ maxWidth: 140 }}
                    value={settingsDirty.min_time_default ?? settings.min_time_default ?? '300'}
                    onChange={e => setSetting('min_time_default', e.target.value)} />
                  <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>seconds</span>
                </div>
                <span style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 4, display: 'block' }}>
                  Evaluators averaging below this time per sheet will be red-flagged.
                </span>
              </div>
              <div className="toggle-row">
                <div className="toggle-row-info">
                  <span className="toggle-label">Send email when evaluator is red-flagged</span>
                  <span className="toggle-desc">Notify Admin/HE when an evaluator repeatedly falls below threshold</span>
                </div>
                <button className={`toggle-switch ${(settingsDirty.min_time_warning_email ?? settings.min_time_warning_email) === '1' ? 'on' : ''}`}
                  onClick={() => setSetting('min_time_warning_email',
                    (settingsDirty.min_time_warning_email ?? settings.min_time_warning_email) === '1' ? '0' : '1')} />
              </div>
            </div>

            {/* Tab-Switch Detection */}
            <div className="settings-group-label">Tab-Switch Detection</div>
            <div className="settings-group-block">
              <div className="field-group" style={{ margin: 0 }}>
                <label className="field-label">Tab switches before flagging (per page)</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <input type="number" className="field-input" min="1" max="20" style={{ maxWidth: 140 }}
                    value={settingsDirty.tab_switch_flag_threshold ?? settings.tab_switch_flag_threshold ?? '3'}
                    onChange={e => setSetting('tab_switch_flag_threshold', e.target.value)} />
                  <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>times</span>
                </div>
              </div>
            </div>

            <div className="settings-actions">
              <button className="btn btn-primary" onClick={saveMonitoringSettings}>
                <CheckCircle2 size={13} /> Save Monitoring Settings
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Audit Log Tab ──────────────────────────────────────────────────────── */}
      {activeTab === 'audit' && (
        <div className="settings-section">
          <div className="settings-header">
            <div className="settings-header-icon"><Activity size={17} /></div>
            <div><h3>Activity Audit Log</h3><p>API requests, client events, and errors (Admin only). Use module filter <code>web_client</code> for browser activity.</p></div>
          </div>
          <div className="settings-body">
            {/* Filter bar */}
            <div className="audit-filters">
              <input className="field-input" placeholder="Module (auth, eval, admin…)"
                value={auditFilter.moduleName}
                onChange={e => setAuditFilter(f => ({ ...f, moduleName: e.target.value }))} />
              <input className="field-input" placeholder="Action type"
                value={auditFilter.actionType}
                onChange={e => setAuditFilter(f => ({ ...f, actionType: e.target.value }))} />
              <input type="date" className="field-input"
                value={auditFilter.dateFrom}
                onChange={e => setAuditFilter(f => ({ ...f, dateFrom: e.target.value }))} />
              <input type="date" className="field-input"
                value={auditFilter.dateTo}
                onChange={e => setAuditFilter(f => ({ ...f, dateTo: e.target.value }))} />
              <button className="btn btn-primary btn-sm" onClick={() => loadAuditLogs(auditFilter)}>
                <Search size={13} /> Search
              </button>
            </div>
            {loading ? (
              <div className="loading"><Loader2 size={20} className="spin" /></div>
            ) : (
              <>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 10 }}>
                  Showing {auditLogs.length} of {auditTotal} entries
                </div>
                <div className="audit-table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Time</th><th>User</th><th>Module</th><th>Action</th><th>IP</th><th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {auditLogs.map((log) => {
                        const logId = log.ActivityID ?? log.LogID;
                        const expanded = expandedLog === logId;
                        return (
                          <Fragment key={logId}>
                            <tr className="audit-row"
                              onClick={() => setExpandedLog(expanded ? null : logId)}>
                              <td className="mono" style={{ fontSize: 11 }}>
                                {new Date(log.CreatedAt).toLocaleString('en-IN')}
                              </td>
                              <td>{log.FullName || log.Username || '—'}</td>
                              <td><span className="badge badge-blue">{log.ModuleName}</span></td>
                              <td style={{ fontSize: 12 }}>{log.ActionType}</td>
                              <td className="mono" style={{ fontSize: 11 }}>{log.IPAddress || '—'}</td>
                              <td>{expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}</td>
                            </tr>
                            {expanded && (
                              <tr>
                                <td colSpan={6} className="audit-expand">
                                  {log.OldValues != null && log.OldValues !== '' && (
                                    <div><strong>Old:</strong>
                                      <pre className="audit-json">{formatAuditPayload(log.OldValues)}</pre>
                                    </div>
                                  )}
                                  {log.NewValues != null && log.NewValues !== '' && (
                                    <div><strong>New:</strong>
                                      <pre className="audit-json">{formatAuditPayload(log.NewValues)}</pre>
                                    </div>
                                  )}
                                  {log.DeviceInfo && (
                                    <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 6 }}>
                                      <Shield size={10} /> {log.DeviceInfo}
                                    </div>
                                  )}
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        );
                      })}
                      {!auditLogs.length && (
                        <tr><td colSpan={6} style={{ textAlign: 'center', padding: 32, color: 'var(--color-text-muted)' }}>
                          No audit log entries found
                        </td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
