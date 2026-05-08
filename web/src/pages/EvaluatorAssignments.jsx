import { useEffect, useState } from 'react';
import { FileText, Loader2, Search } from 'lucide-react';
import { api } from '../services/api';
import { useNavigate } from 'react-router-dom';
import './AdminSettings.css';

export default function EvaluatorAssignments() {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [exams, setExams] = useState([]);
  const [papers, setPapers] = useState([]);
  const [evaluators, setEvaluators] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({
    evaluatorId: '',
    examId: '',
    paperId: '',
    status: '',
  });

  const loadRows = async () => {
    setLoading(true);
    try {
      const d = await api.headeval.getEvaluatorAssignments({ ...filters, limit: 500 });
      setRows(Array.isArray(d) ? d : []);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    Promise.all([api.headeval.getExams(), api.headeval.getEvaluators({})])
      .then(([ex, ev]) => {
        setExams(Array.isArray(ex) ? ex : []);
        setEvaluators(Array.isArray(ev) ? ev : []);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!filters.examId) {
      setPapers([]);
      return;
    }
    api.headeval.getPapers(filters.examId).then((p) => setPapers(Array.isArray(p) ? p : [])).catch(() => setPapers([]));
  }, [filters.examId]);

  return (
    <div className="admin-page page-enter">
      <div className="admin-page-header">
        <div className="admin-page-icon"><FileText size={24} /></div>
        <div>
          <h1 className="admin-page-title">Evaluator Assignments</h1>
          <p className="admin-page-subtitle">Evaluator-wise assigned booklets with status and marks.</p>
        </div>
      </div>

      <div className="settings-section">
        <div className="settings-section-header">
          <FileText size={15} className="settings-section-icon" />
          <h3>Filters</h3>
        </div>
        <div className="settings-form-body">
          <div className="settings-grid">
            <div className="field-group">
              <label className="field-label">Evaluator</label>
              <select className="field-input" value={filters.evaluatorId} onChange={(e) => setFilters((f) => ({ ...f, evaluatorId: e.target.value }))}>
                <option value="">— All —</option>
                {evaluators.map((ev) => <option key={ev.UserID} value={ev.UserID}>{ev.FullName}</option>)}
              </select>
            </div>
            <div className="field-group">
              <label className="field-label">Exam</label>
              <select className="field-input" value={filters.examId} onChange={(e) => setFilters((f) => ({ ...f, examId: e.target.value, paperId: '' }))}>
                <option value="">— All —</option>
                {exams.map((ex) => <option key={ex.ExamID} value={ex.ExamID}>{ex.ExamName} ({ex.ExamYear})</option>)}
              </select>
            </div>
            <div className="field-group">
              <label className="field-label">Paper</label>
              <select className="field-input" value={filters.paperId} onChange={(e) => setFilters((f) => ({ ...f, paperId: e.target.value }))}>
                <option value="">— All —</option>
                {papers.map((p) => <option key={p.PaperID} value={p.PaperID}>{p.PaperCode} — {p.PaperName}</option>)}
              </select>
            </div>
            <div className="field-group">
              <label className="field-label">Status</label>
              <select className="field-input" value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}>
                <option value="">— All —</option>
                <option value="Allocated">Allocated</option>
                <option value="InProgress">InProgress</option>
                <option value="Evaluated">Evaluated</option>
              </select>
            </div>
          </div>
          <div className="settings-actions">
            <button className="btn btn-primary" onClick={loadRows}><Search size={13} /> Load</button>
          </div>
        </div>
      </div>

      <div className="user-table-wrap">
        <div className="user-table-header">
          <h3><FileText size={15} /> Results <span className="selected-count">{rows.length}</span></h3>
        </div>
        {loading ? (
          <div className="loading"><Loader2 size={20} className="spin" /> Loading…</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="admin-data-table">
              <thead>
                <tr>
                  <th>Evaluator</th><th>Booklet</th><th>Status</th><th>Marks</th><th>Paper</th><th>Allocated</th><th>Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={`${r.AllocationID}-${i}`}>
                    <td>{r.EvaluatorName}</td>
                    <td>{r.BookletID}</td>
                    <td>{r.EvaluationStatus}</td>
                    <td>{r.TotalMarks ?? '—'}</td>
                    <td>{r.PaperCode} — {r.PaperName}</td>
                    <td>{r.AllocatedAt ? new Date(r.AllocatedAt).toLocaleString() : '—'}</td>
                    <td>
                      {r.EvaluationID ? (
                        <button
                          type="button"
                          className="btn btn-secondary"
                          onClick={() => navigate(`/admin/evaluation-review/${r.EvaluationID}`)}
                        >
                          View Read-only
                        </button>
                      ) : '—'}
                    </td>
                  </tr>
                ))}
                {!rows.length && (
                  <tr><td colSpan={7} className="empty-row">No assignment rows</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
