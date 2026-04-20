import { Router } from 'express';
import EvalRepository from './eval.repository.js';
import EvalService from './eval.service.js';
import EvalController from './eval.controller.js';
import { getEvalDb } from '../../config/database.js';
import { authenticate, authorize } from '../../middleware/auth.js';
import auditLog from '../../middleware/auditLog.js';
import { evalLimiter } from '../../middleware/security.js';
import { uploadCapturedPhoto } from '../../middleware/upload.js';

const router = Router();

const repo = new EvalRepository(getEvalDb());
const service = new EvalService(repo);
const controller = new EvalController(service);

router.use(authenticate);
router.use(auditLog('eval'));
router.use(evalLimiter);

/**
 * @openapi
 * /api/eval/dashboard/summary:
 *   get:
 *     tags: [Eval]
 *     summary: Dashboard statistics for the evaluation app
 *     description: |
 *       Returns counts of total answer sheets, evaluated, pending, and rejected
 *       for the authenticated evaluator's assigned paper scope.
 *     responses:
 *       200:
 *         description: Dashboard summary
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/DashboardSummary'
 *       401:
 *         description: Unauthorised
 */
router.get('/dashboard/summary', controller.dashboardSummary);

/**
 * @openapi
 * /api/eval/booklets/pending:
 *   get:
 *     tags: [Eval]
 *     summary: List booklets allocated to the current evaluator
 *     description: Returns pending, in-progress, and completed booklets from AllocationQueue.
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [Pending, InProgress, Completed]
 *     responses:
 *       200:
 *         description: Paged list of allocated booklets
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
 *                         booklets:
 *                           type: array
 *                           items:
 *                             $ref: '#/components/schemas/BookletListItem'
 *                         total: { type: integer }
 *                         page: { type: integer }
 *                         limit: { type: integer }
 */
router.get('/booklets/pending', controller.pendingBooklets);

/**
 * @openapi
 * /api/eval/booklet/{bookletId}:
 *   get:
 *     tags: [Eval]
 *     summary: Open a booklet for evaluation
 *     description: |
 *       Returns the booklet's scanned pages (image URLs), the question scheme
 *       (max marks per question), and any existing evaluation marks.
 *       Also marks the allocation as InProgress.
 *     parameters:
 *       - in: path
 *         name: bookletId
 *         required: true
 *         schema: { type: string }
 *         example: 110293000124
 *     responses:
 *       200:
 *         description: Booklet evaluation view data
 *       404:
 *         description: Booklet not found or not allocated to this evaluator
 */
router.get(
  '/booklet/:bookletId/shared-annotations',
  controller.getBookletSharedAnnotations
);
router.put(
  '/booklet/:bookletId/shared-annotations',
  controller.saveBookletSharedAnnotations
);

router.get('/booklet/:bookletId', controller.openBooklet);

/**
 * @openapi
 * /api/eval/evaluation:
 *   post:
 *     tags: [Eval]
 *     summary: Start a new evaluation session
 *     description: Creates an Evaluations record and returns the evaluationId.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [allocationId, bookletId]
 *             properties:
 *               allocationId: { type: integer, example: 10 }
 *               bookletId: { type: string, example: '110293000124' }
 *     responses:
 *       201:
 *         description: Evaluation started
 *       409:
 *         description: Evaluation already in progress for this booklet
 */
router.post('/evaluation', controller.startEvaluation);

/**
 * @openapi
 * /api/eval/evaluation/{evaluationId}/marks:
 *   put:
 *     tags: [Eval]
 *     summary: Auto-save evaluation marks
 *     description: |
 *       Upserts per-question mark entries in EvaluationDetails.
 *       Called frequently during evaluation for auto-save.
 *     parameters:
 *       - in: path
 *         name: evaluationId
 *         required: true
 *         schema: { type: integer }
 *         example: 5
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [marks]
 *             properties:
 *               marks:
 *                 type: array
 *                 items:
 *                   $ref: '#/components/schemas/EvaluationDetail'
 *     responses:
 *       200:
 *         description: Marks saved
 *       404:
 *         description: Evaluation not found
 */
