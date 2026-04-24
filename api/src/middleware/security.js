import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import hpp from 'hpp';
import cors from 'cors';
import env from '../config/env.js';
import logger from '../utils/logger.js';

// -----------------------------------------------------------
// CORS — allow configured client origin + /api/docs
// -----------------------------------------------------------
export const corsMiddleware = cors({
  origin: (origin, callback) => {
    const allowed = [...(env.clientUrls || [env.clientUrl]), env.swaggerUiOrigin].filter(Boolean);
    // Allow server-to-server calls (no origin header) and all configured origins
    if (!origin || allowed.includes(origin)) return callback(null, true);
    logger.warn(`CORS blocked: ${origin}`);
    callback(new Error(`CORS policy: origin ${origin} not allowed`));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Workstation', 'X-Request-ID'],
  credentials: true,
  maxAge: 600,
});

// -----------------------------------------------------------
// Helmet — HTTP security headers
// -----------------------------------------------------------
export const helmetMiddleware = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      // Swagger UI needs unsafe-eval; Try-it-out needs connect-src to the API
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
      workerSrc: ["'self'", 'blob:'],
      fontSrc: ["'self'", 'data:'],
    },
  },
  crossOriginResourcePolicy: { policy: 'cross-origin' },  // allow images served from API
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
});

// -----------------------------------------------------------
// Rate limiters — different thresholds per route type
// -----------------------------------------------------------

// Global fallback: generous ceiling
export const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 2000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests, please slow down.' },
});

// Auth endpoints — strict (prevents brute-force)
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { success: false, message: 'Too many login attempts. Try again in 15 minutes.' },
  keyGenerator: (req) => req.ip,
  handler: (req, res, _next, options) => {
    logger.warn('Auth rate limit hit', { ip: req.ip, url: req.originalUrl });
    res.status(429).json(options.message);
  },
});

// Scan endpoints — moderate (scanner app should not burst)
export const scanLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Scan rate limit exceeded.' },
});

// Eval endpoints — generous (evaluators browse many booklets)
export const evalLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Evaluation rate limit exceeded.' },
});

// -----------------------------------------------------------
// HPP — HTTP Parameter Pollution protection
// -----------------------------------------------------------
export const hppMiddleware = hpp();

// -----------------------------------------------------------
// Request ID — attach unique ID to every request for tracing
// -----------------------------------------------------------
export function requestId(req, res, next) {
  const id = req.headers['x-request-id'] || crypto.randomUUID();
  req.requestId = id;
  res.setHeader('X-Request-ID', id);
  next();
}

// -----------------------------------------------------------
// Input sanitisation — strip null bytes, trim strings
// -----------------------------------------------------------
/** Do not trim: passwords, OTP, JWT-style tokens, or other secrets (trim can break logins and hide failed updates). */
function shouldTrimStringKey(key) {
  return !/password|otpCode|resetToken|token$/i.test(key);
}

export function sanitizeInput(req, _res, next) {
  const clean = (obj) => {
    if (!obj || typeof obj !== 'object') return;
    for (const key of Object.keys(obj)) {
      if (typeof obj[key] === 'string') {
        const s = obj[key].replace(/\0/g, '');
        obj[key] = shouldTrimStringKey(key) ? s.trim() : s;
      } else if (typeof obj[key] === 'object') {
        clean(obj[key]);
      }
    }
  };
  clean(req.body);
  clean(req.query);
  next();
}
