import { config } from 'dotenv';
import path from 'path';
config();

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  /** Swagger UI at /api/docs — off if DISABLE_SWAGGER=true; in production also set ENABLE_SWAGGER=true (Docker compose includes this). */
  enableSwagger:
    process.env.DISABLE_SWAGGER !== 'true' &&
    ((process.env.NODE_ENV || 'development') !== 'production' ||
      process.env.ENABLE_SWAGGER === 'true' ||
      process.env.ENABLE_SWAGGER === '1'),
  port: parseInt(process.env.PORT || '4000', 10),
  // Supports comma-separated list of allowed origins e.g. http://localhost:5173,http://localhost:8080
  clientUrls: (process.env.CLIENT_URL || 'http://localhost:5173')
    .split(',').map(u => u.trim()).filter(Boolean),
  // Keep single clientUrl for backward compat
  clientUrl: process.env.CLIENT_URL?.split(',')[0].trim() || 'http://localhost:5173',
  swaggerUiOrigin: process.env.SWAGGER_UI_ORIGIN || 'http://localhost:5173',

  scanDb: {
    host: process.env.SCAN_DB_HOST || 'localhost',
    port: parseInt(process.env.SCAN_DB_PORT || '3307', 10),
    user: process.env.SCAN_DB_USER || 'root',
    password: process.env.SCAN_DB_PASSWORD || '',
    database: process.env.SCAN_DB_NAME || 'ScanningDB',
  },

  evalDb: {
    host: process.env.EVAL_DB_HOST || 'localhost',
    port: parseInt(process.env.EVAL_DB_PORT || '3307', 10),
    user: process.env.EVAL_DB_USER || 'root',
    password: process.env.EVAL_DB_PASSWORD || '',
    database: process.env.EVAL_DB_NAME || 'EvaluationDB',
  },

  jwt: {
    secret: process.env.JWT_SECRET || 'dev-secret-change-me',
    expiresIn: process.env.JWT_EXPIRES_IN || '8h',
  },

  storage: {
    mode: process.env.STORAGE_MODE || 'local',
    // Common path in API folder for profile photos, captured photos, question papers (not scanned booklets)
    commonPath: process.env.COMMON_STORAGE_PATH || 'storage',
    getCommonPath() {
      const p = (process.env.COMMON_STORAGE_PATH || 'storage').trim();
      return path.isAbsolute(p) ? p : path.resolve(process.cwd(), p);
    },
    // Scan output: for scanned booklets only; configurable via DB (Scan_OutputPaths) or env
    scanOutputPath: process.env.SCAN_OUTPUT_PATH || 'storage/scan_output',
    getScanOutputPaths() {
      const raw = (process.env.SCAN_OUTPUT_PATH || 'storage/scan_output').trim();
      return raw.split(',').map((p) => p.trim()).filter(Boolean);
    },
  },

  logLevel: process.env.LOG_LEVEL || 'info',
};

export default env;
