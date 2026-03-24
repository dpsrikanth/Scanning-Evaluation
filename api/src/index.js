import express from 'express';
import swaggerUi from 'swagger-ui-express';
import env from './config/env.js';
import swaggerSpec from './config/swagger.js';
import { testConnections, getScanDb } from './config/database.js';
import logger from './utils/logger.js';
import errorHandler from './middleware/errorHandler.js';
import requestLogger from './middleware/requestLogger.js';
import {
  corsMiddleware,
  helmetMiddleware,
  globalLimiter,
  hppMiddleware,
  requestId,
  sanitizeInput,
} from './middleware/security.js';

import authRoutes        from './modules/auth/auth.routes.js';
import scanRoutes        from './modules/scan/scan.routes.js';
import evalRoutes        from './modules/eval/eval.routes.js';
import fileRoutes        from './modules/scan/files.routes.js';
import adminRoutes       from './modules/admin/admin.routes.js';
import headEvalRoutes    from './modules/headeval/headeval.routes.js';
import scanAdminRoutes   from './modules/scanadmin/scanadmin.routes.js';
import answerSheetRoutes from './modules/answersheet/answersheet.routes.js';

const app = express();

// ── Trust proxy (needed if behind nginx / Docker) ──────────────────────────
app.set('trust proxy', 1);

// ── Security headers ───────────────────────────────────────────────────────
app.use(helmetMiddleware);

// ── CORS ───────────────────────────────────────────────────────────────────
app.use(corsMiddleware);

// ── Request ID (tracing) ───────────────────────────────────────────────────
app.use(requestId);

// ── Body parsing ───────────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ── HTTP Parameter Pollution guard ─────────────────────────────────────────
app.use(hppMiddleware);

// ── Input sanitisation ─────────────────────────────────────────────────────
app.use(sanitizeInput);

// ── HTTP access logging ────────────────────────────────────────────────────
app.use(requestLogger);

// ── Global rate limiter (failsafe ceiling) ─────────────────────────────────
app.use(globalLimiter);

// ── Health ─────────────────────────────────────────────────────────────────
/**
 * @openapi
 * /api/health:
 *   get:
 *     tags: [Health]
 *     summary: System health check
 *     security: []
 *     responses:
 *       200:
 *         description: API is running
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, example: ok }
 *                 timestamp: { type: string, format: date-time }
 *                 env: { type: string, example: development }
 */
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), env: env.nodeEnv });
});

// ── Swagger UI (/api/docs) — see env.enableSwagger (ENABLE_SWAGGER in production / Docker)
if (env.enableSwagger) {
  app.use(
    '/api/docs',
    ...swaggerUi.serve,
    swaggerUi.setup(swaggerSpec, {
      customSiteTitle: 'Scanning & Evaluation API',
      customCss: '.swagger-ui .topbar { background-color: #1a3a6b; }',
      swaggerOptions: {
        persistAuthorization: true,
        docExpansion: 'none',
        filter: true,
        tagsSorter: 'alpha',
      },
    })
  );

  // Raw OpenAPI JSON for external tools / Postman import
  app.get('/api/docs.json', (req, res) => res.json(swaggerSpec));
  logger.info(`Swagger UI: http://localhost:${env.port}/api/docs`);
} else {
  logger.info('Swagger UI disabled (production without ENABLE_SWAGGER, or DISABLE_SWAGGER=true)');
}

// ── Application routes ─────────────────────────────────────────────────────
app.use('/api/auth',           authRoutes);
app.use('/api/scan',           scanRoutes);
app.use('/api/eval',           evalRoutes);
app.use('/api/files',          fileRoutes);
app.use('/api/admin',          adminRoutes);
app.use('/api/headeval',       headEvalRoutes);
app.use('/api/scanadmin',      scanAdminRoutes);
app.use('/api/admin/answer-sheets', answerSheetRoutes);

// ── 404 catch-all ──────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route ${req.originalUrl} not found` });
});

// ── Global error handler ───────────────────────────────────────────────────
app.use(errorHandler);

// ── Bootstrap ──────────────────────────────────────────────────────────────
async function bootstrapScanOutputDirectories() {
  try {
    const {
      ensureScanOutputDirectory,
      getActiveScanOutputPathRaw,
    } = await import('./modules/scan/scanOutputPaths.js');
    const db = getScanDb();
    try {
      const [rows] = await db.execute('SELECT PathValue FROM Scan_OutputPaths');
      for (const r of rows || []) {
        if (!r?.PathValue) continue;
        try {
          ensureScanOutputDirectory(String(r.PathValue).trim());
        } catch (e) {
          logger.warn(`Scan output path: could not create "${r.PathValue}": ${e.message}`);
        }
      }
    } catch {
      /* table may not exist */
    }
    const raw = await getActiveScanOutputPathRaw(db);
    try {
      ensureScanOutputDirectory(raw);
    } catch (e) {
      logger.warn(`Active scan output path: could not create "${raw}": ${e.message}`);
    }
  } catch (e) {
    logger.warn(`Scan output bootstrap skipped: ${e.message}`);
  }
}

async function start() {
  await testConnections();
  await bootstrapScanOutputDirectories();
  app.listen(env.port, () => {
    logger.info(`API running at http://localhost:${env.port} [${env.nodeEnv}]`);
  });
}

start();
