import { Router } from 'express';
import path from 'path';
import AdminRepository from './admin.repository.js';
import AdminService from './admin.service.js';
import AdminController from './admin.controller.js';
import { getEvalDb } from '../../config/database.js';
import { authenticate, authorize } from '../../middleware/auth.js';
import auditLog from '../../middleware/auditLog.js';
import { uploadProfilePhoto, uploadQuestionPaper } from '../../middleware/upload.js';
import env from '../../config/env.js';

const router = Router();
const repo = new AdminRepository(getEvalDb());
const service = new AdminService(repo);
const controller = new AdminController(service);

router.use(authenticate);
router.use(auditLog('admin'));

// ── Reference data ─────────────────────────────────────────────────────────────

/**
 * @openapi
 * /api/admin/roles:
 *   get:
 *     tags: [Admin]
 *     summary: List all system roles
 *     description: Returns every role in the system. Used for user-management dropdowns.
 *     responses:
 *       200:
 *         description: Array of roles
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           RoleID:   { type: integer, example: 2 }
 *                           RoleName: { type: string,  example: Evaluator }
 *       401:
 *         description: Unauthorised
 */
router.get('/roles', controller.listRoles);

/**
 * @openapi
 * /api/admin/locations:
 *   get:
 *     tags: [Admin]
 *     summary: List all exam locations / centres
 *     description: Returns all active locations. Used by login, user-create and filter dropdowns.
 *     responses:
 *       200:
 *         description: Array of locations
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           LocationID:   { type: integer, example: 1 }
 *                           LocationCode: { type: string,  example: HYD-001 }
 *                           LocationName: { type: string,  example: Hyderabad Centre }
 */
router.get('/locations', controller.listLocations);

// ── User management — Admin only ───────────────────────────────────────────────

/**
 * @openapi
 * /api/admin/users:
 *   get:
 *     tags: [Admin]
 *     summary: List all users (Admin only)
 *     description: Pageable list of all system users with role and location details.
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 50 }
 *       - in: query
 *         name: roleId
 *         schema: { type: integer }
 *         description: Filter by role
 *       - in: query
 *         name: locationId
 *         schema: { type: integer }
 *         description: Filter by location
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *         description: Search by username or full name
 *     responses:
 *       200:
 *         description: Paged list of users
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         users:
 *                           type: array
 *                           items: { $ref: '#/components/schemas/User' }
 *                         total: { type: integer }
 *                         page:  { type: integer }
 *                         limit: { type: integer }
 *       403:
 *         description: Forbidden — Admin role required
 */
router.get('/users', authorize('Admin'), controller.listUsers);

/**
 * @openapi
 * /api/admin/users/{userId}:
 *   get:
 *     tags: [Admin]
 *     summary: Get a single user by ID (Admin only)
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema: { type: integer }
 *         example: 3
 *     responses:
 *       200:
 *         description: User record
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data: { $ref: '#/components/schemas/User' }
 *       404:
 *         description: User not found
 */
router.get('/users/:userId', authorize('Admin'), controller.getUser);

/**
 * @openapi
 * /api/admin/users:
 *   post:
 *     tags: [Admin]
 *     summary: Create a new user (Admin only)
 *     description: |
 *       Creates a user account, hashes the password, and optionally uploads a profile photo.
 *       An activation e-mail is sent to the new user's address.
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             allOf:
 *               - $ref: '#/components/schemas/CreateUserRequest'
 *               - type: object
 *                 properties:
 *                   photo:
 *                     type: string
 *                     format: binary
 *                     description: Optional JPEG/PNG profile photo
 *     responses:
 *       201:
 *         description: User created successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         userId: { type: integer, example: 10 }
 *       400:
 *         description: Validation error — duplicate username/email or missing required fields
 */
router.post('/users', authorize('Admin'), uploadProfilePhoto, controller.createUser);

/**
 * @openapi
 * /api/admin/users/{userId}:
 *   put:
 *     tags: [Admin]
 *     summary: Update a user (Admin only)
 *     description: Updates editable user fields. To change password use `reset-password` instead.
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               fullName:   { type: string,  example: Ravi Rajan }
 *               email:      { type: string,  format: email }
 *               roleId:     { type: integer, example: 2 }
 *               locationId: { type: integer, example: 1 }
 *               mobile:     { type: string,  example: '9876543210' }
 *               isActive:   { type: integer, enum: [0, 1] }
 *     responses:
 *       200:
 *         description: User updated
 *       404:
 *         description: User not found
 */
