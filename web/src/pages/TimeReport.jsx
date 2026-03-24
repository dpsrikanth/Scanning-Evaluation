import { useState, useEffect } from 'react';
import { Clock, AlertTriangle, RefreshCw, BarChart3, BookOpen, Users, Loader2, Filter } from 'lucide-react';
import { api } from '../services/api';
import './TimeReport.css';

function formatSeconds(s) {
  if (s == null) return '—';
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
}

export default function TimeReport() {
  const [tab, setTab]             = useState('evaluators'); // evaluators | subjects
  const [data, setData]           = useState(null);         // { evaluators, subjects, threshold }
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');
  const [exams, setExams]         = useState([]);
  const [papers, setPapers]       = useState([]);
  const [filter, setFilter]       = useState({ examId: '', paperId: '', dateFrom: '', dateTo: '' });

  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const isAdmin = user.roleName === 'Admin' || user.roleName === 'HeadEvaluator';

  useEffect(() => {
    api.headeval.getExams().then(setExams).catch(() => {});
    loadReport();
  }, []);

  useEffect(() => {
    if (!filter.examId) { setPapers([]); return; }
    api.headeval.getPapers(filter.examId).then(setPapers).catch(() => {});
  }, [filter.examId]);

  const loadReport = async (f = filter) => {
    setLoading(true); setError('');
    try {
      const params = {};
      if (f.examId)   params.examId   = f.examId;
      if (f.paperId)  params.paperId  = f.paperId;
      if (f.dateFrom) params.dateFrom = f.dateFrom;
      if (f.dateTo)   params.dateTo   = f.dateTo;
      setData(await api.eval.timeReport(params));
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };

  const setF = (k) => (e) => setFilter(f => ({ ...f, [k]: e.target.value }));

  const threshold = data?.threshold || 300;

  return (
    <div className="tr-page">
      <div className="tr-header">
        <div className="tr-header-icon"><Clock size={22} /></div>
        <div>
          <h1 className="tr-title">Time Analytics Report</h1>
          <p className="tr-subtitle">
            Evaluator time spent per answer sheet. Red-flag threshold: {formatSeconds(threshold)}/sheet.
          </p>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={() => loadReport()} disabled={loading}>
          <RefreshCw size={13} className={loading ? 'spin' : ''} /> Refresh
        </button>
      </div>

      {/* Filter bar */}
      <div className="tr-filters">
        <Filter size={13} style={{ color: 'var(--color-text-muted)' }} />
        {isAdmin && (
          <>
            <select className="field-input" value={filter.examId} onChange={setF('examId')}>
              <option value="">All Exams</option>
              {exams.map(e => <option key={e.ExamID} value={e.ExamID}>{e.ExamName}</option>)}
            </select>
            <select className="field-input" value={filter.paperId} onChange={setF('paperId')}
              disabled={!filter.examId}>
              <option value="">All Papers</option>
              {papers.map(p => <option key={p.PaperID} value={p.PaperID}>{p.PaperCode} — {p.PaperName}</option>)}
            </select>
          </>
        )}
        <input type="date" className="field-input" value={filter.dateFrom} onChange={setF('dateFrom')} />
        <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>to</span>
        <input type="date" className="field-input" value={filter.dateTo} onChange={setF('dateTo')} />
        <button className="btn btn-primary btn-sm" onClick={() => loadReport(filter)}>Apply</button>
      </div>

      {/* Tab switch */}
      {isAdmin && (
        <div className="tr-tabs">
          <button className={`tr-tab ${tab === 'evaluators' ? 'active' : ''}`} onClick={() => setTab('evaluators')}>
            <Users size={14} /> By Evaluator
          </button>
          <button className={`tr-tab ${tab === 'subjects' ? 'active' : ''}`} onClick={() => setTab('subjects')}>
            <BookOpen size={14} /> By Subject
          </button>
        </div>
      )}

      {error && (
        <div className="tr-error"><AlertTriangle size={14} /> {error}</div>
      )}

      {loading ? (
        <div className="tr-loading"><Loader2 size={28} className="spin" /> Loading report…</div>
      ) : (
        <>
          {/* Evaluator table */}
          {(tab === 'evaluators') && (
            <div className="tr-table-wrap">
              {!isAdmin && (
                <div className="tr-own-banner">
                  <BarChart3 size={14} /> Showing your personal time analytics
                </div>
              )}
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Evaluator</th>
                    <th>Exam</th>
                    <th>Paper</th>
                    <th>Sheets</th>
                    <th>Avg Time/Sheet</th>
                    <th>Min</th>
                    <th>Max</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.evaluators || []).map((row, i) => (
                    <tr key={i} className={row.isFlagged ? 'tr-flagged' : ''}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{row.FullName}</div>
                        <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{row.Username}</div>
                      </td>
                      <td>{row.ExamName}</td>
                      <td>
                        <div style={{ fontWeight: 500 }}>{row.PaperCode}</div>
                        <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{row.PaperName}</div>
                      </td>
                      <td className="tr-num">{row.sheetsEvaluated}</td>
                      <td className={`tr-num ${row.isFlagged ? 'tr-num-red' : 'tr-num-green'}`}>
                        {formatSeconds(row.avgSecondsPerSheet)}
                      </td>
                      <td className="tr-num tr-muted">{formatSeconds(row.minSeconds)}</td>
                      <td className="tr-num tr-muted">{formatSeconds(row.maxSeconds)}</td>
                      <td>
                        {row.isFlagged ? (
                          <span className="badge badge-red"><AlertTriangle size={10} /> Below Threshold</span>
                        ) : (
                          <span className="badge badge-green">OK</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {!(data?.evaluators?.length) && (
                    <tr><td colSpan={8} className="tr-empty">No evaluation data found for this filter.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* Subject table */}
          {tab === 'subjects' && isAdmin && (
            <div className="tr-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Paper</th>
                    <th>Exam</th>
                    <th>Sheets Evaluated</th>
                    <th>Evaluators</th>
                    <th>Avg Time/Sheet</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.subjects || []).map((row, i) => {
                    const flagged = row.avgSecondsPerSheet < threshold;
                    return (
                      <tr key={i} className={flagged ? 'tr-flagged' : ''}>
                        <td>
                          <div style={{ fontWeight: 600 }}>{row.PaperCode}</div>
                          <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{row.PaperName}</div>
                        </td>
                        <td>{row.ExamName}</td>
                        <td className="tr-num">{row.sheetsEvaluated}</td>
                        <td className="tr-num">{row.evaluatorCount}</td>
                        <td className={`tr-num ${flagged ? 'tr-num-red' : 'tr-num-green'}`}>
                          {formatSeconds(row.avgSecondsPerSheet)}
                        </td>
                        <td>
                          {flagged
                            ? <span className="badge badge-red"><AlertTriangle size={10} /> Low</span>
                            : <span className="badge badge-green">Normal</span>}
                        </td>
                      </tr>
                    );
                  })}
                  {!(data?.subjects?.length) && (
                    <tr><td colSpan={6} className="tr-empty">No subject data found.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* Red-flag summary */}
          {data?.evaluators?.some(r => r.isFlagged) && tab === 'evaluators' && (
            <div className="tr-flag-summary">
              <AlertTriangle size={16} />
              <strong>{data.evaluators.filter(r => r.isFlagged).length} evaluator(s)</strong> are regularly
              below the {formatSeconds(threshold)} threshold. Review their sessions.
            </div>
          )}
        </>
      )}
    </div>
  );
}
