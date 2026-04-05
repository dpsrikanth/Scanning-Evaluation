import logger from '../utils/logger.js';
import { getEvalDb } from '../config/database.js';

// Key action types that should be persisted to ActivityLogs in the DB
const DB_LOG_ACTIONS = new Set([
  'POST /api/auth/login',
  'POST /api/auth/logout',
  'POST /api/auth/session-context',
  'POST /api/auth/change-password',
  'POST /api/auth/reset-password',
  'POST /api/admin/users',
  'PUT /api/admin/users',
  'DELETE /api/admin/users',
  'POST /api/admin/users/reset-password',
  'PUT /api/admin/settings',
  'POST /api/eval/evaluation',
  'POST /api/eval/captured-photo',
  'POST /api/eval/evaluation/submit',
  'POST /api/scan/booklet',
  'POST /api/scan/booklet/upload',
  'POST /api/scan/booklet-upload',
]);
/** Paths whose successful responses are not written to ActivityLogs (high volume, low audit value). */
const AUDIT_SKIP_PATH_PREFIXES = [
  '/api/auth/heartbeat',
  '/api/auth/active-session',
  '/api/auth/client-activity',
];

function routeKey(req) {
  // Normalise parameterised paths: /api/users/123 → /api/users
  const base = req.originalUrl.split('?')[0].replace(/\/\d+/g, '').replace(/\/$/, '');
  return `${req.method} ${base}`;
}

function shouldPersistAudit(req, statusCode) {
  const path = (req.originalUrl || '').split('?')[0];
  if (AUDIT_SKIP_PATH_PREFIXES.some((p) => path.startsWith(p))) return false;
  if (statusCode >= 400) return true;
  const m = req.method;
  if (m === 'POST' || m === 'PUT' || m === 'PATCH' || m === 'DELETE') return true;
  if (req.user?.userId) return true;
  return false;
}

export function clientIp(req) {
  const xf = req.headers['x-forwarded-for'];
  if (typeof xf === 'string' && xf.length) return xf.split(',')[0].trim().slice(0, 45);
  return req.ip?.slice(0, 45) || null;
}

async function persistToDb(userId, moduleName, actionType, req, statusCode, durationMs) {
  try {
    const db = getEvalDb();
    const sessionId = req.sessionId || null;
    const ipAddress = clientIp(req);
    const deviceInfo = req.headers['user-agent']?.slice(0, 500) || null;

    await db.execute(
      `INSERT INTO ActivityLogs
         (UserID, ModuleName, ActionType, ReferenceID, NewValues, IPAddress, DeviceInfo, SessionID)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId || null,
        moduleName,
        actionType,
        null,
        JSON.stringify({
          method: req.method,
          url: req.originalUrl,
          status: statusCode,
          durationMs,
          referer: req.headers.referer?.slice(0, 500) || null,
          forwardedFor: typeof req.headers['x-forwarded-for'] === 'string'
            ? req.headers['x-forwarded-for'].slice(0, 200)
            : null,
        }),
        ipAddress,
        deviceInfo,
        sessionId,
      ]
    );
  } catch {
    // DB logging must never crash the request
  }
}

/** Persist API errors (central error handler — not all routes use res.json). */
export function persistAuditError(req, statusCode, message) {
  (async () => {
    try {
      const db = getEvalDb();
      const path = (req.originalUrl || '').split('?')[0];
      const actionType = `${req.method} ${path}`.slice(0, 200);
      await db.execute(
        `INSERT INTO ActivityLogs
           (UserID, ModuleName, ActionType, ReferenceID, NewValues, IPAddress, DeviceInfo, SessionID)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          req.user?.userId ?? null,
          'api_error',
          actionType,
          null,
          JSON.stringify({
            status: statusCode,
            message: String(message || '').slice(0, 2000),
            method: req.method,
            url: req.originalUrl,
            referer: req.headers.referer?.slice(0, 500) || null,
          }),
          clientIp(req),
          req.headers['user-agent']?.slice(0, 500) || null,
          req.sessionId || null,
        ]
      );
    } catch {
      /* non-blocking */
    }
  })();
}

export default function auditLog(moduleName) {
  return (req, res, next) => {
    const start = Date.now();
    const originalJson = res.json.bind(res);

    res.json = (body) => {
      const duration = Date.now() - start;
      const userId = req.user?.userId || null;
      const action = routeKey(req);

      // Always log to file
      logger.info('API_REQUEST', {
        module: moduleName,
        method: req.method,
        url: req.originalUrl,
        userId,
        ip: req.ip,
        status: res.statusCode,
        duration: `${duration}ms`,
      });

      if (shouldPersistAudit(req, res.statusCode)) {
        persistToDb(userId, moduleName, action, req, res.statusCode, duration).catch(() => {});
      }

      return originalJson(body);
    };

    next();
  };
}

// Standalone helper for controllers to log specific domain events
export async function logActivity(req, { moduleName, actionType, referenceId, oldValues, newValues }) {
  const userId = req.user?.userId || null;
  try {
    const db = getEvalDb();
    await db.execute(
      `INSERT INTO ActivityLogs
         (UserID, ModuleName, ActionType, ReferenceID, OldValues, NewValues, IPAddress, DeviceInfo, SessionID)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId, moduleName, actionType,
        referenceId ?? null,
        oldValues ? JSON.stringify(oldValues) : null,
        newValues ? JSON.stringify(newValues) : null,
        clientIp(req),
        req.headers['user-agent']?.slice(0, 500) || null,
        req.sessionId || null,
      ]
    );
  } catch {
    /* non-blocking */
  }
}
