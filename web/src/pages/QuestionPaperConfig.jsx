import { useState, useEffect, useRef, useCallback } from 'react';
import {
  BookOpen, Upload, Plus, Trash2, Save, AlertTriangle,
  CheckCircle2, FileText, ChevronDown, Loader2, Info,
  Sparkles, X, Eye,
} from 'lucide-react';
import { api } from '../services/api';
import './QuestionPaperConfig.css';

const SET_TYPES = [
  { value: 'Common',     label: 'Common (Best N of M)' },
  { value: 'Mandatory',  label: 'Mandatory (All required)' },
  { value: 'AnswerAll',  label: 'Answer All' },
];

const emptySet = (idx) => ({
  _id: Date.now() + idx,
  setLabel: `Set ${idx + 1}`,
  setType: 'Common',
  totalQuestions: 4,
  attemptQuestions: 3,
  marksPerQuestion: 10,
  questionRangeFrom: '',
  questionRangeTo: '',
});

function computeSetMax(set) {
  const n = set.setType === 'Common' ? parseInt(set.attemptQuestions) || 0 : parseInt(set.totalQuestions) || 0;
  return n * (parseFloat(set.marksPerQuestion) || 0);
}

// ── Extract-confirm modal ─────────────────────────────────────────────────────

function ExtractModal({ data, onApply, onClose }) {
  const [rows, setRows] = useState(() =>
    data.sections.map((s, i) => ({ ...s, _id: i }))
  );
  const [subject, setSubject] = useState(data.subject || '');
  const [totalMarks, setTotalMarks] = useState(String(data.totalMarks || ''));

  const updateRow = (id, field, value) => {
    setRows(prev => prev.map(r => {
      if (r._id !== id) return r;
      const updated = { ...r, [field]: value };
      if (field === 'setType' && value !== 'Common') {
        updated.attemptQuestions = updated.totalQuestions;
      }
      if (field === 'totalQuestions' && updated.setType !== 'Common') {
        updated.attemptQuestions = value;
      }
      updated.computedMax =
        (updated.setType === 'Common'
          ? parseInt(updated.attemptQuestions) || 0
          : parseInt(updated.totalQuestions) || 0) *
        (parseFloat(updated.marksPerQuestion) || 0);
      return updated;
    }));
  };

  const sectionTotal = rows.reduce((s, r) => {
    const n = r.setType === 'Common'
      ? parseInt(r.attemptQuestions) || 0
      : parseInt(r.totalQuestions) || 0;
    return s + n * (parseFloat(r.marksPerQuestion) || 0);
  }, 0);

  const handleApply = () => {
    onApply({
      maxMarks: parseFloat(totalMarks) || sectionTotal,
      sections: rows,
    });
  };

  return (
    <div className="ext-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="ext-modal">
        {/* Header */}
        <div className="ext-modal-header">
          <div className="ext-modal-title">
            <Sparkles size={18} />
            <span>Extracted Question Paper Structure</span>
            {data.confidence === 'low' && (
              <span className="ext-badge-warn">
                <AlertTriangle size={12} /> Low confidence — please review carefully
              </span>
            )}
          </div>
          <button className="ext-close-btn" onClick={onClose}><X size={18} /></button>
        </div>

        {/* Summary row */}
        <div className="ext-summary-row">
          <div className="ext-summary-field">
            <label>Subject / Title</label>
            <input
              className="field-input"
              value={subject}
              onChange={e => setSubject(e.target.value)}
            />
          </div>
          <div className="ext-summary-field ext-summary-field--sm">
            <label>Total Questions</label>
            <input
              className="field-input"
              readOnly
              value={rows.reduce((s, r) => s + (parseInt(r.totalQuestions) || 0), 0)}
            />
          </div>
          <div className="ext-summary-field ext-summary-field--sm">
            <label>Max Marks (paper)</label>
            <input
              className="field-input"
              type="number"
              value={totalMarks}
              onChange={e => setTotalMarks(e.target.value)}
            />
          </div>
          <div className="ext-summary-field ext-summary-field--sm">
            <label>Sections total</label>
            <input
              className={`field-input ${Math.abs(sectionTotal - (parseFloat(totalMarks) || 0)) < 0.01 ? 'ext-match' : 'ext-mismatch'}`}
              readOnly
              value={sectionTotal.toFixed(1)}
            />
          </div>
        </div>

        {/* Sections table */}
        <div className="ext-table-wrap">
          <table className="qpc-table">
            <thead>
              <tr>
                <th>Section Label</th>
                <th>Type</th>
                <th title="Total questions in section">Total (M)</th>
                <th title="Questions to attempt/count">Attempt (N)</th>
                <th>Marks / Q</th>
                <th>Section Max</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => {
                const secMax = (row.setType === 'Common'
                  ? parseInt(row.attemptQuestions) || 0
                  : parseInt(row.totalQuestions) || 0) *
                  (parseFloat(row.marksPerQuestion) || 0);
                return (
                  <tr key={row._id}>
                    <td>
                      <input
                        className="qpc-cell-input"
                        value={row.label}
                        onChange={e => updateRow(row._id, 'label', e.target.value)}
                      />
                    </td>
                    <td>
                      <select
                        className="qpc-cell-input"
                        value={row.setType}
                        onChange={e => updateRow(row._id, 'setType', e.target.value)}
                      >
                        {SET_TYPES.map(t => (
                          <option key={t.value} value={t.value}>{t.label}</option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input
                        type="number" min={1}
                        className="qpc-cell-input qpc-cell-num"
                        value={row.totalQuestions}
                        onChange={e => updateRow(row._id, 'totalQuestions', parseInt(e.target.value) || 0)}
                      />
                    </td>
                    <td>
                      <input
                        type="number" min={1}
                        className="qpc-cell-input qpc-cell-num"
                        value={row.setType === 'Common' ? row.attemptQuestions : row.totalQuestions}
                        disabled={row.setType !== 'Common'}
                        onChange={e => updateRow(row._id, 'attemptQuestions', parseInt(e.target.value) || 0)}
                      />
                    </td>
                    <td>
                      <input
                        type="number" min={0} step={0.5}
                        className="qpc-cell-input qpc-cell-num"
                        value={row.marksPerQuestion}
                        onChange={e => updateRow(row._id, 'marksPerQuestion', e.target.value)}
                      />
                    </td>
                    <td>
                      <span className={`qpc-setmax ${secMax > 0 ? 'has-value' : ''}`}>
                        {secMax > 0 ? secMax.toFixed(1) : '—'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="ext-modal-footer">
          <p className="ext-hint">
            <Info size={12} />
            Review and correct the extracted values, then click Apply to pre-fill the sets editor.
          </p>
          <div className="ext-modal-actions">
            <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" onClick={handleApply}>
              <CheckCircle2 size={14} /> Apply to Editor
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function QuestionPaperConfig() {
  const [exams,   setExams]   = useState([]);
  const [papers,  setPapers]  = useState([]);
  const [examId,  setExamId]  = useState('');
  const [paperId, setPaperId] = useState('');
  const [config,  setConfig]  = useState(null);   // { paper, sets, scheme }
  const [loading, setLoading] = useState(false);
  const [saving,  setSaving]  = useState(false);
  const [uploading, setUploading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [error,   setError]   = useState('');
  const [success, setSuccess] = useState('');

  // Extraction modal state
  const [extracted,        setExtracted]        = useState(null);
  const [showExtractModal, setShowExtractModal] = useState(false);

  // Editable sets state
  const [maxMarks, setMaxMarks] = useState('');
  const [sets,     setSets]     = useState([]);
  const fileRef = useRef(null);

  // Load exams on mount
  useEffect(() => {
    api.qpaper.exams().then(setExams).catch(() => {});
  }, []);

  // Load papers when exam changes
  useEffect(() => {
    setPapers([]); setPaperId(''); setConfig(null); setSets([]); setMaxMarks('');
    if (!examId) return;
    api.qpaper.papers(examId).then(setPapers).catch(() => {});
  }, [examId]);

  // Load config when paper changes
  useEffect(() => {
    setConfig(null); setSets([]); setMaxMarks(''); setError(''); setExtracted(null);
    if (!paperId) return;
    setLoading(true);
    api.qpaper.config(paperId)
      .then(data => {
        setConfig(data);
        setMaxMarks(data.paper.MaxMarks ?? '');
        if (data.sets && data.sets.length > 0) {
          setSets(data.sets.map((s, i) => ({
            _id: s.SetID || Date.now() + i,
            setLabel: s.SetLabel,
            setType: s.SetType,
            totalQuestions: s.TotalQuestions,
            attemptQuestions: s.AttemptQuestions,
            marksPerQuestion: s.MarksPerQuestion,
            questionRangeFrom: s.QuestionRangeFrom || '',
            questionRangeTo: s.QuestionRangeTo || '',
          })));
        } else {
          setSets([emptySet(0)]);
        }
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [paperId]);

  const updateSet = useCallback((id, field, value) => {
    setSets(prev => prev.map(s => {
      if (s._id !== id) return s;
      const updated = { ...s, [field]: value };
      if (field === 'setType' && value !== 'Common') {
        updated.attemptQuestions = updated.totalQuestions;
      }
      if (field === 'totalQuestions' && updated.setType !== 'Common') {
        updated.attemptQuestions = value;
      }
      return updated;
    }));
  }, []);

  const addSet    = () => setSets(prev => [...prev, emptySet(prev.length)]);
  const removeSet = (id) => setSets(prev => prev.filter(s => s._id !== id));

  const moveSet = (id, dir) => {
    setSets(prev => {
      const idx = prev.findIndex(s => s._id === id);
      if (idx < 0) return prev;
      const next = [...prev];
      const swap = idx + dir;
      if (swap < 0 || swap >= next.length) return prev;
      [next[idx], next[swap]] = [next[swap], next[idx]];
      return next;
    });
  };

  // Live validation
  const calculatedTotal = sets.reduce((s, set) => s + computeSetMax(set), 0);
  const maxMarksNum = parseFloat(maxMarks) || 0;
  const isValid = maxMarksNum > 0 && Math.abs(calculatedTotal - maxMarksNum) < 0.01 && sets.length > 0;

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !paperId) return;
    setUploading(true); setExtracting(false); setError(''); setSuccess('');
    try {
      const fd = new FormData();
      fd.append('questionPaper', file);
      const result = await api.qpaper.upload(paperId, fd);
      setConfig(prev => prev
        ? { ...prev, paper: { ...prev.paper, QuestionPaperPath: result.questionPaperPath } }
        : prev
      );
      setSuccess('PDF uploaded — extracting structure…');
      setUploading(false);

      // Automatically extract structure and show confirm modal
      setExtracting(true);
      try {
        const data = await api.qpaper.extract(paperId);
        setExtracted(data);
        if (data.warning) {
          setSuccess('PDF uploaded. ' + data.warning);
        } else {
          setShowExtractModal(true);
          setSuccess('');
        }
      } catch (extractErr) {
        setSuccess('PDF uploaded successfully.');
        setError('Auto-extraction failed: ' + extractErr.message + '. Use "Extract Structure" to try again.');
      } finally {
        setExtracting(false);
      }
    } catch (err) {
      setUploading(false);
      setError('Upload failed: ' + err.message);
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleExtract = async () => {
    if (!paperId) return;
    setExtracting(true); setError(''); setSuccess('');
    try {
      const data = await api.qpaper.extract(paperId);
      setExtracted(data);
      setShowExtractModal(true);
    } catch (err) {
      setError('Extraction failed: ' + err.message);
    } finally {
      setExtracting(false);
    }
  };

  const handleApplyExtracted = ({ maxMarks: extractedMax, sections }) => {
    setSets(sections.map((s, i) => ({
      _id: Date.now() + i,
      setLabel: s.label,
      setType: s.setType,
      totalQuestions: s.totalQuestions,
      attemptQuestions: s.attemptQuestions,
      marksPerQuestion: s.marksPerQuestion,
      questionRangeFrom: '',
      questionRangeTo: '',
    })));
    setMaxMarks(String(extractedMax));
    setShowExtractModal(false);
    setSuccess('Structure applied to editor — review and save when ready.');
  };

  const handleSave = async () => {
    setError(''); setSuccess('');
    if (!paperId) return;
    if (!isValid) {
      setError(`Total marks (${calculatedTotal.toFixed(2)}) must equal paper max marks (${maxMarksNum.toFixed(2)})`);
      return;
    }
    setSaving(true);
    try {
      const payload = {
        maxMarks: maxMarksNum,
        sets: sets.map(s => ({
          setLabel: s.setLabel,
          setType: s.setType,
          totalQuestions: parseInt(s.totalQuestions),
          attemptQuestions: s.setType === 'Common' ? parseInt(s.attemptQuestions) : parseInt(s.totalQuestions),
          marksPerQuestion: parseFloat(s.marksPerQuestion),
          questionRangeFrom: s.questionRangeFrom || null,
          questionRangeTo: s.questionRangeTo || null,
        })),
      };
      await api.qpaper.saveSets(paperId, payload);
      setSuccess('Question paper configuration saved successfully');
      const fresh = await api.qpaper.config(paperId);
      setConfig(fresh);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const paperName = config?.paper ? `${config.paper.PaperCode} — ${config.paper.PaperName}` : '';

  return (
    <div className="qpc-page">
      {/* Extract modal */}
      {showExtractModal && extracted && (
        <ExtractModal
          data={extracted}
          onApply={handleApplyExtracted}
          onClose={() => setShowExtractModal(false)}
        />
      )}

      {/* Page header */}
      <div className="qpc-header">
        <div className="qpc-header-icon"><BookOpen size={20} /></div>
        <div>
          <h1 className="qpc-title">Question Paper Configuration</h1>
          <p className="qpc-subtitle">Upload the question paper, auto-extract structure, and define question sets</p>
        </div>
      </div>

      {/* Exam / Paper selectors */}
      <div className="qpc-selectors">
        <div className="field-group">
          <label className="field-label">Exam</label>
          <div className="select-wrap">
            <select className="field-input" value={examId} onChange={e => setExamId(e.target.value)}>
              <option value="">— Select Exam —</option>
              {exams.map(ex => (
                <option key={ex.ExamID} value={ex.ExamID}>
                  {ex.ExamCode} — {ex.ExamName} ({ex.ExamYear})
                </option>
              ))}
            </select>
            <ChevronDown size={14} className="select-chevron" />
          </div>
        </div>
        <div className="field-group">
          <label className="field-label">Paper</label>
          <div className="select-wrap">
            <select className="field-input" value={paperId}
              onChange={e => setPaperId(e.target.value)} disabled={!examId}>
              <option value="">— Select Paper —</option>
              {papers.map(p => (
                <option key={p.PaperID} value={p.PaperID}>
                  {p.PaperCode} — {p.PaperName}
                </option>
              ))}
            </select>
            <ChevronDown size={14} className="select-chevron" />
          </div>
        </div>
      </div>

      {/* Alerts */}
      {error && (
        <div className="qpc-alert qpc-alert-error">
          <AlertTriangle size={14} /> {error}
        </div>
      )}
      {success && (
        <div className="qpc-alert qpc-alert-success">
          <CheckCircle2 size={14} /> {success}
        </div>
      )}

      {loading && (
        <div className="qpc-loading"><Loader2 size={24} className="spin" /> Loading configuration…</div>
      )}

      {config && !loading && (
        <>
          {/* Document Upload */}
          <div className="qpc-card">
            <div className="qpc-card-header">
              <FileText size={16} />
              <span>Question Paper Document</span>
            </div>
            <div className="qpc-card-body qpc-doc-row">
              <div className="qpc-doc-info">
                {config.paper.QuestionPaperPath ? (
                  <>
                    <span className="qpc-doc-name">
                      {config.paper.QuestionPaperPath.split('/').pop()}
                    </span>
                    <a
                      href={api.qpaper.fileUrl(config.paper.QuestionPaperPath)}
                      target="_blank" rel="noreferrer"
                      className="btn btn-sm btn-secondary"
                    >
                      <Eye size={12} /> View
                    </a>
                  </>
                ) : (
                  <span className="qpc-doc-empty">No document uploaded yet</span>
                )}
              </div>

              <div className="qpc-doc-actions">
                <label className={`btn btn-secondary btn-sm ${(uploading || extracting) ? 'disabled' : ''}`}>
                  {uploading
                    ? <><Loader2 size={13} className="spin" /> Uploading…</>
                    : extracting
                    ? <><Loader2 size={13} className="spin" /> Extracting…</>
                    : <><Upload size={13} /> Upload PDF</>}
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png,.webp"
                    onChange={handleUpload}
                    style={{ display: 'none' }}
                    disabled={uploading || extracting}
                  />
                </label>

                {config.paper.QuestionPaperPath && (
                  <button
                    className={`btn btn-primary btn-sm ${extracting ? 'disabled' : ''}`}
                    onClick={handleExtract}
                    disabled={extracting}
                    title="Parse the uploaded PDF and auto-detect sections, marks and question counts"
                  >
                    {extracting
                      ? <><Loader2 size={13} className="spin" /> Extracting…</>
                      : <><Sparkles size={13} /> Extract Structure</>}
                  </button>
                )}
              </div>
            </div>

            {config.paper.QuestionPaperPath && (
              <div className="qpc-extract-hint">
                <Info size={12} />
                Click <strong>Extract Structure</strong> to automatically detect sections, attempt
                rules and marks from the PDF. You can review and edit before saving.
              </div>
            )}
          </div>

          {/* Max Marks + Sets editor */}
          <div className="qpc-card">
            <div className="qpc-card-header">
              <BookOpen size={16} />
              <span>Question Sets — {paperName}</span>
            </div>
            <div className="qpc-card-body">
              {/* Max Marks row */}
              <div className="qpc-maxmarks-row">
                <label className="field-label">Paper Max Marks</label>
                <input
                  type="number"
                  className="field-input qpc-maxmarks-input"
                  value={maxMarks}
                  min={0}
                  step={0.5}
                  onChange={e => setMaxMarks(e.target.value)}
                  placeholder="e.g. 70"
                />
                <span className="qpc-maxmarks-hint">
                  <Info size={12} /> Total of all sets must equal this value
                </span>
              </div>

              {/* Sets table */}
              <div className="qpc-table-wrap">
                <table className="qpc-table">
                  <thead>
                    <tr>
                      <th>Label</th>
                      <th>Type</th>
                      <th title="Total questions available">M (Total)</th>
                      <th title="Questions to attempt/count">N (Attempt)</th>
                      <th>Marks/Q</th>
                      <th>Set Max</th>
                      <th>Range (optional)</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {sets.map((set, idx) => {
                      const setMax = computeSetMax(set);
                      return (
                        <tr key={set._id}>
                          <td>
                            <input
                              className="qpc-cell-input"
                              value={set.setLabel}
                              onChange={e => updateSet(set._id, 'setLabel', e.target.value)}
                              placeholder="Set 1"
                            />
                          </td>
                          <td>
                            <select
                              className="qpc-cell-input"
                              value={set.setType}
                              onChange={e => updateSet(set._id, 'setType', e.target.value)}
                            >
                              {SET_TYPES.map(t => (
                                <option key={t.value} value={t.value}>{t.label}</option>
                              ))}
                            </select>
                          </td>
                          <td>
                            <input
                              type="number" min={1}
                              className="qpc-cell-input qpc-cell-num"
                              value={set.totalQuestions}
                              onChange={e => updateSet(set._id, 'totalQuestions', e.target.value)}
                            />
                          </td>
                          <td>
                            <input
                              type="number" min={1}
                              className="qpc-cell-input qpc-cell-num"
                              value={set.setType === 'Common' ? set.attemptQuestions : set.totalQuestions}
                              disabled={set.setType !== 'Common'}
                              onChange={e => updateSet(set._id, 'attemptQuestions', e.target.value)}
                            />
                          </td>
                          <td>
                            <input
                              type="number" min={0} step={0.5}
                              className="qpc-cell-input qpc-cell-num"
                              value={set.marksPerQuestion}
                              onChange={e => updateSet(set._id, 'marksPerQuestion', e.target.value)}
                            />
                          </td>
                          <td>
                            <span className={`qpc-setmax ${setMax > 0 ? 'has-value' : ''}`}>
                              {setMax > 0 ? setMax.toFixed(1) : '—'}
                            </span>
                          </td>
                          <td>
                            <div className="qpc-range-cell">
                              <input
                                className="qpc-cell-input qpc-range-input"
                                value={set.questionRangeFrom}
                                onChange={e => updateSet(set._id, 'questionRangeFrom', e.target.value)}
                                placeholder="Q1"
                              />
                              <span>–</span>
                              <input
                                className="qpc-cell-input qpc-range-input"
                                value={set.questionRangeTo}
                                onChange={e => updateSet(set._id, 'questionRangeTo', e.target.value)}
                                placeholder="Q5"
                              />
                            </div>
                          </td>
                          <td>
                            <div className="qpc-row-actions">
                              <button
                                className="qpc-icon-btn"
                                onClick={() => moveSet(set._id, -1)}
                                disabled={idx === 0}
                                title="Move up"
                              >↑</button>
                              <button
                                className="qpc-icon-btn"
                                onClick={() => moveSet(set._id, 1)}
                                disabled={idx === sets.length - 1}
                                title="Move down"
                              >↓</button>
                              <button
                                className="qpc-icon-btn danger"
                                onClick={() => removeSet(set._id)}
                                title="Remove set"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Add row + totals footer */}
              <div className="qpc-table-footer">
                <button className="btn btn-secondary btn-sm" onClick={addSet}>
                  <Plus size={13} /> Add Set
                </button>

                <div className={`qpc-total-badge ${isValid ? 'valid' : calculatedTotal === 0 ? '' : 'invalid'}`}>
                  <span>Total:</span>
                  <strong>{calculatedTotal.toFixed(1)}</strong>
                  <span>/ {maxMarksNum > 0 ? maxMarksNum.toFixed(1) : '?'}</span>
                  {isValid && <CheckCircle2 size={14} />}
                  {!isValid && calculatedTotal > 0 && maxMarksNum > 0 && <AlertTriangle size={14} />}
                </div>
              </div>

              {/* Type legend */}
              <div className="qpc-legend">
                <span><strong>Common:</strong> Best N of M questions count</span>
                <span><strong>Mandatory:</strong> All specified questions required</span>
                <span><strong>Answer All:</strong> Every question must be attempted</span>
              </div>
            </div>
          </div>

          {/* Preview: generated questions */}
          {sets.length > 0 && (
            <div className="qpc-card qpc-preview">
              <div className="qpc-card-header">
                <Info size={16} />
                <span>Auto-generated Questions Preview</span>
              </div>
              <div className="qpc-card-body qpc-preview-body">
                {(() => {
                  let offset = 0;
                  return sets.map(set => {
                    const items = [];
                    for (let j = 0; j < parseInt(set.totalQuestions || 0); j++) {
                      items.push(`Q${String(offset + j + 1).padStart(2, '0')}`);
                    }
                    offset += parseInt(set.totalQuestions || 0);
                    const setMax = computeSetMax(set);
                    return (
                      <div key={set._id} className="qpc-preview-set">
                        <div className="qpc-preview-set-header">
                          <span className="qpc-preview-label">{set.setLabel}</span>
                          <span className={`qpc-type-badge qpc-type-${set.setType.toLowerCase()}`}>
                            {set.setType === 'Common'
                              ? `Best ${set.attemptQuestions} of ${set.totalQuestions}`
                              : set.setType}
                          </span>
                          <span className="qpc-preview-max">{setMax > 0 ? `${setMax.toFixed(1)} marks` : ''}</span>
                        </div>
                        <div className="qpc-preview-questions">
                          {items.map(q => (
                            <span key={q} className="qpc-q-chip">{q} / {set.marksPerQuestion}</span>
                          ))}
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>
          )}

          {/* Save button */}
          <div className="qpc-save-row">
            <button
              className="btn btn-primary qpc-save-btn"
              onClick={handleSave}
              disabled={saving || !isValid}
            >
              {saving
                ? <><Loader2 size={15} className="spin" /> Saving…</>
                : <><Save size={15} /> Save Configuration</>}
            </button>
            {!isValid && sets.length > 0 && maxMarksNum > 0 && (
              <span className="qpc-save-hint">
                <AlertTriangle size={13} />
                Adjust sets so total ({calculatedTotal.toFixed(1)}) equals max marks ({maxMarksNum.toFixed(1)})
              </span>
            )}
          </div>
        </>
      )}

      {!paperId && !loading && (
        <div className="qpc-empty">
          <BookOpen size={40} />
          <p>Select an exam and paper to configure question sets</p>
        </div>
      )}
    </div>
  );
}