router.put('/users/:userId', authorize('Admin'), controller.updateUser);

/**
 * @openapi
 * /api/admin/users/{userId}:
 *   delete:
 *     tags: [Admin]
 *     summary: Soft-delete (deactivate) a user (Admin only)
 *     description: Sets IsActive = 0. The user cannot log in but historical records are preserved.
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: User deactivated
 *       404:
 *         description: User not found
 */
router.delete('/users/:userId', authorize('Admin'), controller.deleteUser);

/**
 * @openapi
 * /api/admin/users/{userId}/reset-password:
 *   post:
 *     tags: [Admin]
 *     summary: Force-reset a user's password (Admin only)
 *     description: Sets a new password for any user and sends a notification e-mail.
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [newPassword]
 *             properties:
 *               newPassword: { type: string, format: password, minLength: 8, example: NewPass@123 }
 *     responses:
 *       200:
 *         description: Password reset successfully
 *       404:
 *         description: User not found
 */
router.post('/users/:userId/reset-password', authorize('Admin'), controller.resetPassword);

/**
 * @openapi
 * /api/admin/users/{userId}/photo:
 *   post:
 *     tags: [Admin]
 *     summary: Upload / replace a user's profile photo (Admin only)
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [photo]
 *             properties:
 *               photo: { type: string, format: binary }
 *     responses:
 *       200:
 *         description: Photo uploaded — returns photoPath
 *       400:
 *         description: No file provided
 *       404:
 *         description: User not found
 */
router.post('/users/:userId/photo', authorize('Admin'), uploadProfilePhoto, controller.uploadUserPhoto);

/**
 * @openapi
 * /api/admin/users/{userId}/photo:
 *   get:
 *     tags: [Admin]
 *     summary: Get profile photo metadata for a user (Admin only)
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Photo metadata (photoPath, photoUrl)
 *       404:
 *         description: User or photo not found
 */
router.get('/users/:userId/photo', authorize('Admin'), controller.getUserPhoto);

/**
 * @openapi
 * /api/admin/photo-file/{filename}:
 *   get:
 *     tags: [Admin]
 *     summary: Stream a user profile photo file
 *     description: Directly streams the stored JPEG/PNG profile photo. Requires a valid JWT.
 *     parameters:
 *       - in: path
 *         name: filename
 *         required: true
 *         schema: { type: string }
 *         example: user_3_photo.jpg
 *     responses:
 *       200:
 *         description: Image file
 *         content:
 *           image/jpeg:
 *             schema: { type: string, format: binary }
 *       404:
 *         description: Photo not found on server
 */
router.get('/photo-file/:filename', authenticate, (req, res) => {
  const filePath = path.join(env.storage.scanOutputPath, 'profiles', req.params.filename);
  res.sendFile(path.resolve(filePath), err => {
    if (err) res.status(404).json({ message: 'Photo not found' });
  });
});

// ── System Settings — Admin only ───────────────────────────────────────────────

/**
 * @openapi
 * /api/admin/settings:
 *   get:
 *     tags: [Admin]
 *     summary: Get system configuration settings (Admin only)
 *     description: Returns all configurable system settings including SMTP, monitoring, and scan defaults.
 *     responses:
 *       200:
 *         description: Settings object
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data: { $ref: '#/components/schemas/SystemSettings' }
 */
router.get('/settings', authorize('Admin'), controller.getSettings);

/**
 * @openapi
 * /api/admin/settings:
 *   put:
 *     tags: [Admin]
 *     summary: Update system configuration settings (Admin only)
 *     description: Persists system settings. Changes take effect immediately without a restart.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/SystemSettings'
 *     responses:
 *       200:
 *         description: Settings saved successfully
 *       400:
 *         description: Validation error
 */
router.put('/settings', authorize('Admin'), controller.updateSettings);

