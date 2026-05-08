export default class AnswerSheetRepository {
  constructor(db) {
    this.db = db;
  }

  async list() {
    const [rows] = await this.db.execute(
      `SELECT t.TemplateID, t.TemplateName, t.PaperSize, t.ThemeColor,
              t.OrgName, t.OrgCode, t.ExamID,
              t.TotalAnswerPages, t.PageStyle, t.ShowBarcode, t.ShowQrCode,
              t.RoughWorkPages,
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

  async create(data) {
    const [result] = await this.db.execute(
      `INSERT INTO AnswerSheet_Templates
         (TemplateName, PaperSize, ThemeColor,
          OrgName, OrgNameSecondary, OrgCode, LogoPath, PaperCode, SerialNumberPrefix,
          ExamID, CoverFields, Instructions2, Instructions3,
          TotalAnswerPages, PageStyle, ShowBarcode, ShowQrCode,
          AnswerPageLayout, ValuerConfig, QuestionMapping,
          RegistrationMarks, RoughWorkPages, MarginConfig, FooterConfig,
          CoverBarcodePos, CoverLayout,
          CreatedBy, CreatedFromIP)
       VALUES (?,?,?, ?,?,?,?,?,?, ?,?,?,?, ?,?,?,?, ?,?,?, ?,?,?,?, ?,?, ?,?)`,
      [
        data.templateName,
        data.paperSize || 'A4',
        data.themeColor || '#1a3a6b',
        data.orgName || null,
        data.orgNameSecondary || null,
        data.orgCode || null,
        data.logoPath || null,
        data.paperCode || null,
        data.serialNumberPrefix || '',
        data.examId || null,
        JSON.stringify(data.coverFields),
        data.instructions2 || null,
        data.instructions3 || null,
        data.totalAnswerPages ?? 24,
        data.pageStyle || 'lined',
        data.showBarcode ?? 1,
        data.showQrCode ?? 1,
        data.answerPageLayout ? JSON.stringify(data.answerPageLayout) : null,
        data.valuerConfig ? JSON.stringify(data.valuerConfig) : null,
        data.questionMapping ? JSON.stringify(data.questionMapping) : null,
        data.registrationMarks ? JSON.stringify(data.registrationMarks) : null,
        data.roughWorkPages ?? 0,
        data.marginConfig ? JSON.stringify(data.marginConfig) : null,
        data.footerConfig ? JSON.stringify(data.footerConfig) : null,
        data.coverBarcodePos || 'left',
        data.coverLayout ? JSON.stringify(data.coverLayout) : null,
        data.createdBy,
        data.createdFromIP,
      ]
    );
    return result.insertId;
  }

  async update(id, data) {
    const [result] = await this.db.execute(
      `UPDATE AnswerSheet_Templates SET
         TemplateName       = ?,
         PaperSize          = ?,
         ThemeColor         = ?,
         OrgName            = ?,
         OrgNameSecondary   = ?,
         OrgCode            = ?,
         LogoPath           = ?,
         PaperCode          = ?,
         SerialNumberPrefix = ?,
         ExamID             = ?,
         CoverFields        = ?,
         Instructions2      = ?,
         Instructions3      = ?,
         TotalAnswerPages   = ?,
         PageStyle          = ?,
         ShowBarcode        = ?,
         ShowQrCode         = ?,
         AnswerPageLayout   = ?,
         ValuerConfig       = ?,
         QuestionMapping    = ?,
         RegistrationMarks  = ?,
         RoughWorkPages     = ?,
         MarginConfig       = ?,
         FooterConfig       = ?,
         CoverBarcodePos    = ?,
         CoverLayout        = ?,
         ModifiedBy         = ?,
         ModifiedFromIP     = ?
       WHERE TemplateID = ? AND IsDeleted = 0`,
      [
        data.templateName,
        data.paperSize || 'A4',
        data.themeColor || '#1a3a6b',
        data.orgName || null,
        data.orgNameSecondary || null,
        data.orgCode || null,
        data.logoPath || null,
        data.paperCode || null,
        data.serialNumberPrefix || '',
        data.examId || null,
        JSON.stringify(data.coverFields),
        data.instructions2 || null,
        data.instructions3 || null,
        data.totalAnswerPages ?? 24,
        data.pageStyle || 'lined',
        data.showBarcode ?? 1,
        data.showQrCode ?? 1,
        data.answerPageLayout ? JSON.stringify(data.answerPageLayout) : null,
        data.valuerConfig ? JSON.stringify(data.valuerConfig) : null,
        data.questionMapping ? JSON.stringify(data.questionMapping) : null,
        data.registrationMarks ? JSON.stringify(data.registrationMarks) : null,
        data.roughWorkPages ?? 0,
        data.marginConfig ? JSON.stringify(data.marginConfig) : null,
        data.footerConfig ? JSON.stringify(data.footerConfig) : null,
        data.coverBarcodePos || 'left',
        data.coverLayout ? JSON.stringify(data.coverLayout) : null,
        data.modifiedBy,
        data.modifiedFromIP,
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
