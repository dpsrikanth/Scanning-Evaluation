import { ok, created } from '../../utils/response.js';

export default class AnswerSheetController {
  constructor(service) {
    this.service = service;
  }

  list = async (req, res, next) => {
    try { return ok(res, await this.service.list()); }
    catch (err) { next(err); }
  };

  getById = async (req, res, next) => {
    try { return ok(res, await this.service.getById(parseInt(req.params.id))); }
    catch (err) { next(err); }
  };

  create = async (req, res, next) => {
    try {
      const result = await this.service.create(req.body, req.user.username, req.ip);
      return created(res, result, 'Template created');
    } catch (err) { next(err); }
  };

  update = async (req, res, next) => {
    try {
      const result = await this.service.update(
        parseInt(req.params.id), req.body, req.user.username, req.ip
      );
      return ok(res, result, 'Template updated');
    } catch (err) { next(err); }
  };

  remove = async (req, res, next) => {
    try {
      await this.service.remove(parseInt(req.params.id), req.user.username);
      return ok(res, null, 'Template deleted');
    } catch (err) { next(err); }
  };

  listExams = async (req, res, next) => {
    try { return ok(res, await this.service.listExams()); }
    catch (err) { next(err); }
  };

  generatePdf = async (req, res, next) => {
    try {
      await this.service.generatePdf(parseInt(req.params.id), res);
    } catch (err) {
      if (!res.headersSent) next(err);
    }
  };

  uploadLogo = async (req, res, next) => {
    try {
      if (!req.file) {
        return res.status(400).json({ success: false, message: 'No file uploaded' });
      }
      return ok(res, { filename: req.file.filename, path: req.file.path });
    } catch (err) { next(err); }
  };
}
