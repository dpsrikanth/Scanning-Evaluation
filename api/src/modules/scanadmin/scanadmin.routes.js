import { Router } from 'express';
import ScanAdminRepository from './scanadmin.repository.js';
import ScanAdminService from './scanadmin.service.js';
import ScanAdminController from './scanadmin.controller.js';
import ScanRepository from '../scan/scan.repository.js';
import { syncBookletToEval } from '../scan/syncScanToEval.js';
import { getScanDb, getEvalDb } from '../../config/database.js';
import { authenticate, authorize } from '../../middleware/auth.js';
import auditLog from '../../middleware/auditLog.js';
import { uploadTemplateSampleImage } from '../../middleware/upload.js';

const router = Router();

const repo = new ScanAdminRepository(getScanDb());
const service = new ScanAdminService(repo);
const controller = new ScanAdminController(service);
const scanRepo = new ScanRepository(getScanDb());

// Allow public sample-image retrieval by URL (no bearer header required).
// Upload still requires authentication through normal middleware below.
router.get('/templates/:templateId/sample-image', controller.getSampleImage);

router.use(authenticate);
router.use(authorize('Admin', 'ScanAdmin'));
router.use(auditLog('scanadmin'));

// ── Exams ──────────────────────────────────────────────────────────────────────

/**
 * @openapi
 * /api/scanadmin/exams:
 *   get:
 *     tags: [ScanAdmin]
 *     summary: List all exams
 *     description: Returns all exams in the scan database, ordered by year descending.
 *     parameters:
 *       - in: query
 *         name: activeOnly
 *         schema: { type: boolean, default: false }
 *         description: When true, returns only active (IsActive=1) exams
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
 *                       items: { $ref: '#/components/schemas/ScanAdminExam' }
 *       401:
 *         description: Unauthorised
 *       403:
 *         description: Forbidden — Admin or ScanAdmin role required
 */
router.get('/exams', controller.listExams);

/**
 * @openapi
 * /api/scanadmin/exams/{examId}:
 *   get:
 *     tags: [ScanAdmin]
 *     summary: Get a single exam by ID
 *     parameters:
 *       - in: path
 *         name: examId
 *         required: true
 *         schema: { type: integer }
 *         example: 1
 *     responses:
 *       200:
 *         description: Exam record
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data: { $ref: '#/components/schemas/ScanAdminExam' }
 *       404:
 *         description: Exam not found
 */
router.get('/exams/:examId', controller.getExam);

/**
 * @openapi
 * /api/scanadmin/exams:
 *   post:
 *     tags: [ScanAdmin]
 *     summary: Create a new exam
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [examCode, examName, examYear]
 *             properties:
 *               examCode: { type: string, example: TSPSC-GI-2024 }
 *               examName: { type: string, example: Group-I Mains 2024 }
 *               examYear: { type: integer, example: 2024 }
 *               isActive: { type: integer, enum: [0, 1], default: 1 }
 *     responses:
 *       201:
 *         description: Exam created
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
 *                         examId: { type: integer, example: 5 }
 *       400:
 *         description: Validation error or duplicate examCode
 */
router.post('/exams', controller.createExam);

/**
 * @openapi
 * /api/scanadmin/exams/{examId}:
 *   put:
 *     tags: [ScanAdmin]
 *     summary: Update an exam
 *     parameters:
 *       - in: path
 *         name: examId
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               examCode: { type: string }
 *               examName: { type: string }
 *               examYear: { type: integer }
 *               isActive: { type: integer, enum: [0, 1] }
 *     responses:
 *       200:
 *         description: Exam updated
 *       404:
 *         description: Exam not found
 */
router.put('/exams/:examId', controller.updateExam);

/**
 * @openapi
 * /api/scanadmin/exams/{examId}:
 *   delete:
 *     tags: [ScanAdmin]
 *     summary: Delete an exam
 *     description: Hard-deletes the exam record. Fails if papers are still linked.
 *     parameters:
 *       - in: path
 *         name: examId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Exam deleted
 *       409:
 *         description: Cannot delete — papers are linked to this exam
 *       404:
 *         description: Exam not found
 */
