export default class AdminRepository {
  constructor(db) {
    this.db = db;
  }

  // ── Users ───────────────────────────────────────────────────────────────────
  async listUsers({ limit = 50, offset = 0, status, roleId }) {
    let where = 'u.IsDeleted = 0';
    const params = [];
    if (status) { where += ' AND u.UserStatus = ?'; params.push(status); }
    if (roleId) { where += ' AND u.RoleID = ?'; params.push(roleId); }

    const [users] = await this.db.execute(
      `SELECT u.UserID, u.Username, u.FullName, u.Email, u.UserStatus,
              u.IsActive, u.IsFirstLogin, u.CreatedAt, u.PasswordChangedAt,
              u.ProfilePhotoPath,
              r.RoleName, r.RoleID, l.LocationName, l.LocationID
       FROM Users u
       LEFT JOIN Roles r ON u.RoleID = r.RoleID
       LEFT JOIN Eval_Locations l ON u.LocationID = l.LocationID
       WHERE ${where}
       ORDER BY u.CreatedAt DESC
       LIMIT ${parseInt(limit)} OFFSET ${parseInt(offset)}`
    );
    const [[{ total }]] = await this.db.execute(
      `SELECT COUNT(*) AS total FROM Users u WHERE ${where}`,
      params
    );
    return { users, total };
  }

  async getUserById(userId) {
    const [rows] = await this.db.execute(
      `SELECT u.UserID, u.Username, u.FullName, u.Email, u.UserStatus,
              u.IsActive, u.IsFirstLogin, u.RoleID, u.LocationID, u.ProfilePhotoPath,
              r.RoleName, l.LocationName
       FROM Users u
       LEFT JOIN Roles r ON u.RoleID = r.RoleID
       LEFT JOIN Eval_Locations l ON u.LocationID = l.LocationID
       WHERE u.UserID = ? AND u.IsDeleted = 0`,
      [userId]
    );
    return rows[0] || null;
  }

  async createUser({ username, passwordHash, fullName, email, roleId, locationId, createdBy, profilePhotoPath }) {
    const [result] = await this.db.execute(
      `INSERT INTO Users (Username, PasswordHash, FullName, Email, RoleID, LocationID,
                          UserStatus, IsFirstLogin, IsActive, CreatedBy, ProfilePhotoPath)
       VALUES (?, ?, ?, ?, ?, ?, 'Pending', 1, 1, ?, ?)`,
      [username, passwordHash, fullName, email, roleId, locationId, createdBy, profilePhotoPath || null]
    );
    return result.insertId;
  }

  async updateUserPhoto(userId, profilePhotoPath, updatedBy) {
    await this.db.execute(
      `UPDATE Users SET ProfilePhotoPath = ?, ModifiedBy = ?, ModifiedAt = NOW() WHERE UserID = ?`,
      [profilePhotoPath, updatedBy, userId]
    );
  }

  async getUserPhoto(userId) {
    const [rows] = await this.db.execute(
      `SELECT ProfilePhotoPath FROM Users WHERE UserID = ? AND IsDeleted = 0`,
      [userId]
    );
    return rows[0]?.ProfilePhotoPath || null;
  }

  async updateUser(userId, { fullName, email, roleId, locationId, isActive, userStatus, updatedBy }) {
    const status = userStatus && ['Pending', 'Active', 'Suspended'].includes(userStatus) ? userStatus : null;
    if (status != null) {
      await this.db.execute(
        `UPDATE Users SET FullName = ?, Email = ?, RoleID = ?, LocationID = ?,
                          IsActive = ?, UserStatus = ?, ModifiedBy = ?, ModifiedAt = NOW()
         WHERE UserID = ?`,
        [fullName, email, roleId, locationId, isActive, status, updatedBy, userId]
      );
    } else {
      await this.db.execute(
        `UPDATE Users SET FullName = ?, Email = ?, RoleID = ?, LocationID = ?,
                          IsActive = ?, ModifiedBy = ?, ModifiedAt = NOW()
         WHERE UserID = ?`,
        [fullName, email, roleId, locationId, isActive, updatedBy, userId]
      );
    }
  }

