import logger from '../../utils/logger.js';

/**
 * Inserts or updates a booklet in EvaluationDB.Eval_Booklets so it appears in
 * Admin → Assign Booklets and in evaluators' pending lists. Call after a successful
 * save to Scan_Booklets. Non-fatal: logs and returns on failure (e.g. missing
 * Eval_Exams/Eval_Papers/Locations with matching IDs).
 *
 * @param {import('mysql2/promise').Pool} evalDb - EvaluationDB pool
 * @param {object} booklet - { bookletId, examId, paperId, locationId, centreCode, totalPagesScanned, filePath, createdBy, createdFromIP, createdFromSystem }
 */
export async function syncBookletToEval(evalDb, booklet) {
  if (!evalDb || !booklet?.bookletId) return;
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
  } catch (err) {
    logger.warn('syncBookletToEval failed (upload still succeeded)', {
      module: 'upload',
      bookletId: booklet.bookletId,
      error: err.message,
      code: err.code,
    });
  }
}
