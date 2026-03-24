export default class AuthRepository {
  constructor(db) {
    this.db = db;
  }

  async findUserByUsername(username) {
    const [rows] = await this.db.execute(
      `SELECT u.UserID, u.Username, u.PasswordHash, u.FullName, u.Email,
              u.IsActive, u.UserStatus, u.IsFirstLogin, u.LocationID, u.ProfilePhotoPath,
              r.RoleID, r.RoleName, r.RoleHierarchyLevel
       FROM Users u
       JOIN Roles r ON u.RoleID = r.RoleID
       WHERE u.Username = ? AND u.IsDeleted = 0`,
      [username]
    );
    return rows[0] || null;
  }

  async findUserByEmail(email) {
    const [rows] = await this.db.execute(
      `SELECT u.UserID, u.Username, u.FullName, u.Email, u.IsActive, u.UserStatus
       FROM Users u
       WHERE u.Email = ? AND u.IsDeleted = 0`,
      [email]
    );
    return rows[0] || null;
  }

  async findScanUserByUsername(scanDb, username) {
    const [rows] = await scanDb.execute(
      `SELECT u.UserID, u.Username, u.PasswordHash, u.FullName, u.IsActive,
              u.LocationID, r.RoleID, r.RoleName, r.RoleHierarchyLevel
       FROM Scan_Users u
       JOIN Scan_Roles r ON u.RoleID = r.RoleID
       WHERE u.Username = ? AND u.IsDeleted = 0`,
      [username]
    );
    return rows[0] || null;
  }

  async findUserById(userId) {
    const [rows] = await this.db.execute(
      `SELECT u.UserID, u.Username, u.FullName, u.Email, u.IsActive,
              u.UserStatus, u.LocationID, u.ProfilePhotoPath, u.PasswordHash,
              r.RoleID, r.RoleName, r.RoleHierarchyLevel
       FROM Users u
       JOIN Roles r ON u.RoleID = r.RoleID
       WHERE u.UserID = ? AND u.IsDeleted = 0`,
      [userId]
    );
    return rows[0] || null;
  }

  async updatePassword(userId, passwordHash, isFirstLogin = 0) {
    await this.db.execute(
      `UPDATE Users
       SET PasswordHash = ?, IsFirstLogin = ?, UserStatus = 'Active', PasswordChangedAt = NOW()
       WHERE UserID = ?`,
      [passwordHash, isFirstLogin, userId]
    );
  }

  // ── OTP management ──────────────────────────────────────────────────────────
  async createOtp(userId, otpCode, expiresAt) {
    // Invalidate any existing unused OTPs for this user
    await this.db.execute(
      `UPDATE Password_OTP_Tokens SET IsUsed = 1 WHERE UserID = ? AND IsUsed = 0`,
      [userId]
    );
    const [result] = await this.db.execute(
      `INSERT INTO Password_OTP_Tokens (UserID, OTPCode, ExpiresAt) VALUES (?, ?, ?)`,
      [userId, otpCode, expiresAt]
    );
    return result.insertId;
  }

  async findValidOtp(userId, otpCode) {
    const [rows] = await this.db.execute(
      `SELECT TokenID FROM Password_OTP_Tokens
       WHERE UserID = ? AND OTPCode = ? AND IsUsed = 0 AND ExpiresAt > NOW()`,
      [userId, otpCode]
    );
    return rows[0] || null;
  }

  async markOtpUsed(tokenId) {
    await this.db.execute(
      `UPDATE Password_OTP_Tokens SET IsUsed = 1 WHERE TokenID = ?`,
      [tokenId]
    );
  }

  // ── Admin helpers ────────────────────────────────────────────────────────────
  async createUser({ username, passwordHash, fullName, email, roleId, locationId, createdBy }) {
    const [result] = await this.db.execute(
      `INSERT INTO Users (Username, PasswordHash, FullName, Email, RoleID, LocationID,
                          UserStatus, IsFirstLogin, IsActive, CreatedBy)
       VALUES (?, ?, ?, ?, ?, ?, 'Pending', 1, 1, ?)`,
      [username, passwordHash, fullName, email, roleId, locationId, createdBy]
    );
    return result.insertId;
  }

  async listUsers({ limit = 50, offset = 0 }) {
    const [rows] = await this.db.execute(
      `SELECT u.UserID, u.Username, u.FullName, u.Email, u.UserStatus, u.IsActive,
              u.IsFirstLogin, u.CreatedAt, r.RoleName, l.LocationName
       FROM Users u
       LEFT JOIN Roles r ON u.RoleID = r.RoleID
       LEFT JOIN Eval_Locations l ON u.LocationID = l.LocationID
       WHERE u.IsDeleted = 0
       ORDER BY u.CreatedAt DESC
       LIMIT ${limit} OFFSET ${offset}`
    );
    const [[{ total }]] = await this.db.execute(
      `SELECT COUNT(*) AS total FROM Users WHERE IsDeleted = 0`
    );
    return { users: rows, total };
  }

  async softDeleteUser(userId) {
    await this.db.execute(
      `UPDATE Users SET IsDeleted = 1, DeletedAt = NOW() WHERE UserID = ? AND UserStatus = 'Pending'`,
      [userId]
    );
  }

  async resetUserPassword(userId, passwordHash, updatedBy) {
    await this.db.execute(
      `UPDATE Users SET PasswordHash = ?, IsFirstLogin = 1, UserStatus = 'Pending',
                        ModifiedBy = ?, ModifiedAt = NOW()
       WHERE UserID = ?`,
      [passwordHash, updatedBy, userId]
    );
  }

  // ── Session Context ──────────────────────────────────────────────────────
  async createSession({ userId, locationId, workstationId, sessionPeriod, examId, paperId,
                        ipAddress, deviceInfo, geoLatitude, geoLongitude, loginPhotoPath }) {
    // Close any existing active sessions for this user
    await this.db.execute(
      `UPDATE Eval_Sessions SET IsActive = 0, LogoutTime = NOW() WHERE UserID = ? AND IsActive = 1`,
      [userId]
    );
    const [result] = await this.db.execute(
      `INSERT INTO Eval_Sessions
         (UserID, LocationID, WorkstationID, SessionPeriod, ExamID, PaperID,
          IPAddress, DeviceInfo, GeoLatitude, GeoLongitude, LoginPhotoPath, LoginTime, HeartbeatAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [userId, locationId || null, workstationId || null, sessionPeriod || 'Morning',
       examId || null, paperId || null, ipAddress, deviceInfo,
       geoLatitude ?? null, geoLongitude ?? null, loginPhotoPath || null]
    );
    return result.insertId;
  }

  async updateSessionHeartbeat(sessionId, userId) {
    await this.db.execute(
      `UPDATE Eval_Sessions SET HeartbeatAt = NOW() WHERE SessionID = ? AND UserID = ?`,
      [sessionId, userId]
    );
  }

  async closeSession(userId) {
    await this.db.execute(
      `UPDATE Eval_Sessions SET IsActive = 0, LogoutTime = NOW() WHERE UserID = ? AND IsActive = 1`,
      [userId]
    );
  }

  async getActiveSession(userId) {
    const [rows] = await this.db.execute(
      `SELECT s.SessionID, s.LocationID, s.WorkstationID, s.SessionPeriod,
              s.ExamID, s.PaperID, s.LoginTime, s.HeartbeatAt,
              l.LocationName, ee.ExamName, ep.PaperName
       FROM Eval_Sessions s
       LEFT JOIN Eval_Locations l  ON s.LocationID = l.LocationID
       LEFT JOIN Eval_Exams ee     ON s.ExamID = ee.ExamID
       LEFT JOIN Eval_Papers ep    ON s.PaperID = ep.PaperID
       WHERE s.UserID = ? AND s.IsActive = 1
       ORDER BY s.LoginTime DESC LIMIT 1`,
      [userId]
    );
    return rows[0] || null;
  }

  // ── Audit log helper ────────────────────────────────────────────────────
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
    } catch {
      // Never throw from audit log — non-blocking
    }
  }

  async listActivityLogs({ userId, moduleName, actionType, dateFrom, dateTo, limit = 100, offset = 0 }) {
    let where = '1=1';
    const params = [];
    if (userId)     { where += ' AND al.UserID = ?';     params.push(userId); }
    if (moduleName) { where += ' AND al.ModuleName = ?'; params.push(moduleName); }
    if (actionType) { where += ' AND al.ActionType = ?'; params.push(actionType); }
    if (dateFrom)   { where += ' AND al.CreatedAt >= ?'; params.push(dateFrom); }
    if (dateTo)     { where += ' AND al.CreatedAt <= ?'; params.push(dateTo); }

    const safeLimit  = parseInt(limit, 10) || 100;
    const safeOffset = parseInt(offset, 10) || 0;

    const [rows] = await this.db.execute(
      `SELECT al.LogID, al.UserID, u.FullName, u.Username, al.ModuleName, al.ActionType,
              al.ReferenceID, al.OldValues, al.NewValues, al.IPAddress, al.DeviceInfo,
              al.CreatedAt
       FROM ActivityLogs al
       LEFT JOIN Users u ON al.UserID = u.UserID
       WHERE ${where}
       ORDER BY al.CreatedAt DESC
       LIMIT ${safeLimit} OFFSET ${safeOffset}`,
      params
    );
    const [[{ total }]] = await this.db.execute(
      `SELECT COUNT(*) AS total FROM ActivityLogs al WHERE ${where}`,
      params
    );
    return { logs: rows, total };
  }

  async listWorkstations(locationId) {
    const [rows] = await this.db.execute(
      `SELECT WorkstationID, WorkstationCode, WorkstationName FROM Scan_Workstations
       WHERE LocationID = ? AND IsDeleted = 0
       ORDER BY WorkstationCode`,
      [locationId]
    ).catch(() => [[]]);
    return rows;
  }

  /** Get assigned exam/paper for evaluator from their AllocationQueue (most recent allocation). */
  async getAssignedExamPaper(userId) {
    const [rows] = await this.db.execute(
      `SELECT eb.ExamID, eb.PaperID, ee.ExamName, ee.ExamCode, ep.PaperName, ep.PaperCode
       FROM AllocationQueue aq
       JOIN Eval_Booklets eb ON aq.BookletID = eb.BookletID AND eb.IsDeleted = 0
       LEFT JOIN Eval_Exams ee ON eb.ExamID = ee.ExamID
       LEFT JOIN Eval_Papers ep ON eb.PaperID = ep.PaperID
       WHERE aq.AllocatedToUserID = ? AND aq.IsDeleted = 0
       ORDER BY aq.AllocatedAt DESC
       LIMIT 1`,
      [userId]
    ).catch(() => [[]]);
    return rows[0] || null;
  }
}
