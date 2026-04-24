import logger from '../utils/logger.js';
import { persistAuditError } from './auditLog.js';

/**
 * MySQL2 / network errors are usually misconfiguration (no password in .env, wrong port, MySQL down).
 * Return 503 and a message that is safe to show in the API JSON body.
 */
function mapDatabaseError(err) {
  const c = err?.code;
  if (!c) return null;

  if (c === 'ER_ACCESS_DENIED_ERROR' || err.errno === 1045) {
    return {
      status: 503,
      message:
        'Database access denied. In api/.env set EVAL_DB_PASSWORD and SCAN_DB_PASSWORD to your MySQL user password, and EVAL_DB_PORT / EVAL_DB_HOST to match a running instance.',
    };
  }
  if (c === 'ECONNREFUSED' || c === 'ENOTFOUND' || c === 'ETIMEDOUT' || c === 'EAI_AGAIN') {
    return {
      status: 503,
      message:
        'Cannot connect to MySQL. Check that the server is running and that EVAL_DB_HOST and EVAL_DB_PORT in api/.env are correct (default was 3307 before local install; use 3306 for a typical Windows MySQL service).',
    };
  }
  if (c === 'PROTOCOL_CONNECTION_LOST') {
    return { status: 503, message: 'Database connection was lost. Retry, or check MySQL availability and network.' };
  }
  if (typeof c === 'string' && c.startsWith('ER_') && err.sqlMessage) {
    return { status: 500, message: err.sqlMessage };
  }
  return null;
}

export default function errorHandler(err, req, res, _next) {
  let status = err.statusCode || err.status || 500;
  let errMessage = err.message;

  const dbMapped = mapDatabaseError(err);
  if (dbMapped) {
    status = dbMapped.status;
    errMessage = dbMapped.message;
  }

  const requestId = req.requestId || '-';

  const logMeta = {
    requestId,
    status,
    method: req.method,
    url: req.originalUrl,
    ip: req.ip,
    userId: req.user?.userId,
    stack: status >= 500 ? err.stack : undefined,
  };

  if (status >= 500) {
    logger.error(err.message, logMeta);
  } else {
    logger.warn(err.message, logMeta);
  }

  // Surface real error for scan, scanadmin, headeval, eval, and auth (operators, evaluators, and login troubleshooting).
  const isScanRoute = req.originalUrl?.includes('/api/scan/');
  const isScanAdminRoute = req.originalUrl?.includes('/api/scanadmin/');
  const isHeadEvalRoute = req.originalUrl?.includes('/api/headeval/');
  const isEvalRoute = req.originalUrl?.includes('/api/eval/');
  const isAuthRoute = req.originalUrl?.includes('/api/auth');
  const message =
    status === 500 && process.env.NODE_ENV === 'production' && !isScanRoute && !isScanAdminRoute && !isHeadEvalRoute && !isEvalRoute && !isAuthRoute
      ? 'Internal server error'
      : errMessage;

  persistAuditError(req, status, err.message);

  res.status(status).json({
    success: false,
    message,
    requestId,
  });
}
