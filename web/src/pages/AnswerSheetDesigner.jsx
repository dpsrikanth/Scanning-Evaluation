import { useState, useEffect, useCallback } from 'react';
import {
  FileText, Plus, Trash2, Save, Download, Eye,
  ChevronUp, ChevronDown, Settings, BookOpen, AlignLeft,
  Loader2, CheckCircle2, AlertTriangle, X, GripVertical,
  PenTool, RefreshCw, Layout,
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
  { id: 'b1', type: 'lines', heightMm: 0,  lineSpacingMm: 8.5, label: '' },
];

const PAGE_COUNTS   = [16, 20, 24, 28, 32];
const BLOCK_TYPES   = [
  { v: 'lines', label: 'Ruled Lines' },
  { v: 'blank', label: 'Blank Space' },
  { v: 'box',   label: 'Bordered Box' },
];
const PAPER_SIZES = [
  { v: 'A4',    label: 'A4  (210 × 297 mm)' },
  { v: 'Legal', label: 'Legal  (216 × 356 mm)' },
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
          key={t.templateId}
          className={`asd-list-item ${t.templateId === activeId ? 'active' : ''}`}
          onClick={() => onSelect(t.templateId)}
        >
          <div className="asd-list-item-name">{t.templateName}</div>
          <div className="asd-list-item-meta">
            {t.examName || 'Generic'} · {t.totalAnswerPages} pages · {t.paperSize || 'A4'}
          </div>
          <button
            className="asd-list-delete"
            title="Delete template"
            onClick={e => { e.stopPropagation(); onDelete(t.templateId); }}
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
        <input
          type="checkbox"
          checked={field.enabled}
          onChange={e => onChange(field.id, 'enabled', e.target.checked)}
        />
        <span className="asd-toggle-track" />
      </label>

      <input
        className="asd-field-label-input"
        value={field.label}
        onChange={e => onChange(field.id, 'label', e.target.value)}
        placeholder="Field label"
        disabled={!field.enabled}
      />

      <select
        className="asd-field-layout-select"
        value={field.layout}
        onChange={e => onChange(field.id, 'layout', e.target.value)}
        disabled={!field.enabled}
      >
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
  const totalHeight = block.heightMm > 0 ? `${block.heightMm} mm` : 'fill remaining';
  return (
    <div className="asd-block-row">
      <span className="asd-field-grip"><GripVertical size={14} /></span>

      <div
        className="asd-block-type-bar"
        title={totalHeight}
        style={{ background: block.type === 'lines' ? '#e6eeff' : block.type === 'box' ? '#fff3e0' : '#f0fff4' }}
      />

      <select
        className="asd-block-type-select"
        value={block.type}
        onChange={e => onChange(block.id, 'type', e.target.value)}
      >
        {BLOCK_TYPES.map(bt => <option key={bt.v} value={bt.v}>{bt.label}</option>)}
      </select>

      <input
        className="asd-block-height-input"
        type="number"
        min="0"
        max="297"
        value={block.heightMm}
        onChange={e => onChange(block.id, 'heightMm', parseFloat(e.target.value) || 0)}
        title="Height in mm (0 = fill remaining space)"
      />
      <span className="asd-block-unit">mm</span>

      {block.type === 'lines' && (
        <>
          <input
            className="asd-block-spacing-input"
            type="number"
            min="4"
            max="20"
            step="0.5"
            value={block.lineSpacingMm}
            onChange={e => onChange(block.id, 'lineSpacingMm', parseFloat(e.target.value) || 8.5)}
            title="Line spacing in mm"
          />
          <span className="asd-block-unit">sp</span>
        </>
      )}
      {block.type !== 'lines' && <span className="asd-block-spacer" />}

      <input
        className="asd-block-label-input"
        value={block.label || ''}
        onChange={e => onChange(block.id, 'label', e.target.value)}
        placeholder="Label (optional)"
      />

      <div className="asd-field-btns">
        <button className="asd-icon-btn" onClick={() => onMove(block.id, -1)} disabled={index === 0}>
          <ChevronUp size={13} />
        </button>
        <button className="asd-icon-btn" onClick={() => onMove(block.id, 1)} disabled={index === total - 1}>
          <ChevronDown size={13} />
        </button>
        <button className="asd-icon-btn danger" onClick={() => onRemove(block.id)}>
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  );
}

