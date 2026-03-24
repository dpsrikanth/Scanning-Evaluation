import { ok, created } from '../../utils/response.js';

export default class ScanAdminController {
  constructor(service) {
    this.service = service;
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  #audit(req) {
    return {
      createdBy: req.user.username,
      modifiedBy: req.user.username,
      deletedBy: req.user.username,
      createdFromIP: req.ip,
      modifiedFromIP: req.ip,
      createdFromSystem: req.headers['x-workstation'] || 'web',
      modifiedFromSystem: req.headers['x-workstation'] || 'web',
    };
  }

  // ── Exams ─────────────────────────────────────────────────────────────────

  listExams = async (req, res, next) => {
    try { return ok(res, await this.service.listExams()); }
    catch (err) { next(err); }
  };

  getExam = async (req, res, next) => {
    try { return ok(res, await this.service.getExam(req.params.examId)); }
    catch (err) { next(err); }
  };

  createExam = async (req, res, next) => {
    try {
      const data = { ...req.body, ...this.#audit(req) };
      return created(res, await this.service.createExam(data), 'Exam created');
    } catch (err) { next(err); }
  };

  updateExam = async (req, res, next) => {
    try {
      const data = { ...req.body, ...this.#audit(req) };
      return ok(res, await this.service.updateExam(req.params.examId, data));
    } catch (err) { next(err); }
  };

  deleteExam = async (req, res, next) => {
    try {
      await this.service.deleteExam(req.params.examId, req.user.username);
      return ok(res, null, 'Exam deleted');
    } catch (err) { next(err); }
  };

  // ── Papers ────────────────────────────────────────────────────────────────

  listPapers = async (req, res, next) => {
    try { return ok(res, await this.service.listPapers(req.query.examId)); }
    catch (err) { next(err); }
  };

  getPaper = async (req, res, next) => {
    try { return ok(res, await this.service.getPaper(req.params.paperId)); }
    catch (err) { next(err); }
  };

  createPaper = async (req, res, next) => {
    try {
      const data = { ...req.body, ...this.#audit(req) };
      return created(res, await this.service.createPaper(data), 'Paper created');
    } catch (err) { next(err); }
  };

  updatePaper = async (req, res, next) => {
    try {
      const data = { ...req.body, ...this.#audit(req) };
      return ok(res, await this.service.updatePaper(req.params.paperId, data));
    } catch (err) { next(err); }
  };

  deletePaper = async (req, res, next) => {
    try {
      await this.service.deletePaper(req.params.paperId, req.user.username);
      return ok(res, null, 'Paper deleted');
    } catch (err) { next(err); }
  };

  // ── Workstations ──────────────────────────────────────────────────────────

  listWorkstations = async (req, res, next) => {
    try { return ok(res, await this.service.listWorkstations(req.query.locationId)); }
    catch (err) { next(err); }
  };

  getWorkstation = async (req, res, next) => {
    try { return ok(res, await this.service.getWorkstation(req.params.workstationId)); }
    catch (err) { next(err); }
  };

  createWorkstation = async (req, res, next) => {
    try {
      const data = { ...req.body, ...this.#audit(req) };
      return created(res, await this.service.createWorkstation(data), 'Workstation created');
    } catch (err) { next(err); }
  };

  updateWorkstation = async (req, res, next) => {
    try {
      const data = { ...req.body, ...this.#audit(req) };
      return ok(res, await this.service.updateWorkstation(req.params.workstationId, data));
    } catch (err) { next(err); }
  };

  deleteWorkstation = async (req, res, next) => {
    try {
      await this.service.deleteWorkstation(req.params.workstationId, req.user.username);
      return ok(res, null, 'Workstation deleted');
    } catch (err) { next(err); }
  };

  // ── Scan Templates ────────────────────────────────────────────────────────

  listTemplates = async (req, res, next) => {
    try { return ok(res, await this.service.listTemplates()); }
    catch (err) { next(err); }
  };

  getTemplate = async (req, res, next) => {
    try { return ok(res, await this.service.getTemplate(req.params.templateId)); }
    catch (err) { next(err); }
  };

  createTemplate = async (req, res, next) => {
    try {
      const data = { ...req.body, ...this.#audit(req) };
      return created(res, await this.service.createTemplate(data), 'Template created');
    } catch (err) { next(err); }
  };

  updateTemplate = async (req, res, next) => {
    try {
      const data = { ...req.body, ...this.#audit(req) };
      return ok(res, await this.service.updateTemplate(req.params.templateId, data));
    } catch (err) { next(err); }
  };

  deleteTemplate = async (req, res, next) => {
    try {
      await this.service.deleteTemplate(req.params.templateId, req.user.username);
      return ok(res, null, 'Template deleted');
    } catch (err) { next(err); }
  };

  // ── Printer Profiles ──────────────────────────────────────────────────────

  listPrinterProfiles = async (req, res, next) => {
    try { return ok(res, await this.service.listPrinterProfiles()); }
    catch (err) { next(err); }
  };

  getPrinterProfile = async (req, res, next) => {
    try { return ok(res, await this.service.getPrinterProfile(req.params.profileId)); }
    catch (err) { next(err); }
  };

  createPrinterProfile = async (req, res, next) => {
    try {
      const data = { ...req.body, ...this.#audit(req) };
      return created(res, await this.service.createPrinterProfile(data), 'Printer profile created');
    } catch (err) { next(err); }
  };

  updatePrinterProfile = async (req, res, next) => {
    try {
      const data = { ...req.body, ...this.#audit(req) };
      return ok(res, await this.service.updatePrinterProfile(req.params.profileId, data));
    } catch (err) { next(err); }
  };

  deletePrinterProfile = async (req, res, next) => {
    try {
      await this.service.deletePrinterProfile(req.params.profileId, req.user.username);
      return ok(res, null, 'Printer profile deleted');
    } catch (err) { next(err); }
  };

  listScannedBooklets = async (req, res, next) => {
    try {
      const { examId, paperId, locationId, dateFrom, dateTo, limit, offset } = req.query;
      const result = await this.service.listScannedBooklets({
        examId: examId ? parseInt(examId, 10) : undefined,
        paperId: paperId ? parseInt(paperId, 10) : undefined,
        locationId: locationId ? parseInt(locationId, 10) : undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        limit: limit ? parseInt(limit, 10) : 500,
        offset: offset ? parseInt(offset, 10) : 0,
      });
      return ok(res, result);
    } catch (err) { next(err); }
  };

  // ── Helpers ───────────────────────────────────────────────────────────────

  listLocations = async (req, res, next) => {
    try { return ok(res, await this.service.listLocations()); }
    catch (err) { next(err); }
  };

  updateScanQcSettings = async (req, res, next) => {
    try {
      const row = await this.service.updateScanQcSettings(req.body || {});
      return ok(res, row, 'QC settings updated');
    } catch (err) {
      next(err);
    }
  };

  listScanUsers = async (req, res, next) => {
    try { return ok(res, await this.service.listScanUsers()); }
    catch (err) { next(err); }
  };

  listScanRolesForUserManagement = async (req, res, next) => {
    try { return ok(res, await this.service.listScanRolesForUserManagement()); }
    catch (err) { next(err); }
  };

  createScanUser = async (req, res, next) => {
    try {
      const row = await this.service.createScanUser(req.body || {}, this.#audit(req));
      return created(res, row, 'Scan user created');
    } catch (err) { next(err); }
  };

  updateScanUser = async (req, res, next) => {
    try {
      const row = await this.service.updateScanUser(req.params.userId, req.body || {}, this.#audit(req));
      return ok(res, row, 'Scan user updated');
    } catch (err) { next(err); }
  };

  deleteScanUser = async (req, res, next) => {
    try {
      await this.service.deleteScanUser(req.params.userId, this.#audit(req));
      return ok(res, null, 'Scan user deleted');
    } catch (err) { next(err); }
  };

  // ── Scan output paths ─────────────────────────────────────────────────────

  listOutputPaths = async (req, res, next) => {
    try { return ok(res, await this.service.listOutputPaths()); }
    catch (err) { next(err); }
  };

  createOutputPath = async (req, res, next) => {
    try {
      const item = await this.service.createOutputPath(req.body);
      return created(res, item, 'Output path added');
    } catch (err) { next(err); }
  };

  updateOutputPath = async (req, res, next) => {
    try {
      await this.service.updateOutputPath(req.params.pathId, req.body);
      return ok(res, await this.service.listOutputPaths());
    } catch (err) { next(err); }
  };

  setActiveOutputPath = async (req, res, next) => {
    try {
      await this.service.setActiveOutputPath(req.params.pathId);
      return ok(res, await this.service.listOutputPaths(), 'Active path updated');
    } catch (err) { next(err); }
  };

  deleteOutputPath = async (req, res, next) => {
    try {
      await this.service.deleteOutputPath(req.params.pathId);
      return ok(res, null, 'Output path removed');
    } catch (err) { next(err); }
  };
}
