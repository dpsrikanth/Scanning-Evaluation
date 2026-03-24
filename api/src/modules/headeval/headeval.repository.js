export default class HeadEvalRepository {
  constructor(db) {
    this.db = db;
  }

  // ── Unassigned booklets for a given paper ────────────────────────────────────
  async getLot({ paperId, examId, limit = 100, offset = 0 }) {
    let where = `b.EvaluationStatus = 'Open' AND b.IsDeleted = 0`;
    const params = [];
    if (paperId) { where += ' AND b.PaperID = ?'; params.push(paperId); }
    if (examId)  { where += ' AND b.ExamID = ?';  params.push(examId); }

    const [booklets] = await this.db.execute(
      `SELECT b.BookletID, b.ExamID, b.PaperID, b.TotalPages, b.CentreCode,
              b.EvaluationStatus, b.CreatedAt,
              m.StudentName, m.ProgramLevel, m.Branch, m.Year, m.Semester, m.Subject,
              ep.PaperCode, ep.PaperName, ee.ExamCode, ee.ExamName
       FROM Eval_Booklets b
       LEFT JOIN Eval_BookletMetadata m ON b.BookletID = m.BookletID
       LEFT JOIN Eval_Papers ep ON b.PaperID = ep.PaperID
       LEFT JOIN Eval_Exams ee ON b.ExamID = ee.ExamID
       WHERE ${where}
       ORDER BY b.CreatedAt ASC
       LIMIT ${parseInt(limit)} OFFSET ${parseInt(offset)}`,
      params
    );

    const [[{ total }]] = await this.db.execute(
      `SELECT COUNT(*) AS total FROM Eval_Booklets b WHERE ${where}`,
      params
    );

    return { booklets, total };
  }

  // ── Active evaluators with current assignment load ────────────────────────────
  async getEvaluators({ paperId } = {}) {
    const [rows] = await this.db.execute(
      `SELECT u.UserID, u.FullName, u.Email,
              r.RoleName,
              COUNT(aq.AllocationID) AS currentLoad,
              SUM(CASE WHEN aq.EvaluationStatus = 'Evaluated' THEN 1 ELSE 0 END) AS completedToday
       FROM Users u
       JOIN Roles r ON u.RoleID = r.RoleID
       LEFT JOIN AllocationQueue aq ON aq.AllocatedToUserID = u.UserID
                                    AND aq.SessionDate = CURDATE()
                                    AND aq.IsDeleted = 0
       WHERE u.IsActive = 1 AND u.IsDeleted = 0
         AND r.RoleName IN ('Evaluator', 'Moderator')
         AND u.UserStatus = 'Active'
       GROUP BY u.UserID
       ORDER BY currentLoad ASC, u.FullName ASC`
    );
    return rows;
  }

  // ── Bulk assign booklets to an evaluator ─────────────────────────────────────
  async assignBooklets({ bookletIds, toUserId, allocationType = 'Primary', assignedBy }) {
    const results = [];
    for (const bookletId of bookletIds) {
      // Check not already allocated
      const [existing] = await this.db.execute(
        `SELECT AllocationID FROM AllocationQueue
         WHERE BookletID = ? AND AllocationType = ? AND IsDeleted = 0`,
        [bookletId, allocationType]
      );
      if (existing.length > 0) {
        results.push({ bookletId, status: 'already_allocated' });
        continue;
      }

      await this.db.execute(
        `INSERT INTO AllocationQueue
           (BookletID, AllocatedToUserID, AllocationType, EvaluationStatus,
            SessionDate, CreatedBy)
         VALUES (?, ?, ?, 'Allocated', CURDATE(), ?)`,
        [bookletId, toUserId, allocationType, assignedBy]
      );

      await this.db.execute(
        `UPDATE Eval_Booklets SET EvaluationStatus = 'Allocated', ModifiedAt = NOW()
         WHERE BookletID = ?`,
        [bookletId]
      );

      results.push({ bookletId, status: 'assigned' });
    }
    return results;
  }

  // ── Unassign a single allocation (only if still Allocated, not started) ───────
  async unassignBooklet(allocationId, unassignedBy) {
    const [rows] = await this.db.execute(
      `SELECT aq.AllocationID, aq.BookletID, aq.EvaluationStatus
       FROM AllocationQueue aq
       WHERE aq.AllocationID = ? AND aq.IsDeleted = 0`,
      [allocationId]
    );
    if (!rows[0]) throw Object.assign(new Error('Allocation not found'), { statusCode: 404 });
    if (rows[0].EvaluationStatus !== 'Allocated') {
      throw Object.assign(new Error('Cannot unassign — evaluation already started'), { statusCode: 409 });
    }

    await this.db.execute(
      `UPDATE AllocationQueue SET IsDeleted = 1 WHERE AllocationID = ?`,
      [allocationId]
    );
    await this.db.execute(
      `UPDATE Eval_Booklets SET EvaluationStatus = 'Open', ModifiedAt = NOW()
       WHERE BookletID = ?`,
      [rows[0].BookletID]
    );
    return { bookletId: rows[0].BookletID };
  }

  // ── Current allocation summary for a paper ────────────────────────────────────
  async getAllocationSummary(paperId) {
    const [rows] = await this.db.execute(
      `SELECT u.UserID, u.FullName,
              COUNT(aq.AllocationID) AS total,
              SUM(CASE WHEN aq.EvaluationStatus = 'Allocated' THEN 1 ELSE 0 END) AS pending,
              SUM(CASE WHEN aq.EvaluationStatus = 'Evaluated' THEN 1 ELSE 0 END) AS completed
       FROM AllocationQueue aq
       JOIN Users u ON aq.AllocatedToUserID = u.UserID
       JOIN Eval_Booklets b ON aq.BookletID = b.BookletID
       WHERE b.PaperID = ? AND aq.IsDeleted = 0
       GROUP BY u.UserID
       ORDER BY total DESC`,
      [paperId]
    );
    return rows;
  }

  async listExams() {
    const [rows] = await this.db.execute(
      `SELECT ExamID, ExamCode, ExamName, ExamYear FROM Eval_Exams WHERE IsActive = 1 AND IsDeleted = 0`
    );
    return rows;
  }

  async listPapers(examId) {
    const [rows] = await this.db.execute(
      `SELECT PaperID, PaperCode, PaperName, MaxMarks FROM Eval_Papers
       WHERE ExamID = ? AND IsDeleted = 0`,
      [examId]
    );
    return rows;
  }
}
