import { useState, useEffect, useRef } from 'react';
import {
  Clock, ChevronRight, Loader2,
  Camera, Navigation, CheckCircle2, AlertTriangle, XCircle, RefreshCw, ShieldCheck,
} from 'lucide-react';
import * as faceapi from 'face-api.js';
import { api } from '../services/api';
import './SessionContextModal.css';

const FACE_MODEL_URL = '/face-api-models';
let loginFaceModelsLoaded = false;
async function loadLoginFaceModels() {
  if (loginFaceModelsLoaded) return;
  await Promise.all([
    faceapi.nets.tinyFaceDetector.loadFromUri(FACE_MODEL_URL),
    faceapi.nets.faceLandmark68TinyNet.loadFromUri(FACE_MODEL_URL),
    faceapi.nets.faceRecognitionNet.loadFromUri(FACE_MODEL_URL),
  ]);
  loginFaceModelsLoaded = true;
}

function faceDetectorOptsPrimary() {
  return new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.25 });
}
function faceDetectorOptsFallback() {
  return new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.15 });
}

const PERIODS = [
  { value: 'Morning',   label: 'Morning   (8 AM – 12 PM)' },
  { value: 'Afternoon', label: 'Afternoon (12 PM – 4 PM)' },
  { value: 'Evening',   label: 'Evening   (4 PM – 8 PM)' },
];

function getSessionPeriodByTime() {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return 'Morning';
  if (hour >= 12 && hour < 17) return 'Afternoon';
  return 'Evening';
}

