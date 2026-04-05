import { ok, created } from '../../utils/response.js';

export default class AuthController {
  constructor(authService) {
    this.service = authService;
  }

  login = async (req, res, next) => {
    try {
      const { username, password, source } = req.body;
      const result = await this.service.login(username, password, source);
      return ok(res, result, 'Login successful');
    } catch (err) {
      next(err);
    }
  };

  profile = async (req, res, next) => {
    try {
      const result = await this.service.getProfile(req.user.userId);
      return ok(res, result);
    } catch (err) {
      next(err);
    }
  };

  changePassword = async (req, res, next) => {
    try {
      const { currentPassword, newPassword } = req.body;
      const result = await this.service.changePassword(
        req.user.userId, currentPassword, newPassword
      );
      return ok(res, result, result.message);
    } catch (err) {
      next(err);
    }
  };

  forgotPassword = async (req, res, next) => {
    try {
      const { email } = req.body;
      const result = await this.service.forgotPassword(email);
      return ok(res, result, result.message);
    } catch (err) {
      next(err);
    }
  };

  verifyOtp = async (req, res, next) => {
    try {
      const { userId, otpCode } = req.body;
      const result = await this.service.verifyOtp(userId, otpCode);
      return ok(res, result, 'OTP verified');
    } catch (err) {
      next(err);
    }
  };

  resetPassword = async (req, res, next) => {
    try {
      const { resetToken, newPassword } = req.body;
      const result = await this.service.resetPassword(resetToken, newPassword);
      return ok(res, result, result.message);
    } catch (err) {
      next(err);
    }
  };

  sessionContext = async (req, res, next) => {
    try {
      const { locationId, workstationId, sessionPeriod, examId, paperId,
              geoLatitude, geoLongitude, loginPhotoPath } = req.body;
      const result = await this.service.createSession(
        req.user.userId,
        { locationId, workstationId, sessionPeriod, examId, paperId,
          geoLatitude, geoLongitude, loginPhotoPath },
        req
      );
      return ok(res, result, 'Session context saved');
    } catch (err) { next(err); }
  };

  uploadLoginPhoto = async (req, res, next) => {
    try {
      if (!req.file) throw Object.assign(new Error('No photo uploaded'), { statusCode: 400 });
      const result = this.service.saveLoginPhoto(req.file.path);
      return ok(res, result, 'Login photo saved');
    } catch (err) { next(err); }
  };

  heartbeat = async (req, res, next) => {
    try {
      const { sessionId } = req.body;
      const result = await this.service.heartbeat(req.user.userId, sessionId);
      return ok(res, result);
    } catch (err) { next(err); }
  };

  logout = async (req, res, next) => {
    try {
      const result = await this.service.logout(req.user.userId, req);
      return ok(res, result, result.message);
    } catch (err) { next(err); }
  };

  activeSession = async (req, res, next) => {
    try {
      const session = await this.service.getActiveSession(req.user.userId);
      return ok(res, session || {});
    } catch (err) { next(err); }
  };

  workstations = async (req, res, next) => {
    try {
      const { locationId } = req.query;
      const rows = await this.service.getWorkstations(locationId);
      return ok(res, rows);
    } catch (err) { next(err); }
  };

  assignedExamPaper = async (req, res, next) => {
    try {
      const data = await this.service.getAssignedExamPaper(req.user.userId);
      return ok(res, data || {});
    } catch (err) { next(err); }
  };

  activityLogs = async (req, res, next) => {
    try {
      const { userId, moduleName, actionType, dateFrom, dateTo, limit, offset } = req.query;
      const result = await this.service.getActivityLogs({ userId, moduleName, actionType, dateFrom, dateTo, limit, offset });
      return ok(res, result);
    } catch (err) { next(err); }
  };

  clientActivity = async (req, res, next) => {
    try {
      await this.service.recordClientActivity(req.user.userId, req.body || {}, req);
      return ok(res, { ok: true });
    } catch (err) { next(err); }
  };
}