router.get('/evaluation/:evaluationId/marks', controller.getMarks);
router.put('/evaluation/:evaluationId/marks', controller.saveMarks);

/**
 * @openapi
 * /api/eval/evaluation/{evaluationId}/submit:
 *   post:
 *     tags: [Eval]
 *     summary: Submit completed evaluation
 *     description: |
 *       Marks the evaluation as Completed, updates TotalMarks, and checks
 *       for variance if a primary evaluation already exists.
 *     parameters:
 *       - in: path
 *         name: evaluationId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Evaluation submitted successfully
 *       400:
 *         description: All pages must be visited before submission
 *       404:
 *         description: Evaluation not found
 */
router.post('/evaluation/:evaluationId/submit', controller.submitEvaluation);

/**
 * @openapi
 * /api/eval/evaluation/{evaluationId}/page-visit:
 *   post:
 *     tags: [Eval]
 *     summary: Log a page visit
 *     description: |
 *       Records when an evaluator views a page, duration spent, and any
 *       zoom/annotation actions. Used for compliance and audit trails.
 *     parameters:
 *       - in: path
 *         name: evaluationId
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [bookletId, pageNumber]
 *             properties:
 *               bookletId: { type: string, example: '110293000124' }
 *               pageNumber: { type: integer, example: 3 }
 *               durationSeconds: { type: integer, example: 45 }
 *               zoomLevel: { type: number, example: 1.5 }
 *               annotationsMade: { type: integer, example: 2 }
 *     responses:
 *       201:
 *         description: Page visit logged
 */
router.post('/evaluation/:evaluationId/page-visit', controller.logPageVisit);

/**
 * @openapi
 * /api/eval/evaluation/{evaluationId}/annotations:
 *   put:
 *     tags: [Eval]
 *     summary: Save annotations for an evaluation
 *     description: Stores the JSON annotation layer (highlights, arrows, stamps) drawn on booklet pages.
 *     parameters:
 *       - in: path
 *         name: evaluationId
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [annotations]
 *             properties:
 *               annotations:
 *                 type: array
 *                 description: Array of annotation objects per page
 *                 items:
 *                   type: object
 *                   properties:
 *                     pageNumber: { type: integer, example: 3 }
 *                     data:       { type: object, description: Annotation payload (tool-specific JSON) }
 *     responses:
 *       200:
 *         description: Annotations saved
 *       404:
 *         description: Evaluation not found
 */
router.put('/evaluation/:evaluationId/annotations', controller.saveAnnotations);

/**
 * @openapi
 * /api/eval/evaluation/{evaluationId}/annotations:
 *   get:
 *     tags: [Eval]
 *     summary: Get saved annotations for an evaluation
 *     parameters:
 *       - in: path
 *         name: evaluationId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Array of annotation objects per page
 *       404:
 *         description: Evaluation not found
 */
router.get('/evaluation/:evaluationId/annotations', controller.getAnnotations);

/**
 * @openapi
 * /api/eval/captured-photo:
 *   post:
 *     tags: [Eval]
 *     summary: Upload a captured evaluator photo (random check or session-start verification)
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               photo: { type: string, format: binary }
 *               evaluationId: { type: integer }
 *               faceMatchResult: { type: string, enum: [Matched, Mismatch, Skipped, Error, VerifyStart] }
 *               faceMatchScore: { type: number }
 *               captureType: { type: string, enum: [SessionStart, RandomCapture] }
 */
router.post('/captured-photo', uploadCapturedPhoto, controller.saveCapturedPhoto);

/**
 * @openapi
 * /api/eval/time-report:
 *   get:
 *     tags: [Eval]
 *     summary: Evaluator time analytics report
 *     description: Average time per sheet per evaluator / subject. Evaluators see only their own data.
 */
router.get('/time-report', controller.timeReport);

/**
 * @openapi
 * /api/eval/monitoring-settings:
 *   get:
 *     tags: [Eval]
 *     summary: Get monitoring configuration settings (used by frontend for photo capture)
 */
router.get('/monitoring-settings', controller.monitoringSettings);

export default router;
