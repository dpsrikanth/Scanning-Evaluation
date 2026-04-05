import { useState, useEffect, useCallback } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import {
  Plus, CheckCircle2, AlertCircle, Pencil, Trash2,
  ScanLine, Monitor, Layers, Printer, BookOpen, X, ClipboardList, FolderOpen,
  FileText, Loader2, Users, ShieldCheck,
} from 'lucide-react';
import { api } from '../services/api';
import './AdminSettings.css';

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

const VALID_SCAN_SUBTAB_IDS = new Set(SCAN_SUB_TABS.map((t) => t.id));

/** API may return a bare array or { data: [] }; never pass non-arrays into table state. */
function asScanList(v) {
  if (Array.isArray(v)) return v;
  if (v && Array.isArray(v.data)) return v.data;
  return [];
}

const SCANNER_BLANK_EXAM = { examCode: '', examName: '', examYear: new Date().getFullYear() };
const SCANNER_BLANK_PAPER = { examId: '', paperCode: '', paperName: '', totalPages: 24, bookletPageCounts: '' };
const SCANNER_BLANK_WS = { locationId: '', workstationCode: '', workstationName: '', assignedUsername: '', printerProfileId: '', isActive: 1 };
const SCANNER_BLANK_PP = { profileName: '', brand: 'Generic', driverType: 'WIA', twainCapabilities: '', isActive: 1 };
const SCANNER_BLANK_SCAN_USER = { username: '', fullName: '', password: '', roleId: '', locationId: '', isActive: 1 };

