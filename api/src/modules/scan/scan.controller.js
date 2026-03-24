import fs from 'fs';
import path from 'path';
import { ok, created } from '../../utils/response.js';
import logger from '../../utils/logger.js';
import { syncBookletToEval } from './syncScanToEval.js';
import { getEvalDb, getScanDb } from '../../config/database.js';
import { getActiveScanOutputPath } from './scanOutputPaths.js';

export default class ScanController {
  constructor(scanService) {
    this.service = scanService;
  }

  getSettings = async (req, res, next) => {
    try {
      const locationId = req.user.locationId || req.query.locationId;
      const result = await this.service.getSettings(locationId);
      return ok(res, result);
    } catch (err) {
      next(err);
    }
  };

  lookupBarcode = async (req, res, next) => {
    try {
      const { barcodeValue } = req.params;
      const result = await this.service.lookupBarcode(barcodeValue);
      return ok(res, result);
    } catch (err) {
      next(err);
    }
  };

  getBookletInfo = async (req, res, next) => {
    try {
      const { bookletId } = req.params;
      const result = await this.service.getBookletInfo(bookletId);
      return ok(res, result);
    } catch (err) {
      next(err);
    }
  };

  /**
   * POST /api/scan/booklet — receives JSON only (booklet metadata + page records with image paths).
   * No files are saved on the server; only DB rows (Scan_Booklets, Scan_BookletPages) are written.
   * The actual scanned images/PDF remain on the scanner-desktop machine (e.g. C:\ScanOutput\booklets\<bookletId>\).
   */
  saveBooklet = async (req, res, next) => {
    const requestId = req.requestId || '-';
    const workstation = req.headers['x-workstation'] || 'unknown';
    const { booklet, pages } = req.body || {};

    // ── Upload request log ──────────────────────────────────────────────────
    logger.info('UPLOAD_REQUEST', {
      module: 'upload',
      requestId,
      workstation,
      operator: req.user?.username,
      bookletId: booklet?.bookletId,
      examId: booklet?.examId,
      paperId: booklet?.paperId,
      locationId: booklet?.locationId,
      workstationId: booklet?.workstationId,
      totalPagesExpected: booklet?.totalPagesExpected,
      totalPagesScanned: booklet?.totalPagesScanned,
      pageCount: Array.isArray(pages) ? pages.length : 0,
      scanDate: booklet?.scanDate,
      filePath: booklet?.filePath,
      ip: req.ip,
    });

    try {
      if (!booklet) {
        const e = Object.assign(new Error('Request body must contain a "booklet" object'), { statusCode: 400 });
        logger.warn('UPLOAD_REJECTED', { module: 'upload', requestId, reason: 'missing booklet object' });
        return next(e);
      }

      // Fallback: if the desktop sent locationId=0 (no workstation assigned),
      // use the operator's own locationId from the JWT so the upload still works.
      if (!booklet.locationId && req.user.locationId) {
        booklet.locationId = req.user.locationId;
        logger.info('UPLOAD_LOCATION_FALLBACK', {
          module: 'upload',
          requestId,
          bookletId: booklet.bookletId,
          fallbackLocationId: req.user.locationId,
          reason: 'booklet.locationId was 0/missing — using operator locationId from JWT',
        });
      }

      booklet.createdBy         = req.user.username;
      booklet.createdFromIP     = req.ip;
      booklet.createdFromSystem = workstation;

      const result = await this.service.saveScannedBooklet(booklet, pages || []);

      const pdfMeta = req.uploadPdfMeta || null;
      const payload = {
        ...result,
        upload: pdfMeta
          ? {
              pdfSaved: !!pdfMeta.saved,
              pdfServerPath: pdfMeta.saved ? pdfMeta.displayPath : undefined,
              pdfSkippedReason: pdfMeta.saved ? undefined : pdfMeta.reason,
            }
          : undefined,
      };

      let userMessage = 'Booklet saved successfully';
      if (pdfMeta?.saved) {
        userMessage = `Booklet saved. PDF stored on server at ${pdfMeta.displayPath}.`;
      } else if (pdfMeta && !pdfMeta.saved && pdfMeta.reason === 'no_pdf_file') {
        userMessage = 'Booklet metadata saved (no PDF file was sent in this request).';
      } else if (result.note) {
        userMessage = `${userMessage} ${result.note}`;
      }

      logger.info('UPLOAD_SUCCESS', {
        module: 'upload',
        requestId,
        bookletId: result.bookletId,
        totalPagesScanned: result.totalPagesScanned,
        validationStatus: result.validationStatus,
        note: result.note,
        pdfSaved: pdfMeta?.saved,
      });

      // Sync to EvaluationDB so the booklet appears in Admin → Assign Booklets
      await syncBookletToEval(getEvalDb(), booklet);

      return created(res, payload, userMessage);
    } catch (err) {
      logger.error('UPLOAD_FAILED', {
        module:     'upload',
        requestId,
        bookletId:  booklet?.bookletId,
        workstation,
        operator:   req.user?.username,
        error:      err.message,
        statusCode: err.statusCode || 500,
        stack:      err.stack,
      });
      next(err);
    }
  };

