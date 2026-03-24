/**
 * FaceVerifyModal — identity check before evaluation; user picks camera then verifies face.
 */
import { useState, useEffect, useRef } from 'react';
import { Camera, ShieldCheck, ShieldAlert, AlertTriangle, Loader2, X, CheckCircle2 } from 'lucide-react';
import * as faceapi from 'face-api.js';
import { api } from '../services/api';
import './FaceVerifyModal.css';

const MODEL_URL = '/face-api-models';
let modelsLoaded = false;

async function loadModels() {
  if (modelsLoaded) return;
  await Promise.all([
    faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
    faceapi.nets.faceLandmark68TinyNet.loadFromUri(MODEL_URL),
    faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
  ]);
  modelsLoaded = true;
}

async function getDescriptor(imgElement) {
  const detection = await faceapi
    .detectSingleFace(imgElement, new faceapi.TinyFaceDetectorOptions())
    .withFaceLandmarks(true)
    .withFaceDescriptor();
  return detection?.descriptor || null;
}

async function waitForVideoFrame(videoEl) {
  if (!videoEl) return;
  if (videoEl.videoWidth >= 2 && videoEl.videoHeight >= 2) return;
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      videoEl.removeEventListener('loadeddata', tick);
      videoEl.removeEventListener('playing', tick);
      reject(new Error('Video not ready'));
    }, 8000);
    const tick = () => {
      if (videoEl.videoWidth >= 2 && videoEl.videoHeight >= 2) {
        clearTimeout(t);
        videoEl.removeEventListener('loadeddata', tick);
        videoEl.removeEventListener('playing', tick);
        resolve();
      }
    };
    videoEl.addEventListener('loadeddata', tick);
    videoEl.addEventListener('playing', tick);
    tick();
  });
}

async function captureWebcamFrame(videoEl) {
  await waitForVideoFrame(videoEl);
  const canvas = document.createElement('canvas');
  const w = videoEl.videoWidth || 640;
  const h = videoEl.videoHeight || 480;
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d').drawImage(videoEl, 0, 0);
  return canvas;
}

