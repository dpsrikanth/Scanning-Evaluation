import jwt from 'jsonwebtoken';
import env from '../config/env.js';
import { unauthorized, forbidden } from '../utils/response.js';
import logger from '../utils/logger.js';

export function authenticate(req, res, next) {
  // Accept token from Authorization header OR ?token query param (for browser file links)
  let token = null;
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) {
    token = header.slice(7);
  } else if (req.query?.token) {
    token = req.query.token;
  }

  if (!token) {
    return unauthorized(res, 'Missing or invalid Authorization header');
  }

  try {
    req.user = jwt.verify(token, env.jwt.secret);
    next();
  } catch (err) {
    logger.warn('JWT verification failed', {
      requestId: req.requestId,
      ip: req.ip,
      error: err.message,
    });
    return unauthorized(res, err.name === 'TokenExpiredError' ? 'Token has expired' : 'Invalid token');
  }
}

export function authorize(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) return unauthorized(res);
    if (allowedRoles.length && !allowedRoles.includes(req.user.roleName)) {
      logger.warn('Authorization denied', {
        requestId: req.requestId,
        userId: req.user.userId,
        role: req.user.roleName,
        required: allowedRoles,
        url: req.originalUrl,
      });
      return forbidden(res, 'Insufficient permissions');
    }
    next();
  };
}
