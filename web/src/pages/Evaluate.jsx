import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { loadPdfFromUrl, renderPageToDataUrl } from '../utils/pdfBooklet';
import FaceVerifyModal from '../components/FaceVerifyModal';
import CountdownCapture from '../components/CountdownCapture';
import './Evaluate.css';

/** Render scale for main PDF page (CSS zoom still applied like JPEG booklets) */
const PDF_PAGE_RENDER_SCALE = 1.65;
const PDF_THUMB_SCALE = 0.18;

const ANNOTATION_TOOLS = [
  { id: 'tick',            label: '✓',  title: 'Correct (tap)',    color: '#22c55e' },
  { id: 'tick_draw',       label: '✓˜', title: 'Draw tick mark',   color: '#22c55e' },
  { id: 'pencil',          label: '✎',  title: 'Pencil / ink',    color: '#1e293b' },
  { id: 'cross',           label: '✗',  title: 'Wrong',            color: '#ef4444' },
  { id: 'half_tick',       label: '½',  title: 'Partially Correct',color: '#f59e0b' },
  { id: 'query',           label: '?',  title: 'Needs Review',     color: '#3b82f6' },
  { id: 'answer_repeated', label: '↻',  title: 'Answer Repeated',  color: '#8b5cf6' },
  { id: 'not_attempted',   label: '—',  title: 'Not Attempted',    color: '#94a3b8' },
  { id: 'illegible',       label: '~',  title: 'Illegible',        color: '#f97316' },
  { id: 'comment',         label: '💬', title: 'Comment',          color: '#06b6d4' },
];

const DRAWING_TOOL_IDS = new Set(['pencil', 'tick_draw']);

/** Normalise MySQL / API field casing for question scheme rows */
function normalizeSchemeRow(q) {
  if (!q) return null;
  return {
    SchemeID: q.SchemeID ?? q.schemeId,
    SetID: q.SetID ?? q.setId ?? null,
    PageNumber: q.PageNumber ?? q.pageNumber,
    QuestionNumber: q.QuestionNumber ?? q.questionNumber ?? '',
    SubQuestionCode: q.SubQuestionCode ?? q.subQuestionCode ?? '',
    MaxMarks: q.MaxMarks ?? q.maxMarks ?? 0,
    SortOrder: q.SortOrder ?? q.sortOrder ?? 0,
  };
}

function normalizeSetRow(s) {
  if (!s) return null;
  return {
    SetID: s.SetID ?? s.setId,
    SetLabel: s.SetLabel ?? s.setLabel ?? `Set ${s.SetID ?? ''}`,
    SetType: s.SetType ?? s.setType ?? 'AnswerAll',
    TotalQuestions: s.TotalQuestions ?? s.totalQuestions,
    AttemptQuestions: s.AttemptQuestions ?? s.attemptQuestions ?? 0,
    MarksPerQuestion: s.MarksPerQuestion ?? s.marksPerQuestion ?? 0,
    QuestionRangeFrom: s.QuestionRangeFrom ?? s.questionRangeFrom,
    QuestionRangeTo: s.QuestionRangeTo ?? s.questionRangeTo,
    SortOrder: s.SortOrder ?? s.sortOrder ?? 0,
  };
}

// Per-page timer hook
function usePageTimer() {
  const startRef = useRef(Date.now());
  const reset = () => { startRef.current = Date.now(); };
  const elapsed = () => Math.floor((Date.now() - startRef.current) / 1000);
  return { reset, elapsed };
}

