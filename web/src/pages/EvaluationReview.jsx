import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, FileWarning } from 'lucide-react';
import { api } from '../services/api';
import './ViewBooklet.css';

const TOOL_VISUALS = {
  tick: { label: '✓', color: '#22c55e' },
  cross: { label: '✗', color: '#ef4444' },
  half_tick: { label: '½', color: '#f59e0b' },
  query: { label: '?', color: '#3b82f6' },
  answer_repeated: { label: '↻', color: '#8b5cf6' },
  not_attempted: { label: '—', color: '#94a3b8' },
  illegible: { label: '~', color: '#f97316' },
  comment: { label: '💬', color: '#06b6d4' },
};

function rowKey(r) {
  const q = r?.QuestionNumber != null ? String(r.QuestionNumber) : '';
  const s = r?.SubQuestionCode != null ? String(r.SubQuestionCode) : '';
  const setId = r?.SetID != null && r?.SetID !== '' ? String(r.SetID) : '';
  return `${q}||${s}||${setId}`;
}

export default function EvaluationReview() {
  const { evaluationId } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [review, setReview] = useState(null);
  const [status, setStatus] = useState('loading'); // loading|available|pdf|unavailable
  const [totalPages, setTotalPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pdfUrl, setPdfUrl] = useState('');
  const [availabilityMessage, setAvailabilityMessage] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const data = await api.eval.getEvaluationReview(evaluationId);
        setReview(data);
        const bookletId = data?.booklet?.BookletID;
        if (!bookletId) {
          setStatus('unavailable');
          setAvailabilityMessage('Booklet not available');
          return;
        }
        const av = await api.files.bookletAvailability(bookletId);
        if (av.available && av.totalPages > 0) {
          setStatus('available');
          setTotalPages(av.totalPages);
          setAvailabilityMessage(av.message || '');
          setPdfUrl('');
        } else if (av.available && av.hasPdf) {
          setStatus('pdf');
          setTotalPages(0);
          setAvailabilityMessage(av.message || 'PDF on server');
          setPdfUrl(api.files.bookletPdfUrl(bookletId));
        } else {
          setStatus('unavailable');
          setAvailabilityMessage(av.message || 'Answer sheet files not found on server.');
        }
      } catch (e) {
        setError(e?.message || 'Failed to load evaluation review');
      } finally {
        setLoading(false);
      }
    })();
  }, [evaluationId]);

  const marksMap = useMemo(() => {
    const map = new Map();
    for (const m of review?.marks || []) map.set(rowKey(m), m);
    return map;
  }, [review]);

  const bookletId = review?.booklet?.BookletID;
  const scheme = review?.questionScheme || [];
  const annotationsByPage = useMemo(() => {
    const out = {};
    for (const a of review?.annotations || []) {
      const p = Number(a.PageNumber);
      if (!Number.isFinite(p) || p < 1) continue;
      if (!out[p]) out[p] = [];
      out[p].push(a);
    }
    return out;
  }, [review]);
  const sharedByPage = review?.sharedAnnotations || {};
  const pageAnnotations = annotationsByPage[currentPage] || [];
  const sharedForPage = sharedByPage[currentPage] || [];
  const sharedCross = sharedForPage.filter((a) => a.type === 'stamp_page_crossed' && a.fullPage);
  const sharedBlanks = sharedForPage.filter((a) => a.type === 'stamp_blank');

  if (loading) return <div className="view-booklet-loading">Loading evaluation…</div>;
  if (error) return <div className="view-booklet-unavailable"><h2>Could not open review</h2><p>{error}</p></div>;

  return (
    <div className="view-booklet">
      <div className="view-booklet-bar">
        <button type="button" className="btn-back" onClick={() => navigate(-1)}>
          <ArrowLeft size={18} /> Back
        </button>
        <span className="view-booklet-title">
          Evaluation Review — {bookletId} (Read-only)
        </span>
      </div>

      <div className="view-booklet-bar" style={{ marginTop: 8, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <span><strong>Evaluator:</strong> {review?.evaluation?.EvaluatorName || '—'}</span>
        <span><strong>Total Marks:</strong> {review?.evaluation?.TotalMarks ?? '—'}</span>
        <span><strong>Status:</strong> {review?.evaluation?.IsSubmitted ? 'Submitted' : 'In Progress'}</span>
        <span><strong>Visited Pages:</strong> {(review?.visitedPages || []).length}</span>
      </div>

      {status === 'unavailable' && (
        <div className="view-booklet-unavailable">
          <FileWarning size={48} className="unavailable-icon" />
          <h2>File not available</h2>
          <p>{availabilityMessage}</p>
        </div>
      )}

      {status === 'pdf' && pdfUrl && (
        <>
          <div className="view-booklet-badge" style={{ margin: '8px 0' }}>
            Read-only annotations overlay is available for page-image mode. For PDF-only booklets, open evaluator mode if image pages are needed.
          </div>
          <div className="view-booklet-pdf-wrap">
            <iframe title={`Booklet ${bookletId}`} src={pdfUrl} className="view-booklet-pdf-frame" />
          </div>
          <div className="view-booklet-pdf-footer">
            <a href={pdfUrl} target="_blank" rel="noopener noreferrer" className="view-booklet-pdf-open">Open PDF in new tab</a>
          </div>
        </>
      )}

      {status === 'available' && (
        <div className="view-booklet-body">
          <div className="view-booklet-thumbs">
            <span className="thumbs-label">Pages</span>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
              <button
                key={p}
                type="button"
                className={`thumb-item ${currentPage === p ? 'active' : ''}`}
                onClick={() => setCurrentPage(p)}
              >
                <div className="thumb-img">
                  <img src={api.files.pageUrl(bookletId, p)} alt={`Page ${p}`} />
                </div>
                <span className="thumb-num">{p}</span>
              </button>
            ))}
          </div>
          <div className="view-booklet-main">
            {availabilityMessage ? <div className="view-booklet-badge">{availabilityMessage}</div> : null}
            <div style={{ position: 'relative', display: 'inline-block', maxWidth: '100%' }}>
              <img
                src={api.files.pageUrl(bookletId, currentPage)}
                alt={`Page ${currentPage}`}
                className="view-booklet-img"
              />
              <svg
                viewBox="0 0 1 1"
                preserveAspectRatio="none"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden
                style={{
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  width: '100%',
                  height: '100%',
                  pointerEvents: 'none',
                }}
              >
                {sharedCross.map((ann, idx) => (
                  <g key={`shx-${ann.id || idx}`}>
                    <line x1="0" y1="0" x2="1" y2="1" stroke="rgba(185, 28, 28, 0.55)" strokeWidth="0.014" vectorEffect="non-scaling-stroke" />
                    <line x1="1" y1="0" x2="0" y2="1" stroke="rgba(185, 28, 28, 0.55)" strokeWidth="0.014" vectorEffect="non-scaling-stroke" />
                  </g>
                ))}
                {sharedBlanks.map((ann, idx) => (
                  <g key={`shb-${ann.id || idx}`}>
                    <rect
                      x={ann.x}
                      y={ann.y}
                      width={ann.w}
                      height={ann.h}
                      fill="rgba(248, 250, 252, 0.95)"
                      stroke="#64748b"
                      strokeWidth="0.0025"
                      rx="0.01"
                    />
                    <text
                      x={ann.x + ann.w / 2}
                      y={ann.y + ann.h / 2}
                      fontSize="0.03"
                      fill="#0f172a"
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fontWeight="700"
                    >
                      BLANK
                    </text>
                  </g>
                ))}
                {pageAnnotations.map((ann, idx) => {
                  if (ann.type === 'pencil' || ann.type === 'tick_draw') {
                    const pts = ann.payload?.points;
                    if (!pts || pts.length < 2) return null;
                    const ptsStr = pts.map(([px, py]) => `${px},${py}`).join(' ');
                    return (
                      <polyline
                        key={`draw-${idx}`}
                        fill="none"
                        stroke={ann.payload?.color ?? (ann.type === 'tick_draw' ? '#22c55e' : '#1e293b')}
                        strokeWidth={ann.payload?.strokeWidth ?? (ann.type === 'tick_draw' ? 0.008 : 0.004)}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        vectorEffect="non-scaling-stroke"
                        points={ptsStr}
                      />
                    );
                  }
                  if (ann.type === 'comment') {
                    return (
                      <g key={`com-${idx}`}>
                        <text x={ann.x} y={ann.y} fontSize="0.04" fill="#06b6d4" dominantBaseline="hanging">💬</text>
                        {ann.note ? (
                          <text x={ann.x + 0.02} y={ann.y + 0.02} fontSize="0.022" fill="#334155" dominantBaseline="hanging">
                            {String(ann.note).slice(0, 40)}
                          </text>
                        ) : null}
                      </g>
                    );
                  }
                  const visual = TOOL_VISUALS[ann.type] || { label: ann.type, color: '#334155' };
                  return (
                    <text
                      key={`a-${idx}`}
                      x={ann.x}
                      y={ann.y}
                      fontSize="0.045"
                      fill={visual.color}
                      dominantBaseline="middle"
                    >
                      {visual.label}
                    </text>
                  );
                })}
              </svg>
            </div>
            <div className="view-booklet-pager">
              <button type="button" disabled={currentPage <= 1} onClick={() => setCurrentPage((c) => Math.max(1, c - 1))}>Previous</button>
              <span>Page {currentPage} of {totalPages}</span>
              <button type="button" disabled={currentPage >= totalPages} onClick={() => setCurrentPage((c) => Math.min(totalPages, c + 1))}>Next</button>
            </div>
          </div>
        </div>
      )}

      <div className="user-table-wrap" style={{ marginTop: 12 }}>
        <div className="user-table-header">
          <h3>Entered Marks (Read-only)</h3>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="admin-data-table">
            <thead>
              <tr>
                <th>Question</th>
                <th>Page</th>
                <th>Awarded</th>
                <th>Max</th>
              </tr>
            </thead>
            <tbody>
              {scheme.map((q) => {
                const key = rowKey(q);
                const m = marksMap.get(key);
                const label = q.SubQuestionCode
                  ? `Q${q.QuestionNumber}(${q.SubQuestionCode})`
                  : `Q${q.QuestionNumber}`;
                return (
                  <tr key={`${q.SchemeID}-${key}`}>
                    <td>{label}</td>
                    <td>{q.PageNumber ?? '—'}</td>
                    <td>{m?.MarksAwarded ?? 0}</td>
                    <td>{q.MaxMarks ?? m?.MaxMarks ?? 0}</td>
                  </tr>
                );
              })}
              {scheme.length === 0 && (
                <tr>
                  <td colSpan={4} className="empty-row">No marking scheme found</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