router.delete('/exams/:examId', controller.deleteExam);

// ── Papers ─────────────────────────────────────────────────────────────────────

/**
 * @openapi
 * /api/scanadmin/papers:
 *   get:
 *     tags: [ScanAdmin]
 *     summary: List all papers
 *     parameters:
 *       - in: query
 *         name: examId
 *         schema: { type: integer }
 *         description: Filter papers by exam
 *     responses:
 *       200:
 *         description: Array of papers
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: array
 *                       items: { $ref: '#/components/schemas/ScanAdminPaper' }
 */
router.get('/papers', controller.listPapers);

/**
 * @openapi
 * /api/scanadmin/papers/{paperId}:
 *   get:
 *     tags: [ScanAdmin]
 *     summary: Get a single paper by ID
 *     parameters:
 *       - in: path
 *         name: paperId
 *         required: true
 *         schema: { type: integer }
 *         example: 1
 *     responses:
 *       200:
 *         description: Paper record
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data: { $ref: '#/components/schemas/ScanAdminPaper' }
 *       404:
 *         description: Paper not found
 */
router.get('/papers/:paperId', controller.getPaper);

/**
 * @openapi
 * /api/scanadmin/papers:
 *   post:
 *     tags: [ScanAdmin]
 *     summary: Create a new paper
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [examId, paperCode, paperName, totalPages]
 *             properties:
 *               examId:           { type: integer, example: 1 }
 *               paperCode:        { type: string,  example: P1 }
 *               paperName:        { type: string,  example: General English }
 *               totalPages:       { type: integer, example: 32 }
 *               bookletPageCounts: { type: string, example: '12,24,36', description: 'Comma-separated valid page counts' }
 *               maxMarks:         { type: number,  example: 150 }
 *     responses:
 *       201:
 *         description: Paper created
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
 *                         paperId: { type: integer, example: 3 }
 *       400:
 *         description: Validation error
 */
router.post('/papers', controller.createPaper);

/**
 * @openapi
 * /api/scanadmin/papers/{paperId}:
 *   put:
 *     tags: [ScanAdmin]
 *     summary: Update a paper
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
 *             properties:
 *               paperCode:        { type: string }
 *               paperName:        { type: string }
 *               totalPages:       { type: integer }
 *               bookletPageCounts:{ type: string }
 *               maxMarks:         { type: number }
 *     responses:
 *       200:
 *         description: Paper updated
 *       404:
 *         description: Paper not found
 */
router.put('/papers/:paperId', controller.updatePaper);

/**
 * @openapi
 * /api/scanadmin/papers/{paperId}:
 *   delete:
 *     tags: [ScanAdmin]
 *     summary: Delete a paper
 *     description: Hard-deletes the paper. Fails if scanned booklets reference this paper.
 *     parameters:
 *       - in: path
 *         name: paperId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Paper deleted
 *       409:
 *         description: Cannot delete — booklets are linked to this paper
 *       404:
 *         description: Paper not found
 */
router.delete('/papers/:paperId', controller.deletePaper);

// ── Workstations ───────────────────────────────────────────────────────────────

/**
 * @openapi
 * /api/scanadmin/workstations:
 *   get:
 *     tags: [ScanAdmin]
 *     summary: List all workstations
 *     parameters:
 *       - in: query
 *         name: locationId
 *         schema: { type: integer }
 *         description: Filter by location
 *     responses:
 *       200:
 *         description: Array of workstations
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: array
 *                       items: { $ref: '#/components/schemas/Workstation' }
 */
router.get('/workstations', controller.listWorkstations);

/**
 * @openapi
 * /api/scanadmin/workstations/{workstationId}:
 *   get:
 *     tags: [ScanAdmin]
 *     summary: Get a single workstation by ID
 *     parameters:
 *       - in: path
 *         name: workstationId
 *         required: true
 *         schema: { type: integer }
 *         example: 1
 *     responses:
 *       200:
 *         description: Workstation record
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data: { $ref: '#/components/schemas/Workstation' }
 *       404:
 *         description: Workstation not found
 */