  /**
   * POST /api/scan/booklet/upload — multipart: booklet (JSON string), pages (JSON string), pdf (file).
   * Saves the PDF to the active scan output path then persists booklet metadata.
   */
  saveBookletWithPdf = async (req, res, next) => {
    const requestId = req.requestId || '-';
    let booklet;
    let pages;
    try {
      booklet = typeof req.body.booklet === 'string' ? JSON.parse(req.body.booklet) : req.body.booklet;
      pages = typeof req.body.pages === 'string' ? JSON.parse(req.body.pages || '[]') : (req.body.pages || []);
    } catch (e) {
      return next(Object.assign(new Error('Invalid booklet or pages JSON'), { statusCode: 400 }));
    }
    const pdfFile = req.files?.pdf?.[0] || req.file;
    if (!booklet) {
      return next(Object.assign(new Error('Request must include booklet (JSON)'), { statusCode: 400 }));
    }

    req.uploadPdfMeta = { saved: false, reason: 'no_pdf_file' };

    if (pdfFile?.buffer?.length) {
      const bookletId = booklet.bookletId || booklet.BookletId;
      if (!bookletId) {
        return next(Object.assign(new Error('bookletId is required to save PDF'), { statusCode: 400 }));
      }
      try {
        const basePath = await getActiveScanOutputPath(getScanDb(), { ensureDirectory: true });
        const dir = path.join(basePath, 'booklets', bookletId);
        fs.mkdirSync(dir, { recursive: true });
        const pdfPath = path.join(dir, 'booklet.pdf');
        fs.writeFileSync(pdfPath, pdfFile.buffer);
        const displayPath = path.join('booklets', bookletId, 'booklet.pdf');
        req.uploadPdfMeta = { saved: true, displayPath, absolutePath: pdfPath };
        logger.info('UPLOAD_PDF_SAVED', { module: 'upload', requestId, bookletId, path: pdfPath });
      } catch (err) {
        logger.error('UPLOAD_PDF_SAVE_FAILED', { module: 'upload', requestId, bookletId: booklet?.bookletId, error: err.message });
        const hint =
          'Check Admin → Scanner Admin → Scan output paths: set an active path the API can write to ' +
          '(e.g. /data/scan-output in Docker with a volume mount).';
        const msg =
          err.code === 'EACCES' || /permission/i.test(err.message)
            ? `Cannot write PDF (permission denied). ${hint}`
            : /ENOENT|not found|create directory/i.test(err.message)
              ? `Scan output folder is not available: ${err.message}. ${hint}`
              : `Failed to save PDF: ${err.message}. ${hint}`;
        return next(Object.assign(new Error(msg), { statusCode: 503 }));
      }
    }

    req.body.booklet = booklet;
    req.body.pages = pages;
    return this.saveBooklet(req, res, next);
  };

  getProductivity = async (req, res, next) => {
    try {
      const locationId = req.user.locationId || req.query.locationId;
      const scanDate = req.query.date || new Date().toISOString().split('T')[0];
      const result = await this.service.getProductivity(locationId, scanDate);
      return ok(res, result);
    } catch (err) {
      next(err);
    }
  };

  getBookletList = async (req, res, next) => {
    try {
      const locationId = req.user.locationId || req.query.locationId;
      const scanDate = req.query.date || new Date().toISOString().split('T')[0];
      const result = await this.service.getBookletList(locationId, scanDate);
      return ok(res, result);
    } catch (err) {
      next(err);
    }
  };

  getMyWorkstation = async (req, res, next) => {
    try {
      const result = await this.service.getMyWorkstation(req.user.username);
      return ok(res, result);
    } catch (err) {
      next(err);
    }
  };

  getTemplates = async (req, res, next) => {
    try {
      const result = await this.service.getTemplates();
      return ok(res, result);
    } catch (err) {
      next(err);
    }
  };

  getPrinterProfiles = async (req, res, next) => {
    try {
      const result = await this.service.getPrinterProfiles();
      return ok(res, result);
    } catch (err) {
      next(err);
    }
  };
}
