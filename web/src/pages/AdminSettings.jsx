import { useState, useEffect, useRef } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import {
  Settings, Users, Mail, FileText, Plus, KeyRound, Trash2,
  CheckCircle2, AlertCircle, Plug, Loader2, Pencil, Eye,
  ArrowLeft, ToggleLeft, ToggleRight, ShieldCheck,
  Camera, Activity, Clock, Search, ChevronDown, ChevronUp, Shield,
  ScanLine, Monitor, Layers, Printer, BookOpen, X, ClipboardList, FolderOpen
} from 'lucide-react';
import * as faceapi from 'face-api.js';
import { api } from '../services/api';
import ZonePicker from '../components/ZonePicker';
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
  { id: 'scanner',    label: 'Scan settings',     icon: ScanLine },
];

/** Sub-tab ids must match URL ?subtab= and sidebar links. */
const VALID_SCAN_SUBTABS = ['exams', 'papers', 'workstations', 'scanUsers', 'templates', 'printers', 'booklets', 'outputPaths', 'scanQc'];

const SCAN_SUB_TABS = [
  { id: 'exams',      label: 'Exams',            icon: BookOpen },
  { id: 'papers',     label: 'Papers',           icon: FileText },
  { id: 'workstations', label: 'Workstations',   icon: Monitor },
  { id: 'scanUsers',  label: 'Scan users',       icon: Users },
  { id: 'templates',  label: 'Scan Templates',   icon: Layers },
  { id: 'printers',   label: 'Printer Profiles', icon: Printer },
  { id: 'booklets',   label: 'Scanned booklets', icon: ClipboardList },
  { id: 'outputPaths', label: 'Scan output paths', icon: FolderOpen },
  { id: 'scanQc',    label: 'Scan QC flags',    icon: ShieldCheck },
];

const SCANNER_BLANK_EXAM = { examCode: '', examName: '', examYear: new Date().getFullYear() };
const SCANNER_BLANK_PAPER = { examId: '', paperCode: '', paperName: '', totalPages: 24, bookletPageCounts: '' };
const SCANNER_BLANK_WS = { locationId: '', workstationCode: '', workstationName: '', assignedUsername: '', printerProfileId: '', isActive: 1 };
const SCANNER_BLANK_TPL = {
  templateName: '', description: '', pageCount: 24, dpi: 300, colorMode: 'Grayscale',
  pageSize: 'A4', duplexMode: 'Simplex', jpegQuality: 85, brightnessAdj: 128, contrastAdj: 128,
  threshold: 128, pdfJpegQuality: 70, pdfMaxDpi: 150, skipBlankPages: false, deSkew: true,
  barcodeZones: [], pageBarcodeStartPage: 2, pdfFilenameFormat: '{BookletId}',
  uploadScheduleMode: 'Immediate', uploadIntervalHours: 0, isActive: 1,
};

const UPLOAD_SCHEDULE_OPTIONS = [
  { value: 'Immediate', label: 'Immediate' },
  { value: 'Every4h',   label: 'Every 4 hours' },
  { value: 'Every8h',   label: 'Every 8 hours' },
  { value: 'Every12h',  label: 'Every 12 hours' },
  { value: 'Custom',    label: 'Custom interval' },
  { value: 'EndOfDay',  label: 'End of day (23:00)' },
];

const BARCODE_PAGE_SCOPE_OPTIONS = [
  { value: 'FirstPage',     label: 'First page only' },
  { value: 'AllPages',      label: 'All pages' },
  { value: 'FromPage',      label: 'From page N' },
  { value: 'SpecificPages', label: 'Specific page' },
];

const BARCODE_HINT_OPTIONS = ['ANY', 'QR', 'CODE128', 'CODE39'];

// PDF compression presets — (pdfJpegQuality, pdfMaxDpi, label, approx size for 42 colour A4 pages)
const PDF_PRESETS = [
  { label: 'Archive — original quality (≈14 MB / 42 pages)', pdfJpegQuality: 85, pdfMaxDpi: 0 },
  { label: 'High — 200 DPI / 75 % quality (≈6 MB / 42 pages)',  pdfJpegQuality: 75, pdfMaxDpi: 200 },
  { label: 'Standard — 150 DPI / 70 % quality (≈3 MB / 42 pages)', pdfJpegQuality: 70, pdfMaxDpi: 150 },
  { label: 'Small — 150 DPI / 60 % quality (≈2 MB / 42 pages)',  pdfJpegQuality: 60, pdfMaxDpi: 150 },
];
const SCANNER_BLANK_PP = { profileName: '', brand: 'Generic', driverType: 'WIA', twainCapabilities: '', isActive: 1 };
const SCANNER_BLANK_SCAN_USER = { username: '', fullName: '', password: '', roleId: '', locationId: '' };

