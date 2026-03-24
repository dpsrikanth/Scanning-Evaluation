/**
 * CountdownCapture — shows a 3-2-1 countdown overlay then captures a webcam frame
 * and posts it to /api/eval/captured-photo for random monitoring checks.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { Camera } from 'lucide-react';
import * as faceapi from 'face-api.js';
import { api } from '../services/api';
import './CountdownCapture.css';

const MODEL_URL = '/face-api-models';
let modelsLoaded = false;

async function ensureModels() {
  if (modelsLoaded) return;
  await Promise.all([
    faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
    faceapi.nets.faceLandmark68TinyNet.loadFromUri(MODEL_URL),
    faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
  ]);
  modelsLoaded = true;
}

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
      await ensureModels();

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

      // Compare with profile photo
      const user = JSON.parse(localStorage.getItem('user') || '{}');
      let faceMatchResult = 'Skipped';
      let score = null;

      try {
        const [capturedDetection, profileDesc] = await Promise.all([
          faceapi.detectSingleFace(canvas, new faceapi.TinyFaceDetectorOptions())
            .withFaceLandmarks(true).withFaceDescriptor(),
          (async () => {
            if (!user.profilePhotoPath) return null;
            const img = new Image(); img.crossOrigin = 'anonymous';
            img.src = api.files.profilePhotoUrl(user.profilePhotoPath);
            await new Promise(r => { img.onload = r; img.onerror = () => r(null); });
            return faceapi.detectSingleFace(img, new faceapi.TinyFaceDetectorOptions())
              .withFaceLandmarks(true).withFaceDescriptor().then(d => d?.descriptor || null);
          })(),
        ]);

        if (capturedDetection?.descriptor && profileDesc) {
          const dist = faceapi.euclideanDistance(capturedDetection.descriptor, profileDesc);
          score = Math.max(0, Math.round((1 - dist) * 100));
          faceMatchResult = score >= 50 ? 'Matched' : 'Mismatch';
        } else if (capturedDetection?.descriptor) {
          faceMatchResult = 'Skipped';
        } else {
          faceMatchResult = 'Error';
        }
      } catch { faceMatchResult = 'Error'; }

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
