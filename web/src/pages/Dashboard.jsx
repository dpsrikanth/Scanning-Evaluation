import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  BookOpen, CheckCircle2, Clock, XCircle,
  ArrowRight, ChevronRight, RefreshCw,
  TrendingUp, AlertTriangle, FileCheck, Layers
} from 'lucide-react';
import { api } from '../services/api';
import './Dashboard.css';

const STATUS_CONFIG = {
  Allocated:  { label: 'Open',       class: 'badge-blue',  icon: Clock },
  InProgress: { label: 'In Progress',class: 'badge-amber', icon: RefreshCw },
  Evaluated:  { label: 'Evaluated',  class: 'badge-green', icon: CheckCircle2 },
  Rejected:   { label: 'Recheck',    class: 'badge-red',   icon: AlertTriangle },
};

function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || { label: status || 'Open', class: 'badge-gray', icon: Clock };
  const Icon = cfg.icon;
  return (
    <span className={`badge ${cfg.class}`}>
      <Icon size={10} />
      {cfg.label}
    </span>
  );
}

function SummaryCard({ label, value, icon: Icon, color, trend }) {
  return (
    <div className={`stat-card stat-card--${color}`}>
      <div className="stat-icon-wrap">
        <Icon size={22} />
      </div>
      <div className="stat-body">
        <span className="stat-value">{value ?? '—'}</span>
        <span className="stat-label">{label}</span>
      </div>
      {trend != null && (
        <div className="stat-trend">
          <TrendingUp size={12} />
          <span>{trend}</span>
        </div>
      )}
    </div>
  );
}