export default function Evaluate() {
  const { bookletId } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [bookletData, setBookletData] = useState(null);    // { booklet, metadata, questionScheme, questionSets }
  const [evaluationId, setEvaluationId] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [marks, setMarks] = useState({});                  // { schemeId: marksAwarded }
  const [annotations, setAnnotations] = useState({});      // { pageNumber: [{ type, x, y, note }] }
  const [activeTool, setActiveTool] = useState('tick');
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [visitedPages, setVisitedPages] = useState(new Set());
  /** Thumbnail rail filter: all | visited | unvisited */
  const [thumbFilter, setThumbFilter] = useState('all');
  const [showQPaper, setShowQPaper] = useState(false);
  const [commentInput, setCommentInput] = useState('');
  const [commentPos, setCommentPos] = useState(null);
  const [draftStroke, setDraftStroke] = useState(null);
  const dragRef = useRef(null);

  // Timers
  const pageTimer = usePageTimer();
  const [pageSeconds, setPageSeconds] = useState(0);
  const timerRef = useRef(null);

  // Image zoom
  const [zoom, setZoom] = useState(1.0);
  const imgRef = useRef(null);
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;

  // Monitoring — face verification & random capture
  const [monitoringSettings, setMonitoringSettings] = useState(null);
  const [showFaceVerify, setShowFaceVerify] = useState(false);
  const [showCapture, setShowCapture] = useState(false);
  const captureTimerRef = useRef(null);
  /** 'pages' | 'pdf' | 'none' — server may only have PDF (scanner upload), not page JPGs */
  const [bookletMedia, setBookletMedia] = useState({ mode: 'unknown', hint: '' });
  const usePdfViewer = bookletMedia.mode === 'pdf';
  const [thumbLoadErrors, setThumbLoadErrors] = useState(() => new Set());

  /** PDF.js: page-wise render for thumbnails + annotated main view */
  const pdfDocRef = useRef(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState('');
  const [pdfNumPages, setPdfNumPages] = useState(0);
  const [pdfThumbs, setPdfThumbs] = useState({});
  const [pdfMainUrl, setPdfMainUrl] = useState('');

  // Tab-switch tracking
  const tabSwitchRef = useRef(0);
  useEffect(() => {
    const handleVisChange = () => {
      if (document.hidden) tabSwitchRef.current += 1;
    };
    document.addEventListener('visibilitychange', handleVisChange);
    return () => document.removeEventListener('visibilitychange', handleVisChange);
  }, []);

  // ── Load monitoring settings (face verify opens only after evaluationId exists) ──
  useEffect(() => {
    api.eval.monitoringSettings().then(setMonitoringSettings).catch(() => {});
  }, []);

  useEffect(() => {
    if (!evaluationId || !monitoringSettings) return;
    if (monitoringSettings.photo_verify_enabled === '1') {
      setShowFaceVerify(true);
    }
  }, [evaluationId, monitoringSettings]);

  // Schedule random photo captures
  const scheduleCapture = useCallback((settings) => {
    if (!settings || settings.photo_capture_enabled !== '1') return;
    const minMs = (parseInt(settings.photo_capture_interval_min, 10) || 15) * 60 * 1000;
    const maxMs = (parseInt(settings.photo_capture_interval_max, 10) || 30) * 60 * 1000;
    const delay = minMs + Math.random() * (maxMs - minMs);
    captureTimerRef.current = setTimeout(() => {
      setShowCapture(true);
    }, delay);
  }, []);

  useEffect(() => {
    if (monitoringSettings && !showFaceVerify) {
      scheduleCapture(monitoringSettings);
    }
    return () => { if (captureTimerRef.current) clearTimeout(captureTimerRef.current); };
  }, [monitoringSettings, showFaceVerify, scheduleCapture]);

  // ── Load booklet on mount ──────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const raw = await api.eval.openBooklet(bookletId);
        const scheme = (raw.questionScheme || []).map(normalizeSchemeRow).filter((q) => q && q.SchemeID != null);
        const sets = (raw.questionSets || []).map(normalizeSetRow).filter(Boolean);
        const data = { ...raw, questionScheme: scheme, questionSets: sets };
        setBookletData(data);

        const evalData = await api.eval.startEvaluation(bookletId, 'Primary');
        setEvaluationId(evalData.evaluationId);

        const existingAnns = await api.eval.getAnnotations(evalData.evaluationId);
        const byPage = {};
        for (const a of existingAnns) {
          if (!byPage[a.PageNumber]) byPage[a.PageNumber] = [];
          byPage[a.PageNumber].push({
            type: a.type,
            x: a.x,
            y: a.y,
            note: a.note,
            payload: a.payload ?? null,
          });
        }
        setAnnotations(byPage);

        try {
          const av = await api.files.bookletAvailability(bookletId);
          if (av.totalPages > 0) {
            setBookletMedia({ mode: 'pages', hint: av.message || '' });
          } else if (av.hasPdf) {
            setBookletMedia({
              mode: 'pdf',
              hint: av.message || 'Only PDF on server — use PDF viewer below.',
            });
          } else {
            setBookletMedia({
              mode: 'none',
              hint:
                av.message ||
                'No answer images or PDF on server. Check scan output path and PDF upload.',
            });
          }
        } catch {
          setBookletMedia({ mode: 'unknown', hint: '' });
        }
      } catch (err) {
        setError(err.message || 'Failed to load booklet');
      } finally {
        setLoading(false);
      }
    })();
  }, [bookletId]);

  // ── Load PDF document (evaluator booklet PDF-only mode) ───────────────────
  useEffect(() => {
    if (!usePdfViewer || !bookletId) {
      pdfDocRef.current = null;
      setPdfNumPages(0);
      setPdfThumbs({});
      setPdfMainUrl('');
      setPdfError('');
      setPdfLoading(false);
      return undefined;
    }
    let cancelled = false;
    setPdfLoading(true);
    setPdfError('');
    setPdfNumPages(0);
    setPdfThumbs({});
    setPdfMainUrl('');
    const url = api.files.bookletPdfUrl(bookletId);
    loadPdfFromUrl(url)
      .then((pdf) => {
        if (cancelled) {
          pdf.destroy?.().catch(() => {});
          return;
        }
        pdfDocRef.current = pdf;
        setPdfNumPages(pdf.numPages);
        setPdfLoading(false);
      })
      .catch((err) => {
        if (!cancelled) {
          setPdfError(err?.message || 'Could not load PDF');
          setPdfLoading(false);
        }
      });
    return () => {
      cancelled = true;
      const doc = pdfDocRef.current;
      pdfDocRef.current = null;
      if (doc?.destroy) doc.destroy().catch(() => {});
    };
  }, [usePdfViewer, bookletId]);

  // ── PDF thumbnails (progressive) ───────────────────────────────────────────
  useEffect(() => {
    if (!usePdfViewer || pdfNumPages < 1) return undefined;
    const pdf = pdfDocRef.current;
    if (!pdf) return undefined;
    let cancelled = false;
    setPdfThumbs({});
    (async () => {
      for (let p = 1; p <= pdfNumPages; p += 1) {
        if (cancelled) return;
        try {
          const dataUrl = await renderPageToDataUrl(pdf, p, PDF_THUMB_SCALE);
          if (!cancelled) {
            setPdfThumbs((prev) => ({ ...prev, [p]: dataUrl }));
          }
        } catch {
          /* leave slot empty; show placeholder in UI */
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [usePdfViewer, pdfNumPages, bookletId]);

  // ── PDF main page image for current page (annotations use same overlay as JPEG) ──
  useEffect(() => {
    if (!usePdfViewer || pdfNumPages < 1) return undefined;
    const pdf = pdfDocRef.current;
    if (!pdf) return undefined;
    const page = Math.min(Math.max(1, currentPage), pdfNumPages);
    let cancelled = false;
    (async () => {
      try {
        const dataUrl = await renderPageToDataUrl(pdf, page, PDF_PAGE_RENDER_SCALE);
        if (!cancelled) setPdfMainUrl(dataUrl);
      } catch {
        if (!cancelled) setPdfMainUrl('');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [usePdfViewer, pdfNumPages, currentPage, bookletId]);

  // Clamp current page when PDF page count is known
  useEffect(() => {
    if (!usePdfViewer || pdfNumPages < 1) return;
    if (currentPage > pdfNumPages) setCurrentPage(pdfNumPages);
    if (currentPage < 1) setCurrentPage(1);
  }, [usePdfViewer, pdfNumPages, currentPage]);

  // ── Per-page timer display ─────────────────────────────────────────────────
  useEffect(() => {
    clearInterval(timerRef.current);
    timerRef.current = setInterval(() => setPageSeconds(pageTimer.elapsed()), 1000);
    return () => clearInterval(timerRef.current);
  }, [currentPage]);

  // ── Log page visit when page changes ──────────────────────────────────────
  const prevPageRef = useRef(null);
  const annotationsRef = useRef(annotations);
  annotationsRef.current = annotations;
  useEffect(() => {
    if (!evaluationId || prevPageRef.current === null) {
      prevPageRef.current = currentPage;
      return;
    }
    const prev = prevPageRef.current;
    const duration   = pageTimer.elapsed();
    const annCount   = (annotationsRef.current[prev] || []).length;
    const tabSwitches = tabSwitchRef.current;
    tabSwitchRef.current = 0;
    api.eval.saveAnnotations(evaluationId, prev, annotationsRef.current[prev] || []).catch(() => {});
    api.eval.logPageVisit(evaluationId, prev, duration, zoomRef.current, annCount, tabSwitches)
      .catch(() => {});
    prevPageRef.current = currentPage;
    pageTimer.reset();
    setPageSeconds(0);
  }, [currentPage, evaluationId]);

  // Land on a page → count as visited immediately (fixes first/last page never logged until navigate away)
  useEffect(() => {
    if (!evaluationId) return;
    setVisitedPages((s) => new Set(s).add(currentPage));
    const annCount = (annotationsRef.current[currentPage] || []).length;
    api.eval.logPageVisit(evaluationId, currentPage, 0, zoomRef.current, annCount, 0).catch(() => {});
  }, [evaluationId, currentPage]);

  // ── Compute totals (best-N per Common set) ────────────────────────────────
  const totalPages = bookletData?.booklet?.TotalPages || 0;
  const thumbPageNumbers = useMemo(() => {
    if (usePdfViewer) {
      return Array.from(
        { length: Math.max(1, pdfNumPages || totalPages || 1) },
        (_, i) => i + 1
      );
    }
    return Array.from({ length: Math.max(1, totalPages || 1) }, (_, i) => i + 1);
  }, [usePdfViewer, pdfNumPages, totalPages]);
  const pagesRequiredForSubmit = usePdfViewer
    ? Math.max(1, pdfNumPages || totalPages || 1)
    : Math.max(1, totalPages || 1);

  const filteredThumbPageNumbers = useMemo(() => {
    if (thumbFilter === 'all') return thumbPageNumbers;
    if (thumbFilter === 'visited') return thumbPageNumbers.filter((p) => visitedPages.has(p));
    return thumbPageNumbers.filter((p) => !visitedPages.has(p));
  }, [thumbPageNumbers, visitedPages, thumbFilter]);

  const totalAwarded = (() => {
    const scheme = bookletData?.questionScheme || [];
    const sets   = bookletData?.questionSets   || [];
    if (sets.length === 0) {
      return Object.values(marks).reduce((s, v) => s + (parseFloat(v) || 0), 0);
    }
    let total = 0;
    for (const set of sets) {
      const setScheme = scheme.filter((q) => q.SetID != null && set.SetID != null && Number(q.SetID) === Number(set.SetID));
      const vals = setScheme.map(q => parseFloat(marks[q.SchemeID] ?? 0) || 0);
      if (set.SetType === 'Common') {
        const sorted = [...vals].sort((a, b) => b - a).slice(0, set.AttemptQuestions);
        total += sorted.reduce((s, v) => s + v, 0);
      } else {
        total += vals.reduce((s, v) => s + v, 0);
      }
    }
    const setIds = new Set(sets.map((s) => Number(s.SetID)));
    const unlinked = scheme.filter((q) => q.SetID == null || !setIds.has(Number(q.SetID)));
    total += unlinked.reduce((s, q) => s + (parseFloat(marks[q.SchemeID] ?? 0) || 0), 0);
    return Math.round(total * 100) / 100;
  })();

  const totalMax = (() => {
    const sets = bookletData?.questionSets || [];
    if (sets.length > 0) {
      return sets.reduce((s, set) => s + set.AttemptQuestions * parseFloat(set.MarksPerQuestion), 0);
    }
    return bookletData?.questionScheme?.reduce((s, q) => s + parseFloat(q.MaxMarks), 0) || 0;
  })();

  // ── Auto-save marks every 30 s ────────────────────────────────────────────
  useEffect(() => {
    if (!evaluationId) return;
    const id = setInterval(() => { doSaveMarks(false); }, 30000);
    return () => clearInterval(id);
  }, [evaluationId, marks]);

  const doSaveMarks = async (showFeedback = true) => {
    if (!evaluationId || !bookletData) return;
    setSaving(true);
    try {
      const details = (bookletData.questionScheme || []).map((q) => {
        const sid = q.SchemeID;
        const pageRaw = q.PageNumber;
        const pageNum =
          pageRaw != null && pageRaw !== '' ? parseInt(pageRaw, 10) : null;
        const setRaw = q.SetID;
        const setParsed =
          setRaw != null && setRaw !== '' ? parseInt(setRaw, 10) : null;
        return {
          pageNumber: Number.isFinite(pageNum) ? pageNum : null,
          questionNumber: q.QuestionNumber != null ? String(q.QuestionNumber) : '',
          subQuestionCode: q.SubQuestionCode != null ? String(q.SubQuestionCode) : '',
          setId: Number.isFinite(setParsed) ? setParsed : null,
          marksAwarded: parseFloat(marks[sid]) || 0,
          maxMarks: parseFloat(q.MaxMarks) || 0,
        };
      });
      await api.eval.saveMarks(evaluationId, details);

      // Save overlay annotations for every page that has data (JSON in DB; original PDF/images unchanged)
      const pagesToSave = new Set([currentPage, ...Object.keys(annotations).map(Number)]);
      for (const p of pagesToSave) {
        await api.eval.saveAnnotations(evaluationId, p, annotations[p] || []);
      }
    } catch (err) {
      if (showFeedback) alert('Save failed: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const addAnnotation = useCallback((page, ann) => {
    setAnnotations((prev) => ({
      ...prev,
      [page]: [...(prev[page] || []), ann],
    }));
  }, []);

  const removeAnnotation = useCallback((page, idx) => {
    setAnnotations((prev) => {
      const updated = [...(prev[page] || [])];
      updated.splice(idx, 1);
      return { ...prev, [page]: updated };
    });
  }, []);

  // ── Normalized coords on displayed image (0–1); marks stored as JSON per evaluation/booklet ──
  const normPoint = useCallback((e) => {
    const el = imgRef.current;
    if (!el) return { x: 0, y: 0 };
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return { x: 0, y: 0 };
    const x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    const y = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
    return { x, y };
  }, []);

  const dist2 = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;

  const finalizeDrawingStroke = useCallback((drag) => {
    if (!drag || (drag.tool !== 'pencil' && drag.tool !== 'tick_draw')) return;
    const pts = drag.points || [];
    setDraftStroke(null);
    if (pts.length < 2) return;
    const color = drag.tool === 'tick_draw' ? '#22c55e' : '#1e293b';
    const strokeWidth = drag.tool === 'tick_draw' ? 0.008 : 0.004;
    addAnnotation(currentPage, {
      type: drag.tool,
      x: pts[0].x,
      y: pts[0].y,
      note: null,
      payload: { points: pts.map((p) => [p.x, p.y]), color, strokeWidth },
    });
  }, [currentPage, addAnnotation]);

  const placeStampOrComment = useCallback((p) => {
    if (activeTool === 'comment') {
      setCommentPos(p);
      setCommentInput('');
      return;
    }
    if (DRAWING_TOOL_IDS.has(activeTool)) return;
    addAnnotation(currentPage, { type: activeTool, x: p.x, y: p.y, note: null });
  }, [activeTool, currentPage, addAnnotation]);

  const onMarkingPointerDown = useCallback((e) => {
    if (!imgRef.current || e.button !== 0) return;
    if (activeTool === 'comment') {
      dragRef.current = { kind: 'tap', start: normPoint(e), moved: false };
      return;
    }
    if (DRAWING_TOOL_IDS.has(activeTool)) {
      const p0 = normPoint(e);
      const color = activeTool === 'tick_draw' ? '#22c55e' : '#1e293b';
      const strokeWidth = activeTool === 'tick_draw' ? 0.008 : 0.004;
      dragRef.current = { kind: 'draw', tool: activeTool, points: [p0], color, strokeWidth };
      setDraftStroke({ points: [p0], color, strokeWidth });
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      return;
    }
    dragRef.current = { kind: 'tap', start: normPoint(e), moved: false };
  }, [activeTool, normPoint]);

  const onMarkingPointerMove = useCallback((e) => {
    const d = dragRef.current;
    if (!d) return;
    const p = normPoint(e);
    if (d.kind === 'draw') {
      const last = d.points[d.points.length - 1];
      if (dist2(p, last) < 4e-6) return;
      d.points.push(p);
      setDraftStroke({ points: [...d.points], color: d.color, strokeWidth: d.strokeWidth });
      return;
    }
    if (d.kind === 'tap' && d.start) {
      d.moved = d.moved || dist2(p, d.start) > 1e-4;
    }
  }, [normPoint]);

  const onMarkingPointerUp = useCallback((e) => {
    const d = dragRef.current;
    dragRef.current = null;
    setDraftStroke(null);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    if (!d) return;
    if (d.kind === 'draw') {
      finalizeDrawingStroke(d);
      return;
    }
    if (d.kind === 'tap' && d.start && !d.moved) {
      placeStampOrComment(d.start);
    }
  }, [finalizeDrawingStroke, placeStampOrComment]);

  const onMarkingPointerCancel = useCallback((e) => {
    dragRef.current = null;
    setDraftStroke(null);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  }, []);

  const confirmComment = () => {
    if (commentPos) {
      addAnnotation(currentPage, { type: 'comment', ...commentPos, note: commentInput });
    }
    setCommentPos(null);
    setCommentInput('');
  };

  // ── Submit evaluation ─────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!window.confirm(`Submit evaluation?\nTotal: ${totalAwarded.toFixed(2)} / ${totalMax.toFixed(2)}`)) return;
    setSubmitting(true);
    try {
      await doSaveMarks(false);
      const annCount = (annotations[currentPage] || []).length;
      await api.eval.logPageVisit(
        evaluationId,
        currentPage,
        pageTimer.elapsed(),
        zoomRef.current,
        annCount,
        tabSwitchRef.current
      ).catch(() => {});
      tabSwitchRef.current = 0;
      await api.eval.submitEvaluation(
        evaluationId, totalAwarded, pagesRequiredForSubmit,
        bookletData?.booklet?.PaperID || null
      );
      alert('Evaluation submitted successfully!');
      navigate('/');
    } catch (err) {
      alert('Submit failed: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  if (loading) return <div className="eval-loading">Loading booklet…</div>;
  if (error) {
    return (
      <div className="eval-error-page">
        <h2>Could not open this booklet</h2>
        <p className="eval-error-detail">{error}</p>
        <ul className="eval-error-hints">
          <li>If this booklet was only scanned, an admin must <strong>sync it to evaluation</strong> first.</li>
          <li>Confirm you opened the booklet from your assigned queue (Dashboard).</li>
        </ul>
        <button type="button" className="btn-eval-back" onClick={() => navigate('/')}>← Back to dashboard</button>
      </div>
    );
  }

  const { booklet, metadata, questionScheme, questionSets } = bookletData;
  const pageAnnotations = annotations[currentPage] || [];
  const mm = String(Math.floor(pageSeconds / 60)).padStart(2, '0');
  const ss = String(pageSeconds % 60).padStart(2, '0');

  const annSvg = (
    <svg
      className="annotation-overlay-svg"
      viewBox="0 0 1 1"
      preserveAspectRatio="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      {pageAnnotations.map((ann, idx) => {
        if (ann.type === 'pencil' || ann.type === 'tick_draw') {
          const pts = ann.payload?.points;
          if (!pts || pts.length < 2) return null;
          const ptsStr = pts.map(([px, py]) => `${px},${py}`).join(' ');
          const sw = ann.payload?.strokeWidth ?? 0.004;
          const col = ann.payload?.color ?? '#1e293b';
          return (
            <polyline
              key={`draw-${idx}`}
              fill="none"
              stroke={col}
              strokeWidth={sw}
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
              points={ptsStr}
              style={{ cursor: 'pointer', pointerEvents: 'stroke' }}
              onClick={(ev) => {
                ev.stopPropagation();
                removeAnnotation(currentPage, idx);
              }}
            />
          );
        }
        if (ann.type === 'comment') {
          return (
            <g key={`com-${idx}`}>
              <text
                x={ann.x}
                y={ann.y}
                fontSize="0.04"
                fill="#06b6d4"
                dominantBaseline="hanging"
                style={{ cursor: 'pointer', pointerEvents: 'all', userSelect: 'none' }}
                onClick={(ev) => {
                  ev.stopPropagation();
                  removeAnnotation(currentPage, idx);
                }}
              >
                💬
              </text>
              {ann.note && (
                <text
                  x={ann.x + 0.02}
                  y={ann.y + 0.02}
                  fontSize="0.022"
                  fill="#334155"
                  dominantBaseline="hanging"
                  style={{ pointerEvents: 'none', userSelect: 'none' }}
                >
                  {(ann.note || '').substring(0, 40)}
                </text>
              )}
            </g>
          );
        }
        const tool = ANNOTATION_TOOLS.find((t) => t.id === ann.type);
        return (
          <text
            key={`st-${idx}`}
            x={ann.x}
            y={ann.y}
            fontSize="0.045"
            fill={tool?.color || '#333'}
            dominantBaseline="middle"
            style={{ cursor: 'pointer', pointerEvents: 'all', userSelect: 'none' }}
            onClick={(ev) => {
              ev.stopPropagation();
              removeAnnotation(currentPage, idx);
            }}
          >
            {tool?.label || ann.type}
          </text>
        );
      })}
      {draftStroke && draftStroke.points?.length >= 2 && (
        <polyline
          fill="none"
          stroke={draftStroke.color}
          strokeWidth={draftStroke.strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
          points={draftStroke.points.map((p) => `${p.x},${p.y}`).join(' ')}
          opacity={0.88}
        />
      )}
    </svg>
  );

  return (
    <>
    {showFaceVerify && monitoringSettings && evaluationId != null && (
      <FaceVerifyModal
        evaluationId={evaluationId}
        verifyAction={monitoringSettings.photo_verify_action || 'warn_continue'}
        onDone={() => {
          setShowFaceVerify(false);
          scheduleCapture(monitoringSettings);
        }}
        onBlock={() => navigate('/')}
      />
    )}
    {showCapture && (
      <CountdownCapture
        evaluationId={evaluationId}
        onDone={() => {
          setShowCapture(false);
          scheduleCapture(monitoringSettings);
        }}
      />
    )}
    <div className="eval-page">
      {/* ── Top info bar ── */}
      <div className="eval-topbar">
        <div className="eval-topbar-info">
          <span><strong>Booklet:</strong> {booklet.BookletID}</span>
          <span><strong>Student:</strong> {metadata?.StudentName || '—'}</span>
          <span><strong>Course:</strong> {metadata?.ProgramLevel} {metadata?.Branch} {metadata?.Year} Yr</span>
          <span><strong>Subject:</strong> {metadata?.Subject || booklet.PaperName}</span>
          <span><strong>Exam:</strong> {booklet.ExamName}</span>
        </div>
        <div className="eval-topbar-actions">
          <span className="page-timer">Page time: {mm}:{ss}</span>
          <span className="marks-total">{totalAwarded.toFixed(1)} / {totalMax.toFixed(1)}</span>
          <button className="btn-save" onClick={() => doSaveMarks(true)} disabled={saving}>
            {saving ? 'Saving…' : '💾 Save'}
          </button>
          <button className="btn-submit" onClick={handleSubmit} disabled={submitting}>
            {submitting ? 'Submitting…' : '✅ Submit'}
          </button>
        </div>
      </div>

      {(bookletMedia.mode === 'none' || bookletMedia.mode === 'pdf') && (
        <div className={`eval-media-banner eval-media-banner-${bookletMedia.mode === 'pdf' ? 'info' : 'warn'}`}>
          <strong>{bookletMedia.mode === 'pdf' ? 'PDF answer sheet' : 'Answer files on server'}</strong>
          <span>
            {bookletMedia.mode === 'pdf'
              ? 'Marks are saved as overlay data (JSON) for this evaluator and booklet — the original PDF is never modified. Use ✎ pencil or ✓˜ draw-tick, or tap stamps. Thumbnails on the left are page previews.'
              : bookletMedia.hint}
          </span>
        </div>
      )}

      <div className="eval-body">
        {/* ── Left: page thumbnails ── */}
        <div className="eval-thumbnails">
          <div className="thumbs-label">Pages</div>
          <div className="thumb-filter" role="group" aria-label="Filter page thumbnails">
            {[
              { id: 'all', label: 'All' },
              { id: 'visited', label: 'Visited' },
              { id: 'unvisited', label: 'Not visited' },
            ].map(({ id, label }) => (
              <button
                key={id}
                type="button"
                className={`thumb-filter-btn ${thumbFilter === id ? 'active' : ''}`}
                onClick={() => setThumbFilter(id)}
              >
                {label}
              </button>
            ))}
          </div>
          {filteredThumbPageNumbers.length === 0 && (
            <div className="thumb-filter-empty">No pages match this filter.</div>
          )}
          {filteredThumbPageNumbers.map((p) => (
            <div
              key={p}
              className={`thumb-item ${p === currentPage ? 'active' : ''} ${visitedPages.has(p) ? 'visited' : ''}`}
              onClick={() => setCurrentPage(p)}
            >
              <div className="thumb-img">
                {usePdfViewer ? (
                  pdfThumbs[p] ? (
                    <img src={pdfThumbs[p]} alt="" />
                  ) : (
                    <div className="thumb-pdf-loading">
                      <span className="thumb-pdf-loading-num">{p}</span>
                    </div>
                  )
                ) : thumbLoadErrors.has(p) ? (
                  <div className="thumb-fallback">—</div>
                ) : (
                  <img
                    src={api.files.pageUrl(bookletId, p)}
                    alt={`Page ${p}`}
                    onError={() => setThumbLoadErrors((prev) => new Set(prev).add(p))}
                  />
                )}
              </div>
              <span className="thumb-num">P{p}</span>
              {visitedPages.has(p) && <span className="thumb-check">✓</span>}
            </div>
          ))}
        </div>

        {/* ── Centre: document viewer with SVG overlay ── */}
        <div className="eval-viewer">
          {/* Annotation toolbar */}
          <div className="annotation-toolbar">
            {ANNOTATION_TOOLS.map((tool) => (
              <button
                key={tool.id}
                className={`ann-tool ${activeTool === tool.id ? 'active' : ''}`}
                style={activeTool === tool.id ? { borderColor: tool.color, color: tool.color } : {}}
                onClick={() => setActiveTool(tool.id)}
                title={tool.title}
              >
                {tool.label}
              </button>
            ))}
            <div className="toolbar-sep" />
            <button
              className="ann-tool"
              onClick={() => setZoom((z) => Math.min(z + 0.25, 3))}
              title="Zoom In"
            >🔍+</button>
            <button
              className="ann-tool"
              onClick={() => setZoom((z) => Math.max(z - 0.25, 0.5))}
              title="Zoom Out"
            >🔍-</button>
            <button
              className="ann-tool"
              onClick={() => setZoom(1)}
              title="Reset Zoom"
            >{(zoom * 100).toFixed(0)}%</button>
            {(booklet.QuestionPaperPath || booklet.questionPaperPath) && (
              <>
                <div className="toolbar-sep" />
                <button
                  type="button"
                  className="ann-tool qpaper-btn"
                  onClick={() => setShowQPaper(true)}
                  title="View Question Paper"
                >📄 Q.Paper</button>
              </>
            )}
          </div>

          {usePdfViewer && pdfLoading && pdfNumPages === 0 && !pdfError && (
            <div className="eval-pdf-doc-loading">Loading PDF…</div>
          )}
          {usePdfViewer && pdfError && pdfNumPages === 0 && (
            <div className="eval-pdf-container eval-pdf-fallback-wrap">
              <p className="eval-pdf-fallback-msg">{pdfError}</p>
              <iframe
                title="Answer booklet PDF"
                src={api.files.bookletPdfUrl(bookletId)}
                className="eval-pdf-frame"
              />
              <a className="eval-pdf-open-tab" href={api.files.bookletPdfUrl(bookletId)} target="_blank" rel="noopener noreferrer">
                Open PDF in new tab
              </a>
            </div>
          )}
          {usePdfViewer && pdfNumPages > 0 && (
            <div className="image-container">
              {!pdfMainUrl && (
                <div className="eval-pdf-page-rendering">Rendering page {currentPage}…</div>
              )}
              {pdfMainUrl && (
                <div
                  className="booklet-stage"
                  style={{
                    transform: `scale(${zoom})`,
                    transformOrigin: 'top left',
                    touchAction: 'none',
                    display: 'inline-block',
                    position: 'relative',
                    cursor: DRAWING_TOOL_IDS.has(activeTool) ? 'crosshair' : 'default',
                  }}
                  onPointerDown={onMarkingPointerDown}
                  onPointerMove={onMarkingPointerMove}
                  onPointerUp={onMarkingPointerUp}
                  onPointerCancel={onMarkingPointerCancel}
                >
                  <img
                    ref={imgRef}
                    src={pdfMainUrl}
                    alt={`Page ${currentPage}`}
                    className="booklet-img"
                    style={{ display: 'block', maxWidth: '100%', height: 'auto' }}
                    draggable={false}
                  />
                  {annSvg}
                  {commentPos && (
                    <div
                      className="comment-popup"
                      style={{
                        position: 'absolute',
                        left: `${commentPos.x * 100}%`,
                        top: `${commentPos.y * 100}%`,
                        transform: 'translate(-50%, -100%)',
                      }}
                      onClick={(e) => e.stopPropagation()}
                      onPointerDown={(e) => e.stopPropagation()}
                    >
                      <input
                        autoFocus
                        value={commentInput}
                        onChange={(e) => setCommentInput(e.target.value)}
                        placeholder="Enter comment…"
                        onKeyDown={(e) => { if (e.key === 'Enter') confirmComment(); if (e.key === 'Escape') setCommentPos(null); }}
                      />
                      <button type="button" onClick={confirmComment}>Add</button>
                      <button type="button" onClick={() => setCommentPos(null)}>✕</button>
                    </div>
                  )}
                  <a
                    className="eval-pdf-open-tab-inline"
                    href={api.files.bookletPdfUrl(bookletId)}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    onPointerDown={(e) => e.stopPropagation()}
                  >
                    Open original PDF in new tab
                  </a>
                </div>
              )}
            </div>
          )}
          {!usePdfViewer && (
            <div className="image-container">
              <div
                className="booklet-stage"
                style={{
                  transform: `scale(${zoom})`,
                  transformOrigin: 'top left',
                  touchAction: 'none',
                  display: 'inline-block',
                  position: 'relative',
                  cursor: DRAWING_TOOL_IDS.has(activeTool) ? 'crosshair' : 'default',
                }}
                onPointerDown={onMarkingPointerDown}
                onPointerMove={onMarkingPointerMove}
                onPointerUp={onMarkingPointerUp}
                onPointerCancel={onMarkingPointerCancel}
              >
                <img
                  ref={imgRef}
                  src={api.files.pageUrl(bookletId, currentPage)}
                  alt={`Page ${currentPage}`}
                  className="booklet-img"
                  style={{ display: 'block', maxWidth: '100%', height: 'auto' }}
                  draggable={false}
                  onError={(e) => {
                    e.target.style.display = 'none';
                  }}
                />
                {annSvg}
                {commentPos && (
                  <div
                    className="comment-popup"
                    style={{
                      position: 'absolute',
                      left: `${commentPos.x * 100}%`,
                      top: `${commentPos.y * 100}%`,
                      transform: 'translate(-50%, -100%)',
                    }}
                    onClick={(e) => e.stopPropagation()}
                    onPointerDown={(e) => e.stopPropagation()}
                  >
                    <input
                      autoFocus
                      value={commentInput}
                      onChange={(e) => setCommentInput(e.target.value)}
                      placeholder="Enter comment…"
                      onKeyDown={(e) => { if (e.key === 'Enter') confirmComment(); if (e.key === 'Escape') setCommentPos(null); }}
                    />
                    <button type="button" onClick={confirmComment}>Add</button>
                    <button type="button" onClick={() => setCommentPos(null)}>✕</button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ── Right: marks sheet ── */}
        <div className="eval-marks-panel">
          <div className="marks-header">
            <h4>Marks Sheet</h4>
            <span className="marks-badge">{totalAwarded.toFixed(1)} / {totalMax.toFixed(1)}</span>
          </div>

          <div className="marks-scroll">
            {(!questionScheme || questionScheme.length === 0) && (
              <div className="marks-empty">
                <p><strong>No marking scheme</strong> is configured for this paper in the evaluation database.</p>
                <p>An administrator must add rows to <code>Eval_QuestionScheme</code> (and optional <code>Eval_QuestionSets</code>) for this paper so questions, pages, and max marks appear here.</p>
              </div>
            )}
            {questionScheme && questionScheme.length > 0 && questionSets && questionSets.length > 0 ? (
              questionSets.map((set) => {
                const setScheme = questionScheme.filter(
                  (q) => q.SetID != null && set.SetID != null && Number(q.SetID) === Number(set.SetID)
                );
                const setTypeKey = (set.SetType || 'set').toLowerCase().replace(/\s+/g, '');
                const setVals   = setScheme.map(q => parseFloat(marks[q.SchemeID] ?? 0) || 0);
                const setAwarded = set.SetType === 'Common'
                  ? [...setVals].sort((a, b) => b - a).slice(0, set.AttemptQuestions).reduce((s, v) => s + v, 0)
                  : setVals.reduce((s, v) => s + v, 0);
                const setMax = set.AttemptQuestions * parseFloat(set.MarksPerQuestion);

                return (
                  <div key={set.SetID} className="marks-set-group">
                    <div className="marks-set-header">
                      <span className="marks-set-label">{set.SetLabel}</span>
                      <span className={`marks-set-type marks-set-type-${setTypeKey}`}>
                        {set.SetType === 'Common'
                          ? `Best ${set.AttemptQuestions} of ${set.TotalQuestions}`
                          : (set.SetType || 'Set')}
                      </span>
                      <span className="marks-set-score">{setAwarded.toFixed(1)}/{setMax.toFixed(1)}</span>
                    </div>
                    {setScheme.length === 0 && (
                      <div className="marks-set-empty">No questions linked to this set (check SetID on scheme rows).</div>
                    )}
                    {setScheme.map((q) => {
                      const label = q.SubQuestionCode
                        ? `Q${q.QuestionNumber}(${q.SubQuestionCode})`
                        : `Q${q.QuestionNumber}`;
                      const val = marks[q.SchemeID] ?? '';
                      return (
                        <div
                          key={q.SchemeID}
                          className={`mark-row ${q.PageNumber === currentPage ? 'current-page' : ''}`}
                          onClick={() => q.PageNumber != null && q.PageNumber !== '' && setCurrentPage(Number(q.PageNumber))}
                        >
                          <span className="mark-qnum">{label}</span>
                          {q.PageNumber != null && q.PageNumber !== '' && (
                            <span className="mark-page">P{q.PageNumber}</span>
                          )}
                          <input
                            type="number"
                            className="mark-input"
                            value={val}
                            min={0}
                            max={parseFloat(q.MaxMarks)}
                            step={0.5}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => {
                              const v = e.target.value;
                              if (v === '' || (parseFloat(v) >= 0 && parseFloat(v) <= parseFloat(q.MaxMarks))) {
                                setMarks((prev) => ({ ...prev, [q.SchemeID]: v }));
                              }
                            }}
                            placeholder="—"
                          />
                          <span className="mark-max">/{q.MaxMarks}</span>
                        </div>
                      );
                    })}
                  </div>
                );
              })
            ) : questionScheme && questionScheme.length > 0 ? (
              questionScheme.map((q) => {
                const label = q.SubQuestionCode
                  ? `Q${q.QuestionNumber}(${q.SubQuestionCode})`
                  : `Q${q.QuestionNumber}`;
                const val = marks[q.SchemeID] ?? '';
                return (
                  <div
                    key={q.SchemeID}
                    className={`mark-row ${q.PageNumber === currentPage ? 'current-page' : ''}`}
                    onClick={() => q.PageNumber != null && q.PageNumber !== '' && setCurrentPage(Number(q.PageNumber))}
                  >
                    <span className="mark-qnum">{label}</span>
                    {q.PageNumber != null && q.PageNumber !== '' ? (
                      <span className="mark-page">P{q.PageNumber}</span>
                    ) : (
                      <span className="mark-page mark-page-na">—</span>
                    )}
                    <input
                      type="number"
                      className="mark-input"
                      value={val}
                      min={0}
                      max={parseFloat(q.MaxMarks)}
                      step={0.5}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v === '' || (parseFloat(v) >= 0 && parseFloat(v) <= parseFloat(q.MaxMarks))) {
                          setMarks((prev) => ({ ...prev, [q.SchemeID]: v }));
                        }
                      }}
                      placeholder="—"
                    />
                    <span className="mark-max">/{q.MaxMarks}</span>
                  </div>
                );
              })
            ) : null}
          </div>

          <div className="marks-footer">
            <div className="marks-total-row">
              <span>Total Marks</span>
              <span className="total-val">{totalAwarded.toFixed(2)}</span>
            </div>
            <div className="marks-total-row">
              <span>Out of</span>
              <span>{totalMax.toFixed(2)}</span>
            </div>
            <div className="marks-total-row">
              <span>Percentage</span>
              <span>{totalMax > 0 ? ((totalAwarded / totalMax) * 100).toFixed(1) + '%' : '—'}</span>
            </div>
            <div className="pages-visited">
              Pages visited: {visitedPages.size} / {pagesRequiredForSubmit}
            </div>
          </div>
        </div>
      </div>

      {/* Question Paper Modal */}
      {showQPaper && (booklet.QuestionPaperPath || booklet.questionPaperPath) && (
        <div className="modal-overlay" onClick={() => setShowQPaper(false)}>
          <div className="qpaper-modal" onClick={(e) => e.stopPropagation()}>
            <div className="qpaper-header">
              <h3>📄 Question Paper — {booklet.PaperName}</h3>
              <button type="button" className="qpaper-close-btn" onClick={() => setShowQPaper(false)}>✕ Close</button>
            </div>
            <p className="qpaper-hint">If the PDF is blank, open in a new tab (some browsers block iframes across ports).</p>
            <iframe
              src={api.files.qpaperUrl(booklet.QuestionPaperPath || booklet.questionPaperPath)}
              title="Question Paper"
              className="qpaper-iframe"
            />
            <div className="qpaper-footer">
              <a
                href={api.files.qpaperUrl(booklet.QuestionPaperPath || booklet.questionPaperPath)}
                target="_blank"
                rel="noopener noreferrer"
              >
                Open question paper in new tab
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
    </>
  );
}
