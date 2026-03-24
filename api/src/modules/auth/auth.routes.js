import { Router } from 'express';
import AuthRepository from './auth.repository.js';
import AuthService from './auth.service.js';
import AuthController from './auth.controller.js';
import { getEvalDb } from '../../config/database.js';
import { authenticate } from '../../middleware/auth.js';
import { validateBody } from '../../middleware/validate.js';
import auditLog from '../../middleware/auditLog.js';
import { authLimiter } from '../../middleware/security.js';
import { uploadCapturedPhoto } from '../../middleware/upload.js';

const router = Router();
const repo = new AuthRepository(getEvalDb());
const service = new AuthService(repo);
const controller = new AuthController(service);

/**
 * @openapi
 * /api/auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: Login and obtain a JWT
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/LoginRequest'
 *     responses:
 *       200:
 *         description: Login successful — returns JWT and user details
 *       401:
 *         description: Invalid credentials
 *       429:
 *         description: Too many login attempts
 */
router.post(
  '/login',
  authLimiter,
  auditLog('auth'),
  validateBody({
    username: { required: true, type: 'string', minLength: 1 },
    password: { required: true, type: 'string', minLength: 1 },
  }),
  controller.login
);

/**
 * @openapi
 * /api/auth/profile:
 *   get:
 *     tags: [Auth]
 *     summary: Get current user profile
 *     responses:
 *       200:
 *         description: User profile
 *       401:
 *         description: Unauthorised
 */
router.get('/profile', auditLog('auth'), authenticate, controller.profile);

/**
 * @openapi
 * /api/auth/change-password:
 *   post:
 *     tags: [Auth]
 *     summary: Change password (authenticated user)
 *     description: Verifies current password then sets new password. Sends notification email.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [currentPassword, newPassword]
 *             properties:
 *               currentPassword: { type: string }
 *               newPassword: { type: string, minLength: 8 }
 *     responses:
 *       200:
 *         description: Password changed
 *       400:
 *         description: Current password incorrect or new password too short
 */
router.post(
  '/change-password',
  authenticate,
  validateBody({
    currentPassword: { required: true, type: 'string', minLength: 1 },
    newPassword: { required: true, type: 'string', minLength: 8 },
  }),
  controller.changePassword
);

/**
 * @openapi
 * /api/auth/forgot-password:
 *   post:
 *     tags: [Auth]
 *     summary: Request OTP for password reset
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email: { type: string, format: email }
 *     responses:
 *       200:
 *         description: OTP sent (or silently skipped if email not found)
 */
router.post(
  '/forgot-password',
  authLimiter,
  validateBody({ email: { required: true, type: 'string', minLength: 3 } }),
  controller.forgotPassword
);

/**
 * @openapi
 * /api/auth/verify-otp:
 *   post:
 *     tags: [Auth]
 *     summary: Verify OTP and get a short-lived reset token
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [userId, otpCode]
 *             properties:
 *               userId: { type: integer }
 *               otpCode: { type: string, minLength: 6, maxLength: 6 }
 *     responses:
 *       200:
 *         description: OTP valid — returns resetToken
 *       400:
 *         description: Invalid or expired OTP
 */
router.post(
  '/verify-otp',
  authLimiter,
  validateBody({
    userId: { required: true },
    otpCode: { required: true, type: 'string', minLength: 6, maxLength: 6 },
  }),
  controller.verifyOtp
);

/**
 * @openapi
 * /api/auth/reset-password:
 *   post:
 *     tags: [Auth]
 *     summary: Set new password using the OTP reset token
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [resetToken, newPassword]
 *             properties:
 *               resetToken: { type: string }
 *               newPassword: { type: string, minLength: 8 }
 *     responses:
 *       200:
 *         description: Password reset successfully
 *       400:
 *         description: Token expired or invalid
 */
router.post(
  '/reset-password',
  validateBody({
    resetToken: { required: true, type: 'string', minLength: 1 },
    newPassword: { required: true, type: 'string', minLength: 8 },
  }),
  controller.resetPassword
);

/**
 * @openapi
 * /api/auth/session-context:
 *   post:
 *     tags: [Auth]
 *     summary: Save evaluator login session context (location, workstation, session period, exam/paper)
 *     description: Called immediately after successful login to capture session details.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               locationId: { type: integer }
 *               workstationId: { type: integer }
 *               sessionPeriod: { type: string, enum: [Morning, Afternoon, Evening] }
 *               examId: { type: integer }
 *               paperId: { type: integer }
 *     responses:
 *       200:
 *         description: Session context saved
 */
router.post('/session-context', authenticate, auditLog('auth'), controller.sessionContext);

/**
 * @openapi
 * /api/auth/login-photo:
 *   post:
 *     tags: [Auth]
 *     summary: Upload evaluator login photo (captured during session setup)
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               photo:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Photo saved — returns photoPath
 */
router.post('/login-photo', authenticate, uploadCapturedPhoto, controller.uploadLoginPhoto);

/** @openapi
 * /api/auth/heartbeat:
 *   post:
 *     tags: [Auth]
 *     summary: Session heartbeat — keep active session alive
 */
router.post('/heartbeat', authenticate, controller.heartbeat);

/** @openapi
 * /api/auth/logout:
 *   post:
 *     tags: [Auth]
 *     summary: Logout and close active session
 */
router.post('/logout', authenticate, controller.logout);

/** @openapi
 * /api/auth/active-session:
 *   get:
 *     tags: [Auth]
 *     summary: Get current active session context
 */
router.get('/active-session', authenticate, controller.activeSession);

/** @openapi
 * /api/auth/workstations:
 *   get:
 *     tags: [Auth]
 *     summary: List workstations for a location
 */
router.get('/workstations', authenticate, controller.workstations);

/** @openapi
 * /api/auth/assigned-exam-paper:
 *   get:
 *     tags: [Auth]
 *     summary: Get assigned exam/paper for evaluator (from allocations)
 */
router.get('/assigned-exam-paper', authenticate, controller.assignedExamPaper);

/** @openapi
 * /api/auth/activity-logs:
 *   get:
 *     tags: [Auth]
 *     summary: List activity audit logs (Admin only)
 */
router.get('/activity-logs', authenticate, controller.activityLogs);

export default router;