router.get('/workstations/:workstationId', controller.getWorkstation);

/**
 * @openapi
 * /api/scanadmin/workstations:
 *   post:
 *     tags: [ScanAdmin]
 *     summary: Create a new workstation
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [workstationCode, workstationName, locationId]
 *             properties:
 *               workstationCode: { type: string,  example: WS-001 }
 *               workstationName: { type: string,  example: Scanner Station 1 }
 *               locationId:      { type: integer, example: 1 }
 *               printerProfileId: { type: integer, example: 2, description: 'FK to PrinterProfiles.ProfileID (optional)' }
 *               assignedUser:    { type: string,  example: ravi.rajan, description: 'Username of pre-assigned scan operator (optional)' }
 *     responses:
 *       201:
 *         description: Workstation created
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
 *                         workstationId: { type: integer, example: 4 }
 *       400:
 *         description: Validation error or duplicate workstationCode
 */
router.post('/workstations', controller.createWorkstation);

/**
 * @openapi
 * /api/scanadmin/workstations/{workstationId}:
 *   put:
 *     tags: [ScanAdmin]
 *     summary: Update a workstation
 *     parameters:
 *       - in: path
 *         name: workstationId
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               workstationCode: { type: string }
 *               workstationName: { type: string }
 *               locationId:      { type: integer }
 *               printerProfileId:{ type: integer }
 *               assignedUser:    { type: string }
 *     responses:
 *       200:
 *         description: Workstation updated
 *       404:
 *         description: Workstation not found
 */
router.put('/workstations/:workstationId', controller.updateWorkstation);

/**
 * @openapi
 * /api/scanadmin/workstations/{workstationId}:
 *   delete:
 *     tags: [ScanAdmin]
 *     summary: Delete a workstation
 *     parameters:
 *       - in: path
 *         name: workstationId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Workstation deleted
 *       404:
 *         description: Workstation not found
 */
router.delete('/workstations/:workstationId', controller.deleteWorkstation);

// ── Scan Templates ─────────────────────────────────────────────────────────────

/**
 * @openapi
 * /api/scanadmin/templates:
 *   get:
 *     tags: [ScanAdmin]
 *     summary: List all scan templates
 *     description: Returns all scan templates used by the desktop scanning application.
 *     responses:
 *       200:
 *         description: Array of scan templates
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: array
 *                       items: { $ref: '#/components/schemas/ScanTemplate' }
 */
router.get('/templates', controller.listTemplates);

/**
 * @openapi
 * /api/scanadmin/templates/{templateId}:
 *   get:
 *     tags: [ScanAdmin]
 *     summary: Get a single scan template by ID
 *     parameters:
 *       - in: path
 *         name: templateId
 *         required: true
 *         schema: { type: integer }
 *         example: 1
 *     responses:
 *       200:
 *         description: Scan template record
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data: { $ref: '#/components/schemas/ScanTemplate' }
 *       404:
 *         description: Template not found
 */
router.get('/templates/:templateId', controller.getTemplate);

/**
 * @openapi
 * /api/scanadmin/templates:
 *   post:
 *     tags: [ScanAdmin]
 *     summary: Create a new scan template
 *     description: |
 *       Defines a scanner configuration profile. The desktop app uses the template
 *       linked to the operator's workstation printer profile.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [templateName, dpi, colorMode, pageSize, duplexMode, imageFormat]
 *             properties:
 *               templateName: { type: string,  example: A4 Color 300dpi Duplex }
 *               dpi:          { type: integer, example: 300 }
 *               colorMode:    { type: string,  enum: [color, grayscale, blackwhite], example: color }
 *               pageSize:     { type: string,  example: A4 }
 *               duplexMode:   { type: string,  enum: [simplex, duplex], example: duplex }
 *               imageFormat:  { type: string,  enum: [jpeg, png, tiff], example: jpeg }
 *               jpegQuality:  { type: integer, example: 85 }
 *               deSkew:       { type: integer, enum: [0, 1], default: 1 }
 *               autoCrop:     { type: integer, enum: [0, 1], default: 1 }
 *               isActive:     { type: integer, enum: [0, 1], default: 1 }
 *     responses:
 *       201:
 *         description: Template created
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
 *                         templateId: { type: integer, example: 3 }
 *       400:
 *         description: Validation error
 */
