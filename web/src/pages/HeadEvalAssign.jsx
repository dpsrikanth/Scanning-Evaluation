import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  ClipboardList, BookOpen, Users, CheckSquare, Square, RefreshCw,
  CheckCircle2, UserCheck, BookMarked, BarChart3, Loader2, Eye, ArrowUpDown, ArrowUp, ArrowDown,
} from 'lucide-react';
import { api } from '../services/api';
import './HeadEvalAssign.css';

function formatUploadedAt(value) {
  if (value == null || value === '') return '—';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
}

function compareLotRows(a, b, key, dir) {
  const sign = dir === 'asc' ? 1 : -1;
  const str = (x) => String(x ?? '').toLowerCase();
  const num = (x) => {
    const n = Number(x);
    return Number.isFinite(n) ? n : 0;
  };
  const time = (x) => {
    const v = x?.CreatedAt;
    if (v == null || v === '') return 0;
    const t = new Date(v).getTime();
    return Number.isNaN(t) ? 0 : t;
  };
  let cmp = 0;
  switch (key) {
    case 'bookletId':
      cmp = str(a.BookletID).localeCompare(str(b.BookletID), undefined, { numeric: true });
      break;
    case 'studentName':
      cmp = str(a.StudentName).localeCompare(str(b.StudentName));
      break;
    case 'detail':
      cmp = str(`${a.ProgramLevel} ${a.Branch}`).localeCompare(str(`${b.ProgramLevel} ${b.Branch}`));
      break;
    case 'totalPages':
      cmp = num(a.TotalPages) - num(b.TotalPages);
      break;
    case 'createdAt':
      cmp = time(a) - time(b);
      break;
    default:
      cmp = 0;
  }
  if (cmp !== 0) return cmp * sign;
  return str(a.BookletID).localeCompare(str(b.BookletID), undefined, { numeric: true }) * sign;
}