/**
 * @openapi
 * /api/admin/settings/test-smtp:
 *   post:
 *     tags: [Admin]
 *     summary: Send a test e-mail using current SMTP settings (Admin only)
 *     description: Useful to verify SMTP credentials before saving or after an update.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [to]
 *             properties:
 *               to: { type: string, format: email, example: admin@university.edu }
 *     responses:
 *       200:
 *         description: Test e-mail sent successfully
 *       500:
 *         description: SMTP connection or send failure — details in message
 */
router.post('/settings/test-smtp', authorize('Admin'), controller.testSmtp);

/**
 * @openapi
 * /api/admin/qpaper-file/{filename}:
 *   get:
 *     tags: [Admin]
 *     summary: Stream a question paper PDF file
 *     parameters:
 *       - in: path
 *         name: filename
 *         required: true
 *         schema: { type: string }
 *         example: P1_SET_A.pdf
 *     responses:
 *       200:
 *         description: PDF file
 *         content:
 *           application/pdf:
 *             schema: { type: string, format: binary }
 *       404:
 *         description: File not found on server
 */
router.get('/qpaper-file/:filename', (req, res) => {
  const filePath = path.join(env.storage.scanOutputPath, 'question_papers', req.params.filename);
  res.sendFile(path.resolve(filePath), err => {
    if (err) res.status(404).json({ message: 'File not found' });
  });
});

// ── Question Paper Config — Admin only ─────────────────────────────────────────

/**
 * @openapi
 * /api/admin/qpaper/exams:
 *   get:
 *     tags: [Admin]
 *     summary: List exams that have question paper configuration (Admin only)
 *     responses:
 *       200:
 *         description: Array of exams
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: array
 *                       items: { $ref: '#/components/schemas/Exam' }
 */
router.get('/qpaper/exams', authorize('Admin'), controller.qpaperExams);

/**
 * @openapi
 * /api/admin/qpaper/exams/{examId}/papers:
 *   get:
 *     tags: [Admin]
 *     summary: List papers for an exam (question paper config view) (Admin only)
 *     parameters:
 *       - in: path
 *         name: examId
 *         required: true
 *         schema: { type: integer }
 *         example: 1
 *     responses:
 *       200:
 *         description: Array of papers for the exam
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: array
 *                       items: { $ref: '#/components/schemas/Paper' }
 */
router.get('/qpaper/exams/:examId/papers', authorize('Admin'), controller.qpaperPapers);

/**
 * @openapi
 * /api/admin/qpaper/{paperId}:
 *   get:
 *     tags: [Admin]
 *     summary: Get question paper configuration for a paper (Admin only)
 *     description: Returns the question scheme (sets, questions, max marks) and uploaded file info.
 *     parameters:
 *       - in: path
 *         name: paperId
 *         required: true
 *         schema: { type: integer }
 *         example: 1
 *     responses:
 *       200:
 *         description: Question paper configuration
 *       404:
 *         description: Paper not found
 */
router.get('/qpaper/:paperId', authorize('Admin'), controller.qpaperConfig);

/**
 * @openapi
 * /api/admin/qpaper/{paperId}/upload:
 *   post:
 *     tags: [Admin]
 *     summary: Upload a question paper PDF (Admin only)
 *     description: Stores the PDF and links it to the paper record. Accepts one file per set code.
 *     parameters:
 *       - in: path
 *         name: paperId
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [file]
 *             properties:
 *               file:    { type: string, format: binary, description: PDF question paper }
 *               setCode: { type: string, example: A, description: Set identifier (A/B/C…) }
 *     responses:
 *       200:
 *         description: File uploaded and linked to the paper
 *       400:
 *         description: No file provided or invalid file type
 */
router.post('/qpaper/:paperId/upload', authorize('Admin'), uploadQuestionPaper, controller.qpaperUpload);

/**
 * @openapi
 * /api/admin/qpaper/{paperId}/sets:
 *   put:
 *     tags: [Admin]
 *     summary: Save question scheme / sets for a paper (Admin only)
 *     description: Upserts the question sets and per-question max marks. Existing entries are replaced.
 *     parameters:
 *       - in: path
 *         name: paperId
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [sets]
 *             properties:
 *               sets:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required: [setCode, questions]
 *                   properties:
 *                     setCode: { type: string, example: A }
 *                     questions:
 *                       type: array
 *                       items:
 *                         type: object
 *                         required: [questionNumber, maxMarks]
 *                         properties:
 *                           questionNumber:  { type: string, example: '1' }
 *                           subQuestionCode: { type: string, example: '' }
 *                           maxMarks:        { type: number, example: 10 }
 *     responses:
 *       200:
 *         description: Sets saved successfully
 *       400:
 *         description: Validation error in sets payload
 */
