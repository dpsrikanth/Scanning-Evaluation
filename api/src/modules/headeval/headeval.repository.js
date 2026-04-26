const ALLOCATION_MODE_KEY = 'allocation_mode';
const MODES = new Set(['automatic', 'manual']);

export default class HeadEvalRepository {
  constructor(db) {
    this.db = db;
  }

  async getAllocationMode() {
    const [rows] = await this.db.execute(
      `SELECT SettingValue FROM System_Settings WHERE SettingKey = ?`,
      [ALLOCATION_MODE_KEY]
    );
    const v = String(rows[0]?.SettingValue ?? 'automatic').toLowerCase();
    return v === 'manual' ? 'manual' : 'automatic';
  }

  async setAllocationMode(mode) {
    const m = String(mode ?? '').toLowerCase();
    if (!MODES.has(m)) {
      throw Object.assign(new Error('allocationMode must be automatic or manual'), { statusCode: 400 });
    }
    await this.db.execute(
      `INSERT INTO System_Settings (SettingKey, SettingValue, Description)
       VALUES (?, ?, 'Booklet assignment: automatic | manual')
       ON DUPLICATE KEY UPDATE SettingValue = VALUES(SettingValue)`,
      [ALLOCATION_MODE_KEY, m]
    );
    return m;
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

  async assignOneBookletInTransaction(conn, { bookletId, toUserId, allocationType, assignedBy }) {
    const [active] = await conn.execute(
      `SELECT AllocationID FROM AllocationQueue
       WHERE BookletID = ? AND IsDeleted = 0
         AND EvaluationStatus IN ('Allocated', 'InProgress')`,
      [bookletId]
    );
    if (active.length > 0) {
      return { status: 'already_allocated' };
    }

    await conn.execute(
      `INSERT INTO AllocationQueue
         (BookletID, AllocatedToUserID, AllocationType, EvaluationStatus,
          SessionDate, CreatedBy)
       VALUES (?, ?, ?, 'Allocated', CURDATE(), ?)`,
      [bookletId, toUserId, allocationType, assignedBy]
    );
    await conn.execute(
      `UPDATE Eval_Booklets SET EvaluationStatus = 'Allocated', ModifiedAt = NOW()
       WHERE BookletID = ? AND IsDeleted = 0`,
      [bookletId]
    );
    return { status: 'assigned' };
  }

  // ── Bulk assign booklets to an evaluator ─────────────────────────────────────
  async assignBooklets({ bookletIds, toUserId, allocationType = 'Primary', assignedBy }) {
    const results = [];
    for (const bookletId of bookletIds) {
      const conn = await this.db.getConnection();
      try {
        await conn.beginTransaction();
        const [ob] = await conn.execute(
          `SELECT b.BookletID, b.EvaluationStatus
           FROM Eval_Booklets b
           WHERE b.BookletID = ? AND b.IsDeleted = 0 FOR UPDATE`,
          [bookletId]
        );
        if (!ob[0] || ob[0].EvaluationStatus !== 'Open') {
          await conn.rollback();
          results.push({ bookletId, status: 'not_open' });
          continue;
        }
        const [act] = await conn.execute(
          `SELECT 1 FROM AllocationQueue
           WHERE BookletID = ? AND IsDeleted = 0
             AND EvaluationStatus IN ('Allocated', 'InProgress')`,
          [bookletId]
        );
        if (act.length > 0) {
          await conn.rollback();
          results.push({ bookletId, status: 'already_allocated' });
          continue;
        }
        const r = await this.assignOneBookletInTransaction(conn, {
          bookletId,
          toUserId,
          allocationType,
          assignedBy,
        });
        await conn.commit();
        results.push({ bookletId, ...r });
      } catch (e) {
        try {
          await conn.rollback();
        } catch { /* */ }
        throw e;
      } finally {
        conn.release();
      }
    }
    return results;
  }

  /**
   * Open booklets for a paper with no active (Allocated/InProgress) allocation.
   */
  async listOpenBookletsWithoutActiveAllocation(paperId, limit = 50) {
    const lim = Math.min(500, Math.max(1, parseInt(String(limit), 10) || 50));
    const [rows] = await this.db.execute(
      `SELECT b.BookletID
       FROM Eval_Booklets b
       WHERE b.PaperID = ? AND b.EvaluationStatus = 'Open' AND b.IsDeleted = 0
         AND NOT EXISTS (
           SELECT 1 FROM AllocationQueue aq
            WHERE aq.BookletID = b.BookletID AND aq.IsDeleted = 0
              AND aq.EvaluationStatus IN ('Allocated', 'InProgress')
         )
       ORDER BY b.CreatedAt ASC
       LIMIT ${lim}`,
      [paperId]
    );
    return rows.map((r) => r.BookletID);
  }

  /**
   * Auto-assign many open booklets for a paper (per-booklet transaction).
   */
  async autoAssignForPaper({ paperId, limit = 50, assignedBy = 'auto' }) {
    const mode = await this.getAllocationMode();
    if (mode !== 'automatic') {
      throw Object.assign(
        new Error('Auto-assign is only available when allocation mode is set to automatic'),
        { statusCode: 409 }
      );
    }
    const paper = parseInt(String(paperId), 10);
    if (!Number.isFinite(paper) || paper < 1) {
      throw Object.assign(new Error('paperId is required'), { statusCode: 400 });
    }

    const candidates = await this.listOpenBookletsWithoutActiveAllocation(paper, limit);
    const results = [];
    for (const bookletId of candidates) {
      const conn = await this.db.getConnection();
      try {
        await conn.beginTransaction();
        const [ob] = await conn.execute(
          `SELECT b.BookletID, b.PaperID, b.EvaluationStatus
           FROM Eval_Booklets b
           WHERE b.BookletID = ? AND b.IsDeleted = 0 FOR UPDATE`,
          [bookletId]
        );
        if (!ob[0] || ob[0].EvaluationStatus !== 'Open') {
          await conn.rollback();
          results.push({ bookletId, status: 'skipped' });
          continue;
        }
        const [act] = await conn.execute(
          `SELECT 1 FROM AllocationQueue
           WHERE BookletID = ? AND IsDeleted = 0
             AND EvaluationStatus IN ('Allocated', 'InProgress')`,
          [bookletId]
        );
        if (act.length > 0) {
          await conn.rollback();
          results.push({ bookletId, status: 'already_allocated' });
          continue;
        }
        const evalId = await this._pickEvaluatorUserIdOnConn(conn);
        if (evalId == null) {
          await conn.rollback();
          results.push({ bookletId, status: 'no_evaluator' });
          continue;
        }
        const r = await this.assignOneBookletInTransaction(conn, {
          bookletId,
          toUserId: evalId,
          allocationType: 'Primary',
          assignedBy,
        });
        await conn.commit();
        results.push({ bookletId, ...r });
      } catch (e) {
        try {
          await conn.rollback();
        } catch { /* */ }
        throw e;
      } finally {
        conn.release();
      }
    }
    return { results, paperId: paper };
  }

  async _pickEvaluatorUserIdOnConn(conn) {
    const [rows] = await conn.execute(
      `SELECT u.UserID,
              COUNT(aq.AllocationID) AS currentLoad
       FROM Users u
       JOIN Roles r ON u.RoleID = r.RoleID
       LEFT JOIN AllocationQueue aq ON aq.AllocatedToUserID = u.UserID
                                    AND aq.SessionDate = CURDATE()
                                    AND aq.IsDeleted = 0
       WHERE u.IsActive = 1 AND u.IsDeleted = 0
         AND r.RoleName IN ('Evaluator', 'Moderator')
         AND u.UserStatus = 'Active'
       GROUP BY u.UserID, u.FullName
       ORDER BY currentLoad ASC, u.FullName ASC
       LIMIT 1`
    );
    return rows[0]?.UserID ?? null;
  }

  /**
   * Auto-assign a single booklet after sync (no 409 for manual — silently skip).
   * @returns {{ assigned?: boolean, status: string, bookletId: string, evaluatorId?: number }}
   */
  async tryAutoAssignOneBooklet({ bookletId, paperId, assignedBy = 'sync' }) {
    const mode = await this.getAllocationMode();
    if (mode !== 'automatic') {
      return { status: 'skipped_mode', bookletId };
    }
    if (!bookletId || !paperId) {
      return { status: 'skipped_missing_ids', bookletId: bookletId ?? '' };
    }

    const conn = await this.db.getConnection();
    try {
      await conn.beginTransaction();
      const [ob] = await conn.execute(
        `SELECT b.BookletID, b.PaperID, b.EvaluationStatus
         FROM Eval_Booklets b
         WHERE b.BookletID = ? AND b.PaperID = ? AND b.IsDeleted = 0 FOR UPDATE`,
        [bookletId, paperId]
      );
      if (!ob[0] || ob[0].EvaluationStatus !== 'Open') {
        await conn.rollback();
        return { status: 'skipped_not_open', bookletId };
      }
      const [act] = await conn.execute(
        `SELECT 1 FROM AllocationQueue
         WHERE BookletID = ? AND IsDeleted = 0
           AND EvaluationStatus IN ('Allocated', 'InProgress')`,
        [bookletId]
      );
      if (act.length > 0) {
        await conn.rollback();
        return { status: 'already_allocated', bookletId };
      }
      const evalId = await this._pickEvaluatorUserIdOnConn(conn);
      if (evalId == null) {
        await conn.rollback();
        return { status: 'no_evaluator', bookletId };
      }
      await this.assignOneBookletInTransaction(conn, {
        bookletId,
        toUserId: evalId,
        allocationType: 'Primary',
        assignedBy,
      });
      await conn.commit();
      return { status: 'assigned', bookletId, evaluatorId: evalId, assigned: true };
    } catch (e) {
      try {
        await conn.rollback();
      } catch { /* */ }
      return { status: 'error', bookletId, message: e.message };
    } finally {
      conn.release();
    }
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