// ── Cover page preview ───────────────────────────────────────────────────────
function CoverPreview({ fields, examName, paperSize }) {
  const enabled = fields.filter(f => f.enabled).sort((a, b) => a.order - b.order);
  const rows = [];
  let i = 0;
  while (i < enabled.length) {
    const f = enabled[i], next = enabled[i + 1];
    if (f.layout === 'full' || !next || next.layout === 'full') { rows.push([f]); i++; }
    else { rows.push([f, next]); i += 2; }
  }
  const isLegal = paperSize === 'Legal';
  return (
    <div className={`asd-a4-preview ${isLegal ? 'legal' : ''}`}>
      <div className="asd-a4-header">ANSWER BOOKLET</div>
      {examName && <div className="asd-a4-exam">{examName}</div>}
      <div className="asd-a4-divider" />
      {rows.map((row, ri) => (
        <div key={ri} className="asd-a4-field-row">
          {row.map(f => (
            <div key={f.id} className={`asd-a4-field ${row.length === 1 ? 'full' : 'half'}`}>
              <span className="asd-a4-field-label">{f.label}</span>
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

// ── Answer page preview ──────────────────────────────────────────────────────
function AnswerPagePreview({ pageNo, total, templateName, answerPageLayout, showBarcode, showQrCode, paperSize }) {
  const isLegal = paperSize === 'Legal';
  const totalH  = isLegal ? 356 : 297; // mm

  // Compute block heights for preview
  const blocks = answerPageLayout && answerPageLayout.length > 0 ? answerPageLayout : DEFAULT_LAYOUT;
  const fixed  = blocks.reduce((s, b) => s + (b.heightMm > 0 ? b.heightMm : 0), 0);
  const usable = totalH - 30; // rough usable writing area in mm
  const flex   = blocks.filter(b => b.heightMm === 0).length;
  const flexMm = flex > 0 ? Math.max(0, usable - fixed) / flex : 0;

  return (
    <div className={`asd-a4-preview asd-a4-answer ${isLegal ? 'legal' : ''}`}>
      <div className="asd-a4-ans-header">
        <span>{templateName || 'Answer Booklet'}</span>
        <span>Page {pageNo} of {total}</span>
      </div>
      <div className="asd-a4-ans-body">
        <div className="asd-a4-ans-margin">
          {showQrCode && <div className="asd-a4-qr-stub">QR</div>}
          {showBarcode && <div className="asd-a4-ans-barcode-stub">||||</div>}
          <div className="asd-a4-ans-pageno">{pageNo}</div>
        </div>
        <div className="asd-a4-ans-write">
          {blocks.map((block, bi) => {
            const hMm  = block.heightMm > 0 ? block.heightMm : flexMm;
            const hPx  = Math.max(8, (hMm / usable) * 220);
            const lines = block.type === 'lines' ? Math.floor(hMm / (block.lineSpacingMm || 8.5)) : 0;
            return (
              <div
                key={block.id || bi}
                className={`asd-block-preview ${block.type}`}
                style={{ height: hPx }}
              >
                {block.label && <span className="asd-block-preview-label">{block.label}</span>}
                {block.type === 'lines' && Array.from({ length: Math.min(lines, 30) }).map((_, li) => (
                  <div key={li} className="asd-a4-line" />
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────
export default function AnswerSheetDesigner() {
  const [templates,     setTemplates]     = useState([]);
  const [activeId,      setActiveId]      = useState(null);
  const [listLoading,   setListLoading]   = useState(false);
  const [saving,        setSaving]        = useState(false);
  const [error,         setError]         = useState('');
  const [success,       setSuccess]       = useState('');
  const [activeTab,     setActiveTab]     = useState('cover');
  const [exams,         setExams]         = useState([]);
  const [previewPage,   setPreviewPage]   = useState(0);

  // Form state
  const [templateName,      setTemplateName]      = useState('New Template');
  const [paperSize,         setPaperSize]         = useState('A4');
  const [examId,            setExamId]            = useState('');
  const [fields,            setFields]            = useState(DEFAULT_FIELDS);
  const [instructions2,     setInstructions2]     = useState('');
  const [instructions3,     setInstructions3]     = useState('');
  const [hasPage3,          setHasPage3]          = useState(false);
  const [totalAnswerPages,  setTotalAnswerPages]  = useState(24);
  const [pageStyle,         setPageStyle]         = useState('lined');
  const [showBarcode,       setShowBarcode]       = useState(true);
  const [showQrCode,        setShowQrCode]        = useState(true);
  const [answerPageLayout,  setAnswerPageLayout]  = useState(DEFAULT_LAYOUT.map(b => ({ ...b })));

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
      setPaperSize(t.paperSize || 'A4');
      setExamId(t.examId ? String(t.examId) : '');
      setFields(Array.isArray(t.coverFields) && t.coverFields.length ? t.coverFields : DEFAULT_FIELDS);
      setInstructions2(t.instructions2 || '');
      setInstructions3(t.instructions3 || '');
      setHasPage3(!!t.instructions3);
      setTotalAnswerPages(t.totalAnswerPages || 24);
      setPageStyle(t.pageStyle || 'lined');
      setShowBarcode(t.showBarcode !== 0);
      setShowQrCode(t.showQrCode  !== 0);
      setAnswerPageLayout(
        Array.isArray(t.answerPageLayout) && t.answerPageLayout.length
          ? t.answerPageLayout.map(b => ({ ...b, id: b.id || uid() }))
          : DEFAULT_LAYOUT.map(b => ({ ...b }))
      );
      setError(''); setSuccess('');
    } catch (e) { setError(e.message); }
  }, []);

  const handleNew = () => {
    setActiveId(null);
    setTemplateName('New Template');
    setPaperSize('A4');
    setExamId('');
    setFields(DEFAULT_FIELDS.map(f => ({ ...f })));
    setInstructions2('');
    setInstructions3('');
    setHasPage3(false);
    setTotalAnswerPages(24);
    setPageStyle('lined');
    setShowBarcode(true);
    setShowQrCode(true);
    setAnswerPageLayout(DEFAULT_LAYOUT.map(b => ({ ...b })));
    setActiveTab('cover');
    setError(''); setSuccess('');
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this template?')) return;
    try {
      await api.answersheet.remove(id);
      setTemplates(prev => prev.filter(t => t.templateId !== id));
      if (activeId === id) handleNew();
    } catch (e) { setError(e.message); }
  };

  const handleSave = async () => {
    if (!templateName.trim()) { setError('Template name is required'); return; }
    setSaving(true); setError(''); setSuccess('');
    const payload = {
      templateName: templateName.trim(),
      paperSize,
      examId: examId ? parseInt(examId) : null,
      coverFields: fields.map((f, i) => ({ ...f, order: i + 1 })),
      instructions2: instructions2 || null,
      instructions3: hasPage3 ? (instructions3 || null) : null,
      totalAnswerPages,
      pageStyle,
      showBarcode: showBarcode ? 1 : 0,
      showQrCode:  showQrCode  ? 1 : 0,
      answerPageLayout: answerPageLayout.length ? answerPageLayout : null,
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

  // Cover field helpers
  const updateField = (id, key, value) =>
    setFields(prev => prev.map(f => f.id === id ? { ...f, [key]: value } : f));
  const removeField = (id) =>
    setFields(prev => prev.filter(f => f.id !== id));
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
  const removeBlock = (id) =>
    setAnswerPageLayout(prev => prev.filter(b => b.id !== id));
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

  const selectedExam = exams.find(e => String(e.ExamID) === examId);
  const examLabel    = selectedExam ? `${selectedExam.ExamCode} — ${selectedExam.ExamName}` : '';

  const totalPages = 1
    + (instructions2 ? 1 : 0)
    + (hasPage3 && instructions3 ? 1 : 0)
    + totalAnswerPages;

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
            <input
              className="asd-title-input"
              value={templateName}
              onChange={e => setTemplateName(e.target.value)}
              placeholder="Template Name"
            />
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
          {[
            { id: 'cover',    label: 'Cover Page',    icon: FileText   },
            { id: 'instruct', label: 'Instructions',  icon: AlignLeft  },
            { id: 'answer',   label: 'Answer Design', icon: Layout     },
            { id: 'settings', label: 'Page Settings', icon: Settings   },
          ].map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={`asd-tab ${activeTab === id ? 'active' : ''}`}
              onClick={() => setActiveTab(id)}
            >
              <Icon size={14} /> {label}
            </button>
          ))}
        </div>

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
              <FieldRow
                key={f.id}
                field={f}
                index={idx}
                total={fields.length}
                onChange={updateField}
                onRemove={removeField}
                onMove={moveField}
              />
            ))}
            <button className="btn btn-secondary btn-sm asd-add-field-btn" onClick={addField}>
              <Plus size={13} /> Add Custom Field
            </button>
          </div>
        )}

        {/* Tab: Instructions */}
        {activeTab === 'instruct' && (
          <div className="asd-tab-body">
            <div className="asd-section-title">Page 2 — Instructions</div>
            <textarea
              className="asd-instructions-area"
              value={instructions2}
              onChange={e => setInstructions2(e.target.value)}
              placeholder="Enter instructions for page 2 (one per line)…"
              rows={12}
            />
            <label className="asd-toggle-label">
              <input type="checkbox" checked={hasPage3} onChange={e => setHasPage3(e.target.checked)} />
              Include Page 3 (additional instructions)
            </label>
            {hasPage3 && (
              <>
                <div className="asd-section-title" style={{ marginTop: 16 }}>Page 3 — Additional Instructions</div>
                <textarea
                  className="asd-instructions-area"
                  value={instructions3}
                  onChange={e => setInstructions3(e.target.value)}
                  placeholder="Enter additional instructions for page 3…"
                  rows={10}
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
              <BlockRow
                key={b.id}
                block={b}
                index={idx}
                total={answerPageLayout.length}
                onChange={updateBlock}
                onRemove={removeBlock}
                onMove={moveBlock}
              />
            ))}
            <button className="btn btn-secondary btn-sm asd-add-field-btn" onClick={addBlock}>
              <Plus size={13} /> Add Block
            </button>

            <div className="asd-section-title" style={{ marginTop: 20 }}>Margin Symbols</div>
            <div className="asd-symbol-row">
              <label className="asd-symbol-option">
                <input
                  type="checkbox"
                  checked={showQrCode}
                  onChange={e => setShowQrCode(e.target.checked)}
                />
                <div className="asd-symbol-box qr">QR</div>
                QR Code
              </label>
              <label className="asd-symbol-option">
                <input
                  type="checkbox"
                  checked={showBarcode}
                  onChange={e => setShowBarcode(e.target.checked)}
                />
                <div className="asd-symbol-box bc">||||</div>
                Barcode
              </label>
            </div>
            <div className="asd-symbol-hint">
              Both encode <code>templateId/pageNo</code> — QR code appears at top of margin, barcode below it (rotated vertical).
            </div>
          </div>
        )}

        {/* Tab: Page Settings */}
        {activeTab === 'settings' && (
          <div className="asd-tab-body">
            <div className="asd-section-title">Paper Size</div>
            <div className="asd-style-row">
              {PAPER_SIZES.map(({ v, label }) => (
                <label key={v} className={`asd-style-option ${paperSize === v ? 'selected' : ''}`}>
                  <input type="radio" name="paperSize" value={v} checked={paperSize === v}
                    onChange={() => setPaperSize(v)} />
                  <span className="asd-style-icon">{v === 'A4' ? '📄' : '📋'}</span>
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
                <input
                  type="number" min="4" max="100"
                  value={totalAnswerPages}
                  onChange={e => setTotalAnswerPages(parseInt(e.target.value) || 24)}
                  className="asd-page-count-input"
                />
                <span>pages</span>
              </div>
            </div>

            <div className="asd-section-title" style={{ marginTop: 24 }}>Writing Line Style</div>
            <div className="asd-style-row">
              {[{ v: 'lined', label: 'Lined', icon: '≡' }, { v: 'plain', label: 'Plain', icon: '□' }].map(({ v, label, icon }) => (
                <label key={v} className={`asd-style-option ${pageStyle === v ? 'selected' : ''}`}>
                  <input type="radio" name="pageStyle" value={v} checked={pageStyle === v}
                    onChange={() => setPageStyle(v)} />
                  <span className="asd-style-icon">{icon}</span>
                  {label}
                </label>
              ))}
            </div>
            <div className="asd-style-hint">
              Applies as default when Answer Design tab has no custom blocks defined.
            </div>

            <div className="asd-settings-summary">
              <BookOpen size={14} />
              Total booklet pages: <strong>{totalPages}</strong>
              &nbsp;(1 cover +{instructions2 ? ' 1' : ' 0'}{hasPage3 && instructions3 ? '+1' : ''} instructions + {totalAnswerPages} answer) · {paperSize}
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
            />
          )}
        </div>

        <div className="asd-preview-note">
          Scaled preview · {paperSize === 'Legal' ? 'Legal (216×356 mm)' : 'A4 (210×297 mm)'}
        </div>
      </div>
    </div>
  );
}
