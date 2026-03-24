import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  ClipboardList, BookOpen, Users, CheckSquare, Square, RefreshCw,
  CheckCircle2, AlertCircle, UserCheck, BookMarked, BarChart3, Loader2, Eye
} from 'lucide-react';
import { api } from '../services/api';
import './HeadEvalAssign.css';

export default function HeadEvalAssign() {
  const [exams, setExams]                   = useState([]);
  const [papers, setPapers]                 = useState([]);
  const [selectedExam, setSelectedExam]     = useState('');
  const [selectedPaper, setSelectedPaper]   = useState('');
  const [lot, setLot]                       = useState([]);
  const [evaluators, setEvaluators]         = useState([]);
  const [selectedBooklets, setSelectedBooklets] = useState(new Set());
  const [selectedEvaluator, setSelectedEvaluator] = useState('');
  const [allocationType, setAllocationType] = useState('Primary');
  const [loading, setLoading]               = useState(false);
  const [assigning, setAssigning]           = useState(false);
  const [syncing, setSyncing]               = useState(false);
  const [message, setMessage]               = useState('');
  const [summary, setSummary]               = useState([]);

  useEffect(() => { api.headeval.getExams().then(setExams).catch(() => {}); }, []);

  const onExamChange = async (examId) => {
    setSelectedExam(examId); setSelectedPaper(''); setLot([]); setPapers([]);
    if (!examId) return;
    const ps = await api.headeval.getPapers(examId).catch(() => []);
    setPapers(ps);
  };

  const loadLot = async () => {
    if (!selectedPaper) return;
    setLoading(true); setSelectedBooklets(new Set());
    try {
      const [lotData, evals, sumData] = await Promise.all([
        api.headeval.getLot({ paperId: selectedPaper }),
        api.headeval.getEvaluators({ paperId: selectedPaper }),
        api.headeval.getSummary(selectedPaper),
      ]);
      setLot(lotData.booklets || []);
      setEvaluators(evals || []);
      setSummary(sumData || []);
    } catch (err) { alert('Failed to load lot: ' + err.message); }
    finally { setLoading(false); }
  };

  const toggleBooklet = (id) => {
    setSelectedBooklets(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };
  const selectAll = () => setSelectedBooklets(new Set(lot.map(b => b.BookletID)));
  const clearAll  = () => setSelectedBooklets(new Set());

  const handleAssign = async () => {
    if (!selectedEvaluator) { alert('Select an evaluator first'); return; }
    if (selectedBooklets.size === 0) { alert('Select at least one booklet'); return; }
    if (!window.confirm(`Assign ${selectedBooklets.size} booklet(s) to selected evaluator?`)) return;
    setAssigning(true); setMessage('');
    try {
      const results = await api.headeval.assign(Array.from(selectedBooklets), parseInt(selectedEvaluator), allocationType);
      const assigned = results.filter(r => r.status === 'assigned').length;
      const already  = results.filter(r => r.status === 'already_allocated').length;
      setMessage(`Assigned: ${assigned}${already ? `, Already allocated: ${already}` : ''}`);
      setSelectedBooklets(new Set());
      await loadLot();
    } catch (err) { alert('Assignment failed: ' + err.message); }
    finally { setAssigning(false); }
  };

  return (
    <div className="head-eval-page">
      {/* Toolbar */}
      <div className="head-eval-toolbar">
        <div className="toolbar-top">
          <div className="toolbar-icon-wrap"><ClipboardList size={20} /></div>
          <div>
            <h2 className="toolbar-title">Assign Answer Booklets</h2>
            <p className="toolbar-subtitle">Select a paper, load the unassigned lot, and allocate to evaluators</p>
          </div>
        </div>

        <div className="filter-row">
          <div className="filter-field">
            <span className="filter-label">Exam</span>
            <select className="filter-select" value={selectedExam} onChange={e => onExamChange(e.target.value)}>
              <option value="">— Select Exam —</option>
              {exams.map(ex => <option key={ex.ExamID} value={ex.ExamID}>{ex.ExamName} ({ex.ExamYear})</option>)}
            </select>
          </div>
          <div className="filter-field">
            <span className="filter-label">Paper</span>
            <select className="filter-select" value={selectedPaper}
              onChange={e => setSelectedPaper(e.target.value)} disabled={!selectedExam}>
              <option value="">— Select Paper —</option>
              {papers.map(p => <option key={p.PaperID} value={p.PaperID}>{p.PaperCode} — {p.PaperName}</option>)}
            </select>
          </div>
          <div className="filter-field">
            <span className="filter-label">Allocation Type</span>
            <select className="filter-select" value={allocationType} onChange={e => setAllocationType(e.target.value)}>
              <option value="Primary">Primary</option>
              <option value="Secondary">Secondary</option>
              <option value="Moderation">Moderation</option>
            </select>
          </div>
          <button className="btn btn-primary" onClick={loadLot} disabled={!selectedPaper || loading}
            style={{ alignSelf: 'flex-end' }}>
            {loading ? <><Loader2 size={13} className="spin" /> Loading…</> : <><RefreshCw size={13} /> Load Lot</>}
          </button>
          <button className="btn btn-ghost" onClick={async () => {
            setSyncing(true); setMessage('');
            try {
              const d = await api.scanadmin.syncScanToEval() ?? {};
              setMessage(`Synced ${d.synced ?? 0} of ${d.total ?? 0} booklets to evaluation. ${(d.failed ?? 0)} failed (check Exam/Paper/Location exist in evaluation DB).`);
              if (selectedPaper) await loadLot();
            } catch (e) { setMessage('Sync failed: ' + (e.message || 'Unknown error')); }
            finally { setSyncing(false); }
          }} disabled={syncing} style={{ alignSelf: 'flex-end' }} title="Copy all scanned booklets from scanning DB into evaluation so they appear here">
            {syncing ? <><Loader2 size={13} className="spin" /> Syncing…</> : <>Sync scan uploads</>}
          </button>
        </div>

        {message && (
          <div className="assign-message">
            <CheckCircle2 size={14} /> {message}
          </div>
        )}
      </div>

      <div className="head-eval-body">
        {/* Left: booklet lot */}
        <div className="lot-panel">
          <div className="panel-header">
            <div className="panel-header-left">
              <BookOpen size={14} className="panel-header-icon" />
              <span className="panel-title">Unassigned Booklets</span>
              <span className="selected-count">{lot.length} total</span>
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <button className="btn btn-ghost btn-xs" onClick={selectAll}>
                <CheckSquare size={12} /> All
              </button>
              <button className="btn btn-ghost btn-xs" onClick={clearAll}>
                <Square size={12} /> None
              </button>
              {selectedBooklets.size > 0 && (
                <span className="selected-count">{selectedBooklets.size} selected</span>
              )}
            </div>
          </div>
          <div className="lot-list">
            {lot.length === 0 ? (
              <div className="empty-state">
                <BookMarked size={36} className="empty-state-icon" />
                {loading ? 'Loading booklets…' : 'Load a paper to see unassigned booklets'}
              </div>
            ) : (
              lot.map(b => (
                <div key={b.BookletID}
                  className={`lot-item ${selectedBooklets.has(b.BookletID) ? 'selected' : ''}`}
                  onClick={() => toggleBooklet(b.BookletID)}>
                  <input type="checkbox" checked={selectedBooklets.has(b.BookletID)}
                    onChange={() => toggleBooklet(b.BookletID)}
                    onClick={e => e.stopPropagation()} />
                  <div className="lot-info">
                    <span className="lot-id">{b.BookletID}</span>
                    <span className="lot-meta">{b.StudentName || '—'} · {b.ProgramLevel} {b.Branch} · {b.TotalPages}pg</span>
                  </div>
                  <Link to={`/view-booklet/${encodeURIComponent(b.BookletID)}`} className="lot-view-link" onClick={e => e.stopPropagation()} title="View answer sheet">
                    <Eye size={14} /> View
                  </Link>
                  <div className="lot-status-dot" />
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right: evaluators + assign + summary */}
        <div className="eval-panel">
          <div className="panel-header">
            <div className="panel-header-left">
              <Users size={14} className="panel-header-icon" />
              <span className="panel-title">Evaluators</span>
              <span className="selected-count">{evaluators.length}</span>
            </div>
          </div>
          <div className="eval-list">
            {evaluators.length === 0 ? (
              <div className="empty-state">
                <UserCheck size={36} className="empty-state-icon" />
                No active evaluators found
              </div>
            ) : (
              evaluators.map(ev => (
                <div key={ev.UserID}
                  className={`eval-item ${selectedEvaluator == ev.UserID ? 'selected' : ''}`}
                  onClick={() => setSelectedEvaluator(ev.UserID)}>
                  <div className="eval-item-header">
                    <div className="eval-avatar">{ev.FullName?.[0] || 'E'}</div>
                    <span className="eval-name">{ev.FullName}</span>
                    <input type="radio" className="eval-radio"
                      checked={selectedEvaluator == ev.UserID} onChange={() => setSelectedEvaluator(ev.UserID)} />
                  </div>
                  <div className="eval-stats">
                    <span className="badge badge-blue">{ev.currentLoad} assigned</span>
                    <span className="badge badge-green">{ev.completedToday} done today</span>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="assign-action">
            <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', padding: '11px' }}
              onClick={handleAssign}
              disabled={assigning || selectedBooklets.size === 0 || !selectedEvaluator}>
              {assigning
                ? <><Loader2 size={14} className="spin" /> Assigning…</>
                : <><ClipboardList size={14} /> Assign {selectedBooklets.size} Booklet{selectedBooklets.size !== 1 ? 's' : ''}</>}
            </button>
          </div>

          {summary.length > 0 && (
            <div className="assign-summary-section">
              <div className="summary-section-title">
                <BarChart3 size={13} /> Assignment Summary
              </div>
              <table>
                <thead>
                  <tr><th>Evaluator</th><th>Assigned</th><th>Done</th><th>Pending</th></tr>
                </thead>
                <tbody>
                  {summary.map(s => (
                    <tr key={s.UserID}>
                      <td>{s.FullName}</td>
                      <td><strong>{s.total}</strong></td>
                      <td className="text-success"><strong>{s.completed}</strong></td>
                      <td className="text-danger"><strong>{s.pending}</strong></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
