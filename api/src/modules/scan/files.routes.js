import { Router } from 'express';
import { resolve, join } from 'path';
import { existsSync, readdirSync, statSync } from 'fs';
import { authenticate } from '../../middleware/auth.js';
import enforceScanBookletLocationAccess from '../../middleware/scanBookletAccess.js';
import env from '../../config/env.js';
import { getScanDb } from '../../config/database.js';
import { getScanOutputPathsForReading } from './scanOutputPaths.js';
import { notFound } from '../../utils/response.js';
import { ok } from '../../utils/response.js';

const router = Router();
router.use(authenticate);

/** Detect how many page images exist in a booklet folder (page_NNN.jpg or {bookletId}_Page_NN.jpg). */
function countPageImages(dir, bookletId) {
  if (!existsSync(dir)) return { count: 0, hasPdf: false };
  const files = readdirSync(dir);
  const hasPdf = files.some((f) => f.toLowerCase() === 'booklet.pdf');
  const page3 = files.filter((f) => /^page_\d{3}\.jpg$/i.test(f)).length;
  const page2 = files.filter((f) => new RegExp(`^${escapeRe(bookletId)}_Page_\\d{2}\\.jpg$`, 'i').test(f)).length;
  const count = page3 > 0 ? page3 : page2;
  return { count, hasPdf };
}
function escapeRe(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * GET /api/files/booklet/:bookletId/availability
 * Returns whether the answer sheet files exist on the server (page images or PDF).
 * Uses configured scan output paths (DB or env).
 * Use ?debug=1 to include which paths were checked.
 */
router.get('/booklet/:bookletId/availability', enforceScanBookletLocationAccess, async (req, res) => {
  const { bookletId } = req.params;
  const debug = req.query.debug === '1' || req.query.debug === 'true';
  if (!bookletId || bookletId.includes('..') || bookletId.includes('/')) {
    return res.status(400).json({ success: true, data: { available: false, totalPages: 0, hasPdf: false, message: 'Invalid booklet ID' } });
  }
  const roots = await getScanOutputPathsForReading(getScanDb());
  const baseDirs = [];
  for (const root of roots) {
    baseDirs.push(resolve(join(root, 'booklets', bookletId)));
    baseDirs.push(resolve(join(root, bookletId)));
  }
  const checked = debug ? [] : null;
  let totalPages = 0;
  let hasPdf = false;
  for (const dir of baseDirs) {
    if (debug) checked.push({ path: dir, exists: existsSync(dir) });
    const { count, hasPdf: pdf } = countPageImages(dir, bookletId);
    if (count > 0 || pdf) {
      totalPages = count;
      hasPdf = pdf;
      const pdfOnly = hasPdf && totalPages === 0;
      return ok(res, {
        available: true,
        totalPages,
        hasPdf,
        viewMode: pdfOnly ? 'pdf' : 'pages',
        message:
          totalPages > 0
            ? `${totalPages} page image(s) available`
            : hasPdf
              ? 'PDF on server — open PDF viewer (page images were not uploaded).'
              : null,
        ...(debug && { checked }),
      });
    }
  }
  const data = {
    available: false,
    totalPages: 0,
    hasPdf: false,
    viewMode: 'none',
    message: 'Answer sheet files not found on server. Configure scan output paths in Admin or set SCAN_OUTPUT_PATH.',
    ...(debug && { checked }),
  };
  return ok(res, data);
});

/**
 * GET /api/files/booklet/:bookletId/pdf
 * Serves booklet.pdf from configured scan output paths (same roots as page images).
 */
router.get('/booklet/:bookletId/pdf', enforceScanBookletLocationAccess, async (req, res) => {
  const { bookletId } = req.params;
  if (!bookletId || bookletId.includes('..') || bookletId.includes('/') || bookletId.includes('\\')) {
    return notFound(res, 'Invalid booklet ID');
  }
  const roots = await getScanOutputPathsForReading(getScanDb());
  const candidates = [];
  for (const root of roots) {
    candidates.push(resolve(join(root, 'booklets', bookletId, 'booklet.pdf')));
    candidates.push(resolve(join(root, bookletId, 'booklet.pdf')));
  }
  for (const pdfPath of candidates) {
    if (existsSync(pdfPath) && statSync(pdfPath).isFile()) {
      res.type('application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${bookletId}_booklet.pdf"`);
      return res.sendFile(pdfPath);
    }
  }
  return notFound(res, 'Booklet PDF not found on server');
});

/**
 * @openapi
 * /api/files/page/{bookletId}/{pageNumber}:
 *   get:
 *     tags: [Files]
 *     summary: Retrieve a scanned page image
 *     description: |
 *       Serves the JPEG image for a specific page of a scanned booklet.
 *       Images are stored locally on the API server (or a shared volume in Docker).
 *       File path pattern: `{SCAN_OUTPUT_PATH}/{bookletId}/{bookletId}_Page_{NN}.jpg`
 *     parameters:
 *       - in: path
 *         name: bookletId
 *         required: true
 *         schema: { type: string }
 *         example: 110293000124
 *       - in: path
 *         name: pageNumber
 *         required: true
 *         schema: { type: integer, minimum: 1 }
 *         example: 3
 *     responses:
 *       200:
 *         description: JPEG image file
 *         content:
 *           image/jpeg:
 *             schema:
 *               type: string
 *               format: binary
 *       401:
 *         description: Unauthorised — token required
 *       404:
 *         description: Page image file not found on server
 */
router.get('/page/:bookletId/:pageNumber', enforceScanBookletLocationAccess, async (req, res) => {
  const { bookletId, pageNumber } = req.params;
  const padded2 = String(pageNumber).padStart(2, '0');
  const padded3 = String(pageNumber).padStart(3, '0');
  const roots = await getScanOutputPathsForReading(getScanDb());
  const baseDirs = [];
  for (const root of roots) {
    baseDirs.push(resolve(join(root, 'booklets', bookletId)));
    baseDirs.push(resolve(join(root, bookletId)));
  }
  const fileNames = [
    `${bookletId}_Page_${padded2}.jpg`,
    `page_${padded3}.jpg`,
  ];
  let filePath = null;
  for (const dir of baseDirs) {
    for (const name of fileNames) {
      const p = resolve(join(dir, name));
      if (existsSync(p)) {
        filePath = p;
        break;
      }
    }
    if (filePath) break;
  }
  if (!filePath) {
    return notFound(res, `Page image not found: booklet ${bookletId}, page ${pageNumber}`);
  }
  res.sendFile(filePath);
});

/**
 * Serve question paper PDF (stored in common API storage, not scan output).
 * GET /api/files/qpaper/:filename
 */
router.get('/qpaper/:filename', (req, res) => {
  const filename = req.params.filename;
  if (!filename || filename.includes('..') || filename.includes('/')) {
    return notFound(res, 'Invalid filename');
  }
  const base = env.storage?.getCommonPath?.() || resolve(process.cwd(), 'storage');
  const filePath = resolve(join(base, 'question_papers', filename));
  if (!existsSync(filePath)) {
    return notFound(res, `Question paper not found: ${filename}`);
  }
  res.type('application/pdf');
  res.sendFile(filePath);
});

export default router;
