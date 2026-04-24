/**
 * Identity verification before evaluation — same layout & flow as Session Setup step 0
 * (camera + location row + full-width card, Capture & verify, /auth/verify-login-face).
 */
import { useState, useEffect, useRef } from 'react';
import {
  Camera,
  AlertTriangle,
  Loader2,
  X,
  CheckCircle2,
  Navigation,
  RefreshCw,
  XCircle,
  ShieldCheck,
} from 'lucide-react';
import { api } from '../services/api';
import { mapFaceVerifyFailure } from '../utils/faceVerifyErrors';
import './SessionContextModal.css';
import './FaceVerifyModal.css';

const LOGIN_CAPTURE_W = 320;
const LOGIN_CAPTURE_H = 240;

function normalizeVerifyPayload(vr) {
  if (!vr || typeof vr !== 'object') {
    return { verified: false, matchPercentage: null, message: '' };
  }
  const verified = vr.verified === true;
  const raw = vr.matchPercentage ?? vr.match_percentage;
  let matchPercentage = null;
  if (raw != null && raw !== '') {
    const n = Number(raw);
    if (Number.isFinite(n)) matchPercentage = Math.round(n);
  }
  const message = vr.message != null ? String(vr.message) : '';
  return { verified, matchPercentage, message };
}

export default function FaceVerifyModal({ evaluationId, verifyAction = 'warn_continue', onDone, onBlock }) {
  const [setupError, setSetupError] = useState('');
  const [geoStatus, setGeoStatus] = useState('idle');
  const [geoCoords, setGeoCoords] = useState(null);
  const [devices, setDevices] = useState([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState('');
  /** idle | requesting | granted | denied | captured */
  const [camStatus, setCamStatus] = useState('idle');
  const [capturedUrl, setCapturedUrl] = useState(null);
  /** null | verifying | success | error */
  const [verifyPhase, setVerifyPhase] = useState(null);
  const [verifyMessage, setVerifyMessage] = useState('');
  const [verifyErrorTitle, setVerifyErrorTitle] = useState('');
  const [verifyHint, setVerifyHint] = useState('');
  const [lastScore, setLastScore] = useState(null);
  /** 'mismatch' | 'noprofile' | null — drives block / dashboard actions */
  const [resultKind, setResultKind] = useState(null);

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const autoProceedTimerRef = useRef(null);

  const stopStream = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  const requestGeolocation = () => {
    if (!navigator.geolocation) {
      setGeoStatus('denied');
      return;
    }
    setGeoStatus('requesting');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeoCoords({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
        setGeoStatus('granted');
      },
      () => setGeoStatus('denied'),
      { timeout: 10000 }
    );
  };

  const openCameraStream = async (deviceIdOverride) => {
    const deviceId = deviceIdOverride ?? selectedDeviceId;
    setCamStatus('requesting');
    setSetupError('');
    try {
      const candidates = deviceId
        ? [
            {
              audio: false,
              video: {
                deviceId: { ideal: deviceId },
                width: { ideal: LOGIN_CAPTURE_W },
                height: { ideal: LOGIN_CAPTURE_H },
              },
            },
            { audio: false, video: { deviceId: { ideal: deviceId } } },
            {
              audio: false,
              video: {
                deviceId: { ideal: deviceId },
                width: { ideal: 1280 },
                height: { ideal: 720 },
              },
            },
            { audio: false, video: { deviceId: { exact: deviceId } } },
          ]
        : [
            {
              audio: false,
              video: { facingMode: 'user', width: { ideal: LOGIN_CAPTURE_W }, height: { ideal: LOGIN_CAPTURE_H } },
            },
            { audio: false, video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } } },
            { audio: false, video: { facingMode: 'user' } },
          ];
      let stream;
      for (const constraints of candidates) {
        try {
          stream = await navigator.mediaDevices.getUserMedia(constraints);
          break;
        } catch {
          /* try next */
        }
      }
      if (!stream) throw new Error('Could not open any camera with these settings');
      streamRef.current = stream;
      setCamStatus('granted');
      try {
        localStorage.setItem('evalPreferredCameraId', deviceId || stream.getVideoTracks()[0]?.getSettings?.()?.deviceId || '');
      } catch {
        /* */
      }
    } catch (e) {
      stopStream();
      setCamStatus('denied');
      setSetupError(e?.message || 'Camera failed to start');
    }
  };

  useEffect(() => {
    requestGeolocation();
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        try {
          const tmp = await navigator.mediaDevices.getUserMedia({ audio: false, video: true });
          tmp.getTracks().forEach((t) => t.stop());
        } catch {
          /* labels may be hidden */
        }
        if (!mounted) return;
        const inputs = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput');
        if (!mounted) return;
        setDevices(inputs);
        if (inputs.length === 0) {
          setSetupError('No camera was detected. Connect a webcam or allow camera access, then reload.');
          setCamStatus('denied');
          return;
        }
        const pick =
          (() => {
            try {
              const stored = localStorage.getItem('evalPreferredCameraId');
              if (stored && inputs.some((d) => d.deviceId === stored)) return stored;
            } catch {
              /* */
            }
            return inputs[0].deviceId;
          })();
        setSelectedDeviceId(pick);
        await openCameraStream(pick);
      } catch (err) {
        if (!mounted) return;
        setSetupError(err?.message || 'Setup failed');
        setCamStatus('denied');
      }
    })();
    return () => {
      mounted = false;
      stopStream();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initial load only
  }, []);

  useEffect(
    () => () => {
      if (autoProceedTimerRef.current != null) {
        clearTimeout(autoProceedTimerRef.current);
        autoProceedTimerRef.current = null;
      }
    },
    []
  );

  useEffect(() => {
    if (camStatus === 'captured' || camStatus === 'denied') return;
    const stream = streamRef.current;
    const video = videoRef.current;
    if (!stream || !video) return;
    if (video.srcObject !== stream) video.srcObject = stream;
    video.play().catch(() => {});
  }, [camStatus, capturedUrl]);

  const verifyBusy = verifyPhase === 'verifying';
  const canCapture = camStatus === 'granted' && !capturedUrl && !verifyBusy;
  const showPermHint = camStatus === 'granted' && !capturedUrl && !verifyPhase;

  const handleCaptureAndVerify = async () => {
    if (autoProceedTimerRef.current != null) {
      clearTimeout(autoProceedTimerRef.current);
      autoProceedTimerRef.current = null;
    }
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    setSetupError('');
    setVerifyPhase('verifying');
    setVerifyMessage('Verifying your face against your registered photo…');
    setVerifyErrorTitle('');
    setVerifyHint('');
    setLastScore(null);
    setResultKind(null);

    try {
      canvas.width = video.videoWidth || LOGIN_CAPTURE_W;
      canvas.height = video.videoHeight || LOGIN_CAPTURE_H;
      canvas.getContext('2d').drawImage(video, 0, 0);
      const previewUrl = canvas.toDataURL('image/jpeg', 0.85);
      setCapturedUrl(previewUrl);
      setCamStatus('captured');

      const user = JSON.parse(localStorage.getItem('user') || '{}');
      const regPath = user.profilePhotoPath || user.ProfilePhotoPath;

      let faceMatchResult = 'Error';
      let score = null;
      let success = false;
      let errTitle = '';
      let errMsg = '';
      let errHint = '';

      if (!regPath) {
        faceMatchResult = 'NoProfile';
        setResultKind('noprofile');
        errTitle = 'No registration photo';
        errMsg =
          'Your account does not have a photo on file yet. An administrator must upload your registration photo before you can continue.';
      } else {
        try {
          const vr = await api.auth.verifyLoginFace({ liveImageBase64: previewUrl });
          const { verified, matchPercentage: pct, message: vrMsg } = normalizeVerifyPayload(vr);
          score = pct;
          setLastScore(pct);
          if (verified) {
            faceMatchResult = 'Matched';
            success = true;
            setVerifyPhase('success');
            setVerifyMessage(
              pct != null ? `Verified (${pct}% match). Opening evaluation…` : 'Verified. Opening evaluation…'
            );
          } else {
            faceMatchResult = 'Mismatch';
            setResultKind('mismatch');
            errTitle = 'Face did not match';
            errMsg =
              pct != null
                ? `${vrMsg || 'Your live photo does not match your registration photo.'} Similarity was about ${pct}%.`
                : vrMsg ||
                  'Your live photo does not match your registration photo. Try better lighting, remove glasses if possible, and center your face.';
            errHint = 'Tap Retake, adjust your position or lighting, then capture again.';
            setVerifyPhase('error');
            setVerifyErrorTitle(errTitle);
            setVerifyMessage(errMsg);
            setVerifyHint(errHint);
          }
        } catch (e) {
          faceMatchResult = 'Error';
          const mapped = mapFaceVerifyFailure(e?.message);
          errTitle = mapped.title;
          errMsg = mapped.title === 'Verification failed' && e?.message ? e.message : mapped.message;
          errHint = mapped.hint || '';
          setVerifyPhase('error');
          setVerifyErrorTitle(errTitle);
          setVerifyMessage(errMsg);
          setVerifyHint(errHint);
        }
      }

      if (faceMatchResult === 'NoProfile') {
        setVerifyPhase('error');
        setVerifyErrorTitle(errTitle);
        setVerifyMessage(errMsg);
        setVerifyHint('');
      }

      canvas.toBlob(
        async (blob) => {
          try {
            if (!blob) return;
            const fd = new FormData();
            fd.append('photo', blob, 'verify.jpg');
            fd.append('evaluationId', evaluationId || '');
            fd.append('faceMatchResult', faceMatchResult);
            if (score !== null) fd.append('faceMatchScore', score);
            fd.append('captureType', 'SessionStart');
            await api.eval.saveCapturedPhoto(fd);
          } catch {
            /* non-blocking */
          }
        },
        'image/jpeg',
        0.85
      );

      if (success) {
        stopStream();
        autoProceedTimerRef.current = window.setTimeout(() => {
          autoProceedTimerRef.current = null;
          onDone?.({ faceMatchResult: 'Matched', score });
        }, 900);
      }
    } catch (err) {
      setCapturedUrl(null);
      setCamStatus('granted');
      setVerifyPhase(null);
      setVerifyMessage('');
      setVerifyErrorTitle('');
      setVerifyHint('');
      setLastScore(null);
      setResultKind(null);
      setSetupError(err?.message || 'Could not read the camera frame. Try Capture & verify again.');
    }
  };

  const handleRetake = () => {
    if (autoProceedTimerRef.current != null) {
      clearTimeout(autoProceedTimerRef.current);
      autoProceedTimerRef.current = null;
    }
    setCapturedUrl(null);
    setVerifyPhase(null);
    setVerifyMessage('');
    setVerifyErrorTitle('');
    setVerifyHint('');
    setLastScore(null);
    setResultKind(null);
    setCamStatus(streamRef.current ? 'granted' : 'denied');
  };

  const handleProceedManual = () => {
    if (autoProceedTimerRef.current != null) {
      clearTimeout(autoProceedTimerRef.current);
      autoProceedTimerRef.current = null;
    }
    onDone?.({ faceMatchResult: 'Matched', score: lastScore });
  };

  const changeCamera = async () => {
    stopStream();
    setCapturedUrl(null);
    setVerifyPhase(null);
    setVerifyMessage('');
    setVerifyErrorTitle('');
    setVerifyHint('');
    setLastScore(null);
    setResultKind(null);
    await openCameraStream(selectedDeviceId);
  };

  const permCardClass =
    `sc-perm-card sc-cam-card-full ${camStatus === 'denied' ? 'perm-denied' : camStatus === 'granted' || camStatus === 'captured' ? 'perm-granted' : ''} ${camStatus === 'captured' && verifyPhase === 'error' ? 'sc-perm-card-verify-error' : ''}`.trim();

  return (
    <div className="fv-overlay">
      <div className="fv-modal fv-modal-session-layout">
        <div className="fv-header">
          <div className="fv-header-icon">
            <Camera size={20} />
          </div>
          <div>
            <h2 className="fv-title">Identity Verification</h2>
            <p className="fv-subtitle">Required before evaluation begins</p>
          </div>
        </div>

        <div className="sc-body fv-identity-body">
          <div className="sc-section-label">
            <Camera size={14} /> Camera, identity &amp; location
          </div>
          <p className="sc-session-hint">
            Your live photo must <strong>match your administrator-registered profile photo</strong> before you can
            continue.
          </p>

          <div className="sc-location-row" role="status" aria-live="polite">
            <Navigation size={14} className="sc-location-row__icon" aria-hidden />
            {(geoStatus === 'idle' || geoStatus === 'requesting') && (
              <span className="sc-location-row__status">
                <Loader2 size={14} className="spin" aria-hidden />
                Acquiring location…
              </span>
            )}
            {geoStatus === 'granted' && geoCoords && (
              <>
                <span className="sc-location-row__coord">
                  <span className="sc-location-row__coord-label">Latitude</span> <strong>{geoCoords.latitude.toFixed(6)}°</strong>
                </span>
                <span className="sc-location-row__sep" aria-hidden>
                  ·
                </span>
                <span className="sc-location-row__coord">
                  <span className="sc-location-row__coord-label">Longitude</span>{' '}
                  <strong>{geoCoords.longitude.toFixed(6)}°</strong>
                </span>
                <span className="sc-location-row__ok">
                  <CheckCircle2 size={13} aria-hidden /> Location recorded
                </span>
              </>
            )}
            {geoStatus === 'denied' && (
              <span className="sc-location-row__status sc-location-row__status--muted">
                <AlertTriangle size={14} aria-hidden />
                Location unavailable
                <small className="sc-location-row__optional">Optional — you can still proceed</small>
                <button type="button" className="btn btn-sm btn-secondary sc-location-row__retry" onClick={requestGeolocation}>
                  <RefreshCw size={12} /> Retry
                </button>
              </span>
            )}
          </div>

          {setupError ? (
            <div className="sc-error" role="alert">
              {setupError}
            </div>
          ) : null}

          <div className="sc-step0-camera-wrap">
            <div className={permCardClass}>
              <div className="sc-perm-header">
                <Camera size={14} />
                <span>Camera Access</span>
                <span className="sc-perm-badge">
                  {camStatus === 'requesting' && <Loader2 size={13} className="spin" />}
                  {camStatus === 'denied' && <XCircle size={13} />}
                  {camStatus === 'captured' && verifyPhase === 'error' && <AlertTriangle size={13} />}
                  {verifyPhase === 'verifying' && <Loader2 size={13} className="spin" />}
                  {(camStatus === 'granted' && !capturedUrl) || (camStatus === 'captured' && verifyPhase === 'success') ? (
                    <CheckCircle2 size={13} />
                  ) : null}
                </span>
              </div>

              <div className="sc-cam-area">
                {camStatus === 'granted' && !capturedUrl && (
                  <video ref={videoRef} className="sc-video" autoPlay muted playsInline />
                )}
                {capturedUrl && (
                  <img src={capturedUrl} className="sc-video" alt="Verification capture" />
                )}
                {camStatus === 'denied' && (
                  <div className="sc-cam-placeholder">
                    <XCircle size={26} />
                    <span>{setupError || 'Camera access denied'}</span>
                    <button type="button" className="btn btn-sm btn-secondary" onClick={openCameraStream}>
                      <RefreshCw size={12} /> Retry
                    </button>
                  </div>
                )}
                {camStatus === 'requesting' && (
                  <div className="sc-cam-placeholder">
                    <Loader2 size={26} className="spin" />
                    <span>Starting camera…</span>
                  </div>
                )}
              </div>

              <canvas ref={canvasRef} style={{ display: 'none' }} />

              <div className="sc-cam-footer">
                {devices.length > 1 && camStatus === 'granted' && !capturedUrl && (
                  <div className="fv-identity-cam-pick">
                    <label className="fv-label" htmlFor="fv-identity-cam">
                      Camera
                    </label>
                    <select
                      id="fv-identity-cam"
                      className="fv-select fv-select-inline"
                      value={selectedDeviceId}
                      onChange={(e) => setSelectedDeviceId(e.target.value)}
                      aria-label="Choose camera"
                    >
                      {devices.map((d, i) => (
                        <option key={d.deviceId} value={d.deviceId}>
                          {d.label?.trim() || `Camera ${i + 1}`}
                        </option>
                      ))}
                    </select>
                    <button type="button" className="btn btn-sm btn-secondary" onClick={changeCamera}>
                      <RefreshCw size={12} /> Apply
                    </button>
                  </div>
                )}

                {canCapture && (
                  <button type="button" className="btn btn-primary btn-sm" onClick={handleCaptureAndVerify} disabled={verifyBusy}>
                    <Camera size={13} /> Capture &amp; verify
                  </button>
                )}

                {camStatus === 'captured' && (
                  <div className={`sc-cam-captured-bar${verifyPhase === 'error' ? ' sc-cam-captured-bar--error' : ''}`}>
                    {verifyPhase === 'verifying' ? (
                      <span className="sc-uploading">
                        <Loader2 size={13} className="spin" /> {verifyMessage || 'Working…'}
                      </span>
                    ) : verifyPhase === 'success' ? (
                      <span className="sc-ok">
                        <ShieldCheck size={13} /> {verifyMessage || 'Verified'}
                      </span>
                    ) : verifyPhase === 'error' ? (
                      <div className="sc-verify-error-panel" role="alert">
                        <div className="sc-verify-error-panel__title">
                          <AlertTriangle size={16} strokeWidth={2.2} aria-hidden />
                          <span>{verifyErrorTitle || 'Verification issue'}</span>
                        </div>
                        <p className="sc-verify-error-panel__msg">{verifyMessage}</p>
                        {verifyAction !== 'block' && verifyHint ? (
                          <p className="sc-verify-error-panel__hint">{verifyHint}</p>
                        ) : null}
                        {verifyAction === 'block' ? (
                          <p className="sc-verify-error-panel__hint">You cannot continue. Contact your administrator.</p>
                        ) : null}
                      </div>
                    ) : null}
                    {verifyPhase !== 'verifying' && verifyPhase !== 'success' ? (
                      <>
                        {resultKind === 'noprofile' ? (
                          <button type="button" className="btn btn-sm btn-secondary sc-cam-retake" onClick={() => onBlock?.()}>
                            <X size={12} /> Go to dashboard
                          </button>
                        ) : resultKind === 'mismatch' && verifyAction === 'block' ? (
                          <button type="button" className="btn btn-sm btn-secondary sc-cam-retake" onClick={() => onBlock?.()}>
                            <X size={12} /> Go back
                          </button>
                        ) : (
                          <button type="button" className="btn btn-sm btn-secondary sc-cam-retake" onClick={handleRetake} disabled={verifyBusy}>
                            <RefreshCw size={12} /> Retake
                          </button>
                        )}
                      </>
                    ) : verifyPhase === 'success' ? (
                      <button type="button" className="btn btn-sm btn-secondary sc-cam-retake" onClick={handleProceedManual}>
                        <CheckCircle2 size={12} /> Continue now
                      </button>
                    ) : null}
                  </div>
                )}

                {lastScore != null && verifyPhase === 'success' && (
                  <div className="fv-inline-score">
                    <div className="fv-score-track">
                      <div
                        className="fv-score-fill"
                        style={{
                          width: `${Math.min(100, Math.max(0, lastScore))}%`,
                          background:
                            lastScore >= 70 ? '#16a34a' : lastScore >= 50 ? '#f59e0b' : '#ef4444',
                        }}
                      />
                    </div>
                    <span className="fv-score-label">{lastScore}% similarity</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {showPermHint && (
            <p className="sc-perm-hint">
              <AlertTriangle size={12} /> Capture and pass identity verification before proceeding
            </p>
          )}
          {camStatus === 'captured' && verifyPhase === 'error' && (
            <p className="sc-perm-hint sc-perm-hint-error">
              <AlertTriangle size={12} /> Fix the issue above or use Retake, then try again
            </p>
          )}
          {verifyPhase === 'success' && (
            <p className="sc-perm-hint" style={{ borderColor: '#86efac', background: '#f0fdf4', color: '#166534' }}>
              <CheckCircle2 size={12} /> Continuing to evaluation automatically…
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