router.post('/templates', controller.createTemplate);

/**
 * @openapi
 * /api/scanadmin/templates/{templateId}:
 *   put:
 *     tags: [ScanAdmin]
 *     summary: Update a scan template
 *     parameters:
 *       - in: path
 *         name: templateId
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ScanTemplate'
 *     responses:
 *       200:
 *         description: Template updated
 *       404:
 *         description: Template not found
 */
router.put('/templates/:templateId', controller.updateTemplate);

/**
 * @openapi
 * /api/scanadmin/templates/{templateId}:
 *   delete:
 *     tags: [ScanAdmin]
 *     summary: Delete a scan template
 *     parameters:
 *       - in: path
 *         name: templateId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Template deleted
 *       409:
 *         description: Cannot delete — printer profiles reference this template
 *       404:
 *         description: Template not found
 */
router.delete('/templates/:templateId', controller.deleteTemplate);

router.post('/templates/:templateId/sample-image', uploadTemplateSampleImage, controller.uploadSampleImage);

// ── Printer Profiles ───────────────────────────────────────────────────────────

/**
 * @openapi
 * /api/scanadmin/printer-profiles:
 *   get:
 *     tags: [ScanAdmin]
 *     summary: List all printer / scanner profiles
 *     description: Returns all profiles defining scanner hardware + default template combinations.
 *     responses:
 *       200:
 *         description: Array of printer profiles
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: array
 *                       items: { $ref: '#/components/schemas/PrinterProfile' }
 */
router.get('/printer-profiles', controller.listPrinterProfiles);

/**
 * @openapi
 * /api/scanadmin/printer-profiles/{profileId}:
 *   get:
 *     tags: [ScanAdmin]
 *     summary: Get a single printer profile by ID
 *     parameters:
 *       - in: path
 *         name: profileId
 *         required: true
 *         schema: { type: integer }
 *         example: 1
 *     responses:
 *       200:
 *         description: Printer profile record
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data: { $ref: '#/components/schemas/PrinterProfile' }
 *       404:
 *         description: Profile not found
 */
router.get('/printer-profiles/:profileId', controller.getPrinterProfile);

/**
 * @openapi
 * /api/scanadmin/printer-profiles:
 *   post:
 *     tags: [ScanAdmin]
 *     summary: Create a new printer / scanner profile
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [profileName, scannerModel, driverType]
 *             properties:
 *               profileName:     { type: string,  example: Canon DR-G2110 }
 *               scannerModel:    { type: string,  example: Canon DR-G2110 }
 *               driverType:      { type: string,  enum: [WIA, TWAIN], example: WIA }
 *               defaultTemplate: { type: integer, example: 1, description: 'FK to ScanTemplates.TemplateID' }
 *               isActive:        { type: integer, enum: [0, 1], default: 1 }
 *     responses:
 *       201:
 *         description: Profile created
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
 *                         profileId: { type: integer, example: 2 }
 *       400:
 *         description: Validation error
 */
router.post('/printer-profiles', controller.createPrinterProfile);

/**
 * @openapi
 * /api/scanadmin/printer-profiles/{profileId}:
 *   put:
 *     tags: [ScanAdmin]
 *     summary: Update a printer profile
 *     parameters:
 *       - in: path
 *         name: profileId
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/PrinterProfile'
 *     responses:
 *       200:
 *         description: Profile updated
 *       404:
 *         description: Profile not found
 */
