import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { api } from '../services/api';

function browserContext() {
  if (typeof window === 'undefined') return {};
  return {
    userAgent: navigator.userAgent?.slice(0, 500) || '',
    language: navigator.language || '',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || '',
    screen: {
      w: window.screen?.width,
      h: window.screen?.height,
      dpr: window.devicePixelRatio,
    },
    referrer: document.referrer?.slice(0, 500) || '',
  };
}

export default function ClientAuditBeacon() {
  const location = useLocation();
  const lastSentPath = useRef('');

  const send = (kind, extra = {}) => {
    if (!localStorage.getItem('token')) return;
    const { pathOverride, ...rest } = extra;
    const path =
      pathOverride || `${location.pathname}${location.search}`;
    api.auth.postClientActivity({
      kind,
      path,
      ...browserContext(),
      ...rest,
    });
  };

  useEffect(() => {
    const path = `${location.pathname}${location.search}`;
    if (path === lastSentPath.current) return;
    lastSentPath.current = path;
    const t = setTimeout(() => send('page_view'), 350);
    return () => clearTimeout(t);
  }, [location.pathname, location.search]);

  useEffect(() => {
    const pathNow = () =>
      `${window.location.pathname}${window.location.search}`;

    const onError = (event) => {
      const msg = event?.message || 'error';
      const stack = event?.error?.stack?.slice?.(0, 4000);
      send('js_error', {
        pathOverride: pathNow(),
        message: String(msg),
        stack: stack || undefined,
      });
    };

    const onRejection = (event) => {
      const r = event?.reason;
      send('unhandled_rejection', {
        pathOverride: pathNow(),
        message: String(r?.message || r),
        stack: r?.stack?.slice?.(0, 4000),
      });
    };

    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, []);

  useEffect(() => {
    if (!localStorage.getItem('token')) return;
    if (sessionStorage.getItem('auditGeoTried')) return;
    sessionStorage.setItem('auditGeoTried', '1');
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        send('geo', {
          geo: {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracyM: pos.coords.accuracy,
          },
        });
      },
      () => {},
      { maximumAge: 600000, timeout: 8000 }
    );
  }, []);

  return null;
}
