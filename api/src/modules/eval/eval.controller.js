import { ok, created } from '../../utils/response.js';

export default class EvalController {
  constructor(evalService) {
    this.service = evalService;
  }

  dashboardSummary = async (req, res, next) => {
    try {
      const result = await this.service.getDashboardSummary(req.user.userId);
      return ok(res, result);
    } catch (err) {
      next(err);
    }
  };

  pendingBooklets = async (req, res, next) => {
    try {
      const limit = parseInt(req.query.limit) || 50;
      const offset = parseInt(req.query.offset) || 0;
      const result = await this.service.getPendingBooklets(req.user.userId, limit, offset);
      return ok(res, result);
    } catch (err) {
      next(err);
    }
  };

  openBooklet = async (req, res, next) => {
    try {
      const result = await this.service.openBooklet(req.params.bookletId);
      return ok(res, result);
    } catch (err) {
      next(err);
    }
  };

  startEvaluation = async (req, res, next) => {
    try {
      const { bookletId, type } = req.body;
      const result = await this.service.startEvaluation(
        bookletId, req.user.userId, type, req.user.username
      );
      return created(res, result);
    } catch (err) {
      next(err);
    }
  };

  getMarks = async (req, res, next) => {
    try {
      const result = await this.service.getMarks(parseInt(req.params.evaluationId));
      return ok(res, result);
    } catch (err) { next(err); }
  };

  saveMarks = async (req, res, next) => {
    try {
      const { evaluationId } = req.params;
      const { details } = req.body;
      const result = await this.service.saveMarks(parseInt(evaluationId), details);
      return ok(res, result);
    } catch (err) {
      next(err);
    }
  };

  submitEvaluation = async (req, res, next) => {
    try {
      const { evaluationId } = req.params;
      const { totalMarks, totalPages, paperId } = req.body;
      const result = await this.service.submitEvaluation(
        parseInt(evaluationId), totalMarks, totalPages, paperId || null
      );
      return ok(res, result, 'Evaluation submitted');
    } catch (err) {
      next(err);
    }
  };

  logPageVisit = async (req, res, next) => {
    try {
      const { evaluationId } = req.params;
      const { pageNumber, durationSeconds, zoomLevel, annotationsMade } = req.body;
      await this.service.logPageVisit(
        parseInt(evaluationId), pageNumber, durationSeconds, zoomLevel, annotationsMade
      );
      return ok(res, null, 'Page visit logged');
    } catch (err) {
      next(err);
    }
  };

  saveAnnotations = async (req, res, next) => {
    try {
      const { evaluationId } = req.params;
      const { pageNumber, annotations } = req.body;
      const result = await this.service.saveAnnotations(
        parseInt(evaluationId), pageNumber, annotations || []
      );
      return ok(res, result, 'Annotations saved');
    } catch (err) {
      next(err);
    }
  };

  getAnnotations = async (req, res, next) => {
    try {
      const result = await this.service.getAnnotations(parseInt(req.params.evaluationId));
      return ok(res, result);
    } catch (err) {
      next(err);
    }
  };

  getBookletSharedAnnotations = async (req, res, next) => {
    try {
      const result = await this.service.getBookletSharedAnnotations(req.params.bookletId);
      return ok(res, result);
    } catch (err) {
      next(err);
    }
  };

  saveBookletSharedAnnotations = async (req, res, next) => {
    try {
      const { pageNumber, items } = req.body || {};
      const result = await this.service.saveBookletSharedAnnotationsPage(
        req.params.bookletId,
        pageNumber,
        items,
        req.user.userId
      );
      return ok(res, result, 'Shared booklet stamps saved');
    } catch (err) {
      next(err);
    }
  };

  saveCapturedPhoto = async (req, res, next) => {
    try {
      if (!req.file) throw Object.assign(new Error('No photo uploaded'), { statusCode: 400 });
      const photoPath = req.file.path.replace(/\\/g, '/');
      const { evaluationId, faceMatchResult, faceMatchScore, captureType } = req.body;
      const result = await this.service.saveCapturedPhoto({
        userId: req.user.userId,
        evaluationId: evaluationId ? parseInt(evaluationId) : null,
        photoPath,
        faceMatchScore: faceMatchScore != null ? parseFloat(faceMatchScore) : null,
        faceMatchResult: faceMatchResult || 'Skipped',
        captureType: captureType || 'RandomCapture',
        ipAddress: req.ip,
      });
      return ok(res, result, 'Photo captured');
    } catch (err) { next(err); }
  };

  timeReport = async (req, res, next) => {
    try {
      const result = await this.service.getTimeReport(req.query, req.user);
      return ok(res, result);
    } catch (err) { next(err); }
  };

  monitoringSettings = async (req, res, next) => {
    try {
      const result = await this.service.getMonitoringSettings();
      return ok(res, result);
    } catch (err) { next(err); }
  };
}
