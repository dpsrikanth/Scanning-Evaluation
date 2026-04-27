import { ok, created } from '../../utils/response.js';

export default class HeadEvalController {
  constructor(service) {
    this.service = service;
  }

  getLot = async (req, res, next) => {
    try {
      const { paperId, examId, limit, offset } = req.query;
      const result = await this.service.getLot({ paperId, examId, limit, offset });
      return ok(res, result);
    } catch (err) { next(err); }
  };

  getEvaluators = async (req, res, next) => {
    try {
      const { paperId } = req.query;
      const result = await this.service.getEvaluators({ paperId });
      return ok(res, result);
    } catch (err) { next(err); }
  };

  assign = async (req, res, next) => {
    try {
      const { bookletIds, toUserId, allocationType } = req.body;
      const result = await this.service.assignBooklets(
        { bookletIds, toUserId, allocationType },
        req.user.username
      );
      return created(res, result, 'Booklets assigned');
    } catch (err) { next(err); }
  };

  unassign = async (req, res, next) => {
    try {
      const result = await this.service.unassign(
        parseInt(req.params.allocationId),
        req.user.username
      );
      return ok(res, result, 'Allocation removed');
    } catch (err) { next(err); }
  };

  summary = async (req, res, next) => {
    try {
      const result = await this.service.getAllocationSummary(req.params.paperId);
      return ok(res, result);
    } catch (err) { next(err); }
  };

  getExams = async (req, res, next) => {
    try { return ok(res, await this.service.getExams()); } catch (err) { next(err); }
  };

  getPapers = async (req, res, next) => {
    try {
      return ok(res, await this.service.getPapers(req.params.examId));
    } catch (err) { next(err); }
  };

  getAllocationSettings = async (req, res, next) => {
    try {
      return ok(res, await this.service.getAllocationSettings());
    } catch (err) { next(err); }
  };

  setAllocationSettings = async (req, res, next) => {
    try {
      const result = await this.service.setAllocationSettings(req.body || {});
      return ok(res, result, 'Allocation settings updated');
    } catch (err) { next(err); }
  };

  autoAssign = async (req, res, next) => {
    try {
      const paperId = req.body?.paperId ?? req.query?.paperId;
      const limit = req.body?.limit ?? req.query?.limit;
      const result = await this.service.autoAssignForPaper(
        { paperId, limit },
        req.user.username
      );
      return ok(res, result, 'Auto-assign completed');
    } catch (err) { next(err); }
  };

  getEvaluatorPapers = async (req, res, next) => {
    try {
      const userId = parseInt(req.params.userId, 10);
      const rows = await this.service.getEvaluatorPapers(userId);
      return ok(res, rows);
    } catch (err) { next(err); }
  };

  setEvaluatorPapers = async (req, res, next) => {
    try {
      const userId = parseInt(req.params.userId, 10);
      const paperIds = req.body?.paperIds;
      const result = await this.service.setEvaluatorPapers(userId, paperIds, req.user.username);
      return ok(res, result, 'Evaluator paper scope updated');
    } catch (err) { next(err); }
  };
}