export default function SessionContextModal({ onComplete }) {
  // step 0 = camera + geo, 1 = session period + exam/paper (no centre/workstation)
  const [step, setStep] = useState(0);

  // ── Step-0 state ──────────────────────────────────────────────────────────
  const videoRef       = useRef(null);
  const canvasRef      = useRef(null);
  const streamRef      = useRef(null);
  const [camStatus,    setCamStatus]    = useState('idle');     // idle|requesting|granted|denied|captured
  const [geoStatus,    setGeoStatus]    = useState('idle');     // idle|requesting|granted|denied
  const [capturedBlob, setCapturedBlob] = useState(null);
  const [capturedUrl,  setCapturedUrl]  = useState(null);
  const [photoPath,    setPhotoPath]    = useState(null);
  const [geoCoords,    setGeoCoords]    = useState(null);
  /** null | verifying | uploading | done | error */
  const [verifyPhase, setVerifyPhase]   = useState(null);
  const [verifyMessage, setVerifyMessage] = useState('');

  // ── Session / exam state ───────────────────────────────────────────────────
  const [exams,        setExams]        = useState([]);
  const [papers,       setPapers]       = useState([]);
  const [form, setForm] = useState({
    sessionPeriod: getSessionPeriodByTime(), examId: '', paperId: '',
  });
  const [assignedExamPaper, setAssignedExamPaper] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  // ── Camera helpers ────────────────────────────────────────────────────────
  const requestCamera = async () => {
    setCamStatus('requesting');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 320 }, height: { ideal: 240 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      setCamStatus('granted');
    } catch {
      setCamStatus('denied');
    }
  };

  const requestGeolocation = () => {
    if (!navigator.geolocation) { setGeoStatus('denied'); return; }
    setGeoStatus('requesting');
    navigator.geolocation.getCurrentPosition(
      pos => { setGeoCoords({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }); setGeoStatus('granted'); },
      ()  => setGeoStatus('denied'),
      { timeout: 10000 }
    );
  };

  // Start permissions on mount (step 0)
  useEffect(() => {
    requestCamera();
    requestGeolocation();
    return () => {
      // Cleanup stream when component unmounts
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // After capture, <video> unmounts; on Retake it remounts with no srcObject — reattach the same MediaStream
  useEffect(() => {
    if (camStatus === 'captured' || camStatus === 'denied') return;
    const stream = streamRef.current;
    const video = videoRef.current;
    if (!stream || !video) return;
    if (video.srcObject !== stream) {
      video.srcObject = stream;
    }
    video.play().catch(() => {});
  }, [camStatus]);

  // Stop stream after leaving step 0
  useEffect(() => {
    if (step > 0) {
      streamRef.current?.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
  }, [step]);

  // Load exams when reaching step 1 (manual pick if not assigned)
  useEffect(() => {
    if (step !== 1) return;
    api.headeval.getExams().catch(() => []).then(setExams).catch(() => {});
  }, [step]);

  useEffect(() => {
    if (!form.examId) { setPapers([]); return; }
    api.headeval.getPapers(form.examId).then(setPapers).catch(() => {});
  }, [form.examId]);

  // Load assigned exam/paper when entering step 1 and auto-set session by time
  useEffect(() => {
    if (step !== 1) return;
    setForm(f => ({ ...f, sessionPeriod: getSessionPeriodByTime() }));
    api.auth.assignedExamPaper()
      .then((data) => {
        if (data && (data.ExamID || data.examId) && (data.PaperID || data.paperId)) {
          const examId = data.ExamID ?? data.examId;
          const paperId = data.PaperID ?? data.paperId;
          setAssignedExamPaper({ examId, paperId, examName: data.ExamName ?? data.examName, paperName: data.PaperName ?? data.paperName });
          setForm(prev => ({ ...prev, examId: String(examId), paperId: String(paperId) }));
        } else {
          setAssignedExamPaper(null);
        }
      })
      .catch(() => setAssignedExamPaper(null));
  }, [step]);

  // ── Capture + mandatory face match vs registration photo, then upload ───────
  const handleCapture = () => {
    const video  = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    canvas.width  = video.videoWidth  || 320;
    canvas.height = video.videoHeight || 240;
    canvas.getContext('2d').drawImage(video, 0, 0);
    const previewUrl = canvas.toDataURL('image/jpeg', 0.85);
    setCapturedUrl(previewUrl);
    setCamStatus('captured');
    setPhotoPath(null);
    setCapturedBlob(null);
    setVerifyPhase('verifying');
    setVerifyMessage('Verifying your face against your registered photo…');

    (async () => {
      try {
        const user = JSON.parse(localStorage.getItem('user') || '{}');
        if (!user.profilePhotoPath) {
          setVerifyPhase('error');
          setVerifyMessage('No registration photo on file. Contact your administrator.');
          return;
        }
        await loadLoginFaceModels();
        // face-api.js: chain may not return a native Promise — do not use .catch() on it
        let capDet = null;
        try {
          capDet = await faceapi
            .detectSingleFace(canvas, faceDetectorOptsPrimary())
            .withFaceLandmarks(true)
            .withFaceDescriptor();
        } catch {
          capDet = null;
        }
        if (!capDet) {
          try {
            capDet = await faceapi
              .detectSingleFace(canvas, faceDetectorOptsFallback())
              .withFaceLandmarks(true)
              .withFaceDescriptor();
          } catch {
            capDet = null;
          }
        }

        const profileDesc = await new Promise((resolve) => {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.onload = async () => {
            try {
              let det = null;
              try {
                det = await faceapi
                  .detectSingleFace(img, faceDetectorOptsPrimary())
                  .withFaceLandmarks(true)
                  .withFaceDescriptor();
              } catch {
                det = null;
              }
              if (!det) {
                try {
                  det = await faceapi
                    .detectSingleFace(img, faceDetectorOptsFallback())
                    .withFaceLandmarks(true)
                    .withFaceDescriptor();
                } catch {
                  det = null;
                }
              }
              resolve(det?.descriptor || null);
            } catch {
              resolve(null);
            }
          };
          img.onerror = () => resolve(null);
          img.src = api.files.profilePhotoUrl(user.profilePhotoPath);
        });

        if (!profileDesc) {
          setVerifyPhase('error');
          setVerifyMessage('Could not read your registration photo. Contact your administrator.');
          return;
        }
        if (!capDet?.descriptor) {
          setVerifyPhase('error');
          setVerifyMessage('No clear face detected. Improve lighting, face the camera squarely, and retake.');
          return;
        }
        const dist = faceapi.euclideanDistance(capDet.descriptor, profileDesc);
        const score = Math.max(0, Math.round((1 - dist) * 100));
        if (score < 50) {
          setVerifyPhase('error');
          setVerifyMessage(
            `Face does not match your registration photo (${score}% similarity, need ≥50%). Retake or contact your administrator.`
          );
          return;
        }

        setVerifyPhase('uploading');
        setVerifyMessage(`Identity verified (${score}% match). Saving login photo…`);

        const blob = await new Promise((resolve, reject) => {
          canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not encode image'))), 'image/jpeg', 0.85);
        });
        const fd = new FormData();
        fd.append('photo', blob, 'login_capture.jpg');
        const result = await api.auth.loginPhoto(fd);
        setPhotoPath(result.photoPath);
        setCapturedBlob(blob);
        setVerifyPhase('done');
        setVerifyMessage(`Verified (${score}% match). You can continue.`);
      } catch (err) {
        const msg = err?.message || '';
        const modelsMissing = /<!DOCTYPE|is not valid JSON|Failed to fetch|404/i.test(String(msg));
        setVerifyPhase('error');
        setVerifyMessage(
          modelsMissing
            ? 'Face models could not be loaded (check web/public/face-api-models). Install models and try again.'
            : (msg || 'Verification or upload failed. Retake or try again.')
        );
      }
    })();
  };

  const handleRetake = () => {
    setCapturedUrl(null);
    setCapturedBlob(null);
    setPhotoPath(null);
    setVerifyPhase(null);
    setVerifyMessage('');
    setCamStatus(streamRef.current ? 'granted' : 'denied');
  };

  // ── Form helpers ──────────────────────────────────────────────────────────
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async () => {
    setError('');
    if (!form.examId || !form.paperId) { setError('Exam and paper are required. You must be assigned booklets first.'); return; }
    setLoading(true);
    try {
      const result = await api.auth.sessionContext({
        locationId:    null,
        workstationId: null,
        sessionPeriod: form.sessionPeriod,
        examId:        form.examId        ? parseInt(form.examId)        : null,
        paperId:       form.paperId       ? parseInt(form.paperId)       : null,
        geoLatitude:   geoCoords?.latitude  ?? null,
        geoLongitude:  geoCoords?.longitude ?? null,
        loginPhotoPath: photoPath ?? null,
      });
      localStorage.setItem('sessionId', result.sessionId);
      onComplete(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const verifyBusy = verifyPhase === 'verifying' || verifyPhase === 'uploading';
  const canProceed0 = camStatus === 'captured' && verifyPhase === 'done' && !!photoPath;

  // Step labels for header (2 steps only — centre/workstation not required for evaluators)
  const stepLabels = ['Camera & Location', 'Session & Paper'];
  const stepIcons  = [<Camera key="cam" size={20} />, <Clock key="clk" size={20} />];

  return (
    <div className="sc-overlay">
      <div className="sc-modal">

        {/* Header */}
        <div className="sc-header">
          <div className="sc-header-icon">{stepIcons[step]}</div>
          <div>
            <h2 className="sc-title">Session Setup</h2>
            <p className="sc-subtitle">{stepLabels[step]}</p>
          </div>
          <div className="sc-steps">
            {[0, 1].map((s, i) => (
              <span key={s} className="sc-step-group">
                {i > 0 && <span className="sc-step-line" />}
                <span className={`sc-step ${step >= s ? 'active' : ''}`}>{i + 1}</span>
              </span>
            ))}
          </div>
        </div>

        {error && <div className="sc-error">{error}</div>}

        {/* ── Step 0: Camera + Geolocation ── */}
        {step === 0 && (
          <div className="sc-body">
            <div className="sc-section-label"><Camera size={14} /> Camera, identity &amp; location</div>
            <p className="sc-session-hint">
              Your live photo must <strong>match your administrator-registered profile photo</strong> before you can continue.
            </p>

            <div className="sc-perm-grid">
              {/* Camera card */}
              <div className={`sc-perm-card ${camStatus === 'denied' ? 'perm-denied' : camStatus === 'granted' || camStatus === 'captured' ? 'perm-granted' : ''}`}>
                <div className="sc-perm-header">
                  <Camera size={14} />
                  <span>Camera Access</span>
                  <span className="sc-perm-badge">
                    {camStatus === 'requesting' && <Loader2 size={13} className="spin" />}
                    {(camStatus === 'granted' || camStatus === 'captured') && <CheckCircle2 size={13} />}
                    {camStatus === 'denied' && <XCircle size={13} />}
                  </span>
                </div>

                <div className="sc-cam-area">
                  {camStatus !== 'captured' && camStatus !== 'denied' && (
                    <video ref={videoRef} className="sc-video" autoPlay muted playsInline />
                  )}
                  {camStatus === 'captured' && capturedUrl && (
                    <img src={capturedUrl} className="sc-video" alt="Login capture" />
                  )}
                  {camStatus === 'denied' && (
                    <div className="sc-cam-placeholder">
                      <XCircle size={26} />
                      <span>Camera access denied</span>
                      <button className="btn btn-sm btn-secondary" onClick={requestCamera}>
                        <RefreshCw size={12} /> Retry
                      </button>
                    </div>
                  )}
                  {camStatus === 'idle' && (
                    <div className="sc-cam-placeholder">
                      <Loader2 size={26} className="spin" />
                      <span>Starting camera…</span>
                    </div>
                  )}
                </div>

                <canvas ref={canvasRef} style={{ display: 'none' }} />

                <div className="sc-cam-footer">
                  {camStatus === 'granted' && (
                    <button className="btn btn-primary btn-sm" onClick={handleCapture} disabled={verifyBusy}>
                      <Camera size={13} /> Capture &amp; verify
                    </button>
                  )}
                  {camStatus === 'captured' && (
                    <div className="sc-cam-captured-bar">
                      {verifyPhase === 'verifying' || verifyPhase === 'uploading' ? (
                        <span className="sc-uploading"><Loader2 size={13} className="spin" /> {verifyMessage || 'Working…'}</span>
                      ) : verifyPhase === 'done' ? (
                        <span className="sc-ok"><ShieldCheck size={13} /> {verifyMessage || 'Verified'}</span>
                      ) : verifyPhase === 'error' ? (
                        <span className="sc-verify-error"><AlertTriangle size={13} /> {verifyMessage}</span>
                      ) : (
                        <span className="sc-uploading"><Loader2 size={13} className="spin" /> …</span>
                      )}
                      <button type="button" className="btn btn-sm btn-secondary" onClick={handleRetake} disabled={verifyBusy}>
                        <RefreshCw size={12} /> Retake
                      </button>
                    </div>
                  )}
                  {camStatus === 'requesting' && (
                    <span className="sc-cam-hint"><Loader2 size={13} className="spin" /> Requesting camera…</span>
                  )}
                </div>
              </div>

              {/* Geolocation card */}
              <div className={`sc-perm-card ${geoStatus === 'denied' ? 'perm-denied' : geoStatus === 'granted' ? 'perm-granted' : ''}`}>
                <div className="sc-perm-header">
                  <Navigation size={14} />
                  <span>Location Access</span>
                  <span className="sc-perm-badge">
                    {geoStatus === 'requesting' && <Loader2 size={13} className="spin" />}
                    {geoStatus === 'granted' && <CheckCircle2 size={13} />}
                    {geoStatus === 'denied' && <AlertTriangle size={13} />}
                  </span>
                </div>
                <div className="sc-geo-body">
                  {(geoStatus === 'idle' || geoStatus === 'requesting') && (
                    <div className="sc-geo-placeholder">
                      <Loader2 size={22} className="spin" />
                      <span>Acquiring location…</span>
                    </div>
                  )}
                  {geoStatus === 'granted' && geoCoords && (
                    <div className="sc-geo-coords">
                      <div className="sc-geo-row">
                        <span className="sc-geo-label">Latitude</span>
                        <strong>{geoCoords.latitude.toFixed(6)}°</strong>
                      </div>
                      <div className="sc-geo-row">
                        <span className="sc-geo-label">Longitude</span>
                        <strong>{geoCoords.longitude.toFixed(6)}°</strong>
                      </div>
                      <div className="sc-geo-ok"><CheckCircle2 size={13} /> Location recorded</div>
                    </div>
                  )}
                  {geoStatus === 'denied' && (
                    <div className="sc-geo-placeholder denied">
                      <AlertTriangle size={22} />
                      <span>Location unavailable</span>
                      <small>Optional — you can still proceed</small>
                      <button className="btn btn-sm btn-secondary" onClick={requestGeolocation}>
                        <RefreshCw size={12} /> Retry
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {!canProceed0 && camStatus !== 'captured' && (
              <p className="sc-perm-hint">
                <AlertTriangle size={12} /> Capture and pass identity verification before proceeding
              </p>
            )}
            {camStatus === 'captured' && verifyPhase === 'error' && (
              <p className="sc-perm-hint sc-perm-hint-error">
                <AlertTriangle size={12} /> Fix the issue above or use Retake, then try again
              </p>
            )}

            <div className="sc-actions">
              <button
                className="btn btn-primary"
                onClick={() => setStep(1)}
                disabled={!canProceed0}
              >
                Next <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}

        {/* ── Step 1: Session Period + Exam/Paper ── */}
        {step === 1 && (
          <div className="sc-body">
            <div className="sc-section-label"><Clock size={14} /> Session &amp; Paper</div>
            <div className="field-group">
              <label className="field-label">Session Period *</label>
              <div className="sc-period-grid">
                {PERIODS.map(p => (
                  <button key={p.value}
                    className={`sc-period-btn ${form.sessionPeriod === p.value ? 'active' : ''}`}
                    onClick={() => setForm(f => ({ ...f, sessionPeriod: p.value }))}>
                    <Clock size={14} />
                    {p.label}
                  </button>
                ))}
              </div>
              <small className="field-hint">Auto-selected by current time</small>
            </div>
            <div className="field-group">
              <label className="field-label">Exam *</label>
              {assignedExamPaper ? (
                <div className="field-readonly">{assignedExamPaper.examName ?? form.examId}</div>
              ) : (
                <select className="field-input" value={form.examId} onChange={set('examId')}>
                  <option value="">— Select Exam —</option>
                  {exams.map(e => (
                    <option key={e.ExamID} value={e.ExamID}>{e.ExamName} ({e.ExamYear})</option>
                  ))}
                </select>
              )}
            </div>
            <div className="field-group">
              <label className="field-label">Paper *</label>
              {assignedExamPaper ? (
                <div className="field-readonly">{assignedExamPaper.paperName ?? form.paperId}</div>
              ) : (
                <select className="field-input" value={form.paperId} onChange={set('paperId')}
                  disabled={!form.examId}>
                  <option value="">— Select Paper —</option>
                  {papers.map(p => (
                    <option key={p.PaperID} value={p.PaperID}>{p.PaperCode} — {p.PaperName}</option>
                  ))}
                </select>
              )}
            </div>
            <div className="sc-actions">
              <button className="btn btn-secondary" onClick={() => setStep(0)}>Back</button>
              <button className="btn btn-primary" onClick={handleSubmit} disabled={loading || !form.examId || !form.paperId}>
                {loading ? <><Loader2 size={14} className="spin" /> Setting up…</> : 'Start Session'}
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