export default function HeadEvalAssign() {
  const [exams, setExams]                   = useState([]);
  const [papers, setPapers]                 = useState([]);
  const [selectedExam, setSelectedExam]     = useState('');
  const [selectedPaper, setSelectedPaper]   = useState('');
  const [lot, setLot]                       = useState([]);
  const [evaluators, setEvaluators]         = useState([]);
  const [selectedBooklets, setSelectedBooklets] = useState(new Set());
  const [selectedEvaluator, setSelectedEvaluator] = useState('');
  const [allocationMode, setAllocationMode] = useState('automatic');
  const [modeLoading, setModeLoading]       = useState(true);
  const [savingMode, setSavingMode]         = useState(false);
  const [autoAssigning, setAutoAssigning]   = useState(false);
  const [loading, setLoading]               = useState(false);
  const [assigning, setAssigning]           = useState(false);
  const [syncing, setSyncing]               = useState(false);
  const [message, setMessage]               = useState('');
  const [summary, setSummary]               = useState([]);
  const [lotSort, setLotSort]               = useState({ key: 'createdAt', dir: 'desc' });

  const sortedLot = useMemo(
    () => [...lot].sort((a, b) => compareLotRows(a, b, lotSort.key, lotSort.dir)),
    [lot, lotSort.key, lotSort.dir]
  );

  const cycleLotSort = (key) => {
    setLotSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: key === 'createdAt' ? 'desc' : 'asc' }
    );
  };

  const SortIcon = ({ columnKey }) => {
    if (lotSort.key !== columnKey) return <ArrowUpDown size={12} className="lot-sort-icon lot-sort-inactive" />;
    return lotSort.dir === 'asc'
      ? <ArrowUp size={12} className="lot-sort-icon" />
      : <ArrowDown size={12} className="lot-sort-icon" />;
  };

  useEffect(() => { api.headeval.getExams().then(setExams).catch(() => {}); }, []);

  useEffect(() => {
    api.headeval.getAllocationSettings()
      .then((d) => {
        if (d?.allocationMode === 'manual' || d?.allocationMode === 'automatic') {
          setAllocationMode(d.allocationMode);
        }
      })
      .catch(() => {})
      .finally(() => setModeLoading(false));
  }, []);

  const saveAllocationMode = async (mode) => {
    if (mode === allocationMode || savingMode) return;
    setSavingMode(true);
    setMessage('');
    try {
      const d = await api.headeval.setAllocationSettings(mode);
      setAllocationMode(d.allocationMode === 'manual' ? 'manual' : 'automatic');
      setMessage('Assignment mode saved.');
    } catch (e) {
      alert(e.message || 'Failed to save mode');
    } finally {
      setSavingMode(false);
    }
  };

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
      const results = await api.headeval.assign(Array.from(selectedBooklets), parseInt(selectedEvaluator), 'Primary');
      const assigned = results.filter(r => r.status === 'assigned').length;
      const already  = results.filter(r => r.status === 'already_allocated').length;
      const notOpen  = results.filter(r => r.status === 'not_open').length;
      const mismatch = results.filter(r => r.status === 'paper_mismatch').length;
      setMessage(
        `Assigned: ${assigned}${already ? `, Already allocated: ${already}` : ''}${
          notOpen ? `, Not open: ${notOpen}` : ''
        }${mismatch ? `, Wrong paper scope: ${mismatch}` : ''}`
      );
      setSelectedBooklets(new Set());
      await loadLot();
    } catch (err) { alert('Assignment failed: ' + err.message); }
    finally { setAssigning(false); }
  };

  const handleAutoAssignPaper = async () => {
    if (!selectedPaper) {
      alert('Select a paper and load the lot first.');
      return;
    }
    setAutoAssigning(true);
    setMessage('');
    try {
      const d = await api.headeval.autoAssign(selectedPaper, 200);
      const r = d?.results || [];
      const ok = r.filter((x) => x.status === 'assigned').length;
      const skip = r.filter((x) => x.status === 'skipped' || x.status === 'already_allocated').length;
      const noEv = r.filter((x) => x.status === 'no_evaluator').length;
      const mismatch = r.filter((x) => x.status === 'paper_mismatch').length;
      setMessage(
        `Auto-assign: ${ok} booklets assigned${skip ? ` (${skip} skipped)` : ''}${
          noEv ? `, ${noEv} with no eligible evaluator` : ''
        }${mismatch ? `, ${mismatch} paper scope` : ''}.`
      );
      await loadLot();
    } catch (e) {
      alert(e.message || 'Auto-assign failed');
    } finally {
      setAutoAssigning(false);
    }
  };


  return (
    <div className="head-eval-page">
      {/* Toolbar */}
      <div className="head-eval-toolbar">
        <div className="toolbar-top">
          <div className="toolbar-icon-wrap"><ClipboardList size={20} /></div>
          <div>
            <h2 className="toolbar-title">Assign Answer Booklets</h2>
            <p className="toolbar-subtitle">
              Default is automatic assignment; use manual to assign by hand. Primary evaluation only.
              Booklets are only assigned when the evaluator has this paper in their scope; evaluators with no paper
              mapping cannot receive assignments.
            </p>
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
          <div className="filter-field filter-field-mode">
            <span className="filter-label">Assignment mode</span>
            <div className="mode-toggle" role="group" aria-label="Assignment mode">
              <button
                type="button"
                className={`mode-btn ${allocationMode === 'automatic' ? 'mode-btn-active' : ''}`}
                onClick={() => saveAllocationMode('automatic')}
                disabled={modeLoading || savingMode}
              >
                Automatic
              </button>
              <button
                type="button"
                className={`mode-btn ${allocationMode === 'manual' ? 'mode-btn-active' : ''}`}
                onClick={() => saveAllocationMode('manual')}
                disabled={modeLoading || savingMode}
              >
                Manual
              </button>
            </div>
          </div>
          {allocationMode === 'automatic' && (
            <button
              className="btn btn-secondary"
              onClick={handleAutoAssignPaper}
              disabled={!selectedPaper || autoAssigning}
              style={{ alignSelf: 'flex-end' }}
              title="Assign all open booklets in this paper to evaluators (load-balanced)"
            >
              {autoAssigning ? <><Loader2 size={13} className="spin" /> Auto-assigning…</> : <>Run auto-assign</>}
            </button>
          )}
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
          <div className="lot-list lot-list-table-wrap">
            {lot.length === 0 ? (
              <div className="empty-state">
                <BookMarked size={36} className="empty-state-icon" />
                {loading ? 'Loading booklets…' : 'Load a paper to see unassigned booklets'}
              </div>
            ) : (
              <table className="lot-table">
                <thead>
                  <tr>
                    <th className="lot-th lot-th-check" aria-label="Select" />
                    <th className="lot-th lot-th-sortable">
                      <button type="button" className="lot-th-btn" onClick={() => cycleLotSort('bookletId')}>
                        Booklet <SortIcon columnKey="bookletId" />
                      </button>
                    </th>
                    <th className="lot-th lot-th-sortable">
                      <button type="button" className="lot-th-btn" onClick={() => cycleLotSort('studentName')}>
                        Student <SortIcon columnKey="studentName" />
                      </button>
                    </th>
                    <th className="lot-th lot-th-sortable">
                      <button type="button" className="lot-th-btn" onClick={() => cycleLotSort('detail')}>
                        Program / Branch <SortIcon columnKey="detail" />
                      </button>
                    </th>
                    <th className="lot-th lot-th-sortable lot-th-narrow">
                      <button type="button" className="lot-th-btn" onClick={() => cycleLotSort('totalPages')}>
                        Pages <SortIcon columnKey="totalPages" />
                      </button>
                    </th>
                    <th
                      className="lot-th lot-th-sortable lot-th-uploaded"
                      title="When this booklet was first added to evaluation (sync from scan upload)"
                    >
                      <button type="button" className="lot-th-btn" onClick={() => cycleLotSort('createdAt')}>
                        Uploaded <SortIcon columnKey="createdAt" />
                      </button>
                    </th>
                    <th className="lot-th lot-th-view" aria-label="View" />
                  </tr>
                </thead>
                <tbody>
                  {sortedLot.map(b => (
                    <tr
                      key={b.BookletID}
                      className={`lot-row ${selectedBooklets.has(b.BookletID) ? 'selected' : ''}`}
                      onClick={() => toggleBooklet(b.BookletID)}
                    >
                      <td className="lot-td lot-td-check" onClick={e => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedBooklets.has(b.BookletID)}
                          onChange={() => toggleBooklet(b.BookletID)}
                        />
                      </td>
                      <td className="lot-td lot-td-mono">{b.BookletID}</td>
                      <td className="lot-td">{b.StudentName || '—'}</td>
                      <td className="lot-td lot-td-muted">{b.ProgramLevel || '—'} {b.Branch || ''}</td>
                      <td className="lot-td lot-td-n">{b.TotalPages ?? '—'}</td>
                      <td className="lot-td lot-td-date">{formatUploadedAt(b.CreatedAt)}</td>
                      <td className="lot-td lot-td-view">
                        <Link
                          to={`/view-booklet/${encodeURIComponent(b.BookletID)}`}
                          className="lot-view-link"
                          onClick={e => e.stopPropagation()}
                          title="View answer sheet"
                        >
                          <Eye size={14} /> View
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