  async softDeleteUser(userId, deletedBy) {
    const [result] = await this.db.execute(
      `UPDATE Users SET IsDeleted = 1, DeletedAt = NOW(), DeletedBy = ?
       WHERE UserID = ? AND UserStatus = 'Pending'`,
      [deletedBy, userId]
    );
    return result.affectedRows;
  }

  async resetUserPassword(userId, passwordHash, updatedBy) {
    await this.db.execute(
      `UPDATE Users SET PasswordHash = ?, IsFirstLogin = 1, UserStatus = 'Pending',
                        ModifiedBy = ?, ModifiedAt = NOW()
       WHERE UserID = ?`,
      [passwordHash, updatedBy, userId]
    );
  }

  async listRoles() {
    const [rows] = await this.db.execute(
      `SELECT RoleID, RoleName, RoleHierarchyLevel FROM Roles WHERE IsDeleted = 0 ORDER BY RoleHierarchyLevel`
    );
    return rows;
  }

  async getRoleById(roleId) {
    const [rows] = await this.db.execute(
      `SELECT RoleID, RoleName FROM Roles WHERE RoleID = ? AND IsDeleted = 0`,
      [roleId]
    );
    return rows[0] || null;
  }

  async listLocations() {
    const [rows] = await this.db.execute(
      `SELECT LocationID, LocationCode, LocationName FROM Eval_Locations
       WHERE IsDeleted = 0 AND IsActive = 1 ORDER BY LocationName`
    );
    return rows;
  }

  // ── System Settings ──────────────────────────────────────────────────────────
  async getSettings(keys) {
    const placeholders = keys.map(() => '?').join(',');
    const [rows] = await this.db.execute(
      `SELECT SettingKey, SettingValue, Description FROM System_Settings
       WHERE SettingKey IN (${placeholders})`,
      keys
    );
    return Object.fromEntries(rows.map((r) => [r.SettingKey, { value: r.SettingValue, description: r.Description }]));
  }

  async getAllSettings() {
    const [rows] = await this.db.execute(
      `SELECT SettingKey, SettingValue, Description, UpdatedAt FROM System_Settings ORDER BY SettingKey`
    );
    return rows;
  }

  async upsertSettings(settings, updatedBy) {
    for (const [key, value] of Object.entries(settings)) {
      await this.db.execute(
        `INSERT INTO System_Settings (SettingKey, SettingValue, UpdatedBy, UpdatedAt)
         VALUES (?, ?, ?, NOW())
         ON DUPLICATE KEY UPDATE SettingValue = VALUES(SettingValue), UpdatedBy = VALUES(UpdatedBy), UpdatedAt = NOW()`,
        [key, value, updatedBy]
      );
    }
  }

  // ── Question Paper Config ────────────────────────────────────────────────────
  async listExams() {
    const [rows] = await this.db.execute(
      `SELECT ExamID, ExamCode, ExamName, ExamYear FROM Eval_Exams
       WHERE IsDeleted = 0 AND IsActive = 1 ORDER BY ExamYear DESC, ExamName`
    );
    return rows;
  }

  async listPapersByExam(examId) {
    const [rows] = await this.db.execute(
      `SELECT PaperID, PaperCode, PaperName, MaxMarks, QuestionPaperPath
       FROM Eval_Papers WHERE ExamID = ? AND IsDeleted = 0 ORDER BY PaperCode`,
      [examId]
    );
    return rows;
  }

