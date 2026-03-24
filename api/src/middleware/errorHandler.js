import logger from '../utils/logger.js';

export default function errorHandler(err, req, res, _next) {
  const status = err.statusCode || err.status || 500;
  const requestId = req.requestId || '-';

  const logMeta = {
    requestId,
    status,
    method: req.method,
    url: req.originalUrl,
    ip: req.ip,
    userId: req.user?.userId,
    stack: status === 500 ? err.stack : undefined,
  };

  if (status >= 500) {
    logger.error(err.message, logMeta);
  } else {
    logger.warn(err.message, logMeta);
  }

  // Surface real error for scan, scanadmin, headeval, and eval routes (operators and evaluators need actionable messages).
  const isScanRoute = req.originalUrl?.includes('/api/scan/');
  const isScanAdminRoute = req.originalUrl?.includes('/api/scanadmin/');
  const isHeadEvalRoute = req.originalUrl?.includes('/api/headeval/');
  const isEvalRoute = req.originalUrl?.includes('/api/eval/');
  const message =
    status === 500 && process.env.NODE_ENV === 'production' && !isScanRoute && !isScanAdminRoute && !isHeadEvalRoute && !isEvalRoute
      ? 'Internal server error'
      : err.message;

  res.status(status).json({
    success: false,
    message,
    requestId,
  });
}
