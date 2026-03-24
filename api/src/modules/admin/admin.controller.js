import { ok, created } from '../../utils/response.js';

export default class AdminController {
  constructor(service) {
    this.service = service;
  }

  // Users
  listUsers = async (req, res, next) => {
    try {
      const { limit = 50, offset = 0, status, roleId } = req.query;
      const result = await this.service.listUsers({ limit, offset, status, roleId });
      return ok(res, result);
    } catch (err) { next(err); }
  };

  getUser = async (req, res, next) => {
    try {
      const result = await this.service.getUser(parseInt(req.params.userId));
      return ok(res, result);
    } catch (err) { next(err); }
  };

  createUser = async (req, res, next) => {
    try {
      const profilePhotoPath = req.file ? req.file.path.replace(/\\/g, '/') : null;
      const result = await this.service.createUser({ ...req.body, profilePhotoPath }, req.user.username);
      return created(res, result, 'User created successfully');
    } catch (err) { next(err); }
  };

  uploadUserPhoto = async (req, res, next) => {
    try {
      if (!req.file) throw Object.assign(new Error('No photo uploaded'), { statusCode: 400 });
      const photoPath = req.file.path.replace(/\\/g, '/');
      const result = await this.service.updateUserPhoto(parseInt(req.params.userId), photoPath, req.user.username);
      return ok(res, { photoPath }, result.message);
    } catch (err) { next(err); }
  };

  getUserPhoto = async (req, res, next) => {
    try {
      const photoPath = await this.service.getUserPhoto(parseInt(req.params.userId));
      return ok(res, { photoPath });
    } catch (err) { next(err); }
  };

  updateUser = async (req, res, next) => {
    try {
      const result = await this.service.updateUser(parseInt(req.params.userId), req.body, req.user.username);
      return ok(res, result, result.message);
    } catch (err) { next(err); }
  };

  deleteUser = async (req, res, next) => {
    try {
      const result = await this.service.deleteUser(parseInt(req.params.userId), req.user.username);
      return ok(res, result, result.message);
    } catch (err) { next(err); }
  };

  resetPassword = async (req, res, next) => {
    try {
      const result = await this.service.resetUserPassword(parseInt(req.params.userId), req.user.username);
      return ok(res, result, result.message);
    } catch (err) { next(err); }
  };

  listRoles = async (req, res, next) => {
    try { return ok(res, await this.service.listRoles()); } catch (err) { next(err); }
  };

  listLocations = async (req, res, next) => {
    try { return ok(res, await this.service.listLocations()); } catch (err) { next(err); }
  };

  // Settings
  getSettings = async (req, res, next) => {
    try { return ok(res, await this.service.getSettings()); } catch (err) { next(err); }
  };

  updateSettings = async (req, res, next) => {
    try {
      const result = await this.service.updateSettings(req.body, req.user.username);
      return ok(res, result, result.message);
    } catch (err) { next(err); }
  };

  testSmtp = async (req, res, next) => {
    try {
      const result = await this.service.testSmtpConnection(req.body);
      return ok(res, result, result.message);
    } catch (err) { next(err); }
  };

  // Question Paper Config
  qpaperExams = async (req, res, next) => {
    try { return ok(res, await this.service.listExamsForQPaper()); } catch (err) { next(err); }
  };

  qpaperPapers = async (req, res, next) => {
    try {
      return ok(res, await this.service.listPapersForQPaper(parseInt(req.params.examId)));
    } catch (err) { next(err); }
  };

  qpaperConfig = async (req, res, next) => {
    try {
      return ok(res, await this.service.getQPaperConfig(parseInt(req.params.paperId)));
    } catch (err) { next(err); }
  };

  qpaperUpload = async (req, res, next) => {
    try {
      if (!req.file) throw Object.assign(new Error('No file uploaded'), { statusCode: 400 });
      const filePath = req.file.path.replace(/\\/g, '/');
      const result = await this.service.uploadQuestionPaperFile(
        parseInt(req.params.paperId), filePath, req.user.userId
      );
      return ok(res, result, 'Question paper uploaded');
    } catch (err) { next(err); }
  };

  qpaperSaveSets = async (req, res, next) => {
    try {
      const result = await this.service.saveSets(
        parseInt(req.params.paperId), req.body, req.user.userId
      );
      return ok(res, result, 'Question sets saved');
    } catch (err) { next(err); }
  };

  qpaperExtract = async (req, res, next) => {
    try {
      const result = await this.service.extractQPaperStructure(parseInt(req.params.paperId));
      return ok(res, result, 'Extraction complete');
    } catch (err) { next(err); }
  };

  // Templates
  listTemplates = async (req, res, next) => {
    try { return ok(res, await this.service.listTemplates()); } catch (err) { next(err); }
  };

  getTemplate = async (req, res, next) => {
    try { return ok(res, await this.service.getTemplate(req.params.type)); } catch (err) { next(err); }
  };

  updateTemplate = async (req, res, next) => {
    try {
      const result = await this.service.updateTemplate(req.params.type, req.body, req.user.username);
      return ok(res, result, result.message);
    } catch (err) { next(err); }
  };
}