export default function AdminSettings() {
  const [searchParams, setSearchParams] = useSearchParams();
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
      .then(([r, l]) => { setRoles(r); setLocations(l); }).catch(() => {});
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

  // Deep-link: ?tab=scanner&subtab=exams|papers|… or ?tab=users|smtp|…
  useEffect(() => {
    const tab = searchParams.get('tab');
    const subtab = searchParams.get('subtab');
    if (tab === 'scanner') {
      setActiveTab('scanner');
      if (subtab && VALID_SCAN_SUBTABS.includes(subtab)) setScanSubTab(subtab);
      return;
    }
    if (tab && TABS.some((t) => t.id === tab)) setActiveTab(tab);
  }, [searchParams]);

  // Audit log state
  const [auditLogs, setAuditLogs]         = useState([]);
  const [auditTotal, setAuditTotal]       = useState(0);
  const [auditFilter, setAuditFilter]     = useState({ moduleName: '', actionType: '', dateFrom: '', dateTo: '' });
  const [expandedLog, setExpandedLog]     = useState(null);

  // Scanner admin state
  const [scanSubTab, setScanSubTab]       = useState('exams');
  const [scanExams, setScanExams]         = useState([]);
  const [scanPapers, setScanPapers]       = useState([]);
  const [scanWorkstations, setScanWorkstations] = useState([]);
  const [scanTemplates, setScanTemplates] = useState([]);
  const [scanPrinters, setScanPrinters]   = useState([]);
  const [scanLocations, setScanLocations] = useState([]);
  const [scanUsers, setScanUsers]         = useState([]);
  const [scanRoleOptions, setScanRoleOptions] = useState([]);
  const [scanForm, setScanForm]           = useState(null);
  const [scanFormMode, setScanFormMode]   = useState('create');
  const [scanBooklets, setScanBooklets]  = useState([]);
  const [scanBookletsTotal, setScanBookletsTotal] = useState(0);
  const [bookletFilterExamId, setBookletFilterExamId] = useState('');
  const [bookletFilterPaperId, setBookletFilterPaperId] = useState('');
  const [scanOutputPaths, setScanOutputPaths] = useState([]);
  const [outputPathForm, setOutputPathForm] = useState({ pathLabel: '', pathValue: '', displayOrder: 0 });

  // Zone picker state (for template sample image canvas)
  const zoneCanvasRef = useRef(null);
  const [zoneDrawing, setZoneDrawing] = useState(null); // {startX, startY, currentX, currentY}
  const [zoneSampleImageUrl, setZoneSampleImageUrl] = useState(null);
  const [zoneSampleUploading, setZoneSampleUploading] = useState(false);

  // Auto-load sample image when opening a template for edit
  useEffect(() => {
    if (scanFormMode === 'edit' && scanForm.data?.TemplateID) {
      setZoneSampleImageUrl(
        api.scanadmin.getTemplateSampleImageUrl(scanForm.data.TemplateID) + '?t=' + Date.now()
      );
    } else {
      setZoneSampleImageUrl(null);
    }
  }, [scanFormMode, scanForm.data?.TemplateID]);

  useEffect(() => {
    if (activeTab === 'users')      loadUsers();
    if (activeTab === 'smtp')       loadSettings();
    if (activeTab === 'templates')  loadTemplates();
    if (activeTab === 'monitoring') loadSettings();
    if (activeTab === 'audit')      loadAuditLogs();
    if (activeTab === 'scanner')    loadScannerTab();
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === 'scanner') loadScannerSubTab();
  }, [scanSubTab]);

  // Load scanned booklets when on booklets tab or when exam/paper filters change
  useEffect(() => {
    if (activeTab !== 'scanner' || scanSubTab !== 'booklets') return;
    let cancelled = false;
    setLoading(true);
    api.scanadmin.listScannedBooklets({
      examId: bookletFilterExamId ? parseInt(bookletFilterExamId, 10) : undefined,
      paperId: bookletFilterPaperId ? parseInt(bookletFilterPaperId, 10) : undefined,
      limit: 500,
      offset: 0,
    })
      .then((res) => {
        if (!cancelled) {
          setScanBooklets(res.booklets || []);
          setScanBookletsTotal(res.total ?? 0);
        }
      })
      .catch((err) => { if (!cancelled) flash('Load booklets error: ' + err.message, 'error'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [activeTab, scanSubTab, bookletFilterExamId, bookletFilterPaperId]);

  const loadUsers = async () => {
    setLoading(true);
    try { const d = await api.admin.getUsers({ limit: 100, offset: 0 }); setUsers(d.users); setUsersTotal(d.total); }
    catch (err) { flash('Error: ' + err.message, 'error'); }
    finally { setLoading(false); }
  };
  const loadSettings = async () => {
    setLoading(true);
    try {
      const rows = await api.admin.getSettings();
      setSettings(Object.fromEntries(rows.map(r => [r.SettingKey, r.SettingValue]))); setSettingsDirty({});
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
      const params = { limit: 100, offset: 0, ...filter };
      const d = await api.auth.activityLogs(params);
      setAuditLogs(d.logs || []);
      setAuditTotal(d.total || 0);
    } catch (err) { flash('Error: ' + err.message, 'error'); }
    finally { setLoading(false); }
  };

  const loadScannerTab = async () => {
    try {
      const [locs, users] = await Promise.all([
        api.scanadmin.listLocations(),
        api.scanadmin.listScanUsers(),
      ]);
      setScanLocations(locs);
      setScanUsers(users);
    } catch (err) { flash('Scanner admin load error: ' + err.message, 'error'); }
    loadScannerSubTab();
  };

  const loadScannerSubTab = async () => {
    setLoading(true);
    try {
      if (scanSubTab === 'exams')       setScanExams(await api.scanadmin.listExams());
      if (scanSubTab === 'papers')      setScanPapers(await api.scanadmin.listPapers());
      if (scanSubTab === 'workstations') setScanWorkstations(await api.scanadmin.listWorkstations());
      if (scanSubTab === 'templates')   setScanTemplates(await api.scanadmin.listTemplates());
      if (scanSubTab === 'printers')    setScanPrinters(await api.scanadmin.listPrinterProfiles());
      if (scanSubTab === 'booklets') {
        const [exams, papers] = await Promise.all([
          api.scanadmin.listExams(),
          api.scanadmin.listPapers(),
        ]);
        setScanExams(exams);
        setScanPapers(papers);
      }
      if (scanSubTab === 'outputPaths') {
        const res = await api.scanadmin.listOutputPaths();
        setScanOutputPaths(Array.isArray(res) ? res : (res?.data ?? []));
      }
      if (scanSubTab === 'scanQc') {
        const locs = await api.scanadmin.listLocations();
        setScanLocations(locs);
      }
      if (scanSubTab === 'scanUsers') {
        const [roles, users] = await Promise.all([
          api.scanadmin.listScanRolesForUserManagement(),
          api.scanadmin.listScanUsers(),
        ]);
        setScanRoleOptions(Array.isArray(roles) ? roles : (roles?.data ?? []));
        setScanUsers(Array.isArray(users) ? users : (users?.data ?? []));
      }
    } catch (err) { flash('Load error: ' + err.message, 'error'); }
    finally { setLoading(false); }
  };

  const openScanForm = (entity, blank) => {
    setScanFormMode('create');
    setScanForm({ entity, data: { ...blank } });
  };

  const editScanForm = (entity, row) => {
    setScanFormMode('edit');
    setScanForm({ entity, data: { ...row } });
  };

  const handleScanSave = async () => {
    const { entity, data } = scanForm;
    try {
      if (entity === 'exams') {
        if (scanFormMode === 'create') await api.scanadmin.createExam(data);
        else await api.scanadmin.updateExam(data.ExamID, data);
      } else if (entity === 'papers') {
        if (scanFormMode === 'create') await api.scanadmin.createPaper(data);
        else await api.scanadmin.updatePaper(data.PaperID, data);
      } else if (entity === 'workstations') {
        if (scanFormMode === 'create') await api.scanadmin.createWorkstation(data);
        else await api.scanadmin.updateWorkstation(data.WorkstationID, data);
      } else if (entity === 'templates') {
        if (scanFormMode === 'create') await api.scanadmin.createTemplate(data);
        else await api.scanadmin.updateTemplate(data.TemplateID, data);
      } else if (entity === 'printers') {
        if (scanFormMode === 'create') await api.scanadmin.createPrinterProfile(data);
        else await api.scanadmin.updatePrinterProfile(data.ProfileID, data);
      } else if (entity === 'scanUsers') {
        const roleId = parseInt(data.roleId, 10);
        if (!Number.isFinite(roleId) || roleId < 1) {
          flash('Select a role (Operator, Vendor QC, Customer QC, or Admin).', 'error');
          return;
        }
        const lid = data.locationId === '' || data.locationId == null ? null : parseInt(data.locationId, 10);
        const locationId = Number.isFinite(lid) && lid > 0 ? lid : null;
        if (scanFormMode === 'create') {
          if (!String(data.password || '').trim()) {
            flash('Password is required for new scan users.', 'error');
            return;
          }
          await api.scanadmin.createScanUser({
            username: String(data.username || '').trim(),
            fullName: String(data.fullName || '').trim(),
            password: data.password,
            roleId,
            locationId,
          });
        } else {
          const body = {
            fullName: String(data.fullName || '').trim(),
            roleId,
            locationId,
            isActive: data.isActive === 1 || data.isActive === true,
          };
          if (data.password && String(data.password).trim()) body.password = String(data.password).trim();
          await api.scanadmin.updateScanUser(data.UserID, body);
        }
      }
      flash(scanFormMode === 'create' ? 'Created successfully' : 'Updated successfully');
      setScanForm(null);
      if (entity === 'scanUsers') await loadScannerTab();
      else loadScannerSubTab();
    } catch (err) { flash('Error: ' + err.message, 'error'); }
  };

  const handleScanDelete = async (entity, id) => {
    if (!window.confirm('Delete this record?')) return;
    try {
      if (entity === 'exams')       await api.scanadmin.deleteExam(id);
      if (entity === 'papers')      await api.scanadmin.deletePaper(id);
      if (entity === 'workstations') await api.scanadmin.deleteWorkstation(id);
      if (entity === 'templates')   await api.scanadmin.deleteTemplate(id);
      if (entity === 'printers')    await api.scanadmin.deletePrinterProfile(id);
      if (entity === 'scanUsers')   await api.scanadmin.deleteScanUser(id);
      flash('Deleted');
      if (entity === 'scanUsers') await loadScannerTab();
      else loadScannerSubTab();
    } catch (err) { flash('Error: ' + err.message, 'error'); }
  };

  const toggleScanLocQc = (locationId, field) => {
    setScanLocations((prev) =>
      prev.map((l) => {
        if (l.LocationID !== locationId) return l;
        const cur = Number(l[field] ?? 1);
        return { ...l, [field]: cur ? 0 : 1 };
      })
    );
  };

  const saveScanLocationQc = async (locationId) => {
    const loc = scanLocations.find((l) => l.LocationID === locationId);
    if (!loc) return;
    try {
      await api.scanadmin.updateScanQcSettings({
        locationId: loc.LocationID,
        vendorQcEnabled: !!Number(loc.VendorQcEnabled ?? 1),
        customerQcEnabled: !!Number(loc.CustomerQcEnabled ?? 1),
      });
      flash('QC settings saved', 'success');
      const locs = await api.scanadmin.listLocations();
      setScanLocations(locs);
    } catch (err) {
      flash(err.message || 'Save failed', 'error');
    }
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
          <p className="admin-page-subtitle">Evaluation users, SMTP, templates, monitoring — plus Scan settings (exams, papers, operators, QC)</p>
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
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            className={`tab-btn ${activeTab === id ? 'active' : ''}`}
            onClick={() => {
              setActiveTab(id);
              if (id === 'scanner') {
                const sub = VALID_SCAN_SUBTABS.includes(scanSubTab) ? scanSubTab : 'exams';
                setSearchParams({ tab: 'scanner', subtab: sub });
              } else {
                setSearchParams({ tab: id });
              }
            }}
          >
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
                      w.document.write(editTemplate.BodyHtml
                        .replace('{{fullName}}','John Doe').replace('{{username}}','johndoe')
                        .replace('{{tempPassword}}','TempPass@123').replace('{{loginUrl}}','http://localhost:5173')
                        .replace('{{otpCode}}','123456').replace('{{expiryMinutes}}','10')
                        .replace('{{newPassword}}','NewPass@123').replace('{{changedAt}}', new Date().toLocaleString()));
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
            <div><h3>Activity Audit Log</h3><p>Full history of all user actions and system events</p></div>
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
                      {auditLogs.map(log => (
                        <>
                          <tr key={log.LogID} className="audit-row"
                            onClick={() => setExpandedLog(expandedLog === log.LogID ? null : log.LogID)}>
                            <td className="mono" style={{ fontSize: 11 }}>
                              {new Date(log.CreatedAt).toLocaleString('en-IN')}
                            </td>
                            <td>{log.FullName || log.Username || '—'}</td>
                            <td><span className="badge badge-blue">{log.ModuleName}</span></td>
                            <td style={{ fontSize: 12 }}>{log.ActionType}</td>
                            <td className="mono" style={{ fontSize: 11 }}>{log.IPAddress || '—'}</td>
                            <td>{expandedLog === log.LogID ? <ChevronUp size={13} /> : <ChevronDown size={13} />}</td>
                          </tr>
                          {expandedLog === log.LogID && (
                            <tr key={`${log.LogID}-exp`}>
                              <td colSpan={6} className="audit-expand">
                                {log.OldValues && (
                                  <div><strong>Old:</strong>
                                    <pre className="audit-json">{JSON.stringify(JSON.parse(log.OldValues), null, 2)}</pre>
                                  </div>
                                )}
                                {log.NewValues && (
                                  <div><strong>New:</strong>
                                    <pre className="audit-json">{JSON.stringify(JSON.parse(log.NewValues), null, 2)}</pre>
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
                        </>
                      ))}
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
      {/* ── Scan settings (scanner DB: exams, papers, …) ─────────────────────── */}
      {activeTab === 'scanner' && (
        <div className="scanner-admin-wrap">
          {/* Sub-tab bar */}
          <div className="scan-subtabs">
            {SCAN_SUB_TABS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                className={`scan-subtab-btn ${scanSubTab === id ? 'active' : ''}`}
                onClick={() => {
                  setScanSubTab(id);
                  setScanForm(null);
                  setSearchParams({ tab: 'scanner', subtab: id });
                }}
              >
                <Icon size={14} /> {label}
              </button>
            ))}
          </div>

          {/* ── Modal Form ── */}
          {scanForm && (
            <div className="scan-form-modal-overlay">
              <div className="scan-form-modal">
                <div className="scan-form-modal-header">
                  <h3>{scanFormMode === 'create' ? 'Add' : 'Edit'} {
                    { exams: 'Exam', papers: 'Paper', workstations: 'Workstation', templates: 'Scan Template', printers: 'Printer Profile', scanUsers: 'Scan user' }[scanForm.entity]
                  }</h3>
                  <button className="btn btn-ghost btn-sm" onClick={() => setScanForm(null)}><X size={14} /></button>
                </div>
                <div className="scan-form-body">
                  {/* Exam fields */}
                  {scanForm.entity === 'exams' && (<>
                    <div className="field-group"><label className="field-label">Exam Code *</label>
                      <input className="field-input" value={scanForm.data.examCode || ''} onChange={e => setScanForm(f => ({ ...f, data: { ...f.data, examCode: e.target.value } }))} /></div>
                    <div className="field-group"><label className="field-label">Exam Name *</label>
                      <input className="field-input" value={scanForm.data.examName || ''} onChange={e => setScanForm(f => ({ ...f, data: { ...f.data, examName: e.target.value } }))} /></div>
                    <div className="field-group"><label className="field-label">Exam Year</label>
                      <input className="field-input" type="number" value={scanForm.data.examYear || new Date().getFullYear()} onChange={e => setScanForm(f => ({ ...f, data: { ...f.data, examYear: e.target.value } }))} /></div>
                  </>)}

                  {/* Paper fields */}
                  {scanForm.entity === 'papers' && (<>
                    <div className="field-group"><label className="field-label">Exam *</label>
                      <select className="field-input" value={scanForm.data.examId || ''} onChange={e => setScanForm(f => ({ ...f, data: { ...f.data, examId: e.target.value } }))}>
                        <option value="">— Select Exam —</option>
                        {scanExams.map(e => <option key={e.ExamID} value={e.ExamID}>{e.ExamCode} — {e.ExamName}</option>)}
                      </select></div>
                    <div className="field-group"><label className="field-label">Paper Code *</label>
                      <input className="field-input" value={scanForm.data.paperCode || ''} onChange={e => setScanForm(f => ({ ...f, data: { ...f.data, paperCode: e.target.value } }))} /></div>
                    <div className="field-group"><label className="field-label">Paper Name *</label>
                      <input className="field-input" value={scanForm.data.paperName || ''} onChange={e => setScanForm(f => ({ ...f, data: { ...f.data, paperName: e.target.value } }))} /></div>
                    <div className="field-group"><label className="field-label">Total Pages</label>
                      <input className="field-input" type="number" value={scanForm.data.totalPages || 24} onChange={e => setScanForm(f => ({ ...f, data: { ...f.data, totalPages: e.target.value } }))} /></div>
                    <div className="field-group"><label className="field-label">Booklet Page Counts (e.g. 16,24)</label>
                      <input className="field-input" value={scanForm.data.bookletPageCounts || ''} onChange={e => setScanForm(f => ({ ...f, data: { ...f.data, bookletPageCounts: e.target.value } }))} /></div>
                  </>)}

                  {/* Workstation fields */}
                  {scanForm.entity === 'workstations' && (<>
                    <div className="field-group"><label className="field-label">Location *</label>
                      <select className="field-input" value={scanForm.data.locationId || ''} onChange={e => setScanForm(f => ({ ...f, data: { ...f.data, locationId: e.target.value } }))}>
                        <option value="">— Select Location —</option>
                        {scanLocations.map(l => <option key={l.LocationID} value={l.LocationID}>{l.LocationName}</option>)}
                      </select></div>
                    <div className="field-group"><label className="field-label">Workstation Code *</label>
                      <input className="field-input" value={scanForm.data.workstationCode || ''} onChange={e => setScanForm(f => ({ ...f, data: { ...f.data, workstationCode: e.target.value } }))} /></div>
                    <div className="field-group"><label className="field-label">Workstation Name *</label>
                      <input className="field-input" value={scanForm.data.workstationName || ''} onChange={e => setScanForm(f => ({ ...f, data: { ...f.data, workstationName: e.target.value } }))} /></div>
                    <div className="field-group"><label className="field-label">Assign Operator (username)</label>
                      <select className="field-input" value={scanForm.data.assignedUsername || ''} onChange={e => setScanForm(f => ({ ...f, data: { ...f.data, assignedUsername: e.target.value } }))}>
                        <option value="">— Unassigned —</option>
                        {scanUsers.filter(u => Number(u.IsActive) === 1).map(u => <option key={u.UserID} value={u.Username}>{u.FullName} ({u.Username})</option>)}
                      </select></div>
                    <div className="field-group"><label className="field-label">Printer Profile</label>
                      <select className="field-input" value={scanForm.data.printerProfileId || ''} onChange={e => setScanForm(f => ({ ...f, data: { ...f.data, printerProfileId: e.target.value } }))}>
                        <option value="">— None (WIA Default) —</option>
                        {scanPrinters.map(p => <option key={p.ProfileID} value={p.ProfileID}>{p.ProfileName}</option>)}
                      </select></div>
                    <div className="field-group"><label className="field-label">Active</label>
                      <select className="field-input" value={scanForm.data.isActive ?? 1} onChange={e => setScanForm(f => ({ ...f, data: { ...f.data, isActive: parseInt(e.target.value) } }))}>
                        <option value={1}>Yes</option><option value={0}>No</option>
                      </select></div>
                  </>)}

                  {/* Scan Template fields */}
                  {scanForm.entity === 'templates' && (<>
                    <div className="field-group"><label className="field-label">Template Name *</label>
                      <input className="field-input" value={scanForm.data.templateName || ''} onChange={e => setScanForm(f => ({ ...f, data: { ...f.data, templateName: e.target.value } }))} /></div>
                    <div className="field-group"><label className="field-label">Description</label>
                      <input className="field-input" value={scanForm.data.description || ''} onChange={e => setScanForm(f => ({ ...f, data: { ...f.data, description: e.target.value } }))} /></div>
                    <div className="scan-form-grid-3">
                      <div className="field-group"><label className="field-label">Page Count *</label>
                        <input className="field-input" type="number" value={scanForm.data.pageCount || 24} onChange={e => setScanForm(f => ({ ...f, data: { ...f.data, pageCount: parseInt(e.target.value) } }))} /></div>
                      <div className="field-group"><label className="field-label">DPI</label>
                        <select className="field-input" value={scanForm.data.dpi || 300} onChange={e => setScanForm(f => ({ ...f, data: { ...f.data, dpi: parseInt(e.target.value) } }))}>
                          {[100,150,200,300,400,600].map(v => <option key={v} value={v}>{v}</option>)}
                        </select></div>
                      <div className="field-group"><label className="field-label">JPEG Quality</label>
                        <input className="field-input" type="number" min="1" max="100" value={scanForm.data.jpegQuality || 85} onChange={e => setScanForm(f => ({ ...f, data: { ...f.data, jpegQuality: parseInt(e.target.value) } }))} /></div>
                      <div className="field-group"><label className="field-label">Color Mode</label>
                        <select className="field-input" value={scanForm.data.colorMode || 'Grayscale'} onChange={e => setScanForm(f => ({ ...f, data: { ...f.data, colorMode: e.target.value } }))}>
                          {['Color','Grayscale','BlackWhite'].map(v => <option key={v}>{v}</option>)}
                        </select></div>
                      <div className="field-group"><label className="field-label">Page Size</label>
                        <select className="field-input" value={scanForm.data.pageSize || 'A4'} onChange={e => setScanForm(f => ({ ...f, data: { ...f.data, pageSize: e.target.value } }))}>
                          {['A4','A3','Letter','Legal'].map(v => <option key={v}>{v}</option>)}
                        </select></div>
                      <div className="field-group"><label className="field-label">Duplex Mode</label>
                        <select className="field-input" value={scanForm.data.duplexMode || 'Simplex'} onChange={e => setScanForm(f => ({ ...f, data: { ...f.data, duplexMode: e.target.value } }))}>
                          {['Simplex','Duplex'].map(v => <option key={v}>{v}</option>)}
                        </select></div>
                      <div className="field-group"><label className="field-label">Brightness (0-255, 128=neutral)</label>
                        <input className="field-input" type="number" min="0" max="255" value={scanForm.data.brightnessAdj ?? 128} onChange={e => setScanForm(f => ({ ...f, data: { ...f.data, brightnessAdj: parseInt(e.target.value) } }))} /></div>
                      <div className="field-group"><label className="field-label">Contrast (0-255, 128=neutral)</label>
                        <input className="field-input" type="number" min="0" max="255" value={scanForm.data.contrastAdj ?? 128} onChange={e => setScanForm(f => ({ ...f, data: { ...f.data, contrastAdj: parseInt(e.target.value) } }))} /></div>
                      {scanForm.data.colorMode === 'BlackWhite' && (
                        <div className="field-group"><label className="field-label">Threshold (0-255, 128=neutral)</label>
                          <input className="field-input" type="number" min="0" max="255" value={scanForm.data.threshold ?? 128} onChange={e => setScanForm(f => ({ ...f, data: { ...f.data, threshold: parseInt(e.target.value) } }))} /></div>
                      )}
                    </div>

                    {/* ── PDF Compression ──────────────────────────────── */}
                    <div style={{marginTop:'12px',paddingTop:'10px',borderTop:'1px solid var(--border-color)'}}>
                      <div style={{fontWeight:600,fontSize:'0.75rem',color:'var(--text-muted)',letterSpacing:'0.06em',marginBottom:'8px'}}>PDF COMPRESSION</div>
                      <div className="field-group" style={{marginBottom:'8px'}}>
                        <label className="field-label">Quick Preset</label>
                        <select className="field-input" value=""
                          onChange={e => {
                            const p = PDF_PRESETS[parseInt(e.target.value)];
                            if (p) setScanForm(f => ({ ...f, data: { ...f.data, pdfJpegQuality: p.pdfJpegQuality, pdfMaxDpi: p.pdfMaxDpi } }));
                          }}>
                          <option value="">— choose to auto-fill below —</option>
                          {PDF_PRESETS.map((p, i) => <option key={i} value={i}>{p.label}</option>)}
                        </select>
                      </div>
                      <div className="scan-form-grid-3">
                        <div className="field-group">
                          <label className="field-label">PDF JPEG Quality (1-100)</label>
                          <input className="field-input" type="number" min="1" max="100"
                            value={scanForm.data.pdfJpegQuality ?? 70}
                            onChange={e => setScanForm(f => ({ ...f, data: { ...f.data, pdfJpegQuality: parseInt(e.target.value) } }))} />
                        </div>
                        <div className="field-group">
                          <label className="field-label">PDF Max DPI (0=native)</label>
                          <input className="field-input" type="number" min="0" max="600"
                            value={scanForm.data.pdfMaxDpi ?? 150}
                            onChange={e => setScanForm(f => ({ ...f, data: { ...f.data, pdfMaxDpi: parseInt(e.target.value) } }))} />
                        </div>
                        <div className="field-group">
                          <label className="field-label">Est. size (42 colour A4 pages)</label>
                          <input className="field-input" readOnly
                            value={(() => {
                              const dpi = scanForm.data.pdfMaxDpi ?? 150;
                              const q   = scanForm.data.pdfJpegQuality ?? 70;
                              const dpiEff = dpi === 0 ? 300 : Math.min(dpi, 300);
                              // Empirical: ~(dpiEff/300)^2 * (q/85) * 325 KB per page at baseline
                              const kbPerPage = Math.round((dpiEff / 300) ** 2 * (q / 85) * 325);
                              const mb = ((kbPerPage * 42) / 1024).toFixed(1);
                              return `~${mb} MB`;
                            })()}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="scan-form-toggles">
                      <label className="scan-toggle-label">
                        <input type="checkbox" checked={!!scanForm.data.skipBlankPages} onChange={e => setScanForm(f => ({ ...f, data: { ...f.data, skipBlankPages: e.target.checked } }))} />
                        Skip Blank Pages
                      </label>
                      <label className="scan-toggle-label">
                        <input type="checkbox" checked={scanForm.data.deSkew !== false} onChange={e => setScanForm(f => ({ ...f, data: { ...f.data, deSkew: e.target.checked } }))} />
                        Auto De-Skew
                      </label>
                    </div>

                    {/* ── Upload Schedule ──────────────────────────────── */}
                    <div style={{marginTop:'12px',paddingTop:'10px',borderTop:'1px solid var(--border-color)'}}>
                      <div style={{fontWeight:600,fontSize:'0.75rem',color:'var(--text-muted)',letterSpacing:'0.06em',marginBottom:'8px'}}>UPLOAD SCHEDULE</div>
                      <div style={{display:'flex',flexWrap:'wrap',gap:'8px',marginBottom:'8px'}}>
                        {UPLOAD_SCHEDULE_OPTIONS.map(opt => (
                          <label key={opt.value} style={{display:'flex',alignItems:'center',gap:'6px',cursor:'pointer',fontSize:'0.85rem'}}>
                            <input type="radio" name="uploadScheduleMode"
                              checked={(scanForm.data.uploadScheduleMode || 'Immediate') === opt.value}
                              onChange={() => setScanForm(f => ({ ...f, data: { ...f.data, uploadScheduleMode: opt.value } }))} />
                            {opt.label}
                          </label>
                        ))}
                      </div>
                      {(scanForm.data.uploadScheduleMode === 'Custom') && (
                        <div className="field-group" style={{maxWidth:'200px'}}>
                          <label className="field-label">Interval (hours)</label>
                          <input className="field-input" type="number" min="1" max="24" step="0.5"
                            value={scanForm.data.uploadIntervalHours || 1}
                            onChange={e => setScanForm(f => ({ ...f, data: { ...f.data, uploadIntervalHours: parseFloat(e.target.value) } }))} />
                        </div>
                      )}
                    </div>

                    {/* ── PDF Filename Format ───────────────────────────── */}
                    <div style={{marginTop:'12px',paddingTop:'10px',borderTop:'1px solid var(--border-color)'}}>
                      <div style={{fontWeight:600,fontSize:'0.75rem',color:'var(--text-muted)',letterSpacing:'0.06em',marginBottom:'8px'}}>PDF FILENAME FORMAT</div>
                      <div className="field-group">
                        <label className="field-label">Format (use tokens in curly braces)</label>
                        <input className="field-input"
                          value={scanForm.data.pdfFilenameFormat || '{BookletId}'}
                          onChange={e => setScanForm(f => ({ ...f, data: { ...f.data, pdfFilenameFormat: e.target.value } }))}
                          placeholder="{BookletId}" />
                        <div style={{fontSize:'0.72rem',color:'var(--text-muted)',marginTop:'4px',lineHeight:'1.6'}}>
                          Available tokens: <code style={{background:'var(--bg-secondary)',padding:'1px 4px',borderRadius:'3px'}}>{'{BookletId}'}</code>{' '}
                          <code style={{background:'var(--bg-secondary)',padding:'1px 4px',borderRadius:'3px'}}>{'{ExamCode}'}</code>{' '}
                          <code style={{background:'var(--bg-secondary)',padding:'1px 4px',borderRadius:'3px'}}>{'{PaperCode}'}</code>{' '}
                          <code style={{background:'var(--bg-secondary)',padding:'1px 4px',borderRadius:'3px'}}>{'{RollNo}'}</code>{' '}
                          <code style={{background:'var(--bg-secondary)',padding:'1px 4px',borderRadius:'3px'}}>{'{Serial}'}</code>{' '}
                          <code style={{background:'var(--bg-secondary)',padding:'1px 4px',borderRadius:'3px'}}>{'{ScanDate}'}</code>{' '}
                          <code style={{background:'var(--bg-secondary)',padding:'1px 4px',borderRadius:'3px'}}>{'{PageCount}'}</code>
                          {(scanForm.data.barcodeZones || []).map(z => z.name).filter(Boolean).map(n => (
                            <span key={n}>{' '}<code style={{background:'var(--bg-secondary)',padding:'1px 4px',borderRadius:'3px'}}>{`{${n}}`}</code></span>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* ── Barcode Zones ─────────────────────────────────── */}
                    <div style={{marginTop:'12px',paddingTop:'10px',borderTop:'1px solid var(--border-color)'}}>
                      <div style={{fontWeight:600,fontSize:'0.75rem',color:'var(--text-muted)',letterSpacing:'0.06em',marginBottom:'8px'}}>BARCODE / QR ZONES</div>
                      <div className="scan-form-grid-3" style={{marginBottom:'8px'}}>
                        <div className="field-group">
                          <label className="field-label">Page barcode starts from page</label>
                          <input className="field-input" type="number" min="1"
                            value={scanForm.data.pageBarcodeStartPage ?? 2}
                            onChange={e => setScanForm(f => ({ ...f, data: { ...f.data, pageBarcodeStartPage: parseInt(e.target.value) } }))} />
                        </div>
                      </div>

                      {/* Zone rows table */}
                      <div style={{overflowX:'auto'}}>
                        <table style={{width:'100%',borderCollapse:'collapse',fontSize:'0.78rem'}}>
                          <thead>
                            <tr style={{background:'var(--bg-secondary)'}}>
                              {['Zone Name','Page Scope','Page #','X %','Y %','W %','H %','Hint',''].map(h => (
                                <th key={h} style={{padding:'4px 6px',textAlign:'left',fontWeight:600,borderBottom:'1px solid var(--border-color)',whiteSpace:'nowrap'}}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {(scanForm.data.barcodeZones || []).map((zone, idx) => (
                              <tr key={idx}>
                                <td style={{padding:'3px 4px'}}>
                                  <input style={{width:'90px'}} className="field-input" value={zone.name || ''}
                                    onChange={e => setScanForm(f => { const z=[...f.data.barcodeZones]; z[idx]={...z[idx],name:e.target.value}; return {...f,data:{...f.data,barcodeZones:z}}; })} /></td>
                                <td style={{padding:'3px 4px'}}>
                                  <select className="field-input" value={zone.pageScope || 'FirstPage'}
                                    onChange={e => setScanForm(f => { const z=[...f.data.barcodeZones]; z[idx]={...z[idx],pageScope:e.target.value}; return {...f,data:{...f.data,barcodeZones:z}}; })}>
                                    {BARCODE_PAGE_SCOPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                                  </select></td>
                                <td style={{padding:'3px 4px'}}>
                                  <input style={{width:'50px'}} className="field-input" type="number" min="1"
                                    value={zone.pageScopeValue || 1}
                                    disabled={zone.pageScope === 'FirstPage' || zone.pageScope === 'AllPages'}
                                    onChange={e => setScanForm(f => { const z=[...f.data.barcodeZones]; z[idx]={...z[idx],pageScopeValue:parseInt(e.target.value)}; return {...f,data:{...f.data,barcodeZones:z}}; })} /></td>
                                {['x','y','w','h'].map(field => (
                                  <td key={field} style={{padding:'3px 4px'}}>
                                    <input style={{width:'54px'}} className="field-input" type="number" min="0" max="100" step="1"
                                      value={Math.round((zone[field] || 0) * 100)}
                                      onChange={e => setScanForm(f => { const z=[...f.data.barcodeZones]; z[idx]={...z[idx],[field]:parseFloat(e.target.value)/100}; return {...f,data:{...f.data,barcodeZones:z}}; })} /></td>
                                ))}
                                <td style={{padding:'3px 4px'}}>
                                  <select className="field-input" value={zone.hint || 'ANY'}
                                    onChange={e => setScanForm(f => { const z=[...f.data.barcodeZones]; z[idx]={...z[idx],hint:e.target.value}; return {...f,data:{...f.data,barcodeZones:z}}; })}>
                                    {BARCODE_HINT_OPTIONS.map(h => <option key={h}>{h}</option>)}
                                  </select></td>
                                <td style={{padding:'3px 4px'}}>
                                  <button className="btn btn-ghost btn-sm" style={{color:'var(--danger)'}}
                                    onClick={() => setScanForm(f => { const z=f.data.barcodeZones.filter((_,i)=>i!==idx); return {...f,data:{...f.data,barcodeZones:z}}; })}>
                                    <X size={12} />
                                  </button></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <button className="btn btn-ghost btn-sm" style={{marginTop:'6px'}}
                        onClick={() => setScanForm(f => ({ ...f, data: { ...f.data, barcodeZones: [...(f.data.barcodeZones||[]), {name:'',pageScope:'FirstPage',pageScopeValue:1,x:0,y:0,w:0.5,h:0.1,hint:'ANY'}] } }))}>
                        + Add Zone
                      </button>
                    </div>

                    {/* ── Sample Page / Zone Picker ─────────────────────── */}
                    {scanFormMode === 'edit' && scanForm.data.TemplateID && (
                      <div style={{marginTop:'12px',paddingTop:'10px',borderTop:'1px solid var(--border-color)'}}>
                        <div style={{fontWeight:600,fontSize:'0.75rem',color:'var(--text-muted)',letterSpacing:'0.06em',marginBottom:'8px'}}>SAMPLE PAGE &amp; ZONE PICKER</div>
                        <div style={{display:'flex',alignItems:'center',gap:'8px',marginBottom:'8px'}}>
                          <label className="btn btn-ghost btn-sm" style={{cursor:'pointer',display:'flex',alignItems:'center',gap:'4px'}}>
                            {zoneSampleUploading ? <Loader2 size={13} className="spin" /> : <Plus size={13} />}
                            Upload Sample Image
                            <input type="file" accept=".jpg,.jpeg,.png" style={{display:'none'}}
                              onChange={async e => {
                                const file = e.target.files?.[0]; if (!file) return;
                                setZoneSampleUploading(true);
                                try {
                                  const fd = new FormData(); fd.append('sampleImage', file);
                                  await api.scanadmin.uploadTemplateSampleImage(scanForm.data.TemplateID, fd);
                                  const url = api.scanadmin.getTemplateSampleImageUrl(scanForm.data.TemplateID) + '?t=' + Date.now();
                                  setZoneSampleImageUrl(url);
                                } catch { /* ignore */ } finally { setZoneSampleUploading(false); }
                              }} />
                          </label>
                          {zoneSampleImageUrl && (
                            <button className="btn btn-ghost btn-sm" onClick={() => { setScanForm(f => ({...f, data: {...f.data, barcodeZones: []}})); }}>
                              Clear Zones
                            </button>
                          )}
                        </div>
                        <ZonePicker
                          templateId={scanForm.data.TemplateID}
                          zones={scanForm.data.barcodeZones || []}
                          onZonesChange={zones => setScanForm(f => ({ ...f, data: { ...f.data, barcodeZones: zones } }))}
                          canvasRef={zoneCanvasRef}
                          externalImageUrl={zoneSampleImageUrl}
                        />
                      </div>
                    )}
                  </>)}

                  {/* Printer Profile fields */}
                  {scanForm.entity === 'printers' && (<>
                    <div className="field-group"><label className="field-label">Profile Name *</label>
                      <input className="field-input" value={scanForm.data.profileName || ''} onChange={e => setScanForm(f => ({ ...f, data: { ...f.data, profileName: e.target.value } }))} /></div>
                    <div className="scan-form-grid-3">
                      <div className="field-group"><label className="field-label">Brand *</label>
                        <select className="field-input" value={scanForm.data.brand || 'Generic'} onChange={e => setScanForm(f => ({ ...f, data: { ...f.data, brand: e.target.value } }))}>
                          {['Fujitsu','Kodak','Canon','Avision','HP','Generic'].map(v => <option key={v}>{v}</option>)}
                        </select></div>
                      <div className="field-group"><label className="field-label">Driver Type</label>
                        <select className="field-input" value={scanForm.data.driverType || 'WIA'} onChange={e => setScanForm(f => ({ ...f, data: { ...f.data, driverType: e.target.value } }))}>
                          <option>WIA</option><option>TWAIN</option>
                        </select></div>
                    </div>
                    <div className="field-group"><label className="field-label">TWAIN Capabilities (JSON)</label>
                      <textarea className="field-input scan-json-textarea" rows={6}
                        value={typeof scanForm.data.twainCapabilities === 'object' && scanForm.data.twainCapabilities
                          ? JSON.stringify(scanForm.data.twainCapabilities, null, 2)
                          : (scanForm.data.twainCapabilities || '')}
                        onChange={e => setScanForm(f => ({ ...f, data: { ...f.data, twainCapabilities: e.target.value } }))}
                        placeholder='{"ICAP_XRESOLUTION": 300, "CAP_DUPLEXENABLED": 0, ...}' /></div>
                  </>)}

                  {scanForm.entity === 'scanUsers' && (<>
                    {scanFormMode === 'create' && (
                      <div className="field-group"><label className="field-label">Username *</label>
                        <input className="field-input" autoComplete="off" value={scanForm.data.username || ''} onChange={e => setScanForm(f => ({ ...f, data: { ...f.data, username: e.target.value } }))} /></div>
                    )}
                    {scanFormMode === 'edit' && (
                      <div className="field-group"><label className="field-label">Username</label>
                        <input className="field-input" readOnly value={scanForm.data.username || ''} /></div>
                    )}
                    <div className="field-group"><label className="field-label">Full name *</label>
                      <input className="field-input" value={scanForm.data.fullName || ''} onChange={e => setScanForm(f => ({ ...f, data: { ...f.data, fullName: e.target.value } }))} /></div>
                    <div className="field-group"><label className="field-label">{scanFormMode === 'create' ? 'Password *' : 'New password (optional)'}</label>
                      <input className="field-input" type="password" autoComplete="new-password" value={scanForm.data.password || ''} onChange={e => setScanForm(f => ({ ...f, data: { ...f.data, password: e.target.value } }))} /></div>
                    <div className="field-group"><label className="field-label">Role *</label>
                      <select className="field-input" value={scanForm.data.roleId ?? ''} onChange={e => setScanForm(f => ({ ...f, data: { ...f.data, roleId: e.target.value } }))}>
                        <option value="">— Select —</option>
                        {scanRoleOptions.map(r => <option key={r.RoleID} value={r.RoleID}>{r.RoleName}</option>)}
                      </select></div>
                    <div className="field-group"><label className="field-label">Location</label>
                      <select className="field-input" value={scanForm.data.locationId ?? ''} onChange={e => setScanForm(f => ({ ...f, data: { ...f.data, locationId: e.target.value } }))}>
                        <option value="">— None —</option>
                        {scanLocations.map(l => <option key={l.LocationID} value={l.LocationID}>{l.LocationName}</option>)}
                      </select></div>
                    {scanFormMode === 'edit' && (
                      <div className="field-group"><label className="field-label">Active</label>
                        <select className="field-input" value={scanForm.data.isActive ?? 1} onChange={e => setScanForm(f => ({ ...f, data: { ...f.data, isActive: parseInt(e.target.value, 10) } }))}>
                          <option value={1}>Yes</option><option value={0}>No</option>
                        </select></div>
                    )}
                  </>)}
                </div>
                <div className="scan-form-actions">
                  <button className="btn btn-primary" onClick={handleScanSave}>
                    <CheckCircle2 size={14} /> {scanFormMode === 'create' ? 'Create' : 'Save Changes'}
                  </button>
                  <button className="btn btn-secondary" onClick={() => setScanForm(null)}>Cancel</button>
                </div>
              </div>
            </div>
          )}

          {/* ── Exams Table ── */}
          {scanSubTab === 'exams' && (
            <div className="scan-section">
              <div className="scan-section-header">
                <h3><BookOpen size={15} /> Exams ({scanExams.length})</h3>
                <button className="btn btn-primary btn-sm" onClick={() => openScanForm('exams', SCANNER_BLANK_EXAM)}>
                  <Plus size={13} /> Add Exam
                </button>
              </div>
              <table className="data-table">
                <thead><tr><th>Code</th><th>Name</th><th>Year</th><th>Active</th><th></th></tr></thead>
                <tbody>
                  {scanExams.map(e => (
                    <tr key={e.ExamID}>
                      <td><code>{e.ExamCode}</code></td>
                      <td>{e.ExamName}</td>
                      <td>{e.ExamYear}</td>
                      <td>{e.IsActive ? <span className="badge badge-green">Yes</span> : <span className="badge badge-red">No</span>}</td>
                      <td className="action-cell">
                        <button className="btn btn-ghost btn-xs" onClick={() => editScanForm('exams', { examCode: e.ExamCode, examName: e.ExamName, examYear: e.ExamYear, isActive: e.IsActive, ExamID: e.ExamID })}><Pencil size={12} /></button>
                        <button className="btn btn-ghost btn-xs btn-danger" onClick={() => handleScanDelete('exams', e.ExamID)}><Trash2 size={12} /></button>
                      </td>
                    </tr>
                  ))}
                  {scanExams.length === 0 && <tr><td colSpan={5} className="empty-row">No exams configured</td></tr>}
                </tbody>
              </table>
            </div>
          )}

          {/* ── Papers Table ── */}
          {scanSubTab === 'papers' && (
            <div className="scan-section">
              <div className="scan-section-header">
                <h3><FileText size={15} /> Papers ({scanPapers.length})</h3>
                <button className="btn btn-primary btn-sm" onClick={() => { if (scanExams.length === 0) api.scanadmin.listExams().then(setScanExams); openScanForm('papers', SCANNER_BLANK_PAPER); }}>
                  <Plus size={13} /> Add Paper
                </button>
              </div>
              <table className="data-table">
                <thead><tr><th>Exam</th><th>Code</th><th>Name</th><th>Pages</th><th>Booklet Sizes</th><th></th></tr></thead>
                <tbody>
                  {scanPapers.map(p => (
                    <tr key={p.PaperID}>
                      <td><span className="badge badge-blue">{p.ExamCode}</span></td>
                      <td><code>{p.PaperCode}</code></td>
                      <td>{p.PaperName}</td>
                      <td>{p.TotalPages}</td>
                      <td>{p.BookletPageCounts || '—'}</td>
                      <td className="action-cell">
                        <button className="btn btn-ghost btn-xs" onClick={() => editScanForm('papers', { paperCode: p.PaperCode, paperName: p.PaperName, examId: p.ExamID, totalPages: p.TotalPages, bookletPageCounts: p.BookletPageCounts, PaperID: p.PaperID })}><Pencil size={12} /></button>
                        <button className="btn btn-ghost btn-xs btn-danger" onClick={() => handleScanDelete('papers', p.PaperID)}><Trash2 size={12} /></button>
                      </td>
                    </tr>
                  ))}
                  {scanPapers.length === 0 && <tr><td colSpan={6} className="empty-row">No papers configured</td></tr>}
                </tbody>
              </table>
            </div>
          )}

          {/* ── Workstations Table ── */}
          {scanSubTab === 'workstations' && (
            <div className="scan-section">
              <div className="scan-section-header">
                <h3><Monitor size={15} /> Workstations ({scanWorkstations.length})</h3>
                <button className="btn btn-primary btn-sm" onClick={() => { if (scanPrinters.length === 0) api.scanadmin.listPrinterProfiles().then(setScanPrinters); openScanForm('workstations', SCANNER_BLANK_WS); }}>
                  <Plus size={13} /> Add Workstation
                </button>
              </div>
              <table className="data-table">
                <thead><tr><th>Code</th><th>Name</th><th>Location</th><th>Operator</th><th>Printer</th><th>Driver</th><th>Active</th><th></th></tr></thead>
                <tbody>
                  {scanWorkstations.map(w => (
                    <tr key={w.WorkstationID}>
                      <td><code>{w.WorkstationCode}</code></td>
                      <td>{w.WorkstationName}</td>
                      <td>{w.LocationName}</td>
                      <td>{w.AssignedUsername || <span className="text-muted">—</span>}</td>
                      <td>{w.PrinterProfileName || <span className="text-muted">Default WIA</span>}</td>
                      <td>{w.DriverType ? <span className={`badge ${w.DriverType === 'TWAIN' ? 'badge-amber' : 'badge-blue'}`}>{w.DriverType}</span> : '—'}</td>
                      <td>{w.IsActive ? <span className="badge badge-green">Yes</span> : <span className="badge badge-red">No</span>}</td>
                      <td className="action-cell">
                        <button className="btn btn-ghost btn-xs" onClick={() => editScanForm('workstations', { workstationCode: w.WorkstationCode, workstationName: w.WorkstationName, locationId: w.LocationID, assignedUsername: w.AssignedUsername, printerProfileId: w.PrinterProfileID, isActive: w.IsActive, WorkstationID: w.WorkstationID })}><Pencil size={12} /></button>
                        <button className="btn btn-ghost btn-xs btn-danger" onClick={() => handleScanDelete('workstations', w.WorkstationID)}><Trash2 size={12} /></button>
                      </td>
                    </tr>
                  ))}
                  {scanWorkstations.length === 0 && <tr><td colSpan={8} className="empty-row">No workstations configured</td></tr>}
                </tbody>
              </table>
            </div>
          )}

          {/* ── Scan users (ScanningDB — scanner / Vendor QC / Customer QC login) ── */}
          {scanSubTab === 'scanUsers' && (
            <div className="scan-section">
              <div className="scan-section-header">
                <h3><Users size={15} /> Scan users ({scanUsers.length})</h3>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => {
                    if (scanRoleOptions.length === 0) {
                      api.scanadmin.listScanRolesForUserManagement().then((r) => {
                        const list = Array.isArray(r) ? r : (r?.data ?? []);
                        setScanRoleOptions(list);
                        openScanForm('scanUsers', { ...SCANNER_BLANK_SCAN_USER, roleId: list[0]?.RoleID ?? '' });
                      }).catch((err) => flash(err.message || 'Could not load roles', 'error'));
                    } else {
                      openScanForm('scanUsers', { ...SCANNER_BLANK_SCAN_USER, roleId: scanRoleOptions[0]?.RoleID ?? '' });
                    }
                  }}
                >
                  <Plus size={13} /> Add scan user
                </button>
              </div>
              <p className="text-muted" style={{ fontSize: '0.85rem', marginBottom: 12 }}>
                These accounts sign in on the scanner desktop app and QC portal (source: scan). Roles: Operator, Vendor QC, Customer QC, or Admin.
              </p>
              {loading && scanSubTab === 'scanUsers' && (
                <div className="loading"><Loader2 size={20} className="spin" /> Loading…</div>
              )}
              {!loading && (
              <table className="data-table">
                <thead><tr><th>Username</th><th>Full name</th><th>Role</th><th>Location</th><th>Active</th><th></th></tr></thead>
                <tbody>
                  {scanUsers.map(u => (
                    <tr key={u.UserID}>
                      <td className="mono">{u.Username}</td>
                      <td>{u.FullName}</td>
                      <td><span className="badge badge-blue">{u.RoleName}</span></td>
                      <td>{u.LocationName || '—'}</td>
                      <td>{Number(u.IsActive) === 1 ? <span className="badge badge-green">Yes</span> : <span className="badge badge-red">No</span>}</td>
                      <td className="action-cell">
                        <button className="btn btn-ghost btn-xs" onClick={() => editScanForm('scanUsers', {
                          UserID: u.UserID,
                          username: u.Username,
                          fullName: u.FullName,
                          roleId: u.RoleID,
                          locationId: u.LocationID ?? '',
                          isActive: Number(u.IsActive) === 1 ? 1 : 0,
                          password: '',
                        })}><Pencil size={12} /></button>
                        <button className="btn btn-ghost btn-xs btn-danger" onClick={() => handleScanDelete('scanUsers', u.UserID)}><Trash2 size={12} /></button>
                      </td>
                    </tr>
                  ))}
                  {scanUsers.length === 0 && <tr><td colSpan={6} className="empty-row">No scan users. Add one to grant Operator, Vendor QC, or Customer QC access.</td></tr>}
                </tbody>
              </table>
              )}
            </div>
          )}

          {/* ── Scan Templates Table ── */}
          {scanSubTab === 'templates' && (
            <div className="scan-section">
              <div className="scan-section-header">
                <h3><Layers size={15} /> Scan Templates ({scanTemplates.length})</h3>
                <button className="btn btn-primary btn-sm" onClick={() => openScanForm('templates', SCANNER_BLANK_TPL)}>
                  <Plus size={13} /> Add Template
                </button>
              </div>
              <table className="data-table">
                <thead><tr><th>Name</th><th>Pages</th><th>DPI</th><th>Color</th><th>Size</th><th>Duplex</th><th>Quality</th><th>Active</th><th></th></tr></thead>
                <tbody>
                  {scanTemplates.map(t => (
                    <tr key={t.TemplateID}>
                      <td>{t.TemplateName}</td>
                      <td><span className="badge badge-gray">{t.PageCount}pp</span></td>
                      <td>{t.DPI}</td>
                      <td>{t.ColorMode}</td>
                      <td>{t.PageSize}</td>
                      <td>{t.DuplexMode}</td>
                      <td>{t.JpegQuality}%</td>
                      <td>{t.IsActive ? <span className="badge badge-green">Yes</span> : <span className="badge badge-red">No</span>}</td>
                      <td className="action-cell">
                        <button className="btn btn-ghost btn-xs" onClick={() => editScanForm('templates', { templateName: t.TemplateName, description: t.Description, pageCount: t.PageCount, dpi: t.DPI, colorMode: t.ColorMode, pageSize: t.PageSize, duplexMode: t.DuplexMode, jpegQuality: t.JpegQuality, brightnessAdj: t.BrightnessAdj ?? 128, contrastAdj: t.ContrastAdj ?? 128, threshold: t.Threshold ?? 128, pdfJpegQuality: t.PdfJpegQuality ?? 70, pdfMaxDpi: t.PdfMaxDpi ?? 150, skipBlankPages: !!t.SkipBlankPages, deSkew: !!t.DeSkew, isActive: t.IsActive, TemplateID: t.TemplateID })}><Pencil size={12} /></button>
                        <button className="btn btn-ghost btn-xs btn-danger" onClick={() => handleScanDelete('templates', t.TemplateID)}><Trash2 size={12} /></button>
                      </td>
                    </tr>
                  ))}
                  {scanTemplates.length === 0 && <tr><td colSpan={9} className="empty-row">No scan templates configured</td></tr>}
                </tbody>
              </table>
            </div>
          )}

          {/* ── Printer Profiles Table ── */}
          {scanSubTab === 'printers' && (
            <div className="scan-section">
              <div className="scan-section-header">
                <h3><Printer size={15} /> Printer Profiles ({scanPrinters.length})</h3>
                <button className="btn btn-primary btn-sm" onClick={() => openScanForm('printers', SCANNER_BLANK_PP)}>
                  <Plus size={13} /> Add Profile
                </button>
              </div>
              <table className="data-table">
                <thead><tr><th>Name</th><th>Brand</th><th>Driver</th><th>TWAIN Caps</th><th>Active</th><th></th></tr></thead>
                <tbody>
                  {scanPrinters.map(p => (
                    <tr key={p.ProfileID}>
                      <td>{p.ProfileName}</td>
                      <td><span className="badge badge-blue">{p.Brand}</span></td>
                      <td><span className={`badge ${p.DriverType === 'TWAIN' ? 'badge-amber' : 'badge-gray'}`}>{p.DriverType}</span></td>
                      <td>{p.TwainCapabilities ? <span className="badge badge-green">Configured</span> : <span className="text-muted">—</span>}</td>
                      <td>{p.IsActive ? <span className="badge badge-green">Yes</span> : <span className="badge badge-red">No</span>}</td>
                      <td className="action-cell">
                        <button className="btn btn-ghost btn-xs" onClick={() => editScanForm('printers', { profileName: p.ProfileName, brand: p.Brand, driverType: p.DriverType, twainCapabilities: p.TwainCapabilities ? JSON.stringify(p.TwainCapabilities, null, 2) : '', isActive: p.IsActive, ProfileID: p.ProfileID })}><Pencil size={12} /></button>
                        <button className="btn btn-ghost btn-xs btn-danger" onClick={() => handleScanDelete('printers', p.ProfileID)}><Trash2 size={12} /></button>
                      </td>
                    </tr>
                  ))}
                  {scanPrinters.length === 0 && <tr><td colSpan={6} className="empty-row">No printer profiles configured</td></tr>}
                </tbody>
              </table>
            </div>
          )}

          {/* ── Scanned booklets (uploads by exam/paper) ── */}
          {scanSubTab === 'booklets' && (
            <div className="scan-section">
              <div className="scan-section-header">
                <h3><ClipboardList size={15} /> Scanned booklets ({scanBookletsTotal})</h3>
                <span className="text-muted" style={{ fontSize: '0.85rem' }}>Uploads from scanner-desktop by selected exam/paper. Sync to evaluation then assign in Head Evaluator → Assign booklets.</span>
              </div>
              <div className="scan-booklets-filters">
                <label>Exam</label>
                <select
                  className="field-input"
                  value={bookletFilterExamId}
                  onChange={(e) => { setBookletFilterExamId(e.target.value); setBookletFilterPaperId(''); }}
                  style={{ maxWidth: 220 }}
                >
                  <option value="">All exams</option>
                  {scanExams.map((e) => (
                    <option key={e.ExamID} value={e.ExamID}>{e.ExamCode} — {e.ExamName}</option>
                  ))}
                </select>
                <label style={{ marginLeft: 12 }}>Paper</label>
                <select
                  className="field-input"
                  value={bookletFilterPaperId}
                  onChange={(e) => setBookletFilterPaperId(e.target.value)}
                  style={{ maxWidth: 220 }}
                >
                  <option value="">All papers</option>
                  {scanPapers
                    .filter((p) => !bookletFilterExamId || String(p.ExamID) === String(bookletFilterExamId))
                    .map((p) => (
                      <option key={p.PaperID} value={p.PaperID}>{p.PaperCode} — {p.PaperName}</option>
                    ))}
                </select>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  style={{ marginLeft: 12 }}
                  onClick={async () => {
                    try {
                      const res = await api.scanadmin.syncScanToEval();
                      const msg = res?.message || (res?.synced != null ? `Synced ${res.synced} booklets to evaluation.` : 'Sync completed.');
                      flash(msg, res?.failed > 0 ? 'warning' : 'success');
                      if (scanSubTab === 'booklets') {
                        const r = await api.scanadmin.listScannedBooklets({
                          examId: bookletFilterExamId ? parseInt(bookletFilterExamId, 10) : undefined,
                          paperId: bookletFilterPaperId ? parseInt(bookletFilterPaperId, 10) : undefined,
                          limit: 500,
                          offset: 0,
                        });
                        setScanBooklets(r.booklets || []);
                        setScanBookletsTotal(r.total ?? 0);
                      }
                    } catch (err) {
                      flash('Sync failed: ' + err.message, 'error');
                    }
                  }}
                >
                  Sync to evaluation
                </button>
              </div>
              {loading && scanSubTab === 'booklets' && (
                <div className="loading-row"><Loader2 size={18} className="spin" /> Loading booklets…</div>
              )}
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Booklet ID</th>
                    <th>Exam</th>
                    <th>Paper</th>
                    <th>Location</th>
                    <th>Pages</th>
                    <th>Status</th>
                    <th>Scan date</th>
                    <th>Upload date</th>
                    <th>Uploaded by</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {scanBooklets.map((b) => (
                    <tr key={b.BookletID}>
                      <td><code>{b.BookletID}</code></td>
                      <td>{b.ExamCode ? `${b.ExamCode} — ${b.ExamName}` : (b.ExamID || '—')}</td>
                      <td>{b.PaperCode ? `${b.PaperCode} — ${b.PaperName}` : (b.PaperID || '—')}</td>
                      <td>{b.LocationName || b.LocationCode || (b.LocationID ?? '—')}</td>
                      <td>{b.TotalPagesScanned ?? 0}{b.TotalPagesExpected != null ? ` / ${b.TotalPagesExpected}` : ''}</td>
                      <td>{b.ValidationStatus ? <span className={`badge badge-${b.ValidationStatus === 'Valid' ? 'green' : 'amber'}`}>{b.ValidationStatus}</span> : '—'}</td>
                      <td>{b.ScanDate ? new Date(b.ScanDate).toLocaleDateString() : '—'}</td>
                      <td>{b.CreatedAt ? new Date(b.CreatedAt).toLocaleString() : '—'}</td>
                      <td>{b.CreatedBy || '—'}</td>
                      <td className="action-cell">
                        <Link to={`/view-booklet/${encodeURIComponent(b.BookletID)}`} className="btn btn-ghost btn-xs">View</Link>
                      </td>
                    </tr>
                  ))}
                  {!loading && scanSubTab === 'booklets' && scanBooklets.length === 0 && (
                    <tr><td colSpan={10} className="empty-row">No scanned booklets found. Uploads from scanner-desktop appear here by the exam/paper selected at scan time.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* ── Scan output paths (where booklet PDFs are stored) ── */}
          {scanSubTab === 'outputPaths' && (
            <div className="scan-section">
              <div className="scan-section-header">
                <h3><FolderOpen size={15} /> Scan output paths</h3>
                <span className="text-muted" style={{ fontSize: '0.85rem' }}>Scanned booklet PDFs are saved to the active path only. Profile photos and other files use the common API storage. When you add or change a path, the server <strong>creates the folder</strong> if it does not exist (if permissions allow). Relative paths are resolved on the <strong>server</strong> from its working directory (Docker API is usually <code>/app</code> — use an absolute container path like <code>/data/scan-output</code> if you mount a volume there).</span>
              </div>
              <div className="scan-output-path-form" style={{ marginBottom: 16 }}>
                <input className="field-input" placeholder="Label (e.g. Primary store)" value={outputPathForm.pathLabel} onChange={(e) => setOutputPathForm(f => ({ ...f, pathLabel: e.target.value }))} style={{ width: 180 }} />
                <input className="field-input" placeholder="Path as stored (e.g. /data/scan-output or storage/scan_output)" value={outputPathForm.pathValue} onChange={(e) => setOutputPathForm(f => ({ ...f, pathValue: e.target.value }))} style={{ flex: 1, minWidth: 200 }} title="Docker: use a path inside the container (e.g. /data/scan-output). Relative paths resolve from the API working directory (often /app), not your PC." />
                <button type="button" className="btn btn-primary btn-sm" onClick={async () => {
                  if (!outputPathForm.pathLabel?.trim() || !outputPathForm.pathValue?.trim()) { flash('Label and path are required', 'error'); return; }
                  try {
                    await api.scanadmin.createOutputPath({ pathLabel: outputPathForm.pathLabel.trim(), pathValue: outputPathForm.pathValue.trim(), displayOrder: outputPathForm.displayOrder });
                    setOutputPathForm({ pathLabel: '', pathValue: '', displayOrder: 0 });
                    const res = await api.scanadmin.listOutputPaths();
                    setScanOutputPaths(Array.isArray(res) ? res : (res?.data ?? []));
                    flash('Path added', 'success');
                  } catch (err) { flash(err.message || 'Failed to add path', 'error'); }
                }}>Add path</button>
              </div>
              {loading && scanSubTab === 'outputPaths' && (
                <div className="loading-row"><Loader2 size={18} className="spin" /> Loading…</div>
              )}
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Label</th>
                    <th>Configured path</th>
                    <th>Files</th>
                    <th>Status</th>
                    <th>Accessible</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {scanOutputPaths.map((p) => (
                    <tr key={p.PathID}>
                      <td>{p.PathLabel}</td>
                      <td>
                        <code style={{ fontSize: 12, wordBreak: 'break-all', display: 'block' }}>{p.PathValue}</code>
                        {p.resolvedPath && p.resolvedPath !== p.PathValue && (
                          <div className="text-muted" style={{ fontSize: 11, marginTop: 4 }} title={`Relative paths are joined with server cwd: ${p.serverWorkingDir || ''}`}>
                            On server: <code style={{ wordBreak: 'break-all' }}>{p.resolvedPath}</code>
                          </div>
                        )}
                      </td>
                      <td>
                        {p.isAccessible
                          ? (
                            <span title={p.fileCountTruncated ? 'Count capped for performance' : 'Files under this folder (recursive)'}>
                              {p.fileCount?.toLocaleString?.() ?? p.fileCount ?? 0}
                              {p.fileCountTruncated ? '+' : ''}
                            </span>
                          )
                          : '—'}
                      </td>
                      <td>{p.IsActive ? <span className="badge badge-green">Active</span> : <span className="badge badge-gray">Inactive</span>}</td>
                      <td>{p.isAccessible ? <span className="badge badge-green">Yes</span> : <span className="badge badge-red" title={p.accessibilityError}>{p.accessibilityError || 'No'}</span>}</td>
                      <td className="action-cell">
                        {!p.IsActive && <button type="button" className="btn btn-ghost btn-xs" onClick={async () => { try { await api.scanadmin.setActiveOutputPath(p.PathID); const res = await api.scanadmin.listOutputPaths(); setScanOutputPaths(Array.isArray(res) ? res : (res?.data ?? [])); flash('Active path updated', 'success'); } catch (err) { flash(err.message, 'error'); } }}>Set active</button>}
                        <button type="button" className="btn btn-ghost btn-xs" onClick={async () => { const label = prompt('Label', p.PathLabel); if (label == null) return; try { await api.scanadmin.updateOutputPath(p.PathID, { pathLabel: label }); const res = await api.scanadmin.listOutputPaths(); setScanOutputPaths(Array.isArray(res) ? res : (res?.data ?? [])); flash('Updated', 'success'); } catch (err) { flash(err.message, 'error'); } }}>Edit</button>
                        <button type="button" className="btn btn-ghost btn-xs btn-danger" disabled={!!p.IsActive} onClick={async () => { if (!p.IsActive && confirm('Remove this path?')) { try { await api.scanadmin.deleteOutputPath(p.PathID); const res = await api.scanadmin.listOutputPaths(); setScanOutputPaths(Array.isArray(res) ? res : (res?.data ?? [])); flash('Path removed', 'success'); } catch (err) { flash(err.message, 'error'); } }}}>Delete</button>
                      </td>
                    </tr>
                  ))}
                  {!loading && scanSubTab === 'outputPaths' && scanOutputPaths.length === 0 && (
                    <tr><td colSpan={6} className="empty-row">No paths configured. Add a path above or use server default (storage/scan_output).</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {scanSubTab === 'scanQc' && (
            <div className="scan-section">
              <div className="scan-section-header">
                <h3><ShieldCheck size={15} /> Scan QC per location</h3>
                <span className="text-muted" style={{ fontSize: '0.85rem' }}>
                  Disable vendor or customer QC per scanning centre. Scanner staff use the main login with
                  {' '}<strong>Scanner staff login</strong> checked (operator / vendor QC / customer QC).
                </span>
              </div>
              {loading && scanSubTab === 'scanQc' && (
                <div className="loading-row"><Loader2 size={18} className="spin" /> Loading…</div>
              )}
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Location</th>
                    <th>Vendor QC</th>
                    <th>Customer QC</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {scanLocations.map((loc) => (
                    <tr key={loc.LocationID}>
                      <td>{loc.LocationName} <span className="text-muted">({loc.LocationCode})</span></td>
                      <td>
                        <label style={{ cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={!!Number(loc.VendorQcEnabled ?? 1)}
                            onChange={() => toggleScanLocQc(loc.LocationID, 'VendorQcEnabled')}
                          />
                          {' '}Enabled
                        </label>
                      </td>
                      <td>
                        <label style={{ cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={!!Number(loc.CustomerQcEnabled ?? 1)}
                            onChange={() => toggleScanLocQc(loc.LocationID, 'CustomerQcEnabled')}
                          />
                          {' '}Enabled
                        </label>
                      </td>
                      <td className="action-cell">
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          onClick={() => saveScanLocationQc(loc.LocationID)}
                        >
                          Save
                        </button>
                      </td>
                    </tr>
                  ))}
                  {!loading && scanSubTab === 'scanQc' && scanLocations.length === 0 && (
                    <tr><td colSpan={4} className="empty-row">No locations.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
