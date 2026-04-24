/**
 * CountdownCapture — shows a 3-2-1 countdown overlay then captures a webcam frame
 * and posts it to /api/eval/captured-photo for random monitoring checks.
 * Face match uses the same server verification as evaluator login (/auth/verify-login-face).
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { Camera } from 'lucide-react';
import { api } from '../services/api';
import './CountdownCapture.css';

function waitVideoReady(video) {
  return new Promise((resolve, reject) => {
    if (!video) {
      reject(new Error('No video element'));
      return;
    }
    const cleanup = () => {
      video.removeEventListener('loadedmetadata', onMeta);
      video.removeEventListener('loadeddata', onMeta);
      clearTimeout(to);
    };
    const done = () => {
      cleanup();
      resolve();
    };
    const onMeta = () => {
      if (video.videoWidth >= 2 && video.videoHeight >= 2) done();
    };
    const to = setTimeout(() => {
      cleanup();
      reject(new Error('Video timeout'));
    }, 12000);
    if (video.videoWidth >= 2 && video.videoHeight >= 2) {
      cleanup();
      resolve();
      return;
    }
    video.addEventListener('loadedmetadata', onMeta);
    video.addEventListener('loadeddata', onMeta);
  });
}

export default function CountdownCapture({ evaluationId, onDone }) {
  const [count, setCount]     = useState(3);
  const [phase, setPhase]     = useState('countdown'); // countdown|capturing|done
  const [videoReady, setVideoReady] = useState(false);
  const videoRef  = useRef(null);
  const streamRef = useRef(null);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const saved = localStorage.getItem('evalPreferredCameraId');
        const tryConstraints = [
          saved
            ? { audio: false, video: { deviceId: { ideal: saved }, width: { ideal: 1280 }, height: { ideal: 720 } } }
            : { audio: false, video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } } },
          saved
            ? { audio: false, video: { deviceId: { ideal: saved } } }
            : { audio: false, video: { facingMode: 'user' } },
          { audio: false, video: true },
        ];
        let stream;
        for (const c of tryConstraints) {
          try {
            stream = await navigator.mediaDevices.getUserMedia(c);
            break;
          } catch {
            /* try next */
          }
        }
        if (!stream) throw new Error('No camera stream');
        if (!mounted) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const el = videoRef.current;
        el.srcObject = stream;
        el.muted = true;
        el.playsInline = true;
        el.setAttribute('playsinline', '');
        el.setAttribute('webkit-playsinline', '');
        await el.play().catch(() => {});
        await waitVideoReady(el);
        if (!mounted) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        setVideoReady(true);
      } catch {
        if (!mounted) return;
        setPhase('done');
        setTimeout(() => onDoneRef.current?.({ faceMatchResult: 'Error', score: null }), 400);
      }
    })();
    return () => {
      mounted = false;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const doCapture = useCallback(async () => {
    setPhase('capturing');
    try {
      const canvas  = document.createElement('canvas');
      const video   = videoRef.current;
      const w = video?.videoWidth  || 0;
      const h = video?.videoHeight || 0;
      if (w < 2 || h < 2) {
        try {
          await waitVideoReady(video);
        } catch {
          /* use fallback size below */
        }
      }
      const vw = video?.videoWidth  || 640;
      const vh = video?.videoHeight || 480;
      canvas.width  = vw;
      canvas.height = vh;
      canvas.getContext('2d').drawImage(video, 0, 0);
      const previewUrl = canvas.toDataURL('image/jpeg', 0.8);

      const user = JSON.parse(localStorage.getItem('user') || '{}');
      const regPath = user.profilePhotoPath || user.ProfilePhotoPath;
      let faceMatchResult = 'Skipped';
      let score = null;

      if (regPath) {
        try {
          const vr = await api.auth.verifyLoginFace({ liveImageBase64: previewUrl });
          const pct =
            vr.matchPercentage != null && Number.isFinite(Number(vr.matchPercentage))
              ? Math.round(Number(vr.matchPercentage))
              : null;
          score = pct;
          if (vr.verified) {
            faceMatchResult = 'Matched';
          } else {
            faceMatchResult = 'Mismatch';
          }
        } catch {
          faceMatchResult = 'Error';
        }
      }

      // Upload
      canvas.toBlob(async (blob) => {
        try {
          const fd = new FormData();
          fd.append('photo', blob, 'random_capture.jpg');
          fd.append('evaluationId', evaluationId || '');
          fd.append('faceMatchResult', faceMatchResult);
          if (score !== null) fd.append('faceMatchScore', score);
          fd.append('captureType', 'RandomCapture');
          await api.eval.saveCapturedPhoto(fd);
        } catch { /* non-blocking */ }
      }, 'image/jpeg', 0.8);

      streamRef.current?.getTracks().forEach(t => t.stop());
      setPhase('done');
      setTimeout(() => onDoneRef.current?.({ faceMatchResult, score }), 600);
    } catch {
      streamRef.current?.getTracks().forEach(t => t.stop());
      setPhase('done');
      setTimeout(() => onDoneRef.current?.({ faceMatchResult: 'Error', score: null }), 400);
    }
  }, [evaluationId]);

  useEffect(() => {
    if (!videoReady || phase !== 'countdown') return undefined;
    if (count <= 0) {
      void doCapture();
      return undefined;
    }
    const t = setTimeout(() => setCount((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [count, videoReady, phase, doCapture]);

  return (
    <div className="cc-overlay">
      <div className="cc-box">
        <video ref={videoRef} className="cc-video" muted playsInline />
        {phase === 'countdown' && (
          <div className="cc-count-layer">
            <Camera size={28} className="cc-cam-icon" />
            <div className="cc-number">{videoReady ? count : '…'}</div>
            <p className="cc-hint">
              {videoReady ? 'Random verification capture' : 'Starting camera…'}
            </p>
          </div>
        )}
        {phase === 'capturing' && (
          <div className="cc-count-layer flash">
            <div className="cc-flash-icon">📷</div>
          </div>
        )}
        {phase === 'done' && (
          <div className="cc-count-layer done">
            <div className="cc-done-text">✓</div>
          </div>
        )}
      </div>
    </div>
  );
}