router.put('/qpaper/:paperId/sets', authorize('Admin'), controller.qpaperSaveSets);

/**
 * @openapi
 * /api/admin/qpaper/{paperId}/extract:
 *   post:
 *     tags: [Admin]
 *     summary: Auto-extract question structure from uploaded PDF (Admin only)
 *     description: |
 *       Reads the question paper PDF already uploaded for this paper, extracts text
 *       via pdf-parse, and runs a regex parser to detect:
 *       - Subject / paper title
 *       - Section headings (Section A, Part I, etc.)
 *       - Attempt instructions (Answer any 5, Answer all, etc.)
 *       - Marks per question
 *       Returns a structured JSON the admin can review, edit, and then save via
 *       `PUT /qpaper/:paperId/sets`.
 *     parameters:
 *       - in: path
 *         name: paperId
 *         required: true
 *         schema: { type: integer }
 *         example: 1
 *     responses:
 *       200:
 *         description: Extracted question paper structure
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         subject:        { type: string, example: Mathematics Paper IIA }
 *                         totalMarks:     { type: number, example: 75 }
 *                         totalQuestions: { type: integer, example: 22 }
 *                         confidence:     { type: string, enum: [ok, low] }
 *                         sections:
 *                           type: array
 *                           items:
 *                             type: object
 *                             properties:
 *                               label:            { type: string, example: Section A }
 *                               setType:          { type: string, enum: [AnswerAll, Common, Mandatory] }
 *                               totalQuestions:   { type: integer, example: 10 }
 *                               attemptQuestions: { type: integer, example: 10 }
 *                               marksPerQuestion: { type: number, example: 2 }
 *                               computedMax:      { type: number, example: 20 }
 *       400:
 *         description: No question paper uploaded yet for this paper
 *       404:
 *         description: Paper not found
 */
router.post('/qpaper/:paperId/extract', authorize('Admin'), controller.qpaperExtract);

// ── Email Templates — Admin only ───────────────────────────────────────────────

/**
 * @openapi
 * /api/admin/email-templates:
 *   get:
 *     tags: [Admin]
 *     summary: List all email templates (Admin only)
 *     responses:
 *       200:
 *         description: Array of template metadata (type, subject, updatedAt)
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           type:      { type: string, example: password_reset }
 *                           subject:   { type: string }
 *                           updatedAt: { type: string, format: date-time }
 */
router.get('/email-templates', authorize('Admin'), controller.listTemplates);

/**
 * @openapi
 * /api/admin/email-templates/{type}:
 *   get:
 *     tags: [Admin]
 *     summary: Get a specific email template by type (Admin only)
 *     parameters:
 *       - in: path
 *         name: type
 *         required: true
 *         schema:
 *           type: string
 *           enum: [welcome, password_reset, otp, evaluation_complete]
 *         example: password_reset
 *     responses:
 *       200:
 *         description: Template subject and HTML body
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         type:    { type: string }
 *                         subject: { type: string }
 *                         body:    { type: string, description: 'HTML body with placeholder variables' }
 *       404:
 *         description: Template type not found
 */
router.get('/email-templates/:type', authorize('Admin'), controller.getTemplate);

/**
 * @openapi
 * /api/admin/email-templates/{type}:
 *   put:
 *     tags: [Admin]
 *     summary: Update an email template (Admin only)
 *     parameters:
 *       - in: path
 *         name: type
 *         required: true
 *         schema: { type: string }
 *         example: password_reset
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [subject, body]
 *             properties:
 *               subject: { type: string, example: 'Your OTP code for the system' }
 *               body:    { type: string, description: 'HTML template with placeholder variables like system_name, user_name' }
 *     responses:
 *       200:
 *         description: Template updated successfully
 *       404:
 *         description: Template type not found
 */
router.put('/email-templates/:type', authorize('Admin'), controller.updateTemplate);

export default router;
