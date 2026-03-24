import { Router } from 'express';
import { getEvalDb } from '../../config/database.js';
import { authenticate, authorize } from '../../middleware/auth.js';
import AnswerSheetRepository from './answersheet.repository.js';
import AnswerSheetService    from './answersheet.service.js';
import AnswerSheetController from './answersheet.controller.js';

const router = Router();
const repo   = new AnswerSheetRepository(getEvalDb());
const svc    = new AnswerSheetService(repo);
const ctrl   = new AnswerSheetController(svc);

router.use(authenticate);
router.use(authorize('Admin'));

router.get   ('/',           ctrl.list);
router.post  ('/',           ctrl.create);
router.get   ('/exams',      ctrl.listExams);
router.get   ('/:id',        ctrl.getById);
router.put   ('/:id',        ctrl.update);
router.delete('/:id',        ctrl.remove);
router.post  ('/:id/generate', ctrl.generatePdf);

export default router;
