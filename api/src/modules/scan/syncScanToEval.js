import logger from '../../utils/logger.js';
import HeadEvalRepository from '../headeval/headeval.repository.js';

/**
 * Inserts or updates a booklet in EvaluationDB.Eval_Booklets so it appears in
 * Admin → Assign Booklets and in evaluators' pending lists. Call after a successful
 * save to Scan_Booklets. Non-fatal: logs and returns on failure (e.g. missing
 * Eval_Exams/Eval_Papers/Locations with matching IDs).
 *
 * @param {import('mysql2/promise').Pool} evalDb - EvaluationDB pool
 * @param {object} booklet - { bookletId, examId, paperId, locationId, centreCode, totalPagesScanned, filePath, createdBy, createdFromIP, createdFromSystem }
 */
/** @returns {Promise<{ ok: boolean, error?: string, code?: string, reason?: string }>} */
export async function syncBookletToEval(evalDb, booklet) {
  if (!evalDb || !booklet?.bookletId) {
    return { ok: false, reason: 'missing-eval-db-or-booklet-id' };
  }
  try {
    await evalDb.execute(
      `INSERT INTO Eval_Booklets
        (BookletID, ExamID, PaperID, LocationID, CentreCode, TotalPages, FilePath,
         EvaluationStatus, CreatedBy, CreatedFromIP, CreatedFromSystem)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'Open', ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         TotalPages = VALUES(TotalPages),
         FilePath = VALUES(FilePath),
         ModifiedAt = NOW()`,
      [
        booklet.bookletId,
        booklet.examId ?? null,
        booklet.paperId ?? null,
        booklet.locationId ?? null,
        (booklet.centreCode ?? '') || '',
        booklet.totalPagesScanned ?? 0,
        booklet.filePath ?? '',
        booklet.createdBy ?? null,
        booklet.createdFromIP ?? null,
        booklet.createdFromSystem ?? null,
      ]
    );
    logger.info('syncBookletToEval OK', {
      module: 'upload',
      bookletId: booklet.bookletId,
      examId: booklet.examId,
      paperId: booklet.paperId,
    });
    if (booklet.paperId) {
      try {
        const heRepo = new HeadEvalRepository(evalDb);
        const ar = await heRepo.tryAutoAssignOneBooklet({
          bookletId: booklet.bookletId,
          paperId: booklet.paperId,
          assignedBy: 'sync',
        });
        if (ar.status === 'assigned') {
          logger.info('tryAutoAssignOneBooklet after sync', {
            module: 'upload',
            bookletId: booklet.bookletId,
            evaluatorId: ar.evaluatorId,
          });
        }
      } catch (autoErr) {
        logger.warn('tryAutoAssignOneBooklet after sync failed (non-fatal)', {
          module: 'upload',
          bookletId: booklet.bookletId,
          error: autoErr.message,
        });
      }
    }
    return { ok: true };
  } catch (err) {
    logger.warn('syncBookletToEval failed (upload still succeeded)', {
      module: 'upload',
      bookletId: booklet.bookletId,
      error: err.message,
      code: err.code,
    });
    return { ok: false, error: err.message, code: err.code };
  }
}