  async getQPaperConfig(paperId) {
    const [papers] = await this.db.execute(
      `SELECT ep.PaperID, ep.PaperCode, ep.PaperName, ep.MaxMarks, ep.QuestionPaperPath,
              ee.ExamID, ee.ExamName, ee.ExamCode
       FROM Eval_Papers ep
       JOIN Eval_Exams ee ON ep.ExamID = ee.ExamID
       WHERE ep.PaperID = ? AND ep.IsDeleted = 0`,
      [paperId]
    );
    if (!papers[0]) return null;

    const [sets] = await this.db.execute(
      `SELECT SetID, SetLabel, SetType, TotalQuestions, AttemptQuestions,
              MarksPerQuestion, QuestionRangeFrom, QuestionRangeTo, SortOrder
       FROM Eval_QuestionSets WHERE PaperID = ? ORDER BY SortOrder, SetID`,
      [paperId]
    );

    const [scheme] = await this.db.execute(
      `SELECT SchemeID, SetID, PageNumber, QuestionNumber, SubQuestionCode, MaxMarks, SortOrder
       FROM Eval_QuestionScheme WHERE PaperID = ? ORDER BY SortOrder, QuestionNumber`,
      [paperId]
    );

    return { paper: papers[0], sets, scheme };
  }

  async updateQuestionPaperPath(paperId, filePath, updatedBy) {
    await this.db.execute(
      `UPDATE Eval_Papers SET QuestionPaperPath = ?, ModifiedBy = ?, ModifiedAt = NOW()
       WHERE PaperID = ?`,
      [filePath, updatedBy, paperId]
    );
  }

  async saveSetsAtomic(paperId, sets, userId) {
    const conn = await this.db.getConnection();
    try {
      await conn.beginTransaction();

      // Delete existing scheme entries and sets for this paper
      await conn.execute(`DELETE FROM Eval_QuestionScheme WHERE PaperID = ?`, [paperId]);
      await conn.execute(`DELETE FROM Eval_QuestionSets WHERE PaperID = ?`, [paperId]);

      let questionOffset = 0;
      for (let i = 0; i < sets.length; i++) {
        const set = sets[i];
        const [setResult] = await conn.execute(
          `INSERT INTO Eval_QuestionSets
             (PaperID, SetLabel, SetType, TotalQuestions, AttemptQuestions,
              MarksPerQuestion, QuestionRangeFrom, QuestionRangeTo, SortOrder, CreatedBy)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            paperId, set.setLabel, set.setType,
            set.totalQuestions, set.attemptQuestions, set.marksPerQuestion,
            set.questionRangeFrom || null, set.questionRangeTo || null,
            i, userId,
          ]
        );
        const setId = setResult.insertId;

        // Auto-generate question scheme entries from set
        for (let j = 0; j < set.totalQuestions; j++) {
          const qNum = String(questionOffset + j + 1).padStart(2, '0');
          await conn.execute(
            `INSERT INTO Eval_QuestionScheme
               (PaperID, SetID, PageNumber, QuestionNumber, SubQuestionCode, MaxMarks, SortOrder)
             VALUES (?, ?, NULL, ?, NULL, ?, ?)`,
            [paperId, setId, qNum, set.marksPerQuestion, i * 100 + j]
          );
        }
        questionOffset += set.totalQuestions;
      }

      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  // ── Email Templates ──────────────────────────────────────────────────────────
  async listTemplates() {
    const [rows] = await this.db.execute(
      `SELECT TemplateID, TemplateType, Subject, IsActive, UpdatedAt FROM Email_Templates ORDER BY TemplateType`
    );
    return rows;
  }

  async getTemplate(templateType) {
    const [rows] = await this.db.execute(
      `SELECT TemplateID, TemplateType, Subject, BodyHtml, IsActive FROM Email_Templates WHERE TemplateType = ?`,
      [templateType]
    );
    return rows[0] || null;
  }

  async updateTemplate(templateType, { subject, bodyHtml, isActive, updatedBy }) {
    await this.db.execute(
      `UPDATE Email_Templates SET Subject = ?, BodyHtml = ?, IsActive = ?, UpdatedBy = ?, UpdatedAt = NOW()
       WHERE TemplateType = ?`,
      [subject, bodyHtml, isActive, updatedBy, templateType]
    );
  }
}
