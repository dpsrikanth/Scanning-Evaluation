import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import env from '../../config/env.js';
import { sendMail } from '../../services/mailer.js';
import logger from '../../utils/logger.js';
import { clientIp } from '../../middleware/auditLog.js';
import { getProfilePhotoDir } from '../../middleware/upload.js';

/** Resolve stored DB path (absolute or filename) to a readable profile photo file. */
function resolveProfilePhotoPath(storedPath) {
  if (!storedPath || typeof storedPath !== 'string') return null;
  const trimmed = storedPath.trim();
  if (!trimmed) return null;
  const normalized = trimmed.replace(/\//g, path.sep);
  try {
    if (fs.existsSync(normalized)) return path.resolve(normalized);
  } catch {
    /* ignore */
  }
  const base = path.basename(trimmed);
  const candidate = path.join(getProfilePhotoDir(), base);
  try {
    if (fs.existsSync(candidate)) return candidate;
  } catch {
    /* ignore */
  }
  return null;
}

/** Face-matching API may return snake_case or camelCase; numbers may arrive as strings. */
function pickFaceMatchVerified(data) {
  if (!data || typeof data !== 'object') return false;
  const sf = data.success_flag ?? data.successFlag;
  if (sf === true || sf === 1) return true;
  if (sf === false || sf === 0) return false;
  if (typeof sf === 'string') {
    const s = sf.trim().toLowerCase();
    if (s === 'true' || s === '1') return true;
    if (s === 'false' || s === '0') return false;
  }
  return Boolean(sf);
}

function pickFaceMatchPercentage(data) {
  if (!data || typeof data !== 'object') return 0;
  const raw = data.match_percentage ?? data.matchPercentage ?? data.match_percent;
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (typeof raw === 'string' && raw.trim() !== '') {
    const n = parseFloat(raw);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

/** MySQL2 row keys can vary by driver/case; never lose the hash. */
function passHashFrom(user) {
  if (!user) return null;
  return user.PasswordHash ?? user.passwordHash;
}

export default class AuthService {
  constructor(authRepository) {
    this.repo = authRepository;
  }

  // ── Login ──────────────────────────────────────────────────────────────────
  async login(username, password, source = 'eval') {
    const u = String(username ?? '').trim();
    if (!u || !password) {
      throw Object.assign(new Error('Username and password are required'), { statusCode: 400 });
    }

    let user;
    if (source === 'scan') {
      const { getScanDb } = await import('../../config/database.js');
      user = await this.repo.findScanUserByUsername(getScanDb(), u);
    } else {
      user = await this.repo.findUserByUsername(u);
    }

    if (!user) {
      throw Object.assign(new Error('Invalid credentials'), { statusCode: 401 });
    }

    if (!user.IsActive) {
      throw Object.assign(new Error('Account is deactivated'), { statusCode: 403 });
    }

    if (user.UserStatus === 'Suspended') {
      throw Object.assign(new Error('Account is suspended. Contact administrator.'), { statusCode: 403 });
    }

    // Evaluators must have a profile photo (for face verification). Block login until admin registers one.
    const roleName = user.RoleName || user.roleName;
    if (roleName === 'Evaluator' && !user.ProfilePhotoPath) {
      throw Object.assign(
        new Error('Profile photo is required to login. Please contact administrator to register your photo.'),
        { statusCode: 403 }
      );
    }

    const hash = passHashFrom(user);
    if (!hash) {
      logger.error('login: user row missing PasswordHash', { userId: user.UserID, username: user.Username });
      throw Object.assign(new Error('Invalid credentials'), { statusCode: 401 });
    }
    let valid;
    try {
      valid = await bcrypt.compare(password, hash);
    } catch (bcErr) {
      logger.error('bcrypt.compare failed; stored hash may be invalid', { userId: user.UserID, username: user.Username, err: bcErr.message });
      throw Object.assign(new Error('Invalid credentials'), { statusCode: 401 });
    }
    if (!valid) {
      throw Object.assign(new Error('Invalid credentials'), { statusCode: 401 });
    }

    const payload = {
      userId: user.UserID,
      username: user.Username,
      fullName: user.FullName,
      roleId: user.RoleID,
      roleName: user.RoleName,
      roleLevel: user.RoleHierarchyLevel,
      locationId: user.LocationID,
      source,
    };

    const token = jwt.sign(payload, env.jwt.secret, { expiresIn: env.jwt.expiresIn });

    return {
      token,
      forcePasswordChange: user.IsFirstLogin === 1,
      user: {
        userId: user.UserID,
        username: user.Username,
        fullName: user.FullName,
        email: user.Email,
        roleName: user.RoleName,
        roleLevel: user.RoleHierarchyLevel,
        locationId: user.LocationID,
        userStatus: user.UserStatus,
        profilePhotoPath: user.ProfilePhotoPath || null,
        source: source || 'eval',
      },
    };
  }

  // ── Profile ────────────────────────────────────────────────────────────────
  async getProfile(userId) {
    const user = await this.repo.findUserById(userId);
    if (!user) {
      throw Object.assign(new Error('User not found'), { statusCode: 404 });
    }
    return {
      userId: user.UserID,
      username: user.Username,
      fullName: user.FullName,
      email: user.Email,
      roleName: user.RoleName,
      locationId: user.LocationID,
      userStatus: user.UserStatus,
      profilePhotoPath: user.ProfilePhotoPath || null,
    };
  }

  // ── Change Password (authenticated) ───────────────────────────────────────
  async changePassword(userId, currentPassword, newPassword) {
    const user = await this.repo.findUserById(userId);
    if (!user) throw Object.assign(new Error('User not found'), { statusCode: 404 });

    const currentHash = passHashFrom(user);
    if (!currentHash) {
      throw Object.assign(new Error('Current password is incorrect'), { statusCode: 400 });
    }
    const valid = await bcrypt.compare(currentPassword, currentHash);
    if (!valid) throw Object.assign(new Error('Current password is incorrect'), { statusCode: 400 });

    if (newPassword.length < 8) {
      throw Object.assign(new Error('Password must be at least 8 characters'), { statusCode: 400 });
    }

    const hash = await bcrypt.hash(newPassword, 10);
    const n = await this.repo.updatePassword(userId, hash, 0);
    if (n === 0) {
      throw Object.assign(
        new Error('Password could not be saved. Try again or contact an administrator.'),
        { statusCode: 500 }
      );
    }
    const after = await this.repo.findUserById(userId);
    if (!after || !(await bcrypt.compare(newPassword, passHashFrom(after) || ''))) {
      throw Object.assign(
        new Error('Password could not be saved. Try again or contact an administrator.'),
        { statusCode: 500 }
      );
    }

    // Send notification email (non-blocking)
    if (user.Email) {
      sendMail('change_password', user.Email, {
        fullName: user.FullName,
        newPassword,
        changedAt: new Date().toLocaleString('en-IN'),
      }).catch((e) => logger.error('change_password email error', { error: e.message }));
    }

    return { message: 'Password changed successfully' };
  }

  // ── Forgot Password: generate and send OTP (email verification for password reset / first-login flow) ─────────────────
  async forgotPassword(email) {
    const user = await this.repo.findUserByEmail(email);
    // Always return success to prevent email enumeration
    if (!user || !user.IsActive) {
      return { message: 'If that email is registered, an OTP has been sent.' };
    }

    const otp = String(Math.floor(100000 + Math.random() * 900000));
    const expiry = new Date(Date.now() + 10 * 60 * 1000); // 10 min

    await this.repo.createOtp(user.UserID, otp, expiry);

    if (user.Email) {
      sendMail('otp', user.Email, {
        fullName: user.FullName,
        otpCode: otp,
        expiryMinutes: '10',
      }).catch((e) => logger.error('otp email error', { error: e.message }));
    }

    return {
      message: 'OTP sent to your registered email.',
      userId: user.UserID,
    };
  }

  // ── Verify OTP: validate code and issue short-lived reset token ─────────────────────────────────────────────────────
  async verifyOtp(userId, otpCode) {
    const token = await this.repo.findValidOtp(userId, otpCode);
    if (!token) {
      throw Object.assign(new Error('Invalid or expired OTP'), { statusCode: 400 });
    }
    await this.repo.markOtpUsed(token.TokenID);

    const resetToken = jwt.sign(
      { userId, purpose: 'password_reset' },
      env.jwt.secret,
      { expiresIn: '5m' }
    );
    return { resetToken };
  }

  // ── Session Context ────────────────────────────────────────────────────────
  async createSession(userId, { locationId, workstationId, sessionPeriod, examId, paperId,
                                geoLatitude, geoLongitude, loginPhotoPath }, req) {
    const ipAddress  = req.ip || null;
    const deviceInfo = req.headers['user-agent']?.slice(0, 500) || null;
    const sessionId  = await this.repo.createSession({
      userId, locationId, workstationId, sessionPeriod, examId, paperId, ipAddress, deviceInfo,
      geoLatitude: geoLatitude ?? null,
      geoLongitude: geoLongitude ?? null,
      loginPhotoPath: loginPhotoPath || null,
    });
    // Audit log — include geo in newValues
    await this.repo.insertActivityLog({
      userId, moduleName: 'auth', actionType: 'SESSION_START',
      referenceId: sessionId,
      newValues: { locationId, workstationId, sessionPeriod, examId, paperId, geoLatitude, geoLongitude },
      ipAddress, deviceInfo, sessionId,
    });
    return { sessionId };
  }

  // ── Login Photo Upload ─────────────────────────────────────────────────────
  saveLoginPhoto(filePath) {
    return { photoPath: filePath.replace(/\\/g, '/') };
  }

  /**
   * Compare live capture (base64) to the user's registered profile photo via the face-matching API.
   * @param {string} [method] - optional DeepFace detector override (opencv, mediapipe, …)
   */
  async verifyLoginFace(userId, liveImageBase64, method = null) {
    const raw = String(liveImageBase64 ?? '').trim();
    if (!raw) {
      throw Object.assign(new Error('liveImageBase64 is required'), { statusCode: 400 });
    }

    const baseUrl = env.faceMatching?.baseUrl;
    if (!baseUrl) {
      throw Object.assign(
        new Error('Face matching service is not configured (set FACE_MATCHING_API_URL).'),
        { statusCode: 503 }
      );
    }

    const user = await this.repo.findUserById(userId);
    if (!user) {
      throw Object.assign(new Error('User not found'), { statusCode: 404 });
    }
    const regPath = user.ProfilePhotoPath || user.profilePhotoPath;
    if (!regPath) {
      throw Object.assign(
        new Error('No registration photo on file. Contact your administrator.'),
        { statusCode: 403 }
      );
    }

    const absPhoto = resolveProfilePhotoPath(regPath);
    if (!absPhoto) {
      logger.error('verifyLoginFace: profile file missing on disk', { userId, regPath });
      throw Object.assign(
        new Error('Registration photo file is missing on the server. Contact your administrator.'),
        { statusCode: 404 }
      );
    }

    let referenceB64;
    try {
      referenceB64 = (await fs.promises.readFile(absPhoto)).toString('base64');
    } catch (e) {
      logger.error('verifyLoginFace: read profile photo failed', { userId, err: e.message });
      throw Object.assign(
        new Error('Could not read registration photo on the server.'),
        { statusCode: 500 }
      );
    }

    const url = `${baseUrl}/facematch`;
    const timeoutMs = env.faceMatching?.timeoutMs || 120000;
    const payload = {
      actual_image_base64: referenceB64,
      tobecompared_image_base64: raw,
    };
    if (method && String(method).trim()) {
      payload.method = String(method).trim();
    }

    let res;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (e) {
      logger.error('verifyLoginFace: fetch face-matching API failed', { err: e.message });
      throw Object.assign(
        new Error(
          'Face verification service is unavailable. Ensure face-matching-api is running and FACE_MATCHING_API_URL is correct.'
        ),
        { statusCode: 503 }
      );
    }

    const text = await res.text();
    let data;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      throw Object.assign(new Error('Face verification service returned an invalid response.'), {
        statusCode: 502,
      });
    }

    if (!data || typeof data !== 'object') {
      throw Object.assign(new Error('Face verification service returned an invalid response.'), {
        statusCode: 502,
      });
    }

    if (data.success === false) {
      const msg = data.message || data.error || 'Face verification failed.';
      throw Object.assign(new Error(msg), { statusCode: 502 });
    }

    const verified = pickFaceMatchVerified(data);
    const matchPercentage = pickFaceMatchPercentage(data);
    const message = data.message || (verified ? 'Faces match.' : 'Face does not match.');

    return {
      verified,
      matchPercentage,
      message,
      method: data.method || null,
      faceCountReference: data.face_count_reference ?? null,
      faceCountCompare: data.face_count_compare ?? null,
    };
  }

  async heartbeat(userId, sessionId) {
    await this.repo.updateSessionHeartbeat(sessionId, userId);
    return { ok: true };
  }

  async logout(userId, req) {
    await this.repo.closeSession(userId);
    await this.repo.insertActivityLog({
      userId, moduleName: 'auth', actionType: 'LOGOUT',
      ipAddress: req.ip, deviceInfo: req.headers['user-agent']?.slice(0, 500),
    });
    return { message: 'Logged out' };
  }

  async getActiveSession(userId) {
    return this.repo.getActiveSession(userId);
  }

  async getActivityLogs(filters) {
    return this.repo.listActivityLogs(filters);
  }

  /** Browser / SPA context: navigation, errors, optional coarse geo (user-consented). */
  async recordClientActivity(userId, body, req) {
    const kind = String(body.kind || 'event').slice(0, 64);
    const newValues = {
      kind,
      path: body.path != null ? String(body.path).slice(0, 500) : null,
      message: body.message != null ? String(body.message).slice(0, 2000) : null,
      stack: body.stack != null ? String(body.stack).slice(0, 4000) : null,
      userAgent: body.userAgent != null ? String(body.userAgent).slice(0, 500) : null,
      language: body.language != null ? String(body.language).slice(0, 64) : null,
      timezone: body.timezone != null ? String(body.timezone).slice(0, 64) : null,
      screen: body.screen && typeof body.screen === 'object' ? body.screen : null,
      geo: body.geo && typeof body.geo === 'object' ? body.geo : null,
      referrer: body.referrer != null ? String(body.referrer).slice(0, 500) : null,
    };
    await this.repo.insertActivityLog({
      userId,
      moduleName: 'web_client',
      actionType: `client:${kind}`,
      newValues,
      ipAddress: clientIp(req),
      deviceInfo: req.headers['user-agent']?.slice(0, 200),
      sessionId: req.sessionId ?? null,
    });
    return { ok: true };
  }

  async getWorkstations(locationId) {
    return this.repo.listWorkstations(locationId);
  }

  async getAssignedExamPaper(userId) {
    return this.repo.getAssignedExamPaper(userId);
  }

  // ── Reset Password (after OTP verification) ────────────────────────────────
  async resetPassword(resetToken, newPassword) {
    let payload;
    try {
      payload = jwt.verify(resetToken, env.jwt.secret);
    } catch {
      throw Object.assign(new Error('Reset token expired or invalid'), { statusCode: 400 });
    }

    if (payload.purpose !== 'password_reset') {
      throw Object.assign(new Error('Invalid reset token'), { statusCode: 400 });
    }

    if (newPassword.length < 8) {
      throw Object.assign(new Error('Password must be at least 8 characters'), { statusCode: 400 });
    }

    const hash = await bcrypt.hash(newPassword, 10);
    const n = await this.repo.updatePassword(payload.userId, hash, 0);
    if (n === 0) {
      throw Object.assign(
        new Error('Password could not be saved. Try again or contact an administrator.'),
        { statusCode: 500 }
      );
    }

    const user = await this.repo.findUserById(payload.userId);
    if (!user || !(await bcrypt.compare(newPassword, passHashFrom(user) || ''))) {
      throw Object.assign(
        new Error('Password could not be saved. Try again or contact an administrator.'),
        { statusCode: 500 }
      );
    }
    if (user?.Email) {
      sendMail('change_password', user.Email, {
        fullName: user.FullName,
        newPassword,
        changedAt: new Date().toLocaleString('en-IN'),
      }).catch((e) => logger.error('reset_password email error', { error: e.message }));
    }

    return { message: 'Password reset successfully. You can now log in.' };
  }
}
