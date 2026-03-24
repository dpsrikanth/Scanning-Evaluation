import winston from 'winston';
import 'winston-daily-rotate-file';
import { existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const logDir = join(__dirname, '../../logs');
if (!existsSync(logDir)) mkdirSync(logDir, { recursive: true });

const { combine, timestamp, errors, json, colorize, printf } = winston.format;

// Console format: human-readable in dev
const consoleFormat = combine(
  colorize(),
  printf(({ timestamp: ts, level, message, ...meta }) => {
    const extra = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    return `${ts} [${level}] ${message}${extra}`;
  })
);

// File format: structured JSON
const fileFormat = combine(timestamp(), errors({ stack: true }), json());

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: combine(timestamp(), errors({ stack: true }), json()),
  transports: [
    // Console
    new winston.transports.Console({ format: consoleFormat }),

    // All logs: daily rotation, keep 14 days, max 20MB per file
    new winston.transports.DailyRotateFile({
      filename: join(logDir, 'combined-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '20m',
      maxFiles: '14d',
      format: fileFormat,
    }),

    // Error logs only: daily rotation, keep 30 days
    new winston.transports.DailyRotateFile({
      level: 'error',
      filename: join(logDir, 'error-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '20m',
      maxFiles: '30d',
      format: fileFormat,
    }),

    // Audit/access logs: separate file for compliance
    new winston.transports.DailyRotateFile({
      level: 'http',
      filename: join(logDir, 'access-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '50m',
      maxFiles: '90d',
      format: fileFormat,
    }),

    // Upload-specific logs: every booklet save attempt with full detail
    // Filter: only emit entries that have module === 'upload'
    new winston.transports.DailyRotateFile({
      filename: join(logDir, 'upload-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '20m',
      maxFiles: '30d',
      format: combine(
        timestamp(),
        errors({ stack: true }),
        winston.format((info) => info.module === 'upload' ? info : false)(),
        json()
      ),
    }),
  ],
  // Never crash on uncaught log errors
  exitOnError: false,
});

// Uncaught exception / rejection handlers
logger.exceptions.handle(
  new winston.transports.DailyRotateFile({
    filename: join(logDir, 'exceptions-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    maxFiles: '30d',
    format: fileFormat,
  })
);

logger.rejections.handle(
  new winston.transports.DailyRotateFile({
    filename: join(logDir, 'rejections-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    maxFiles: '30d',
    format: fileFormat,
  })
);

export default logger;