export default function ScanSettings() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [msg, setMsg] = useState({ text: '', type: '' });
  const flash = useCallback((text, type = 'success') => {
    setMsg({ text, type });
    setTimeout(() => setMsg({ text: '', type: '' }), 4000);
  }, []);

  const [scanSubTab, setScanSubTab] = useState('exams');
  const [scanExams, setScanExams] = useState([]);
  const [scanPapers, setScanPapers] = useState([]);
  const [scanWorkstations, setScanWorkstations] = useState([]);
  const [scanTemplates, setScanTemplates] = useState([]);
  const [scanPrinters, setScanPrinters] = useState([]);
  const [scanLocations, setScanLocations] = useState([]);
  const [scanUsers, setScanUsers] = useState([]);
  const [scanRoleOptions, setScanRoleOptions] = useState([]);
  const [scanForm, setScanForm] = useState(null);
  const [scanFormMode, setScanFormMode] = useState('create');
  const [scanBooklets, setScanBooklets] = useState([]);
  const [scanBookletsTotal, setScanBookletsTotal] = useState(0);
  const [bookletFilterExamId, setBookletFilterExamId] = useState('');
  const [bookletFilterPaperId, setBookletFilterPaperId] = useState('');
  const [scanOutputPaths, setScanOutputPaths] = useState([]);
  const [outputPathForm, setOutputPathForm] = useState({ pathLabel: '', pathValue: '', displayOrder: 0 });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const s = searchParams.get('subtab');
    if (s && VALID_SCAN_SUBTAB_IDS.has(s)) setScanSubTab(s);
  }, [searchParams]);

  const selectScanSubTab = (id) => {
    setScanSubTab(id);
    setScanForm(null);
    setSearchParams({ subtab: id });
  };

  useEffect(() => {
    (async () => {
      try {
        const [locs, users] = await Promise.all([
          api.scanadmin.listLocations(),
          api.scanadmin.listScanUsers(),
        ]);
        setScanLocations(asScanList(locs));
        setScanUsers(asScanList(users));
      } catch (err) {
        flash('Scanner admin load error: ' + err.message, 'error');
      }
    })();
  }, [flash]);

  const loadScannerSubTab = async () => {
    setLoading(true);
    try {
      if (scanSubTab === 'exams')       setScanExams(asScanList(await api.scanadmin.listExams()));
      if (scanSubTab === 'papers')      setScanPapers(asScanList(await api.scanadmin.listPapers()));
      if (scanSubTab === 'workstations') setScanWorkstations(asScanList(await api.scanadmin.listWorkstations()));
      if (scanSubTab === 'templates')   setScanTemplates(asScanList(await api.scanadmin.listTemplates()));
      if (scanSubTab === 'printers')    setScanPrinters(asScanList(await api.scanadmin.listPrinterProfiles()));
      if (scanSubTab === 'booklets') {
        const [exams, papers] = await Promise.all([
          api.scanadmin.listExams(),
          api.scanadmin.listPapers(),
        ]);
        setScanExams(asScanList(exams));
        setScanPapers(asScanList(papers));
      }
      if (scanSubTab === 'outputPaths') {
        const res = await api.scanadmin.listOutputPaths();
        setScanOutputPaths(asScanList(res));
      }
      if (scanSubTab === 'scanQc') {
        const locs = await api.scanadmin.listLocations();
        setScanLocations(asScanList(locs));
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

  useEffect(() => {
    loadScannerSubTab();
  }, [scanSubTab]);

  useEffect(() => {
    if (scanSubTab !== 'booklets') return;
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
  }, [scanSubTab, bookletFilterExamId, bookletFilterPaperId, flash]);

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
      if (entity === 'scanUsers') {
        try {
          const [locs, users] = await Promise.all([
            api.scanadmin.listLocations(),
            api.scanadmin.listScanUsers(),
          ]);
          setScanLocations(locs);
          setScanUsers(users);
        } catch { /* ignore */ }
        loadScannerSubTab();
      } else loadScannerSubTab();
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
      if (entity === 'scanUsers') {
        try {
          const [locs, users] = await Promise.all([
            api.scanadmin.listLocations(),
            api.scanadmin.listScanUsers(),
          ]);
          setScanLocations(locs);
          setScanUsers(users);
        } catch { /* ignore */ }
        loadScannerSubTab();
      } else loadScannerSubTab();
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

  return (
    <div className="admin-page page-enter">
      <div className="admin-page-header">
        <div className="admin-page-icon"><ScanLine size={24} /></div>
        <div>
          <h1 className="admin-page-title">Scan settings</h1>
          <p className="admin-page-subtitle">Exams, papers, workstations, QC flags, output paths, and scanned booklets.</p>
        </div>
      </div>

      {msg.text && (
        <div className={`admin-flash ${msg.type}`}>
          {msg.type === 'success' ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
          {msg.text}
        </div>
      )}

        <div className="scanner-admin-wrap">
          {/* Sub-tab bar */}
          <div className="scan-subtabs">
            {SCAN_SUB_TABS.map(({ id, label, icon: Icon }) => (
              <button key={id}
                className={`scan-subtab-btn ${scanSubTab === id ? 'active' : ''}`}
                onClick={() => selectScanSubTab(id)}>
                <Icon size={14} /> {label}
              </button>
            ))}
          </div>

          {/* Modal form */}
          {scanForm && (
            <div className="scan-form-modal-overlay">
              <div className="scan-form-modal">
                <div className="scan-form-modal-header">
                  <h3>{scanFormMode === 'create' ? 'Add' : 'Edit'} {
                    { exams: 'Exam', papers: 'Paper', workstations: 'Workstation', printers: 'Printer Profile', scanUsers: 'Scan user' }[scanForm.entity]
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
                        <option value="">-- Select exam --</option>
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
                        <option value="">-- Select location --</option>
                        {scanLocations.map(l => <option key={l.LocationID} value={l.LocationID}>{l.LocationName}</option>)}
                      </select></div>
                    <div className="field-group"><label className="field-label">Workstation Code *</label>
                      <input className="field-input" value={scanForm.data.workstationCode || ''} onChange={e => setScanForm(f => ({ ...f, data: { ...f.data, workstationCode: e.target.value } }))} /></div>
                    <div className="field-group"><label className="field-label">Workstation Name *</label>
                      <input className="field-input" value={scanForm.data.workstationName || ''} onChange={e => setScanForm(f => ({ ...f, data: { ...f.data, workstationName: e.target.value } }))} /></div>
                    <div className="field-group"><label className="field-label">Assign Operator (username)</label>
                      <select className="field-input" value={scanForm.data.assignedUsername || ''} onChange={e => setScanForm(f => ({ ...f, data: { ...f.data, assignedUsername: e.target.value } }))}>
                        <option value="">-- Unassigned --</option>
                        {scanUsers.filter(u => Number(u.IsActive) === 1).map(u => <option key={u.UserID} value={u.Username}>{u.FullName} ({u.Username})</option>)}
                      </select></div>
                    <div className="field-group"><label className="field-label">Printer Profile</label>
                      <select className="field-input" value={scanForm.data.printerProfileId || ''} onChange={e => setScanForm(f => ({ ...f, data: { ...f.data, printerProfileId: e.target.value } }))}>
                        <option value="">-- None (WIA default) --</option>
                        {scanPrinters.map(p => <option key={p.ProfileID} value={p.ProfileID}>{p.ProfileName}</option>)}
                      </select></div>
                    <div className="field-group"><label className="field-label">Active</label>
                      <select className="field-input" value={scanForm.data.isActive ?? 1} onChange={e => setScanForm(f => ({ ...f, data: { ...f.data, isActive: parseInt(e.target.value) } }))}>
                        <option value={1}>Yes</option><option value={0}>No</option>
                      </select></div>
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
                        <option value="">-- Select --</option>
                        {scanRoleOptions.map(r => <option key={r.RoleID} value={r.RoleID}>{r.RoleName}</option>)}
                      </select></div>
                    <div className="field-group"><label className="field-label">Location</label>
                      <select className="field-input" value={scanForm.data.locationId ?? ''} onChange={e => setScanForm(f => ({ ...f, data: { ...f.data, locationId: e.target.value } }))}>
                        <option value="">-- None --</option>
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

          {/* Exams table */}
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

          {/* Papers table */}
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
                      <td>{p.BookletPageCounts || '\u2014'}</td>
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

          {/* Workstations table */}
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
                      <td>{w.AssignedUsername || <span className="text-muted">{'\u2014'}</span>}</td>
                      <td>{w.PrinterProfileName || <span className="text-muted">Default WIA</span>}</td>
                      <td>{w.DriverType ? <span className={`badge ${w.DriverType === 'TWAIN' ? 'badge-amber' : 'badge-blue'}`}>{w.DriverType}</span> : '\u2014'}</td>
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

          {/* Scan users (ScanningDB — scanner / Vendor QC / Customer QC login) */}
          {scanSubTab === 'scanUsers' && (
            <div className="scan-section">
              <div className="scan-section-header">
                <h3><Users size={15} /> Scan users ({scanUsers.length})</h3>
                <button className="btn btn-primary btn-sm" onClick={() => openScanForm('scanUsers', { ...SCANNER_BLANK_SCAN_USER, roleId: scanRoleOptions[0]?.RoleID ?? '' })}>
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
                      <td>{u.LocationName || '\u2014'}</td>
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

          {/* Scan templates table */}
          {scanSubTab === 'templates' && (
            <div className="scan-section">
              <div className="scan-section-header">
                <h3><Layers size={15} /> Scan Templates ({scanTemplates.length})</h3>
                <Link className="btn btn-primary btn-sm" to="/admin/scan-settings/templates/new">
                  <Plus size={13} /> Add template
                </Link>
              </div>
              <table className="data-table">
                <thead><tr><th>Name</th><th>Pages</th><th>DPI</th><th>Color</th><th>Size</th><th>Duplex</th><th>Quality</th><th>Upload</th><th>Active</th><th></th></tr></thead>
                <tbody>
                  {scanTemplates.map(t => (
                    <tr key={t.TemplateID}>
                      <td>
                        <Link to={`/admin/scan-settings/templates/${t.TemplateID}`} style={{ fontWeight: 600 }}>{t.TemplateName}</Link>
                      </td>
                      <td><span className="badge badge-gray">{t.PageCount}pp</span></td>
                      <td>{t.DPI}</td>
                      <td>{t.ColorMode}</td>
                      <td>{t.PageSize}</td>
                      <td>{t.DuplexMode}</td>
                      <td>{t.JpegQuality}%</td>
                      <td><code style={{ fontSize: '0.75rem' }}>{t.UploadScheduleMode || 'immediate'}</code></td>
                      <td>{t.IsActive ? <span className="badge badge-green">Yes</span> : <span className="badge badge-red">No</span>}</td>
                      <td className="action-cell">
                        <Link className="btn btn-ghost btn-xs" to={`/admin/scan-settings/templates/${t.TemplateID}`} title="Edit"><Pencil size={12} /></Link>
                        <button className="btn btn-ghost btn-xs btn-danger" onClick={() => handleScanDelete('templates', t.TemplateID)}><Trash2 size={12} /></button>
                      </td>
                    </tr>
                  ))}
                  {scanTemplates.length === 0 && <tr><td colSpan={10} className="empty-row">No scan templates configured</td></tr>}
                </tbody>
              </table>
            </div>
          )}

          {/* Printer profiles table */}
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
                      <td>{p.TwainCapabilities ? <span className="badge badge-green">Configured</span> : <span className="text-muted">{'\u2014'}</span>}</td>
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

          {/* Scanned booklets */}
          {scanSubTab === 'booklets' && (
            <div className="scan-section">
              <div className="scan-section-header">
                <h3><ClipboardList size={15} /> Scanned booklets ({scanBookletsTotal})</h3>
                <span className="text-muted" style={{ fontSize: '0.85rem' }}>Uploads from scanner-desktop by selected exam/paper. Sync to evaluation, then assign in Head Evaluator {'\u2192'} Assign booklets.</span>
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
                      <td>{b.ExamCode ? `${b.ExamCode} \u2014 ${b.ExamName}` : (b.ExamID || '\u2014')}</td>
                      <td>{b.PaperCode ? `${b.PaperCode} \u2014 ${b.PaperName}` : (b.PaperID || '\u2014')}</td>
                      <td>{b.LocationName || b.LocationCode || (b.LocationID ?? '\u2014')}</td>
                      <td>{b.TotalPagesScanned ?? 0}{b.TotalPagesExpected != null ? ` / ${b.TotalPagesExpected}` : ''}</td>
                      <td>{b.ValidationStatus ? <span className={`badge badge-${b.ValidationStatus === 'Valid' ? 'green' : 'amber'}`}>{b.ValidationStatus}</span> : '\u2014'}</td>
                      <td>{b.ScanDate ? new Date(b.ScanDate).toLocaleDateString() : '\u2014'}</td>
                      <td>{b.CreatedAt ? new Date(b.CreatedAt).toLocaleString() : '\u2014'}</td>
                      <td>{b.CreatedBy || '\u2014'}</td>
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

          {/* Scan output paths */}
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
                          : '\u2014'}
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

    </div>
  );
}
