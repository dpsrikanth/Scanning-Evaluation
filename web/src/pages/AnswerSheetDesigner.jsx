import { useState, useEffect, useCallback, useRef } from 'react';
import {
  FileText, Plus, Trash2, Save, Download, Eye,
  ChevronUp, ChevronDown, Settings, BookOpen, AlignLeft,
  Loader2, CheckCircle2, AlertTriangle, X, GripVertical,
  PenTool, RefreshCw, Layout, Building2, Award, Image,
  Palette, Hash, SquareStack, Crosshair,
} from 'lucide-react';
import { api } from '../services/api';
import './AnswerSheetDesigner.css';

// ── Constants ────────────────────────────────────────────────────────────────
const DEFAULT_FIELDS = [
  { id: 'si_no',           label: 'SI No',                          layout: 'half', enabled: true,  order: 1  },
  { id: 'college_name',    label: 'University / College Name',       layout: 'full', enabled: true,  order: 2  },
  { id: 'paper_no',        label: 'Paper No & Subject',              layout: 'full', enabled: true,  order: 3  },
  { id: 'notification_no', label: 'Notification No & District Code', layout: 'full', enabled: true,  order: 4  },
  { id: 'application_id',  label: 'Application ID',                  layout: 'half', enabled: true,  order: 5  },
  { id: 'hall_ticket',     label: 'Hall Ticket No',                  layout: 'half', enabled: true,  order: 6  },
  { id: 'candidate_name',  label: 'Name of the Candidate',           layout: 'full', enabled: true,  order: 7  },
  { id: 'dob',             label: 'Date of Birth',                   layout: 'half', enabled: true,  order: 8  },
  { id: 'exam_datetime',   label: 'Date & Time of Examination',      layout: 'full', enabled: true,  order: 9  },
  { id: 'centre',          label: 'Centre Code & Name',              layout: 'full', enabled: true,  order: 10 },
];

const DEFAULT_LAYOUT = [
  { id: 'b1', type: 'lines', heightMm: 0, lineSpacingMm: 8.5, label: '' },
];

const DEFAULT_MARGIN     = { top: 15, right: 15, bottom: 18, left: 25 };
const DEFAULT_FOOTER     = { show: true, height: 12, showPageNo: true, showSerial: true };
const DEFAULT_REG_MARKS  = { show: false, size: 5, offset: 4 };
const DEFAULT_VALUER     = {
  show: false,
  count: 3,
  labels: ['Examiner', 'Moderator', 'Head Examiner'],
  columns: ['Marks Awarded', 'Marks in Words', 'Signature'],
};
const DEFAULT_Q_MAPPING  = { show: false, questions: 0 };

const PAGE_COUNTS = [16, 20, 24, 28, 32];
const BLOCK_TYPES = [
  { v: 'lines', label: 'Ruled Lines' },
  { v: 'blank', label: 'Blank Space' },
  { v: 'box',   label: 'Bordered Box' },
];
const PAPER_SIZES = [
  { v: 'A4',    label: 'A4  (210 x 297 mm)' },
  { v: 'Legal', label: 'Legal  (216 x 356 mm)' },
];
const THEME_PRESETS = [
  '#1a3a6b', '#2d5016', '#6b1a1a', '#4a1a6b',
  '#1a5a5a', '#6b4f1a', '#333333', '#0d47a1',
];

function uid() { return `b_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`; }

// ── Template list sidebar ────────────────────────────────────────────────────
function TemplateList({ templates, activeId, onSelect, onCreate, onDelete, loading }) {
  return (
    <div className="asd-list-panel">
      <div className="asd-list-header">
        <span>Templates</span>
        <button className="btn btn-primary btn-sm" onClick={onCreate}>
          <Plus size={13} /> New
        </button>
      </div>
      {loading && <div className="asd-list-loading"><Loader2 size={16} className="spin" /></div>}
      {templates.map(t => (
        <div
          key={t.templateId || t.TemplateID}
          className={`asd-list-item ${(t.templateId || t.TemplateID) === activeId ? 'active' : ''}`}
          onClick={() => onSelect(t.templateId || t.TemplateID)}
        >
          <div className="asd-list-item-name">{t.templateName || t.TemplateName}</div>
          <div className="asd-list-item-meta">
            {t.examName || t.ExamName || 'Generic'} · {t.totalAnswerPages || t.TotalAnswerPages} pg · {t.paperSize || t.PaperSize || 'A4'}
          </div>
          <button
            className="asd-list-delete"
            title="Delete template"
            onClick={e => { e.stopPropagation(); onDelete(t.templateId || t.TemplateID); }}
          >
            <Trash2 size={12} />
          </button>
        </div>
      ))}
      {!loading && templates.length === 0 && (
        <div className="asd-list-empty">No templates yet. Click New to start.</div>
      )}
    </div>
  );
}

