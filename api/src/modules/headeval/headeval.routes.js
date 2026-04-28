import { Router } from 'express';
import HeadEvalRepository from './headeval.repository.js';
import HeadEvalService from './headeval.service.js';
import HeadEvalController from './headeval.controller.js';
import { getEvalDb } from '../../config/database.js';
import { authenticate, authorize } from '../../middleware/auth.js';
import auditLog from '../../middleware/auditLog.js';

const router = Router();
const repo = new HeadEvalRepository(getEvalDb());
const service = new HeadEvalService(repo);
const controller = new HeadEvalController(service);

router.use(authenticate);
router.use(authorize('Admin', 'HeadEvaluator'));
router.use(auditLog('headeval'));

/**
 * @openapi
 * /api/headeval/exams:
 *   get:
 *     tags: [HeadEval]
 *     summary: List exams available to the head evaluator
 *     description: Returns active exams for the head evaluator's location scope.
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
 *       401:
 *         description: Unauthorised
 *       403:
 *         description: Forbidden — Admin or HeadEvaluator role required
 */
router.get('/exams', controller.getExams);

/**
 * @openapi
 * /api/headeval/exams/{examId}/papers:
 *   get:
 *     tags: [HeadEval]
 *     summary: List papers for a given exam (head evaluator scope)
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
 *       404:
 *         description: Exam not found
 */
router.get('/exams/:examId/papers', controller.getPapers);

/**
 * @openapi
 * /api/headeval/lot:
 *   get:
 *     tags: [HeadEval]
 *     summary: Fetch the allocation lot (scanned booklets awaiting assignment)
 *     description: |
 *       Returns all scanned booklets that are either Unallocated or already allocated,
 *       filtered by paperId and optional status. Used to populate the assignment grid.
 *     parameters:
 *       - in: query
 *         name: paperId
 *         required: true
 *         schema: { type: integer }
 *         example: 1
 *         description: Filter lot by exam paper
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [Unallocated, Allocated, All]
 *           default: All
 *         description: Filter by allocation status
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 100 }
 *     responses:
 *       200:
 *         description: Paged allocation lot
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
 *                         items:
 *                           type: array
 *                           items: { $ref: '#/components/schemas/AllocationLotItem' }
 *                         total: { type: integer }
 *                         page:  { type: integer }
 *                         limit: { type: integer }
 */
router.get('/lot', controller.getLot);

/**
 * @openapi
 * /api/headeval/evaluators:
 *   get:
 *     tags: [HeadEval]
 *     summary: List evaluators available for assignment
 *     description: |
 *       Returns active evaluators at the head evaluator's location, including
 *       their current workload (booklets assigned and completed today).
 *     parameters:
 *       - in: query
 *         name: paperId
 *         schema: { type: integer }
 *         description: Filter evaluators who can evaluate this paper
 *     responses:
 *       200:
 *         description: Array of evaluators with workload info
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
 *                           UserID:         { type: integer }
 *                           Username:       { type: string }
 *                           FullName:       { type: string }
 *                           Assigned:       { type: integer, description: Booklets currently assigned }
 *                           Completed:      { type: integer, description: Booklets evaluated today }
 */
router.get('/evaluators', controller.getEvaluators);

/**
 * @openapi
 * /api/headeval/evaluators/{userId}/papers:
 *   get:
 *     tags: [HeadEval]
 *     summary: List papers mapped to an evaluator (paper scope)
 *   put:
 *     tags: [HeadEval]
 *     summary: Replace evaluator paper scope (empty list = no papers mapped; no assignments until mapped)
 */
router.get('/evaluators/:userId/papers', controller.getEvaluatorPapers);
router.put('/evaluators/:userId/papers', controller.setEvaluatorPapers);
router.get('/paper-evaluator-mapping', controller.getPaperEvaluatorMapping);
router.get('/evaluator-assignments', controller.getEvaluatorAssignments);

/**
 * @openapi
 * /api/headeval/assign:
 *   post:
 *     tags: [HeadEval]
 *     summary: Assign booklets to an evaluator
 *     description: |
 *       Inserts AllocationQueue records linking booklets to an evaluator.
 *       Supports bulk assignment — pass an array of bookletIds.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [evaluatorId, bookletIds, allocationType]
 *             properties:
 *               evaluatorId:    { type: integer, example: 5 }
 *               bookletIds:
 *                 type: array
 *                 items: { type: string }
 *                 example: ['110293000124', '110293000125']
 *               allocationType:
 *                 type: string
 *                 enum: [Primary, Secondary, Spot]
 *                 example: Primary
 *                 description: 'Primary = first evaluation, Secondary = second for variance check, Spot = random audit'
 *               paperId:        { type: integer, example: 1 }
 *     responses:
 *       201:
 *         description: Booklets assigned successfully
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
 *                         assigned: { type: integer, example: 10, description: Number of booklets assigned }
 *       400:
 *         description: Validation error — empty bookletIds or invalid allocationType
 *       409:
 *         description: One or more booklets already have an active allocation of this type
 */
router.post('/assign', controller.assign);

/**
 * @openapi
 * /api/headeval/assign/{allocationId}:
 *   delete:
 *     tags: [HeadEval]
 *     summary: Unassign / remove a booklet allocation
 *     description: |
 *       Removes an AllocationQueue record. Can only be done when the evaluation
 *       status is still Pending (not InProgress or Completed).
 *     parameters:
 *       - in: path
 *         name: allocationId
 *         required: true
 *         schema: { type: integer }
 *         example: 42
 *     responses:
 *       200:
 *         description: Allocation removed
 *       409:
 *         description: Cannot unassign — evaluation is already InProgress or Completed
 *       404:
 *         description: Allocation not found
 */
router.delete('/assign/:allocationId', controller.unassign);

/**
 * @openapi
 * /api/headeval/summary/{paperId}:
 *   get:
 *     tags: [HeadEval]
 *     summary: Allocation and evaluation summary for a paper
 *     description: |
 *       Returns aggregated progress metrics: total booklets scanned, allocated,
 *       evaluated (primary + secondary), pending, flagged for variance, and
 *       average marks per evaluator.
 *     parameters:
 *       - in: path
 *         name: paperId
 *         required: true
 *         schema: { type: integer }
 *         example: 1
 *     responses:
 *       200:
 *         description: Summary metrics object
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
 *                         totalScanned:     { type: integer, example: 590 }
 *                         totalAllocated:   { type: integer, example: 500 }
 *                         primaryComplete:  { type: integer, example: 320 }
 *                         secondaryComplete: { type: integer, example: 150 }
 *                         pendingEval:      { type: integer, example: 180 }
 *                         varianceFlagged:  { type: integer, example: 12 }
 *                         evaluators:
 *                           type: array
 *                           items:
 *                             type: object
 *                             properties:
 *                               FullName:   { type: string }
 *                               Assigned:   { type: integer }
 *                               Completed:  { type: integer }
 *                               AvgMarks:   { type: number }
 *       404:
 *         description: Paper not found
 */
router.get('/summary/:paperId', controller.summary);

router.get('/allocation-settings', controller.getAllocationSettings);
router.put('/allocation-settings', controller.setAllocationSettings);
router.post('/auto-assign', controller.autoAssign);

export default router;