export default function Dashboard() {
  const [summary, setSummary] = useState(null);
  const [pending, setPending] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState('');
  const navigate = useNavigate();

  const today = new Date();
  const dateStr = today.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  useEffect(() => {
    Promise.all([
      api.eval.dashboardSummary(),
      api.eval.pendingBooklets(20, 0),
    ]).then(([s, p]) => {
      setSummary(s);
      setPending(p);
    }).catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const completionRate = summary
    ? Math.round(((summary.evaluated || 0) / Math.max(summary.totalAnswerSheets || 1, 1)) * 100)
    : 0;

  return (
    <div className="dashboard page-enter">
      {/* Page header */}
      <div className="dash-page-header">
        <div>
          <h1 className="dash-title">Dashboard</h1>
          <p className="dash-date">{dateStr}</p>
        </div>
        <div className="dash-header-actions">
          <button className="btn btn-secondary btn-sm" onClick={() => window.location.reload()}>
            <RefreshCw size={13} /> Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="dash-alert">
          <AlertTriangle size={15} /> {error}
        </div>
      )}

      {/* Stats */}
      <div className="stat-grid">
        <SummaryCard label="Total Answer Sheets" value={summary?.totalAnswerSheets} icon={BookOpen}    color="blue"  />
        <SummaryCard label="Evaluated"            value={summary?.evaluated}        icon={CheckCircle2} color="green" trend="Today" />
        <SummaryCard label="Pending"              value={summary?.pending}          icon={Clock}        color="amber" />
        <SummaryCard label="Rejected / Recheck"   value={summary?.rejected}         icon={XCircle}      color="red"   />
      </div>

      {/* Progress bar */}
      {summary && (
        <div className="progress-card card">
          <div className="progress-header">
            <div className="progress-label-row">
              <Layers size={15} className="progress-icon" />
              <span>Completion Progress</span>
              <span className="progress-percent">{completionRate}%</span>
            </div>
            <div className="progress-bar-track">
              <div className="progress-bar-fill" style={{ width: `${completionRate}%` }} />
            </div>
          </div>
          <div className="progress-stats">
            <span><strong>{summary.evaluated || 0}</strong> done</span>
            <span><strong>{summary.pending || 0}</strong> pending</span>
            <span><strong>{summary.rejected || 0}</strong> recheck</span>
          </div>
        </div>
      )}

      <div className="dash-body">
        {/* Main table */}
        <div className="dash-main">
          <div className="section-header">
            <div className="section-title-row">
              <FileCheck size={16} className="section-icon" />
              <h2 className="section-title">Pending Review Queue</h2>
              <span className="section-count">{pending.length}</span>
            </div>
          </div>

          {loading ? (
            <div className="table-skeleton">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="skeleton-row">
                  <div className="skeleton" style={{ width: '18%', height: 14 }} />
                  <div className="skeleton" style={{ width: '10%', height: 14 }} />
                  <div className="skeleton" style={{ width: '14%', height: 14 }} />
                  <div className="skeleton" style={{ width: '8%',  height: 14 }} />
                  <div className="skeleton" style={{ width: '8%',  height: 14 }} />
                  <div className="skeleton" style={{ width: '14%', height: 14 }} />
                  <div className="skeleton" style={{ width: '10%', height: 14 }} />
                  <div className="skeleton" style={{ width: '10%', height: 14 }} />
                </div>
              ))}
            </div>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Document No.</th>
                    <th>Program</th>
                    <th>Branch</th>
                    <th>Year</th>
                    <th>Sem</th>
                    <th>Subject</th>
                    <th>Marks</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {pending.map(row => (
                    <tr key={row.AllocationID || row.BookletID}
                        className="table-row-clickable"
                        onClick={() => navigate(`/evaluate/${row.BookletID}`)}>
                      <td>
                        <span className="doc-num">{row.DocumentNumber || row.BookletID}</span>
                      </td>
                      <td>{row.ProgramLevel || '—'}</td>
                      <td><span className="branch-chip">{row.Branch || '—'}</span></td>
                      <td>{row.Year || '—'}</td>
                      <td>{row.Semester || '—'}</td>
                      <td className="subject-cell">{row.Subject || '—'}</td>
                      <td>
                        {row.TotalMarks != null
                          ? <span className="marks-display">{row.TotalMarks}<span className="marks-max">/{row.MaxMarks || '?'}</span></span>
                          : <span className="text-muted">–</span>}
                      </td>
                      <td><StatusBadge status={row.EvaluationStatus} /></td>
                      <td className="dash-actions-cell" onClick={e => e.stopPropagation()}>
                        <Link to={`/view-booklet/${encodeURIComponent(row.BookletID)}`} className="dash-view-link" title="View answer sheet">View</Link>
                        <ChevronRight size={14} className="row-arrow" onClick={() => navigate(`/evaluate/${row.BookletID}`)} />
                      </td>
                    </tr>
                  ))}
                  {pending.length === 0 && (
                    <tr>
                      <td colSpan="9" className="empty-row">
                        <CheckCircle2 size={32} className="empty-icon" />
                        <p>All caught up! No booklets pending.</p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="dash-sidebar">
          <div className="widget card">
            <div className="widget-header">
              <CheckCircle2 size={15} className="widget-icon green" />
              <h3>Quick Stats</h3>
            </div>
            <div className="quick-stats">
              {[
                { label: 'Open',       val: summary?.pending    ?? '—', color: '#2563eb' },
                { label: 'Done Today', val: summary?.evaluated  ?? '—', color: '#16a34a' },
                { label: 'Recheck',    val: summary?.rejected   ?? '—', color: '#dc2626' },
              ].map(s => (
                <div key={s.label} className="quick-stat-row">
                  <span className="qs-label">{s.label}</span>
                  <span className="qs-val" style={{ color: s.color }}>{s.val}</span>
                </div>
              ))}
              <div className="qs-divider" />
              <div className="quick-stat-row">
                <span className="qs-label">Completion</span>
                <span className="qs-val" style={{ color: '#0d6e4a' }}>{completionRate}%</span>
              </div>
            </div>
          </div>

          <div className="widget card">
            <div className="widget-header">
              <Clock size={15} className="widget-icon amber" />
              <h3>Today</h3>
            </div>
            <div className="today-date-display">
              <div className="today-day">{today.getDate()}</div>
              <div>
                <div className="today-month">{today.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</div>
                <div className="today-weekday">{today.toLocaleDateString('en-IN', { weekday: 'long' })}</div>
              </div>
            </div>
          </div>

          <div className="widget card">
            <div className="widget-header">
              <ArrowRight size={15} className="widget-icon blue" />
              <h3>Quick Actions</h3>
            </div>
            <div className="quick-actions">
              {pending.filter(p => p.EvaluationStatus === 'Allocated' || p.EvaluationStatus === 'InProgress')
                .slice(0, 3)
                .map(b => (
                  <button key={b.BookletID} className="qa-item"
                    onClick={() => navigate(`/evaluate/${b.BookletID}`)}>
                    <BookOpen size={13} className="qa-icon" />
                    <span className="qa-label">{b.DocumentNumber || b.BookletID}</span>
                    <StatusBadge status={b.EvaluationStatus} />
                    <ChevronRight size={12} />
                  </button>
                ))}
              {pending.filter(p => p.EvaluationStatus === 'Allocated' || p.EvaluationStatus === 'InProgress').length === 0 && (
                <p className="widget-empty">No pending booklets</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
