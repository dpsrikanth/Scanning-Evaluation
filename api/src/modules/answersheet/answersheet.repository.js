export default class AnswerSheetRepository {
  constructor(db) {
    this.db = db;
  }

  async list() {
    const [rows] = await this.db.execute(
      `SELECT t.TemplateID, t.TemplateName, t.PaperSize, t.ExamID,
              t.TotalAnswerPages, t.PageStyle, t.ShowBarcode, t.ShowQrCode,
              t.IsActive, t.CreatedBy, t.CreatedAt, t.ModifiedAt,
              e.ExamName, e.ExamCode
       FROM AnswerSheet_Templates t
       LEFT JOIN Eval_Exams e ON t.ExamID = e.ExamID
       WHERE t.IsDeleted = 0
       ORDER BY t.CreatedAt DESC`
    );
    return rows;
  }

  async findById(id) {
    const [rows] = await this.db.execute(
      `SELECT t.*, e.ExamName, e.ExamCode
       FROM AnswerSheet_Templates t
       LEFT JOIN Eval_Exams e ON t.ExamID = e.ExamID
       WHERE t.TemplateID = ? AND t.IsDeleted = 0`,
      [id]
    );
    return rows[0] || null;
  }

  async create({ templateName, paperSize, examId, coverFields, instructions2, instructions3,
                 totalAnswerPages, pageStyle, showBarcode, showQrCode, answerPageLayout,
                 createdBy, createdFromIP }) {
    const [result] = await this.db.execute(
      `INSERT INTO AnswerSheet_Templates
         (TemplateName, PaperSize, ExamID, CoverFields, Instructions2, Instructions3,
          TotalAnswerPages, PageStyle, ShowBarcode, ShowQrCode, AnswerPageLayout,
          CreatedBy, CreatedFromIP)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        templateName,
        paperSize || 'A4',
        examId || null,
        JSON.stringify(coverFields),
        instructions2 || null,
        instructions3 || null,
        totalAnswerPages ?? 24,
        pageStyle || 'lined',
        showBarcode ?? 1,
        showQrCode  ?? 1,
        answerPageLayout ? JSON.stringify(answerPageLayout) : null,
        createdBy,
        createdFromIP,
      ]
    );
    return result.insertId;
  }

  async update(id, { templateName, paperSize, examId, coverFields, instructions2, instructions3,
                     totalAnswerPages, pageStyle, showBarcode, showQrCode, answerPageLayout,
                     modifiedBy, modifiedFromIP }) {
    const [result] = await this.db.execute(
      `UPDATE AnswerSheet_Templates SET
         TemplateName      = ?,
         PaperSize         = ?,
         ExamID            = ?,
         CoverFields       = ?,
         Instructions2     = ?,
         Instructions3     = ?,
         TotalAnswerPages  = ?,
         PageStyle         = ?,
         ShowBarcode       = ?,
         ShowQrCode        = ?,
         AnswerPageLayout  = ?,
         ModifiedBy        = ?,
         ModifiedFromIP    = ?
       WHERE TemplateID = ? AND IsDeleted = 0`,
      [
        templateName,
        paperSize || 'A4',
        examId || null,
        JSON.stringify(coverFields),
        instructions2 || null,
        instructions3 || null,
        totalAnswerPages ?? 24,
        pageStyle || 'lined',
        showBarcode ?? 1,
        showQrCode  ?? 1,
        answerPageLayout ? JSON.stringify(answerPageLayout) : null,
        modifiedBy,
        modifiedFromIP,
        id,
      ]
    );
    return result.affectedRows;
  }

  async softDelete(id, deletedBy) {
    const [result] = await this.db.execute(
      `UPDATE AnswerSheet_Templates
       SET IsDeleted = 1, DeletedBy = ?, DeletedAt = NOW()
       WHERE TemplateID = ? AND IsDeleted = 0`,
      [deletedBy, id]
    );
    return result.affectedRows;
  }

  async listExams() {
    const [rows] = await this.db.execute(
      `SELECT ExamID, ExamCode, ExamName, ExamYear
       FROM Eval_Exams
       WHERE IsDeleted = 0
       ORDER BY ExamYear DESC, ExamName`
    );
    return rows;
  }
}