// ── Cover field row ──────────────────────────────────────────────────────────
function FieldRow({ field, index, total, onChange, onRemove, onMove }) {
  return (
    <div className={`asd-field-row ${!field.enabled ? 'disabled' : ''}`}>
      <span className="asd-field-grip"><GripVertical size={14} /></span>
      <label className="asd-field-toggle">
        <input type="checkbox" checked={field.enabled}
          onChange={e => onChange(field.id, 'enabled', e.target.checked)} />
        <span className="asd-toggle-track" />
      </label>
      <input className="asd-field-label-input" value={field.label}
        onChange={e => onChange(field.id, 'label', e.target.value)}
        placeholder="Field label" disabled={!field.enabled} />
      <select className="asd-field-layout-select" value={field.layout}
        onChange={e => onChange(field.id, 'layout', e.target.value)} disabled={!field.enabled}>
        <option value="full">Full row</option>
        <option value="half">Half row</option>
      </select>
      <div className="asd-field-btns">
        <button className="asd-icon-btn" onClick={() => onMove(field.id, -1)} disabled={index === 0}>
          <ChevronUp size={13} />
        </button>
        <button className="asd-icon-btn" onClick={() => onMove(field.id, 1)} disabled={index === total - 1}>
          <ChevronDown size={13} />
        </button>
        <button className="asd-icon-btn danger" onClick={() => onRemove(field.id)}>
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  );
}

// ── Answer layout block row ──────────────────────────────────────────────────
function BlockRow({ block, index, total, onChange, onRemove, onMove }) {
  return (
    <div className="asd-block-row">
      <span className="asd-field-grip"><GripVertical size={14} /></span>
      <div className="asd-block-type-bar"
        style={{ background: block.type === 'lines' ? '#e6eeff' : block.type === 'box' ? '#fff3e0' : '#f0fff4' }} />
      <select className="asd-block-type-select" value={block.type}
        onChange={e => onChange(block.id, 'type', e.target.value)}>
        {BLOCK_TYPES.map(bt => <option key={bt.v} value={bt.v}>{bt.label}</option>)}
      </select>
      <input className="asd-block-height-input" type="number" min="0" max="297"
        value={block.heightMm}
        onChange={e => onChange(block.id, 'heightMm', parseFloat(e.target.value) || 0)}
        title="Height in mm (0 = fill remaining space)" />
      <span className="asd-block-unit">mm</span>
      {block.type === 'lines' ? (
        <>
          <input className="asd-block-spacing-input" type="number" min="4" max="20" step="0.5"
            value={block.lineSpacingMm}
            onChange={e => onChange(block.id, 'lineSpacingMm', parseFloat(e.target.value) || 8.5)} />
          <span className="asd-block-unit">sp</span>
        </>
      ) : <span className="asd-block-spacer" />}
      <input className="asd-block-label-input" value={block.label || ''}
        onChange={e => onChange(block.id, 'label', e.target.value)} placeholder="Label (optional)" />
      <div className="asd-field-btns">
        <button className="asd-icon-btn" onClick={() => onMove(block.id, -1)} disabled={index === 0}>
          <ChevronUp size={13} /></button>
        <button className="asd-icon-btn" onClick={() => onMove(block.id, 1)} disabled={index === total - 1}>
          <ChevronDown size={13} /></button>
        <button className="asd-icon-btn danger" onClick={() => onRemove(block.id)}>
          <Trash2 size={13} /></button>
      </div>
    </div>
  );
}

// ── Editable list (for valuer labels / columns) ─────────────────────────────
function EditableList({ items, onChange, label, addLabel }) {
  const update = (idx, val) => {
    const next = [...items];
    next[idx] = val;
    onChange(next);
  };
  const remove = (idx) => onChange(items.filter((_, i) => i !== idx));
  const add = () => onChange([...items, `${label} ${items.length + 1}`]);
  return (
    <div className="asd-editable-list">
      {items.map((item, idx) => (
        <div key={idx} className="asd-editable-item">
          <input value={item} onChange={e => update(idx, e.target.value)}
            className="asd-editable-input" />
          <button className="asd-icon-btn danger" onClick={() => remove(idx)}
            disabled={items.length <= 1}><X size={12} /></button>
        </div>
      ))}
      <button className="btn btn-secondary btn-sm" onClick={add}>
        <Plus size={12} /> {addLabel}
      </button>
    </div>
  );
}