router.put('/printer-profiles/:profileId', controller.updatePrinterProfile);

/**
 * @openapi
 * /api/scanadmin/printer-profiles/{profileId}:
 *   delete:
 *     tags: [ScanAdmin]
 *     summary: Delete a printer profile
 *     parameters:
 *       - in: path
 *         name: profileId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Profile deleted
 *       409:
 *         description: Cannot delete — workstations reference this profile
 *       404:
 *         description: Profile not found
 */
router.delete('/printer-profiles/:profileId', controller.deletePrinterProfile);

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * @openapi
 * /api/scanadmin/locations:
 *   get:
 *     tags: [ScanAdmin]
 *     summary: List all locations (reference data for dropdowns)
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
 *                           LocationID:   { type: integer }
 *                           LocationCode: { type: string }
 *                           LocationName: { type: string }
 */
router.get('/locations', controller.listLocations);
router.patch('/qc-settings', controller.updateScanQcSettings);

/**
 * @openapi
 * /api/scanadmin/scanned-booklets:
 *   get:
 *     tags: [ScanAdmin]
 *     summary: List scanned booklets (uploads) with exam/paper info, filterable by exam and paper
 *     parameters:
 *       - in: query
 *         name: examId
 *         schema: { type: integer }
 *       - in: query
 *         name: paperId
 *         schema: { type: integer }
 *       - in: query
 *         name: locationId
 *         schema: { type: integer }
 *       - in: query
 *         name: dateFrom
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: dateTo
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 500 }
 *       - in: query
 *         name: offset
 *         schema: { type: integer, default: 0 }
 *     responses:
 *       200:
 *         description: { booklets: [...], total: number }
 */
router.get('/scanned-booklets', controller.listScannedBooklets);

/**
 * @openapi
 * /api/scanadmin/scan-users:
 *   get:
 *     tags: [ScanAdmin]
 *     summary: List all active scan operators (for workstation assignment)
 *     responses:
 *       200:
 *         description: Array of scan operator accounts
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
 *                           UserID:   { type: integer }
 *                           Username: { type: string }
 *                           FullName: { type: string }
 */
router.get('/scan-users', controller.listScanUsers);
router.get('/scan-roles', controller.listScanRolesForUserManagement);
router.post('/scan-users', controller.createScanUser);
router.put('/scan-users/:userId', controller.updateScanUser);
router.delete('/scan-users/:userId', controller.deleteScanUser);

// ── Scan output paths (where scanned booklet PDFs are stored) ─────────────────
router.get('/output-paths', controller.listOutputPaths);
router.post('/output-paths', controller.createOutputPath);
router.put('/output-paths/:pathId', controller.updateOutputPath);
router.post('/output-paths/:pathId/set-active', controller.setActiveOutputPath);
router.delete('/output-paths/:pathId', controller.deleteOutputPath);

// ── Sync Scan_Booklets → Eval_Booklets (so uploads appear in Admin → Assign Booklets)
router.post('/sync-scan-to-eval', async (req, res, next) => {
  try {
    const booklets = await scanRepo.getAllBookletsForSync();
    let synced = 0;
    let failed = 0;
    for (const b of booklets) {
      try {
        await syncBookletToEval(getEvalDb(), {
          bookletId: b.BookletID,
          examId: b.ExamID,
          paperId: b.PaperID,
          locationId: b.LocationID,
          centreCode: b.CentreCode,
          totalPagesScanned: b.TotalPagesScanned,
          filePath: b.FilePath,
          createdBy: b.CreatedBy,
          createdFromIP: b.CreatedFromIP,
          createdFromSystem: b.CreatedFromSystem,
        });
        synced++;
      } catch {
        failed++;
      }
    }
    return res.status(200).json({
      success: true,
      data: { total: booklets.length, synced, failed },
      message: `Synced ${synced} of ${booklets.length} booklets to evaluation. ${failed} failed (e.g. missing Exam/Paper/Location in EvaluationDB).`,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
