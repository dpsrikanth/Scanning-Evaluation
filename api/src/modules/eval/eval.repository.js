export default class EvalRepository {
  constructor(db) {
    this.db = db;
    /** @type {boolean|undefined} cache: Eval_Annotations.PayloadJSON exists */
    this._annotationPayloadColumn = undefined;
  }

  /** Detect migration 13 (PayloadJSON); avoids crash on DBs not migrated yet */
  async _hasAnnotationPayloadJsonColumn() {
    if (this._annotationPayloadColumn !== undefined) return this._annotationPayloadColumn;
    try {
      const [[rows]] = await this.db.execute(
        `SELECT COUNT(*) AS c FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Eval_Annotations' AND COLUMN_NAME = 'PayloadJSON'`
      );
      this._annotationPayloadColumn = Number(rows.c) > 0;
    } catch {
      this._annotationPayloadColumn = false;
    }
    return this._annotationPayloadColumn;
  }

  async getDashboardSummary(evaluatorId) {
    const baseWhere = evaluatorId
      ? `WHERE aq.AllocatedToUserID = ? AND aq.IsDeleted = 0`
      : `WHERE aq.IsDeleted = 0`;
    const params = evaluatorId ? [evaluatorId] : [];

    const [rows] = await this.db.execute(
      `SELECT
        COUNT(*) AS totalAnswerSheets,
        SUM(CASE WHEN aq.EvaluationStatus = 'Evaluated' THEN 1 ELSE 0 END) AS evaluated,
        SUM(CASE WHEN aq.EvaluationStatus IN ('Allocated','InProgress') THEN 1 ELSE 0 END) AS pending,
        SUM(CASE WHEN aq.EvaluationStatus = 'Rejected' THEN 1 ELSE 0 END) AS rejected
       FROM AllocationQueue aq
       ${baseWhere}`,
      params
    );
    return rows[0];
  }

  async getPendingBooklets(evaluatorId, limit = 50, offset = 0) {
    const safeLimit = parseInt(limit, 10) || 50;
    const safeOffset = parseInt(offset, 10) || 0;
    const [rows] = await this.db.execute(
      `SELECT aq.AllocationID, aq.BookletID, aq.AllocationType, aq.EvaluationStatus,
              aq.SessionDate,
              bm.StudentName, bm.ProgramLevel, bm.Branch, bm.Year, bm.Semester,
              bm.Subject, bm.DocumentNumber,
              ev.TotalMarks, ep.MaxMarks
       FROM AllocationQueue aq
       LEFT JOIN Eval_BookletMetadata bm ON aq.BookletID = bm.BookletID
       LEFT JOIN Evaluations ev ON aq.BookletID = ev.BookletID AND ev.IsSubmitted = 1
       LEFT JOIN Eval_Booklets eb ON aq.BookletID = eb.BookletID
       LEFT JOIN Eval_Papers ep ON eb.PaperID = ep.PaperID
       WHERE aq.AllocatedToUserID = ? AND aq.IsDeleted = 0
       ORDER BY CASE aq.EvaluationStatus
                  WHEN 'Allocated' THEN 1
                  WHEN 'InProgress' THEN 2
                  WHEN 'Evaluated' THEN 3
                  ELSE 4 END,
                aq.AllocatedAt DESC
       LIMIT ${safeLimit} OFFSET ${safeOffset}`,
      [evaluatorId]
    );
    return rows;
  }

  async getBookletForEvaluation(bookletId) {
    const [booklet] = await this.db.execute(
      `SELECT eb.BookletID, eb.ExamID, eb.PaperID, eb.TotalPages,
              eb.FilePath, eb.EvaluationStatus,
              ep.PaperCode, ep.PaperName, ep.MaxMarks,
              ep.QuestionPaperPath, ep.ModelAnswersPath,
              ee.ExamCode, ee.ExamName
       FROM Eval_Booklets eb
       JOIN Eval_Papers ep ON eb.PaperID = ep.PaperID
       JOIN Eval_Exams ee ON eb.ExamID = ee.ExamID
       WHERE eb.BookletID = ? AND eb.IsDeleted = 0`,
      [bookletId]
    );

    const [metadata] = await this.db.execute(
      `SELECT * FROM Eval_BookletMetadata WHERE BookletID = ?`,
      [bookletId]
    );

    const [sets] = await this.db.execute(
      `SELECT SetID, SetLabel, SetType, TotalQuestions, AttemptQuestions,
              MarksPerQuestion, QuestionRangeFrom, QuestionRangeTo, SortOrder
       FROM Eval_QuestionSets
       WHERE PaperID = ?
       ORDER BY SortOrder, SetID`,
      [booklet[0]?.PaperID]
    );

    const [scheme] = await this.db.execute(
      `SELECT SchemeID, SetID, PaperID, PageNumber, QuestionNumber, SubQuestionCode, MaxMarks, SortOrder
       FROM Eval_QuestionScheme
       WHERE PaperID = ?
       ORDER BY SortOrder, QuestionNumber`,
      [booklet[0]?.PaperID]
    );

    return {
      booklet: booklet[0] || null,
      metadata: metadata[0] || null,
      questionScheme: scheme,
      questionSets: sets,
    };
  }

  async createEvaluation(evaluation) {
    const [result] = await this.db.execute(
      `INSERT INTO Evaluations
        (BookletID, EvaluatorUserID, EvaluationType, StartTime, CreatedBy)
       VALUES (?, ?, ?, NOW(), ?)`,
      [evaluation.bookletId, evaluation.evaluatorId, evaluation.type, evaluation.createdBy]
    );
    return result.insertId;
  }

  async deleteEvaluationDetails(evaluationId) {
    await this.db.execute(`DELETE FROM EvaluationDetails WHERE EvaluationID = ?`, [evaluationId]);
  }

  async saveEvaluationDetail(detail) {
    const rawPage = detail.pageNumber ?? detail.PageNumber;
    const pageNum =
      rawPage != null && rawPage !== '' ? parseInt(rawPage, 10) : null;
    const qNum = String(detail.questionNumber ?? detail.QuestionNumber ?? '');
    const sub = String(detail.subQuestionCode ?? detail.SubQuestionCode ?? '');
    const rawSet = detail.setId ?? detail.SetID;
    const setId =
      rawSet != null && rawSet !== '' ? parseInt(rawSet, 10) : null;
    const marks = detail.marksAwarded;
    const marksNum =
      marks === '' || marks == null || Number.isNaN(Number(marks)) ? 0 : Number(marks);
    const maxM = detail.maxMarks;
    const maxNum =
      maxM === '' || maxM == null || Number.isNaN(Number(maxM)) ? 0 : Number(maxM);

    await this.db.execute(
      `INSERT INTO EvaluationDetails
        (EvaluationID, PageNumber, QuestionNumber, SubQuestionCode, SetID,
         MarksAwarded, MaxMarks, Notes, IsFlagged, FlagReason)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        detail.evaluationId,
        Number.isFinite(pageNum) ? pageNum : null,
        qNum,
        sub,
        Number.isFinite(setId) ? setId : null,
        marksNum,
        maxNum,
        detail.notes != null ? detail.notes : null,
        detail.isFlagged ? 1 : 0,
        detail.flagReason != null ? String(detail.flagReason) : null,
      ]
    );
  }

  async getEvaluationDetails(evaluationId) {
    const [rows] = await this.db.execute(
      `SELECT EvaluationDetailID, QuestionNumber, SubQuestionCode,
              MarksAwarded, MaxMarks
       FROM EvaluationDetails WHERE EvaluationID = ?`,
      [evaluationId]
    );
    return rows;
  }

  async getQuestionSetsForPaper(paperId) {
    const [rows] = await this.db.execute(
      `SELECT SetID, SetType, AttemptQuestions
       FROM Eval_QuestionSets WHERE PaperID = ? ORDER BY SortOrder, SetID`,
      [paperId]
    );
    return rows;
  }

  async submitEvaluation(evaluationId, totalMarks) {
    await this.db.execute(
      `UPDATE Evaluations
       SET EndTime = NOW(), TotalMarks = ?, IsSubmitted = 1, SubmittedAt = NOW()
       WHERE EvaluationID = ?`,
      [totalMarks, evaluationId]
    );
  }

  async logPageVisit(evaluationId, pageNumber, durationSeconds, zoomLevel, annotationsMade) {
    const pn =
      pageNumber != null && pageNumber !== '' ? parseInt(pageNumber, 10) : NaN;
    if (!Number.isFinite(pn) || pn < 1) return;
    const dur =
      durationSeconds == null || durationSeconds === ''
        ? null
        : parseInt(durationSeconds, 10);
    const zoom =
      zoomLevel == null || zoomLevel === '' ? null : Number(zoomLevel);
    const ann =
      annotationsMade == null || annotationsMade === ''
        ? 0
        : parseInt(annotationsMade, 10) || 0;
    await this.db.execute(
      `INSERT INTO Eval_PageVisitLog
         (EvaluationID, PageNumber, DurationSeconds, ZoomLevel, AnnotationsMade)
       VALUES (?, ?, ?, ?, ?)`,
      [evaluationId, pn, Number.isFinite(dur) ? dur : null, Number.isFinite(zoom) ? zoom : null, ann]
    );
  }

  // ── Annotations ──────────────────────────────────────────────────────────────
  async saveAnnotations(evaluationId, pageNumber, annotations) {
    const hasPayloadCol = await this._hasAnnotationPayloadJsonColumn();
    // Delete existing annotations for this page first (full replace)
    await this.db.execute(
      `DELETE FROM Eval_Annotations WHERE EvaluationID = ? AND PageNumber = ?`,
      [evaluationId, pageNumber]
    );
    for (const ann of annotations) {
      const payloadVal =
        ann.payload != null
          ? (typeof ann.payload === 'string' ? ann.payload : JSON.stringify(ann.payload))
          : null;
      if (payloadVal != null && !hasPayloadCol) {
        throw Object.assign(
          new Error(
            'This database is missing Eval_Annotations.PayloadJSON (needed for pencil / drawn marks). ' +
              'Run docker/mysql-init/13_eval_annotations_payload.sql on EvaluationDB (or apply migrations/13_eval_annotations_payload.sql), then restart the API.'
          ),
          { statusCode: 503 }
        );
      }
      if (hasPayloadCol) {
        await this.db.execute(
          `INSERT INTO Eval_Annotations
             (EvaluationID, PageNumber, AnnotationType, PosX, PosY, Note, PayloadJSON)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [evaluationId, pageNumber, ann.type, ann.x ?? null, ann.y ?? null, ann.note ?? null, payloadVal]
        );
      } else {
        await this.db.execute(
          `INSERT INTO Eval_Annotations
             (EvaluationID, PageNumber, AnnotationType, PosX, PosY, Note)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [evaluationId, pageNumber, ann.type, ann.x ?? null, ann.y ?? null, ann.note ?? null]
        );
      }
    }
  }

  async getAnnotations(evaluationId) {
    const hasPayloadCol = await this._hasAnnotationPayloadJsonColumn();
    const sql = hasPayloadCol
      ? `SELECT AnnotationID, PageNumber, AnnotationType AS type, PosX AS x, PosY AS y, Note AS note,
                PayloadJSON AS payload
         FROM Eval_Annotations
         WHERE EvaluationID = ?
         ORDER BY PageNumber, AnnotationID`
      : `SELECT AnnotationID, PageNumber, AnnotationType AS type, PosX AS x, PosY AS y, Note AS note
         FROM Eval_Annotations
         WHERE EvaluationID = ?
         ORDER BY PageNumber, AnnotationID`;
    const [rows] = await this.db.execute(sql, [evaluationId]);
    return rows.map((r) => {
      let payload = hasPayloadCol ? r.payload : null;
      if (payload != null && typeof payload === 'string') {
        try {
          payload = JSON.parse(payload);
        } catch {
          /* leave as string */
        }
      }
      return { ...r, payload };
    });
  }

  // ── Booklet-level shared stamps (BLANK / student crossed page) ─────────────
  async bookletExists(bookletId) {
    const [rows] = await this.db.execute(
      `SELECT 1 FROM Eval_Booklets WHERE BookletID = ? LIMIT 1`,
      [bookletId]
    );
    return rows.length > 0;
  }

  async getBookletSharedAnnotations(bookletId) {
    const [rows] = await this.db.execute(
      `SELECT PageNumber, ItemsJson FROM Eval_BookletSharedAnnotations
       WHERE BookletID = ? ORDER BY PageNumber ASC`,
      [bookletId]
    );
    const pages = {};
    for (const r of rows) {
      let items = r.ItemsJson;
      if (items == null) continue;
      if (typeof items === 'string') {
        try {
          items = JSON.parse(items);
        } catch {
          items = [];
        }
      }
      if (!Array.isArray(items)) items = [];
      pages[Number(r.PageNumber)] = items;
    }
    return { pages };
  }

  async saveBookletSharedAnnotationsPage(bookletId, pageNumber, items, userId) {
    const json = JSON.stringify(items ?? []);
    await this.db.execute(
      `INSERT INTO Eval_BookletSharedAnnotations (BookletID, PageNumber, ItemsJson, UpdatedByUserID)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         ItemsJson = VALUES(ItemsJson),
         UpdatedByUserID = VALUES(UpdatedByUserID),
         UpdatedAt = CURRENT_TIMESTAMP`,
      [bookletId, pageNumber, json, userId ?? null]
    );
  }

  // ── Captured Photos ───────────────────────────────────────────────────────
  async saveCapturedPhoto({ userId, evaluationId, photoPath, faceMatchScore, faceMatchResult, captureType, ipAddress }) {
    const [result] = await this.db.execute(
      `INSERT INTO EvaluatorPhotos
         (UserID, EvaluationID, PhotoPath, FaceMatchScore, FaceMatchResult, CaptureType, IPAddress)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [userId, evaluationId || null, photoPath, faceMatchScore ?? null,
       faceMatchResult || 'Skipped', captureType || 'RandomCapture', ipAddress || null]
    );
    return result.insertId;
  }

  async getMismatchCount(userId, sinceHours = 24) {
    const [rows] = await this.db.execute(
      `SELECT COUNT(*) AS cnt FROM EvaluatorPhotos
       WHERE UserID = ? AND FaceMatchResult = 'Mismatch'
         AND CapturedAt >= DATE_SUB(NOW(), INTERVAL ? HOUR)`,
      [userId, sinceHours]
    );
    return rows[0].cnt;
  }

  // ── Time Report ───────────────────────────────────────────────────────────
  async getTimeReport({ evaluatorId, examId, paperId, dateFrom, dateTo }) {
    let where = '1=1';
    const params = [];
    if (evaluatorId) { where += ' AND ev.EvaluatorUserID = ?'; params.push(evaluatorId); }
    if (examId)      { where += ' AND eb.ExamID = ?';           params.push(examId); }
    if (paperId)     { where += ' AND eb.PaperID = ?';          params.push(paperId); }
    if (dateFrom)    { where += ' AND ev.StartTime >= ?';        params.push(dateFrom); }
    if (dateTo)      { where += ' AND ev.StartTime <= ?';        params.push(dateTo + ' 23:59:59'); }

    const [rows] = await this.db.execute(
      `SELECT
         ev.EvaluatorUserID AS userId,
         u.FullName, u.Username,
         ep.PaperCode, ep.PaperName,
         ee.ExamName,
         COUNT(DISTINCT ev.EvaluationID)                                       AS sheetsEvaluated,
         ROUND(AVG(TIMESTAMPDIFF(SECOND, ev.StartTime, ev.EndTime)), 0)        AS avgSecondsPerSheet,
         SUM(TIMESTAMPDIFF(SECOND, ev.StartTime, ev.EndTime))                  AS totalSeconds,
         MIN(TIMESTAMPDIFF(SECOND, ev.StartTime, ev.EndTime))                  AS minSeconds,
         MAX(TIMESTAMPDIFF(SECOND, ev.StartTime, ev.EndTime))                  AS maxSeconds
       FROM Evaluations ev
       JOIN Users u         ON ev.EvaluatorUserID = u.UserID
       JOIN Eval_Booklets eb ON ev.BookletID = eb.BookletID
       JOIN Eval_Papers ep   ON eb.PaperID = ep.PaperID
       JOIN Eval_Exams ee    ON eb.ExamID = ee.ExamID
       WHERE ev.IsSubmitted = 1 AND ${where}
       GROUP BY ev.EvaluatorUserID, u.FullName, u.Username, eb.PaperID, ep.PaperCode, ep.PaperName, ee.ExamName
       ORDER BY u.FullName, ep.PaperCode`,
      params
    );
    return rows;
  }

  async getSubjectTimeReport({ examId, paperId, dateFrom, dateTo }) {
    let where = 'ev.IsSubmitted = 1';
    const params = [];
    if (examId)   { where += ' AND eb.ExamID = ?';    params.push(examId); }
    if (paperId)  { where += ' AND eb.PaperID = ?';   params.push(paperId); }
    if (dateFrom) { where += ' AND ev.StartTime >= ?'; params.push(dateFrom); }
    if (dateTo)   { where += ' AND ev.StartTime <= ?'; params.push(dateTo + ' 23:59:59'); }

    const [rows] = await this.db.execute(
      `SELECT
         ep.PaperCode, ep.PaperName,
         ee.ExamName,
         COUNT(DISTINCT ev.EvaluationID)                                       AS sheetsEvaluated,
         ROUND(AVG(TIMESTAMPDIFF(SECOND, ev.StartTime, ev.EndTime)), 0)        AS avgSecondsPerSheet,
         COUNT(DISTINCT ev.EvaluatorUserID)                                    AS evaluatorCount
       FROM Evaluations ev
       JOIN Eval_Booklets eb ON ev.BookletID = eb.BookletID
       JOIN Eval_Papers ep   ON eb.PaperID = ep.PaperID
       JOIN Eval_Exams ee    ON eb.ExamID = ee.ExamID
       WHERE ${where}
       GROUP BY eb.PaperID, ep.PaperCode, ep.PaperName, ee.ExamName
       ORDER BY ep.PaperCode`,
      params
    );
    return rows;
  }

  async getMonitoringSettings() {
    const [rows] = await this.db.execute(
      `SELECT SettingKey, SettingValue FROM System_Settings
       WHERE SettingKey IN (
         'photo_verify_enabled','photo_verify_action',
         'photo_capture_enabled','photo_capture_interval_min','photo_capture_interval_max',
         'min_time_default','min_time_warning_email','tab_switch_flag_threshold'
       )`
    );
    return Object.fromEntries(rows.map(r => [r.SettingKey, r.SettingValue]));
  }

  // ── Audit log insert ──────────────────────────────────────────────────────
  async insertActivityLog({ userId, moduleName, actionType, referenceId, oldValues, newValues, ipAddress, deviceInfo, sessionId }) {
    try {
      await this.db.execute(
        `INSERT INTO ActivityLogs
           (UserID, ModuleName, ActionType, ReferenceID, OldValues, NewValues,
            IPAddress, DeviceInfo, SessionID)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          userId, moduleName, actionType,
          referenceId ?? null,
          oldValues ? JSON.stringify(oldValues) : null,
          newValues ? JSON.stringify(newValues) : null,
          ipAddress ?? null,
          deviceInfo ?? null,
          sessionId ?? null,
        ]
      );
    } catch { /* non-blocking */ }
  }

  async getVisitedPages(evaluationId) {
    const [rows] = await this.db.execute(
      `SELECT DISTINCT PageNumber FROM Eval_PageVisitLog WHERE EvaluationID = ?`,
      [evaluationId]
    );
    return rows.map((r) => r.PageNumber);
  }

  async updateAllPagesVisited(evaluationId, visited) {
    await this.db.execute(
      `UPDATE Evaluations SET AllPagesVisited = ? WHERE EvaluationID = ?`,
      [visited ? 1 : 0, evaluationId]
    );
  }
}