export default function FaceVerifyModal({ evaluationId, verifyAction = 'warn_continue', onDone, onBlock }) {
  const [phase, setPhase] = useState('init');
  const [result, setResult] = useState(null);
  const [message, setMessage] = useState('');
  const [devices, setDevices] = useState([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState('');
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  const stopStream = () => streamRef.current?.getTracks().forEach((t) => t.stop());

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setMessage('Loading face recognition models…');
        await loadModels();
        if (!mounted) return;

        setMessage('Requesting camera permission so we can list your devices…');
        try {
          const tmp = await navigator.mediaDevices.getUserMedia({ audio: false, video: true });
          tmp.getTracks().forEach((t) => t.stop());
        } catch {
          /* labels may be hidden */
        }

        if (!mounted) return;
        const inputs = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput');
        setDevices(inputs);
        if (inputs.length === 0) {
          setPhase('error');
          setMessage('No camera was detected. Connect a webcam or allow camera access, then reload.');
          return;
        }
        setSelectedDeviceId((prev) => {
          if (prev && inputs.some((d) => d.deviceId === prev)) return prev;
          try {
            const stored = localStorage.getItem('evalPreferredCameraId');
            if (stored && inputs.some((d) => d.deviceId === stored)) return stored;
          } catch {
            /* ignore */
          }
          return inputs[0].deviceId;
        });
        setPhase('pick_camera');
        setMessage('Choose which camera to use, then click “Start camera”.');
      } catch (err) {
        if (!mounted) return;
        setPhase('error');
        setMessage(`Setup failed: ${err.message || 'Unknown error'}`);
      }
    })();
    return () => {
      mounted = false;
      stopStream();
    };
  }, []);

  const startCamera = async () => {
    setPhase('starting');
    setMessage('Starting camera…');
    try {
      const candidates = selectedDeviceId
        ? [
            {
              audio: false,
              video: {
                deviceId: { ideal: selectedDeviceId },
                width: { ideal: 1280 },
                height: { ideal: 720 },
              },
            },
            { audio: false, video: { deviceId: { ideal: selectedDeviceId } } },
          ]
        : [
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
      if (!stream) {
        throw new Error('Could not open any camera with these settings');
      }
      streamRef.current = stream;
      if (videoRef.current) {
        const v = videoRef.current;
        v.srcObject = stream;
        v.muted = true;
        v.playsInline = true;
        v.setAttribute('playsinline', '');
        v.setAttribute('webkit-playsinline', '');
        await new Promise((r) => {
          v.onloadedmetadata = () => r();
        });
        await v.play().catch(() => {});
        await waitForVideoFrame(v);
      }
      setPhase('ready');
      setMessage('Position your face in the frame and click Verify.');
      if (selectedDeviceId) {
        try {
          localStorage.setItem('evalPreferredCameraId', selectedDeviceId);
        } catch {
          /* ignore */
        }
      }
    } catch (err) {
      setPhase('pick_camera');
      setMessage(`Could not open that camera: ${err.message}. Try another device.`);
    }
  };

  const handleVerify = async () => {
    setPhase('verifying');
    setMessage('Capturing and verifying…');
    try {
      const canvas = await captureWebcamFrame(videoRef.current);
      const captured = await getDescriptor(canvas);

      let faceMatchResult = 'Skipped';
      let score = null;

      if (!captured) {
        faceMatchResult = 'Error';
        setMessage('No face detected in camera. Please ensure good lighting.');
      } else {
        const user = JSON.parse(localStorage.getItem('user') || '{}');
        const photoPath = user.profilePhotoPath;

        if (photoPath) {
          try {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.src = api.files.profilePhotoUrl(photoPath);
            await new Promise((res, rej) => {
              img.onload = res;
              img.onerror = rej;
            });
            const profileDesc = await getDescriptor(img);
            if (profileDesc) {
              const distance = faceapi.euclideanDistance(captured, profileDesc);
              score = Math.max(0, Math.round((1 - distance) * 100));
              faceMatchResult = score >= 50 ? 'Matched' : 'Mismatch';
            } else {
              faceMatchResult = 'Skipped';
            }
          } catch {
            faceMatchResult = 'Skipped';
          }
        } else {
          faceMatchResult = 'Skipped';
        }
      }

      canvas.toBlob(
        async (blob) => {
          try {
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

      setResult({ faceMatchResult, score });
      setPhase('result');
      stopStream();
    } catch (err) {
      setPhase('error');
      setMessage(`Verification failed: ${err.message}`);
      stopStream();
    }
  };

  const handleProceed = () => {
    if (result?.faceMatchResult === 'Mismatch' && verifyAction === 'block') {
      onBlock?.();
    } else {
      onDone?.({ faceMatchResult: result?.faceMatchResult, score: result?.score });
    }
  };

  const handleSkip = () => {
    stopStream();
    onDone?.({ faceMatchResult: 'Skipped', score: null });
  };

  return (
    <div className="fv-overlay">
      <div className="fv-modal fv-modal-wide">
        <div className="fv-header">
          <div className="fv-header-icon">
            <Camera size={20} />
          </div>
          <div>
            <h2 className="fv-title">Identity Verification</h2>
            <p className="fv-subtitle">Required before evaluation begins</p>
          </div>
        </div>

        <div className="fv-body">
          {phase === 'init' && (
            <div className="fv-video-overlay-inline">
              <Loader2 size={32} className="spin" />
            </div>
          )}

          {phase === 'pick_camera' && (
            <div className="fv-camera-pick">
              <label className="fv-label" htmlFor="fv-cam-select">
                Camera
              </label>
              <select
                id="fv-cam-select"
                className="fv-select"
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
              <button type="button" className="btn btn-primary fv-start-cam" onClick={startCamera} disabled={!selectedDeviceId}>
                <Camera size={14} /> Start camera
              </button>
            </div>
          )}

          {phase === 'starting' && (
            <div className="fv-video-overlay-inline">
              <Loader2 size={32} className="spin" />
            </div>
          )}

          {(phase === 'ready' || phase === 'verifying') && (
            <div className="fv-video-wrap">
              <video
                key={selectedDeviceId || 'default'}
                ref={videoRef}
                className="fv-video"
                muted
                playsInline
                autoPlay
              />
              {phase === 'verifying' && (
                <div className="fv-video-overlay scanning">
                  <div className="fv-scan-line" />
                </div>
              )}
            </div>
          )}

          {phase === 'result' && result && (
            <div
              className={`fv-result ${result.faceMatchResult === 'Matched' ? 'matched' : result.faceMatchResult === 'Mismatch' ? 'mismatch' : 'skipped'}`}
            >
              {result.faceMatchResult === 'Matched' && <CheckCircle2 size={48} />}
              {result.faceMatchResult === 'Mismatch' && <ShieldAlert size={48} />}
              {result.faceMatchResult === 'Skipped' && <ShieldCheck size={48} />}
              <h3 className="fv-result-title">
                {result.faceMatchResult === 'Matched' && 'Identity Verified'}
                {result.faceMatchResult === 'Mismatch' && 'Face Mismatch Detected'}
                {result.faceMatchResult === 'Skipped' && 'Verification Skipped'}
              </h3>
              {result.score !== null && (
                <div className="fv-score-bar">
                  <div className="fv-score-track">
                    <div
                      className="fv-score-fill"
                      style={{
                        width: `${result.score}%`,
                        background:
                          result.score >= 70 ? '#16a34a' : result.score >= 50 ? '#f59e0b' : '#ef4444',
                      }}
                    />
                  </div>
                  <span className="fv-score-label">{result.score}% similarity</span>
                </div>
              )}
              {result.faceMatchResult === 'Mismatch' && verifyAction !== 'block' && (
                <p className="fv-warn-text">
                  <AlertTriangle size={14} /> This session has been flagged for review. You may continue.
                </p>
              )}
              {result.faceMatchResult === 'Mismatch' && verifyAction === 'block' && (
                <p className="fv-block-text">Access denied. Contact your administrator.</p>
              )}
            </div>
          )}

          {phase === 'error' && (
            <div className="fv-error-state">
              <ShieldAlert size={40} />
              <p>{message}</p>
            </div>
          )}

          {phase !== 'result' && phase !== 'error' && <p className="fv-message">{message}</p>}

          <div className="fv-actions">
            {phase === 'ready' && (
              <>
                <button type="button" className="btn btn-primary" onClick={handleVerify}>
                  <Camera size={14} /> Verify Identity
                </button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={handleSkip}>
                  Skip
                </button>
              </>
            )}
            {phase === 'result' && (
              <>
                {!(result.faceMatchResult === 'Mismatch' && verifyAction === 'block') && (
                  <button type="button" className="btn btn-primary" onClick={handleProceed}>
                    <CheckCircle2 size={14} /> Proceed to Evaluation
                  </button>
                )}
                {result.faceMatchResult === 'Mismatch' && verifyAction === 'block' && (
                  <button type="button" className="btn btn-secondary" onClick={() => (window.location.href = '/')}>
                    <X size={14} /> Go Back
                  </button>
                )}
              </>
            )}
            {phase === 'error' && (
              <button type="button" className="btn btn-secondary" onClick={handleSkip}>
                Skip Verification
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
