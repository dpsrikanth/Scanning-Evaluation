export default class ScanAdminRepository {
  constructor(db) {
    this.db = db;
  }

  // ── Exams ────────────────────────────────────────────────────────────────

  async listExams() {
    const [rows] = await this.db.execute(
      `SELECT ExamID, ExamCode, ExamName, ExamYear, IsActive
       FROM Scan_Exams WHERE IsDeleted = 0 ORDER BY ExamYear DESC, ExamName`
    );
    return rows;
  }

  async getExam(examId) {
    const [rows] = await this.db.execute(
      `SELECT ExamID, ExamCode, ExamName, ExamYear, IsActive
       FROM Scan_Exams WHERE ExamID = ? AND IsDeleted = 0`,
      [examId]
    );
    return rows[0] || null;
  }

  async createExam(data) {
    const [result] = await this.db.execute(
      `INSERT INTO Scan_Exams (ExamCode, ExamName, ExamYear, IsActive, CreatedBy, CreatedFromIP, CreatedFromSystem)
       VALUES (?, ?, ?, 1, ?, ?, ?)`,
      [data.examCode, data.examName, data.examYear, data.createdBy, data.createdFromIP, data.createdFromSystem]
    );
    return result.insertId;
  }

  async updateExam(examId, data) {
    await this.db.execute(
      `UPDATE Scan_Exams SET ExamCode = ?, ExamName = ?, ExamYear = ?, IsActive = ?,
              ModifiedBy = ?, ModifiedFromIP = ?, ModifiedFromSystem = ?
       WHERE ExamID = ? AND IsDeleted = 0`,
      [data.examCode, data.examName, data.examYear, data.isActive ?? 1,
       data.modifiedBy, data.modifiedFromIP, data.modifiedFromSystem, examId]
    );
  }

  async deleteExam(examId, deletedBy) {
    await this.db.execute(
      `UPDATE Scan_Exams SET IsDeleted = 1, DeletedBy = ?, DeletedAt = NOW() WHERE ExamID = ?`,
      [deletedBy, examId]
    );
  }

  // ── Papers ───────────────────────────────────────────────────────────────

  async listPapers(examId) {
    const params = [];
    let where = 'p.IsDeleted = 0';
    if (examId) { where += ' AND p.ExamID = ?'; params.push(examId); }
    const [rows] = await this.db.execute(
      `SELECT p.PaperID, p.ExamID, p.PaperCode, p.PaperName, p.TotalPages, p.BookletPageCounts,
              e.ExamCode, e.ExamName
       FROM Scan_Papers p
       JOIN Scan_Exams e ON p.ExamID = e.ExamID AND e.IsDeleted = 0
       WHERE ${where}
       ORDER BY e.ExamCode, p.PaperCode`,
      params
    );
    return rows;
  }

  async getPaper(paperId) {
    const [rows] = await this.db.execute(
      `SELECT p.PaperID, p.ExamID, p.PaperCode, p.PaperName, p.TotalPages, p.BookletPageCounts,
              e.ExamCode, e.ExamName
       FROM Scan_Papers p
       JOIN Scan_Exams e ON p.ExamID = e.ExamID
       WHERE p.PaperID = ? AND p.IsDeleted = 0`,
      [paperId]
    );
    return rows[0] || null;
  }

  async createPaper(data) {
    const [result] = await this.db.execute(
      `INSERT INTO Scan_Papers (ExamID, PaperCode, PaperName, TotalPages, BookletPageCounts,
              CreatedBy, CreatedFromIP, CreatedFromSystem)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [data.examId, data.paperCode, data.paperName, data.totalPages,
       data.bookletPageCounts || null, data.createdBy, data.createdFromIP, data.createdFromSystem]
    );
    return result.insertId;
  }

  async updatePaper(paperId, data) {
    await this.db.execute(
      `UPDATE Scan_Papers SET ExamID = ?, PaperCode = ?, PaperName = ?, TotalPages = ?,
              BookletPageCounts = ?, ModifiedBy = ?, ModifiedFromIP = ?, ModifiedFromSystem = ?
       WHERE PaperID = ? AND IsDeleted = 0`,
      [data.examId, data.paperCode, data.paperName, data.totalPages,
       data.bookletPageCounts || null, data.modifiedBy, data.modifiedFromIP, data.modifiedFromSystem, paperId]
    );
  }

  async deletePaper(paperId, deletedBy) {
    await this.db.execute(
      `UPDATE Scan_Papers SET IsDeleted = 1, DeletedBy = ?, DeletedAt = NOW() WHERE PaperID = ?`,
      [deletedBy, paperId]
    );
  }

  // ── Workstations ─────────────────────────────────────────────────────────

  async listWorkstations(locationId) {
    const params = [];
    let where = 'w.IsDeleted = 0';
    if (locationId) { where += ' AND w.LocationID = ?'; params.push(locationId); }
    const [rows] = await this.db.execute(
      `SELECT w.WorkstationID, w.LocationID, w.WorkstationCode, w.WorkstationName,
              w.IsActive, w.AssignedUsername, w.PrinterProfileID,
              l.LocationName, l.LocationCode,
              pp.ProfileName AS PrinterProfileName, pp.Brand AS PrinterBrand, pp.DriverType
       FROM Scan_Workstations w
       JOIN Scan_Locations l ON w.LocationID = l.LocationID
       LEFT JOIN Scan_PrinterProfiles pp ON w.PrinterProfileID = pp.ProfileID
       WHERE ${where}
       ORDER BY l.LocationCode, w.WorkstationCode`,
      params
    );
    return rows;
  }

  async getWorkstation(workstationId) {
    const [rows] = await this.db.execute(
      `SELECT w.WorkstationID, w.LocationID, w.WorkstationCode, w.WorkstationName,
              w.IsActive, w.AssignedUsername, w.PrinterProfileID,
              l.LocationName, pp.ProfileName AS PrinterProfileName
       FROM Scan_Workstations w
       JOIN Scan_Locations l ON w.LocationID = l.LocationID
       LEFT JOIN Scan_PrinterProfiles pp ON w.PrinterProfileID = pp.ProfileID
       WHERE w.WorkstationID = ? AND w.IsDeleted = 0`,
      [workstationId]
    );
    return rows[0] || null;
  }

  async createWorkstation(data) {
    const [result] = await this.db.execute(
      `INSERT INTO Scan_Workstations (LocationID, WorkstationCode, WorkstationName, IsActive,
              AssignedUsername, PrinterProfileID, CreatedBy, CreatedFromIP, CreatedFromSystem)
       VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?)`,
      [data.locationId, data.workstationCode, data.workstationName,
       data.assignedUsername || null, data.printerProfileId || null,
       data.createdBy, data.createdFromIP, data.createdFromSystem]
    );
    return result.insertId;
  }

  async updateWorkstation(workstationId, data) {
    await this.db.execute(
      `UPDATE Scan_Workstations SET LocationID = ?, WorkstationCode = ?, WorkstationName = ?,
              IsActive = ?, AssignedUsername = ?, PrinterProfileID = ?,
              ModifiedBy = ?, ModifiedFromIP = ?, ModifiedFromSystem = ?
       WHERE WorkstationID = ? AND IsDeleted = 0`,
      [data.locationId, data.workstationCode, data.workstationName,
       data.isActive ?? 1, data.assignedUsername || null, data.printerProfileId || null,
       data.modifiedBy, data.modifiedFromIP, data.modifiedFromSystem, workstationId]
    );
  }

  async deleteWorkstation(workstationId, deletedBy) {
    await this.db.execute(
      `UPDATE Scan_Workstations SET IsDeleted = 1, DeletedBy = ?, DeletedAt = NOW()
       WHERE WorkstationID = ?`,
      [deletedBy, workstationId]
    );
  }

  // ── Scan Templates ────────────────────────────────────────────────────────

  async listTemplates() {
    const [rows] = await this.db.execute(
      `SELECT TemplateID, TemplateName, Description, PageCount, DPI, ColorMode, PageSize,
              DuplexMode, JpegQuality, BrightnessAdj, ContrastAdj, SkipBlankPages, DeSkew,
              Threshold, PdfJpegQuality, PdfMaxDpi,
              BarcodeZones, PageBarcodeStartPage, PdfFilenameFormat,
              UploadScheduleMode, UploadIntervalHours,
              IsActive
       FROM Scan_ScanTemplates WHERE IsDeleted = 0 ORDER BY TemplateName`
    );
    return rows.map(r => ({
      ...r,
      BarcodeZones: r.BarcodeZones ? (typeof r.BarcodeZones === 'string' ? JSON.parse(r.BarcodeZones) : r.BarcodeZones) : [],
    }));
  }

  async getTemplate(templateId) {
    const [rows] = await this.db.execute(
      `SELECT TemplateID, TemplateName, Description, PageCount, DPI, ColorMode, PageSize,
              DuplexMode, JpegQuality, BrightnessAdj, ContrastAdj, SkipBlankPages, DeSkew,
              Threshold, PdfJpegQuality, PdfMaxDpi,
              BarcodeZones, PageBarcodeStartPage, PdfFilenameFormat,
              UploadScheduleMode, UploadIntervalHours,
              IsActive
       FROM Scan_ScanTemplates WHERE TemplateID = ? AND IsDeleted = 0`,
      [templateId]
    );
    const r = rows[0];
    if (!r) return null;
    return {
      ...r,
      BarcodeZones: r.BarcodeZones ? (typeof r.BarcodeZones === 'string' ? JSON.parse(r.BarcodeZones) : r.BarcodeZones) : [],
    };
  }

  async createTemplate(data) {
    const barcodeZonesJson = data.barcodeZones != null
      ? JSON.stringify(data.barcodeZones)
      : null;
    const [result] = await this.db.execute(
      `INSERT INTO Scan_ScanTemplates
        (TemplateName, Description, PageCount, DPI, ColorMode, PageSize, DuplexMode,
         JpegQuality, BrightnessAdj, ContrastAdj, SkipBlankPages, DeSkew,
         Threshold, PdfJpegQuality, PdfMaxDpi,
         BarcodeZones, PageBarcodeStartPage, PdfFilenameFormat,
         UploadScheduleMode, UploadIntervalHours,
         IsActive, CreatedBy, CreatedFromIP, CreatedFromSystem)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
      [data.templateName, data.description || null, data.pageCount,
       data.dpi || 300, data.colorMode || 'Grayscale', data.pageSize || 'A4',
       data.duplexMode || 'Simplex', data.jpegQuality ?? 85,
       data.brightnessAdj ?? 128, data.contrastAdj ?? 128,
       data.skipBlankPages ? 1 : 0, data.deSkew !== false ? 1 : 0,
       data.threshold ?? 128, data.pdfJpegQuality ?? 70, data.pdfMaxDpi ?? 150,
       barcodeZonesJson,
       data.pageBarcodeStartPage ?? 2,
       data.pdfFilenameFormat || '{BookletId}',
       data.uploadScheduleMode || 'Immediate',
       data.uploadIntervalHours ?? 0,
       data.createdBy, data.createdFromIP, data.createdFromSystem]
    );
    return result.insertId;
  }

  async updateTemplate(templateId, data) {
    const barcodeZonesJson = data.barcodeZones != null
      ? JSON.stringify(data.barcodeZones)
      : null;
    await this.db.execute(
      `UPDATE Scan_ScanTemplates SET
        TemplateName = ?, Description = ?, PageCount = ?, DPI = ?, ColorMode = ?,
        PageSize = ?, DuplexMode = ?, JpegQuality = ?, BrightnessAdj = ?,
        ContrastAdj = ?, SkipBlankPages = ?, DeSkew = ?,
        Threshold = ?, PdfJpegQuality = ?, PdfMaxDpi = ?,
        BarcodeZones = ?, PageBarcodeStartPage = ?, PdfFilenameFormat = ?,
        UploadScheduleMode = ?, UploadIntervalHours = ?,
        IsActive = ?, ModifiedBy = ?, ModifiedFromIP = ?, ModifiedFromSystem = ?
       WHERE TemplateID = ? AND IsDeleted = 0`,
      [data.templateName, data.description || null, data.pageCount,
       data.dpi || 300, data.colorMode || 'Grayscale', data.pageSize || 'A4',
       data.duplexMode || 'Simplex', data.jpegQuality ?? 85,
       data.brightnessAdj ?? 128, data.contrastAdj ?? 128,
       data.skipBlankPages ? 1 : 0, data.deSkew !== false ? 1 : 0,
       data.threshold ?? 128, data.pdfJpegQuality ?? 70, data.pdfMaxDpi ?? 150,
       barcodeZonesJson,
       data.pageBarcodeStartPage ?? 2,
       data.pdfFilenameFormat || '{BookletId}',
       data.uploadScheduleMode || 'Immediate',
       data.uploadIntervalHours ?? 0,
       data.isActive ?? 1,
       data.modifiedBy, data.modifiedFromIP, data.modifiedFromSystem, templateId]
    );
  }

  async deleteTemplate(templateId, deletedBy) {
    await this.db.execute(
      `UPDATE Scan_ScanTemplates SET IsDeleted = 1, DeletedBy = ?, DeletedAt = NOW()
       WHERE TemplateID = ?`,
      [deletedBy, templateId]
    );
  }

  // ── Template Sample Images ────────────────────────────────────────────────

  async saveTemplateImage(templateId, filePath, imageType = 'SamplePage') {
    // Upsert: delete existing then insert
    await this.db.execute(
      `DELETE FROM Scan_TemplateImages WHERE TemplateID = ? AND ImageType = ?`,
      [templateId, imageType]
    );
    await this.db.execute(
      `INSERT INTO Scan_TemplateImages (TemplateID, ImageType, FilePath) VALUES (?, ?, ?)`,
      [templateId, imageType, filePath]
    );
  }

  async getTemplateImage(templateId, imageType = 'SamplePage') {
    const [rows] = await this.db.execute(
      `SELECT FilePath FROM Scan_TemplateImages
       WHERE TemplateID = ? AND ImageType = ? ORDER BY UploadedAt DESC LIMIT 1`,
      [templateId, imageType]
    );
    return rows[0] || null;
  }

  // ── Printer Profiles ──────────────────────────────────────────────────────

  async listPrinterProfiles() {
    const [rows] = await this.db.execute(
      `SELECT ProfileID, ProfileName, Brand, DriverType, TwainCapabilities, IsActive
       FROM Scan_PrinterProfiles WHERE IsDeleted = 0 ORDER BY Brand, ProfileName`
    );
    return rows;
  }

  async getPrinterProfile(profileId) {
    const [rows] = await this.db.execute(
      `SELECT ProfileID, ProfileName, Brand, DriverType, TwainCapabilities, IsActive
       FROM Scan_PrinterProfiles WHERE ProfileID = ? AND IsDeleted = 0`,
      [profileId]
    );
    return rows[0] || null;
  }

  async createPrinterProfile(data) {
    const caps = data.twainCapabilities
      ? (typeof data.twainCapabilities === 'string' ? data.twainCapabilities : JSON.stringify(data.twainCapabilities))
      : null;
    const [result] = await this.db.execute(
      `INSERT INTO Scan_PrinterProfiles
        (ProfileName, Brand, DriverType, TwainCapabilities, IsActive,
         CreatedBy, CreatedFromIP, CreatedFromSystem)
       VALUES (?, ?, ?, ?, 1, ?, ?, ?)`,
      [data.profileName, data.brand, data.driverType || 'WIA', caps,
       data.createdBy, data.createdFromIP, data.createdFromSystem]
    );
    return result.insertId;
  }

  async updatePrinterProfile(profileId, data) {
    const caps = data.twainCapabilities
      ? (typeof data.twainCapabilities === 'string' ? data.twainCapabilities : JSON.stringify(data.twainCapabilities))
      : null;
    await this.db.execute(
      `UPDATE Scan_PrinterProfiles SET
        ProfileName = ?, Brand = ?, DriverType = ?, TwainCapabilities = ?, IsActive = ?,
        ModifiedBy = ?, ModifiedFromIP = ?, ModifiedFromSystem = ?
       WHERE ProfileID = ? AND IsDeleted = 0`,
      [data.profileName, data.brand, data.driverType || 'WIA', caps,
       data.isActive ?? 1,
       data.modifiedBy, data.modifiedFromIP, data.modifiedFromSystem, profileId]
    );
  }

  async deletePrinterProfile(profileId, deletedBy) {
    await this.db.execute(
      `UPDATE Scan_PrinterProfiles SET IsDeleted = 1, DeletedBy = ?, DeletedAt = NOW()
       WHERE ProfileID = ?`,
      [deletedBy, profileId]
    );
  }

  // ── Scanned booklets (uploads by exam/paper) ───────────────────────────────

  /**
   * Lists booklets from Scan_Booklets with exam and paper info.
   * Filters: examId, paperId, locationId, dateFrom, dateTo (all optional).
   */
  async listScannedBooklets({ examId, paperId, locationId, dateFrom, dateTo, limit = 500, offset = 0 } = {}) {
    const conditions = ['b.IsDeleted = 0'];
    const params = [];
    if (examId)   { conditions.push('b.ExamID = ?');      params.push(examId); }
    if (paperId)  { conditions.push('b.PaperID = ?');    params.push(paperId); }
    if (locationId) { conditions.push('b.LocationID = ?'); params.push(locationId); }
    if (dateFrom) { conditions.push('b.ScanDate >= ?');  params.push(dateFrom); }
    if (dateTo)   { conditions.push('b.ScanDate <= ?');  params.push(dateTo); }
    const where = conditions.join(' AND ');
    const limitNum = Math.max(0, parseInt(limit, 10) || 500);
    const offsetNum = Math.max(0, parseInt(offset, 10) || 0);

    const [rows] = await this.db.execute(
      `SELECT b.BookletID, b.ExamID, b.PaperID, b.LocationID,
              b.TotalPagesExpected, b.TotalPagesScanned, b.ValidationStatus,
              b.ScanDate, b.CreatedBy, b.CreatedAt,
              e.ExamCode, e.ExamName, e.ExamYear,
              p.PaperCode, p.PaperName,
              l.LocationCode, l.LocationName
       FROM Scan_Booklets b
       LEFT JOIN Scan_Exams e ON b.ExamID = e.ExamID
       LEFT JOIN Scan_Papers p ON b.PaperID = p.PaperID
       LEFT JOIN Scan_Locations l ON b.LocationID = l.LocationID
       WHERE ${where}
       ORDER BY b.CreatedAt DESC
       LIMIT ${limitNum} OFFSET ${offsetNum}`,
      params
    );

    const [countRows] = await this.db.execute(
      `SELECT COUNT(*) AS total FROM Scan_Booklets b WHERE ${where}`,
      params.length ? params : []
    );
    const total = (countRows && countRows[0] && countRows[0].total) != null ? Number(countRows[0].total) : 0;

    return { booklets: rows || [], total };
  }

  // ── Shared helpers ────────────────────────────────────────────────────────

  async listLocations() {
    const [rows] = await this.db.execute(
      `SELECT LocationID, LocationCode, LocationName,
              COALESCE(VendorQcEnabled, 1) AS VendorQcEnabled,
              COALESCE(CustomerQcEnabled, 1) AS CustomerQcEnabled
       FROM Scan_Locations
       WHERE IsDeleted = 0 AND IsActive = 1 ORDER BY LocationName`
    );
    return rows;
  }

  async updateLocationQcToggles(locationId, vendorQcEnabled, customerQcEnabled) {
    const [result] = await this.db.execute(
      `UPDATE Scan_Locations
       SET VendorQcEnabled = ?, CustomerQcEnabled = ?
       WHERE LocationID = ? AND IsDeleted = 0`,
      [vendorQcEnabled ? 1 : 0, customerQcEnabled ? 1 : 0, locationId]
    );
    return result.affectedRows;
  }

  async listScanUsers() {
    const [rows] = await this.db.execute(
      `SELECT u.UserID, u.Username, u.FullName, u.RoleID, u.LocationID, u.IsActive,
              r.RoleName, l.LocationName
       FROM Scan_Users u
       JOIN Scan_Roles r ON u.RoleID = r.RoleID
       LEFT JOIN Scan_Locations l ON u.LocationID = l.LocationID
       WHERE u.IsDeleted = 0
       ORDER BY u.FullName`
    );
    return rows;
  }

  /** Roles that may be assigned to scanning-station accounts (login source scan). */
  async listScanRolesForUserManagement() {
    const [rows] = await this.db.execute(
      `SELECT RoleID, RoleName, RoleHierarchyLevel
       FROM Scan_Roles
       WHERE RoleName IN ('Admin', 'Operator', 'VendorQC', 'CustomerQC')
       ORDER BY RoleHierarchyLevel ASC, RoleName ASC`
    );
    return rows || [];
  }

  async getScanUserById(userId) {
    const [rows] = await this.db.execute(
      `SELECT u.UserID, u.Username, u.FullName, u.RoleID, u.LocationID, u.IsActive, r.RoleName
       FROM Scan_Users u
       JOIN Scan_Roles r ON u.RoleID = r.RoleID
       WHERE u.UserID = ? AND u.IsDeleted = 0`,
      [userId]
    );
    return rows[0] || null;
  }

  async getScanRoleById(roleId) {
    const [rows] = await this.db.execute(
      `SELECT RoleID, RoleName, RoleHierarchyLevel FROM Scan_Roles WHERE RoleID = ?`,
      [roleId]
    );
    return rows[0] || null;
  }

  async usernameExistsScan(username, excludeUserId = null) {
    const sql = excludeUserId
      ? `SELECT 1 FROM Scan_Users WHERE Username = ? AND IsDeleted = 0 AND UserID <> ? LIMIT 1`
      : `SELECT 1 FROM Scan_Users WHERE Username = ? AND IsDeleted = 0 LIMIT 1`;
    const params = excludeUserId ? [username, excludeUserId] : [username];
    const [rows] = await this.db.execute(sql, params);
    return rows.length > 0;
  }

  async createScanUser(row) {
    const {
      username,
      passwordHash,
      fullName,
      roleId,
      locationId,
      createdBy,
      createdFromIP,
      createdFromSystem,
    } = row;
    const [result] = await this.db.execute(
      `INSERT INTO Scan_Users (
        Username, PasswordHash, FullName, RoleID, LocationID, IsActive,
        CreatedBy, CreatedAt, CreatedFromIP, CreatedFromSystem, IsDeleted
      ) VALUES (?, ?, ?, ?, ?, 1, ?, NOW(), ?, ?, 0)`,
      [
        username,
        passwordHash,
        fullName,
        roleId,
        locationId || null,
        createdBy || null,
        createdFromIP || null,
        createdFromSystem || null,
      ]
    );
    return result.insertId;
  }

  async updateScanUser(userId, row) {
    const sets = [];
    const params = [];
    if (row.fullName !== undefined) {
      sets.push('FullName = ?');
      params.push(row.fullName);
    }
    if (row.roleId !== undefined) {
      sets.push('RoleID = ?');
      params.push(row.roleId);
    }
    if (row.locationId !== undefined) {
      sets.push('LocationID = ?');
      params.push(row.locationId || null);
    }
    if (row.passwordHash !== undefined) {
      sets.push('PasswordHash = ?');
      params.push(row.passwordHash);
    }
    if (row.isActive !== undefined) {
      sets.push('IsActive = ?');
      params.push(row.isActive ? 1 : 0);
    }
    if (row.modifiedBy !== undefined) {
      sets.push('ModifiedBy = ?');
      params.push(row.modifiedBy);
    }
    if (row.modifiedFromIP !== undefined) {
      sets.push('ModifiedFromIP = ?');
      params.push(row.modifiedFromIP);
    }
    if (row.modifiedFromSystem !== undefined) {
      sets.push('ModifiedFromSystem = ?');
      params.push(row.modifiedFromSystem);
    }
    if (sets.length === 0) return 0;
    sets.push('ModifiedAt = NOW()');
    params.push(userId);
    const [result] = await this.db.execute(
      `UPDATE Scan_Users SET ${sets.join(', ')} WHERE UserID = ? AND IsDeleted = 0`,
      params
    );
    return result.affectedRows;
  }

  async softDeleteScanUser(userId, deletedBy, deletedFromIP) {
    const [result] = await this.db.execute(
      `UPDATE Scan_Users SET
        IsDeleted = 1,
        DeletedBy = ?,
        DeletedAt = NOW(),
        DeletedFromIP = ?,
        IsActive = 0
       WHERE UserID = ? AND IsDeleted = 0`,
      [deletedBy || null, deletedFromIP || null, userId]
    );
    return result.affectedRows;
  }

  // ── Scan output paths (scanned documents storage) ────────────────────────

  async listOutputPaths() {
    const [rows] = await this.db.execute(
      `SELECT PathID, PathLabel, PathValue, IsActive, DisplayOrder, CreatedAt, ModifiedAt
       FROM Scan_OutputPaths ORDER BY DisplayOrder ASC, PathID ASC`
    );
    return rows || [];
  }

  async getActiveOutputPath() {
    const [rows] = await this.db.execute(
      `SELECT PathID, PathLabel, PathValue, IsActive FROM Scan_OutputPaths WHERE IsActive = 1 LIMIT 1`
    );
    return rows[0] || null;
  }

  async createOutputPath({ pathLabel, pathValue, displayOrder = 0 }) {
    const [result] = await this.db.execute(
      `INSERT INTO Scan_OutputPaths (PathLabel, PathValue, IsActive, DisplayOrder)
       VALUES (?, ?, 0, ?)`,
      [pathLabel, pathValue, displayOrder]
    );
    return result.insertId;
  }

  async updateOutputPath(pathId, { pathLabel, pathValue, displayOrder }) {
    const updates = [];
    const params = [];
    if (pathLabel !== undefined) { updates.push('PathLabel = ?'); params.push(pathLabel); }
    if (pathValue !== undefined) { updates.push('PathValue = ?'); params.push(pathValue); }
    if (displayOrder !== undefined) { updates.push('DisplayOrder = ?'); params.push(displayOrder); }
    if (updates.length === 0) return;
    params.push(pathId);
    await this.db.execute(
      `UPDATE Scan_OutputPaths SET ${updates.join(', ')}, ModifiedAt = NOW() WHERE PathID = ?`,
      params
    );
  }

  async setActiveOutputPath(pathId) {
    await this.db.execute(`UPDATE Scan_OutputPaths SET IsActive = 0`);
    await this.db.execute(`UPDATE Scan_OutputPaths SET IsActive = 1 WHERE PathID = ?`, [pathId]);
  }

  async deleteOutputPath(pathId) {
    await this.db.execute(`DELETE FROM Scan_OutputPaths WHERE PathID = ?`, [pathId]);
  }
}