// ── Cover page preview ──────────────────────────────────────────────────────
function CoverPreview({ fields, examName, paperSize, themeColor, orgName, orgNameSecondary, paperCode }) {
  const enabled = fields.filter(f => f.enabled).sort((a, b) => a.order - b.order);
  const rows = [];
  let i = 0;
  while (i < enabled.length) {
    const f = enabled[i], next = enabled[i + 1];
    if (f.layout === 'full' || !next || next.layout === 'full') { rows.push([f]); i++; }
    else { rows.push([f, next]); i += 2; }
  }
  const isLegal = paperSize === 'Legal';
  const theme = themeColor || '#1a3a6b';
  return (
    <div className={`asd-a4-preview ${isLegal ? 'legal' : ''}`}>
      {orgName && (
        <div className="asd-a4-org-header" style={{ background: theme }}>
          <div className="asd-a4-org-name">{orgName}</div>
          {orgNameSecondary && <div className="asd-a4-org-sub">{orgNameSecondary}</div>}
        </div>
      )}
      <div className="asd-a4-header" style={{ background: theme }}>ANSWER BOOKLET</div>
      {examName && <div className="asd-a4-exam">{examName}</div>}
      {paperCode && <div className="asd-a4-paper-code">Paper Code: {paperCode}</div>}
      <div className="asd-a4-divider" style={{ background: theme }} />
      {rows.map((row, ri) => (
        <div key={ri} className="asd-a4-field-row">
          {row.map(f => (
            <div key={f.id} className={`asd-a4-field ${row.length === 1 ? 'full' : 'half'}`}>
              <span className="asd-a4-field-label" style={{ background: `${theme}15` }}>{f.label}</span>
              <span className="asd-a4-field-box" />
            </div>
          ))}
        </div>
      ))}
      <div className="asd-a4-sig-row">
        {['Invigilator', 'Room No', 'Official Use'].map(s => (
          <div key={s} className="asd-a4-sig-box">
            <span>{s}</span>
            <div className="asd-a4-sig-blank" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Answer page preview ─────────────────────────────────────────────────────
function AnswerPagePreview({ pageNo, total, templateName, answerPageLayout, showBarcode, showQrCode, paperSize, themeColor, footerConfig }) {
  const isLegal = paperSize === 'Legal';
  const totalH  = isLegal ? 356 : 297;
  const blocks  = answerPageLayout?.length > 0 ? answerPageLayout : DEFAULT_LAYOUT;
  const fixed   = blocks.reduce((s, b) => s + (b.heightMm > 0 ? b.heightMm : 0), 0);
  const usable  = totalH - 30;
  const flex    = blocks.filter(b => b.heightMm === 0).length;
  const flexMm  = flex > 0 ? Math.max(0, usable - fixed) / flex : 0;
  const theme   = themeColor || '#1a3a6b';
  const footer  = footerConfig || DEFAULT_FOOTER;

  return (
    <div className={`asd-a4-preview asd-a4-answer ${isLegal ? 'legal' : ''}`}>
      <div className="asd-a4-ans-header" style={{ background: `${theme}18` }}>
        <span>{templateName || 'Answer Booklet'}</span>
        <span>Page {pageNo} of {total}</span>
      </div>
      <div className="asd-a4-ans-body">
        <div className="asd-a4-ans-margin">
          {showQrCode && <div className="asd-a4-qr-stub" style={{ borderColor: theme, color: theme }}>QR</div>}
          {showBarcode && <div className="asd-a4-ans-barcode-stub">||||</div>}
          <div className="asd-a4-ans-pageno">{pageNo}</div>
        </div>
        <div className="asd-a4-ans-write">
          {blocks.map((block, bi) => {
            const hMm  = block.heightMm > 0 ? block.heightMm : flexMm;
            const hPx  = Math.max(8, (hMm / usable) * 220);
            const lines = block.type === 'lines' ? Math.floor(hMm / (block.lineSpacingMm || 8.5)) : 0;
            return (
              <div key={block.id || bi} className={`asd-block-preview ${block.type}`} style={{ height: hPx }}>
                {block.label && <span className="asd-block-preview-label">{block.label}</span>}
                {block.type === 'lines' && Array.from({ length: Math.min(lines, 30) }).map((_, li) => (
                  <div key={li} className="asd-a4-line" />
                ))}
              </div>
            );
          })}
        </div>
      </div>
      {footer.show && (
        <div className="asd-a4-footer-bar" style={{ background: `${theme}08` }}>
          <span>Serial: ________</span>
          <span>Page {pageNo}/{total}</span>
        </div>
      )}
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────
export default function AnswerSheetDesigner() {
  const [templates, setTemplates]         = useState([]);
  const [activeId, setActiveId]           = useState(null);
  const [listLoading, setListLoading]     = useState(false);
  const [saving, setSaving]               = useState(false);
  const [error, setError]                 = useState('');
  const [success, setSuccess]             = useState('');
  const [activeTab, setActiveTab]         = useState('branding');
  const [exams, setExams]                 = useState([]);
  const [previewPage, setPreviewPage]     = useState(0);
  const logoInputRef                      = useRef(null);

  // Form state — branding
  const [templateName, setTemplateName]   = useState('New Template');
  const [themeColor, setThemeColor]       = useState('#1a3a6b');
  const [orgName, setOrgName]             = useState('');
  const [orgNameSecondary, setOrgNameSecondary] = useState('');
  const [orgCode, setOrgCode]             = useState('');
  const [logoPath, setLogoPath]           = useState('');
  const [paperCode, setPaperCode]         = useState('');
  const [serialNumberPrefix, setSerialNumberPrefix] = useState('');

  // Form state — cover
  const [fields, setFields]               = useState(DEFAULT_FIELDS);

  // Form state — instructions
  const [instructions2, setInstructions2] = useState('');
  const [instructions3, setInstructions3] = useState('');
  const [hasPage3, setHasPage3]           = useState(false);

  // Form state — valuer
  const [valuerConfig, setValuerConfig]   = useState({ ...DEFAULT_VALUER });

  // Form state — question mapping
  const [questionMapping, setQuestionMapping] = useState({ ...DEFAULT_Q_MAPPING });

  // Form state — page layout
  const [paperSize, setPaperSize]         = useState('A4');
  const [examId, setExamId]               = useState('');
  const [totalAnswerPages, setTotalAnswerPages] = useState(24);
  const [pageStyle, setPageStyle]         = useState('lined');
  const [showBarcode, setShowBarcode]     = useState(true);
  const [showQrCode, setShowQrCode]       = useState(true);
  const [answerPageLayout, setAnswerPageLayout] = useState(DEFAULT_LAYOUT.map(b => ({ ...b })));
  const [marginConfig, setMarginConfig]   = useState({ ...DEFAULT_MARGIN });
  const [footerConfig, setFooterConfig]   = useState({ ...DEFAULT_FOOTER });
  const [registrationMarks, setRegistrationMarks] = useState({ ...DEFAULT_REG_MARKS });
  const [roughWorkPages, setRoughWorkPages] = useState(0);

  useEffect(() => {
    setListLoading(true);
    Promise.all([api.answersheet.list(), api.answersheet.listExams()])
      .then(([tmps, exs]) => { setTemplates(tmps); setExams(exs); })
      .catch(() => {})
      .finally(() => setListLoading(false));
  }, []);

  const loadTemplate = useCallback(async (id) => {
    try {
      const t = await api.answersheet.get(id);
      setActiveId(t.templateId);
      setTemplateName(t.templateName);
      setThemeColor(t.themeColor || '#1a3a6b');
      setOrgName(t.orgName || '');
      setOrgNameSecondary(t.orgNameSecondary || '');
      setOrgCode(t.orgCode || '');
      setLogoPath(t.logoPath || '');
      setPaperCode(t.paperCode || '');
      setSerialNumberPrefix(t.serialNumberPrefix || '');
      setPaperSize(t.paperSize || 'A4');
      setExamId(t.examId ? String(t.examId) : '');
      setFields(Array.isArray(t.coverFields) && t.coverFields.length ? t.coverFields : DEFAULT_FIELDS);
      setInstructions2(t.instructions2 || '');
      setInstructions3(t.instructions3 || '');
      setHasPage3(!!t.instructions3 || t.valuerConfig?.show);
      setTotalAnswerPages(t.totalAnswerPages || 24);
      setPageStyle(t.pageStyle || 'lined');
      setShowBarcode(t.showBarcode !== 0);
      setShowQrCode(t.showQrCode !== 0);
      setAnswerPageLayout(
        Array.isArray(t.answerPageLayout) && t.answerPageLayout.length
          ? t.answerPageLayout.map(b => ({ ...b, id: b.id || uid() }))
          : DEFAULT_LAYOUT.map(b => ({ ...b }))
      );
      setValuerConfig(t.valuerConfig || { ...DEFAULT_VALUER });
      setQuestionMapping(t.questionMapping || { ...DEFAULT_Q_MAPPING });
      setMarginConfig(t.marginConfig || { ...DEFAULT_MARGIN });
      setFooterConfig(t.footerConfig || { ...DEFAULT_FOOTER });
      setRegistrationMarks(t.registrationMarks || { ...DEFAULT_REG_MARKS });
      setRoughWorkPages(t.roughWorkPages || 0);
      setError(''); setSuccess('');
    } catch (e) { setError(e.message); }
  }, []);

  const handleNew = () => {
    setActiveId(null);
    setTemplateName('New Template');
    setThemeColor('#1a3a6b');
    setOrgName(''); setOrgNameSecondary(''); setOrgCode('');
    setLogoPath(''); setPaperCode(''); setSerialNumberPrefix('');
    setPaperSize('A4'); setExamId('');
    setFields(DEFAULT_FIELDS.map(f => ({ ...f })));
    setInstructions2(''); setInstructions3(''); setHasPage3(false);
    setTotalAnswerPages(24); setPageStyle('lined');
    setShowBarcode(true); setShowQrCode(true);
    setAnswerPageLayout(DEFAULT_LAYOUT.map(b => ({ ...b })));
    setValuerConfig({ ...DEFAULT_VALUER });
    setQuestionMapping({ ...DEFAULT_Q_MAPPING });
    setMarginConfig({ ...DEFAULT_MARGIN });
    setFooterConfig({ ...DEFAULT_FOOTER });
    setRegistrationMarks({ ...DEFAULT_REG_MARKS });
    setRoughWorkPages(0);
    setActiveTab('branding');
    setError(''); setSuccess('');
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this template?')) return;
    try {
      await api.answersheet.remove(id);
      setTemplates(prev => prev.filter(t => (t.templateId || t.TemplateID) !== id));
      if (activeId === id) handleNew();
    } catch (e) { setError(e.message); }
  };

  const handleSave = async () => {
    if (!templateName.trim()) { setError('Template name is required'); return; }
    setSaving(true); setError(''); setSuccess('');
    const payload = {
      templateName: templateName.trim(),
      paperSize,
      themeColor,
      orgName: orgName || null,
      orgNameSecondary: orgNameSecondary || null,
      orgCode: orgCode || null,
      logoPath: logoPath || null,
      paperCode: paperCode || null,
      serialNumberPrefix: serialNumberPrefix || '',
      examId: examId ? parseInt(examId) : null,
      coverFields: fields.map((f, i) => ({ ...f, order: i + 1 })),
      instructions2: instructions2 || null,
      instructions3: hasPage3 ? (instructions3 || null) : null,
      totalAnswerPages,
      pageStyle,
      showBarcode: showBarcode ? 1 : 0,
      showQrCode: showQrCode ? 1 : 0,
      answerPageLayout: answerPageLayout.length ? answerPageLayout : null,
      valuerConfig,
      questionMapping,
      registrationMarks,
      roughWorkPages,
      marginConfig,
      footerConfig,
    };
    try {
      let saved;
      if (activeId) {
        saved = await api.answersheet.update(activeId, payload);
      } else {
        saved = await api.answersheet.create(payload);
        setActiveId(saved.templateId);
      }
      setSuccess('Template saved successfully');
      setTemplates(await api.answersheet.list());
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  };

  const handleDownload = () => {
    if (!activeId) { setError('Save the template first before generating PDF'); return; }
    window.open(api.answersheet.downloadUrl(activeId), '_blank');
  };

  const handleLogoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const result = await api.answersheet.uploadLogo(file);
      setLogoPath(result.filename);
      setSuccess('Logo uploaded');
    } catch (err) { setError(err.message); }
  };

  // Cover field helpers
  const updateField = (id, key, value) =>
    setFields(prev => prev.map(f => f.id === id ? { ...f, [key]: value } : f));
  const removeField = (id) => setFields(prev => prev.filter(f => f.id !== id));
  const moveField = (id, dir) => setFields(prev => {
    const idx = prev.findIndex(f => f.id === id);
    if (idx < 0) return prev;
    const a = [...prev], sw = idx + dir;
    if (sw < 0 || sw >= a.length) return prev;
    [a[idx], a[sw]] = [a[sw], a[idx]];
    return a;
  });
  const addField = () =>
    setFields(prev => [...prev, { id: uid(), label: 'New Field', layout: 'full', enabled: true, order: prev.length + 1 }]);

  // Block layout helpers
  const updateBlock = (id, key, value) =>
    setAnswerPageLayout(prev => prev.map(b => b.id === id ? { ...b, [key]: value } : b));
  const removeBlock = (id) => setAnswerPageLayout(prev => prev.filter(b => b.id !== id));
  const moveBlock = (id, dir) => setAnswerPageLayout(prev => {
    const idx = prev.findIndex(b => b.id === id);
    if (idx < 0) return prev;
    const a = [...prev], sw = idx + dir;
    if (sw < 0 || sw >= a.length) return prev;
    [a[idx], a[sw]] = [a[sw], a[idx]];
    return a;
  });
  const addBlock = () =>
    setAnswerPageLayout(prev => [...prev, { id: uid(), type: 'lines', heightMm: 0, lineSpacingMm: 8.5, label: '' }]);

  // Margin/footer helpers
  const updateMargin = (key, val) => setMarginConfig(prev => ({ ...prev, [key]: val }));
  const updateFooter = (key, val) => setFooterConfig(prev => ({ ...prev, [key]: val }));
  const updateRegMarks = (key, val) => setRegistrationMarks(prev => ({ ...prev, [key]: val }));
  const updateValuer = (key, val) => setValuerConfig(prev => ({ ...prev, [key]: val }));
  const updateQMapping = (key, val) => setQuestionMapping(prev => ({ ...prev, [key]: val }));

  const selectedExam = exams.find(e => String(e.ExamID) === examId);
  const examLabel    = selectedExam ? `${selectedExam.ExamCode} — ${selectedExam.ExamName}` : '';

  const totalPages = 1
    + (instructions2 ? 1 : 0)
    + (valuerConfig.show ? 1 : (hasPage3 && instructions3 ? 1 : 0))
    + totalAnswerPages
    + roughWorkPages;

  const TABS = [
    { id: 'branding', label: 'Branding',       icon: Building2   },
    { id: 'cover',    label: 'Cover Page',      icon: FileText    },
    { id: 'instruct', label: 'Instructions',    icon: AlignLeft   },
    { id: 'valuer',   label: 'Valuer & Marks',  icon: Award       },
    { id: 'answer',   label: 'Answer Design',   icon: Layout      },
    { id: 'page',     label: 'Page Layout',     icon: SquareStack },
    { id: 'settings', label: 'Settings',        icon: Settings    },
  ];

  return (
    <div className="asd-page">
      <TemplateList
        templates={templates}
        activeId={activeId}
        onSelect={loadTemplate}
        onCreate={handleNew}
        onDelete={handleDelete}
        loading={listLoading}
      />

      {/* ── Editor ── */}
      <div className="asd-editor">
        <div className="asd-editor-header">
          <div className="asd-editor-title">
            <PenTool size={18} />
            <input className="asd-title-input" value={templateName}
              onChange={e => setTemplateName(e.target.value)} placeholder="Template Name" />
            {activeId && <span className="asd-id-badge">#{activeId}</span>}
          </div>
          <div className="asd-editor-actions">
            <button className="btn btn-secondary btn-sm" onClick={handleNew}>
              <RefreshCw size={13} /> Reset
            </button>
            <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving}>
              {saving ? <><Loader2 size={13} className="spin" /> Saving…</> : <><Save size={13} /> Save</>}
            </button>
            <button className="btn btn-success btn-sm" onClick={handleDownload}>
              <Download size={13} /> Generate PDF
            </button>
          </div>
        </div>

        {error && (
          <div className="asd-alert error">
            <AlertTriangle size={13} /> {error}
            <button onClick={() => setError('')}><X size={12} /></button>
          </div>
        )}
        {success && (
          <div className="asd-alert success">
            <CheckCircle2 size={13} /> {success}
            <button onClick={() => setSuccess('')}><X size={12} /></button>
          </div>
        )}

        <div className="asd-tabs">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button key={id} className={`asd-tab ${activeTab === id ? 'active' : ''}`}
              onClick={() => setActiveTab(id)}>
              <Icon size={14} /> {label}
            </button>
          ))}
        </div>

        {/* Tab: Branding */}
        {activeTab === 'branding' && (
          <div className="asd-tab-body">
            <div className="asd-section-title">Organisation Details</div>
            <div className="asd-form-grid">
              <div className="asd-form-field">
                <label>Organisation Name (Primary)</label>
                <input className="field-input" value={orgName}
                  onChange={e => setOrgName(e.target.value)}
                  placeholder="e.g. Telangana State Public Service Commission" />
              </div>
              <div className="asd-form-field">
                <label>Organisation Name (Secondary Line)</label>
                <input className="field-input" value={orgNameSecondary}
                  onChange={e => setOrgNameSecondary(e.target.value)}
                  placeholder="e.g. Government of Telangana" />
              </div>
              <div className="asd-form-field half">
                <label>Organisation Code</label>
                <input className="field-input" value={orgCode}
                  onChange={e => setOrgCode(e.target.value)} placeholder="e.g. TSPSC" />
              </div>
              <div className="asd-form-field half">
                <label>Paper Code</label>
                <input className="field-input" value={paperCode}
                  onChange={e => setPaperCode(e.target.value)} placeholder="e.g. GE-2024" />
              </div>
              <div className="asd-form-field half">
                <label>Serial Number Prefix</label>
                <input className="field-input" value={serialNumberPrefix}
                  onChange={e => setSerialNumberPrefix(e.target.value)} placeholder="e.g. SN" />
              </div>
            </div>

            <div className="asd-section-title" style={{ marginTop: 20 }}>
              <Palette size={14} /> Theme Color
            </div>
            <div className="asd-color-row">
              {THEME_PRESETS.map(c => (
                <button key={c}
                  className={`asd-color-swatch ${themeColor === c ? 'selected' : ''}`}
                  style={{ background: c }}
                  onClick={() => setThemeColor(c)}
                />
              ))}
              <input type="color" value={themeColor}
                onChange={e => setThemeColor(e.target.value)}
                className="asd-color-picker" title="Custom color" />
              <span className="asd-color-hex">{themeColor}</span>
            </div>

            <div className="asd-section-title" style={{ marginTop: 20 }}>
              <Image size={14} /> Logo
            </div>
            <div className="asd-logo-row">
              <input type="file" ref={logoInputRef} accept="image/*"
                onChange={handleLogoUpload} style={{ display: 'none' }} />
              <button className="btn btn-secondary btn-sm"
                onClick={() => logoInputRef.current?.click()}>
                <Image size={13} /> {logoPath ? 'Change Logo' : 'Upload Logo'}
              </button>
              {logoPath && (
                <>
                  <span className="asd-logo-name">{logoPath}</span>
                  <button className="asd-icon-btn danger" onClick={() => setLogoPath('')}>
                    <X size={12} />
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        {/* Tab: Cover Page */}
        {activeTab === 'cover' && (
          <div className="asd-tab-body">
            <div className="asd-section-title">
              Student & Exam Details Fields
              <span className="asd-section-hint">
                Toggle, relabel, choose width, reorder. Half-row fields pair side-by-side.
              </span>
            </div>
            {fields.map((f, idx) => (
              <FieldRow key={f.id} field={f} index={idx} total={fields.length}
                onChange={updateField} onRemove={removeField} onMove={moveField} />
            ))}
            <button className="btn btn-secondary btn-sm asd-add-field-btn" onClick={addField}>
              <Plus size={13} /> Add Custom Field
            </button>

            <div className="asd-section-title" style={{ marginTop: 20 }}>
              <Hash size={14} /> Question-Marks Table on Cover
            </div>
            <label className="asd-toggle-label">
              <input type="checkbox" checked={questionMapping.show}
                onChange={e => updateQMapping('show', e.target.checked)} />
              Show question-wise marks table
            </label>
            {questionMapping.show && (
              <div className="asd-form-field half" style={{ marginTop: 8 }}>
                <label>Number of Questions</label>
                <input className="field-input" type="number" min="1" max="30"
                  value={questionMapping.questions}
                  onChange={e => updateQMapping('questions', parseInt(e.target.value) || 0)} />
              </div>
            )}
          </div>
        )}

        {/* Tab: Instructions */}
        {activeTab === 'instruct' && (
          <div className="asd-tab-body">
            <div className="asd-section-title">Page 2 — Instructions</div>
            <textarea className="asd-instructions-area" value={instructions2}
              onChange={e => setInstructions2(e.target.value)}
              placeholder="Enter instructions for page 2 (one per line)…" rows={12} />
            <label className="asd-toggle-label">
              <input type="checkbox" checked={hasPage3}
                onChange={e => setHasPage3(e.target.checked)} />
              Include additional instructions (shown on page 3 or below valuer table)
            </label>
            {hasPage3 && (
              <>
                <div className="asd-section-title" style={{ marginTop: 16 }}>Additional Instructions</div>
                <textarea className="asd-instructions-area" value={instructions3}
                  onChange={e => setInstructions3(e.target.value)}
                  placeholder="Enter additional instructions…" rows={10} />
              </>
            )}
          </div>
        )}

        {/* Tab: Valuer & Marks */}
        {activeTab === 'valuer' && (
          <div className="asd-tab-body">
            <div className="asd-section-title">
              <Award size={14} /> Examiner / Valuer Page
            </div>
            <label className="asd-toggle-label">
              <input type="checkbox" checked={valuerConfig.show}
                onChange={e => updateValuer('show', e.target.checked)} />
              Include Valuer / Examiner marks page (page 3)
            </label>
            <p className="asd-section-hint" style={{ margin: '8px 0' }}>
              This page appears after instructions, with a table for examiners to fill marks, signatures, etc.
            </p>

            {valuerConfig.show && (
              <>
                <div className="asd-section-title" style={{ marginTop: 16 }}>Valuer Row Labels</div>
                <EditableList
                  items={valuerConfig.labels}
                  onChange={labels => updateValuer('labels', labels)}
                  label="Valuer"
                  addLabel="Add Valuer Row"
                />

                <div className="asd-section-title" style={{ marginTop: 16 }}>Table Columns</div>
                <EditableList
                  items={valuerConfig.columns}
                  onChange={cols => updateValuer('columns', cols)}
                  label="Column"
                  addLabel="Add Column"
                />
              </>
            )}
          </div>
        )}

        {/* Tab: Answer Design */}
        {activeTab === 'answer' && (
          <div className="asd-tab-body">
            <div className="asd-section-title">
              Answer Page Layout
              <span className="asd-section-hint">
                Define writing sections per answer page. Height 0 = fills remaining space.
              </span>
            </div>
            <div className="asd-block-legend">
              <span className="asd-block-dot lines" /> Ruled Lines
              <span className="asd-block-dot blank" /> Blank Space
              <span className="asd-block-dot box"   /> Bordered Box
              <span style={{ marginLeft: 'auto', fontSize: 11, color: '#888' }}>
                mm = height &nbsp;|&nbsp; sp = line spacing (mm)
              </span>
            </div>
            {answerPageLayout.map((b, idx) => (
              <BlockRow key={b.id} block={b} index={idx} total={answerPageLayout.length}
                onChange={updateBlock} onRemove={removeBlock} onMove={moveBlock} />
            ))}
            <button className="btn btn-secondary btn-sm asd-add-field-btn" onClick={addBlock}>
              <Plus size={13} /> Add Block
            </button>

            <div className="asd-section-title" style={{ marginTop: 20 }}>Margin Symbols</div>
            <div className="asd-symbol-row">
              <label className="asd-symbol-option">
                <input type="checkbox" checked={showQrCode}
                  onChange={e => setShowQrCode(e.target.checked)} />
                <div className="asd-symbol-box qr">QR</div> QR Code
              </label>
              <label className="asd-symbol-option">
                <input type="checkbox" checked={showBarcode}
                  onChange={e => setShowBarcode(e.target.checked)} />
                <div className="asd-symbol-box bc">||||</div> Barcode
              </label>
            </div>
          </div>
        )}

        {/* Tab: Page Layout */}
        {activeTab === 'page' && (
          <div className="asd-tab-body">
            <div className="asd-section-title">Margins (mm)</div>
            <div className="asd-margin-grid">
              {['top', 'right', 'bottom', 'left'].map(side => (
                <div key={side} className="asd-margin-field">
                  <label>{side.charAt(0).toUpperCase() + side.slice(1)}</label>
                  <input className="field-input" type="number" min="5" max="50"
                    value={marginConfig[side]}
                    onChange={e => updateMargin(side, parseInt(e.target.value) || 15)} />
                </div>
              ))}
            </div>

            <div className="asd-section-title" style={{ marginTop: 20 }}>
              <Crosshair size={14} /> Registration Marks
            </div>
            <label className="asd-toggle-label">
              <input type="checkbox" checked={registrationMarks.show}
                onChange={e => updateRegMarks('show', e.target.checked)} />
              Show corner registration marks (for scanner alignment)
            </label>
            {registrationMarks.show && (
              <div className="asd-form-grid" style={{ marginTop: 8 }}>
                <div className="asd-form-field half">
                  <label>Mark Size (mm)</label>
                  <input className="field-input" type="number" min="3" max="15"
                    value={registrationMarks.size}
                    onChange={e => updateRegMarks('size', parseInt(e.target.value) || 5)} />
                </div>
                <div className="asd-form-field half">
                  <label>Offset from Edge (mm)</label>
                  <input className="field-input" type="number" min="2" max="15"
                    value={registrationMarks.offset}
                    onChange={e => updateRegMarks('offset', parseInt(e.target.value) || 4)} />
                </div>
              </div>
            )}

            <div className="asd-section-title" style={{ marginTop: 20 }}>Footer Bar</div>
            <label className="asd-toggle-label">
              <input type="checkbox" checked={footerConfig.show}
                onChange={e => updateFooter('show', e.target.checked)} />
              Show footer bar on answer pages
            </label>
            {footerConfig.show && (
              <div className="asd-form-grid" style={{ marginTop: 8 }}>
                <div className="asd-form-field half">
                  <label>Footer Height (mm)</label>
                  <input className="field-input" type="number" min="6" max="25"
                    value={footerConfig.height}
                    onChange={e => updateFooter('height', parseInt(e.target.value) || 12)} />
                </div>
                <div className="asd-form-field half" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <label className="asd-toggle-label">
                    <input type="checkbox" checked={footerConfig.showPageNo}
                      onChange={e => updateFooter('showPageNo', e.target.checked)} />
                    Page number
                  </label>
                  <label className="asd-toggle-label">
                    <input type="checkbox" checked={footerConfig.showSerial}
                      onChange={e => updateFooter('showSerial', e.target.checked)} />
                    Serial number
                  </label>
                </div>
              </div>
            )}

            <div className="asd-section-title" style={{ marginTop: 20 }}>Rough Work Pages</div>
            <div className="asd-form-field half">
              <label>Number of rough work pages at the end</label>
              <input className="field-input" type="number" min="0" max="10"
                value={roughWorkPages}
                onChange={e => setRoughWorkPages(parseInt(e.target.value) || 0)} />
            </div>
          </div>
        )}

        {/* Tab: Settings */}
        {activeTab === 'settings' && (
          <div className="asd-tab-body">
            <div className="asd-section-title">Paper Size</div>
            <div className="asd-style-row">
              {PAPER_SIZES.map(({ v, label }) => (
                <label key={v} className={`asd-style-option ${paperSize === v ? 'selected' : ''}`}>
                  <input type="radio" name="paperSize" value={v} checked={paperSize === v}
                    onChange={() => setPaperSize(v)} />
                  {label}
                </label>
              ))}
            </div>

            <div className="asd-section-title" style={{ marginTop: 24 }}>Exam Link (optional)</div>
            <select className="field-input asd-exam-select" value={examId}
              onChange={e => setExamId(e.target.value)}>
              <option value="">— Generic (not linked to a specific exam) —</option>
              {exams.map(e => (
                <option key={e.ExamID} value={e.ExamID}>
                  {e.ExamCode} — {e.ExamName} ({e.ExamYear})
                </option>
              ))}
            </select>

            <div className="asd-section-title" style={{ marginTop: 24 }}>Answer Page Count</div>
            <div className="asd-page-count-row">
              {PAGE_COUNTS.map(n => (
                <label key={n} className={`asd-page-count-option ${totalAnswerPages === n ? 'selected' : ''}`}>
                  <input type="radio" name="pageCount" value={n} checked={totalAnswerPages === n}
                    onChange={() => setTotalAnswerPages(n)} />
                  {n}
                </label>
              ))}
              <div className="asd-page-count-custom">
                <input type="number" min="4" max="100" value={totalAnswerPages}
                  onChange={e => setTotalAnswerPages(parseInt(e.target.value) || 24)}
                  className="asd-page-count-input" />
                <span>pages</span>
              </div>
            </div>

            <div className="asd-section-title" style={{ marginTop: 24 }}>Writing Line Style</div>
            <div className="asd-style-row">
              {[{ v: 'lined', label: 'Lined' }, { v: 'plain', label: 'Plain' }].map(({ v, label }) => (
                <label key={v} className={`asd-style-option ${pageStyle === v ? 'selected' : ''}`}>
                  <input type="radio" name="pageStyle" value={v} checked={pageStyle === v}
                    onChange={() => setPageStyle(v)} />
                  {label}
                </label>
              ))}
            </div>

            <div className="asd-settings-summary">
              <BookOpen size={14} />
              Total booklet pages: <strong>{totalPages}</strong>
              &nbsp;(1 cover
              {instructions2 ? ' + 1 instructions' : ''}
              {valuerConfig.show ? ' + 1 valuer' : (hasPage3 && instructions3 ? ' + 1 instructions' : '')}
              {' + '}{totalAnswerPages} answer
              {roughWorkPages > 0 ? ` + ${roughWorkPages} rough` : ''})
              · {paperSize}
            </div>
          </div>
        )}
      </div>

      {/* ── Live preview ── */}
      <div className="asd-preview-panel">
        <div className="asd-preview-header">
          <Eye size={14} /> Live Preview
          <div className="asd-preview-tabs">
            <button className={`asd-preview-tab ${previewPage === 0 ? 'active' : ''}`}
              onClick={() => setPreviewPage(0)}>Cover</button>
            <button className={`asd-preview-tab ${previewPage === 1 ? 'active' : ''}`}
              onClick={() => setPreviewPage(1)}>Answer pg</button>
          </div>
        </div>

        <div className="asd-preview-scaler">
          {previewPage === 0 ? (
            <CoverPreview
              fields={fields}
              examName={examLabel}
              paperSize={paperSize}
              themeColor={themeColor}
              orgName={orgName}
              orgNameSecondary={orgNameSecondary}
              paperCode={paperCode}
            />
          ) : (
            <AnswerPagePreview
              pageNo={1}
              total={totalAnswerPages}
              templateName={templateName}
              answerPageLayout={answerPageLayout}
              showBarcode={showBarcode}
              showQrCode={showQrCode}
              paperSize={paperSize}
              themeColor={themeColor}
              footerConfig={footerConfig}
            />
          )}
        </div>

        <div className="asd-preview-note">
          Scaled preview · {paperSize === 'Legal' ? 'Legal (216x356 mm)' : 'A4 (210x297 mm)'}
        </div>
      </div>
    </div>
  );
}
