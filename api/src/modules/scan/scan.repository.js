export default class ScanRepository {
  constructor(db) {
    this.db = db;
  }

  async getScanSettings(locationId) {
    const [locations] = await this.db.execute(
      `SELECT LocationID, LocationCode, LocationName,
              COALESCE(VendorQcEnabled, 1) AS VendorQcEnabled,
              COALESCE(CustomerQcEnabled, 1) AS CustomerQcEnabled
       FROM Scan_Locations WHERE LocationID = ? AND IsDeleted = 0`,
      [locationId]
    );

    const [exams] = await this.db.execute(
      `SELECT ExamID, ExamCode, ExamName, ExamYear FROM Scan_Exams WHERE IsActive = 1 AND IsDeleted = 0`
    );

    const [papers] = await this.db.execute(
      `SELECT PaperID, ExamID, PaperCode, PaperName, TotalPages, BookletPageCounts
       FROM Scan_Papers WHERE IsDeleted = 0`
    );

    const [workstations] = await this.db.execute(
      `SELECT w.WorkstationID, w.WorkstationCode, w.WorkstationName,
              w.AssignedUsername, w.PrinterProfileID,
              pp.ProfileName AS PrinterProfileName, pp.Brand AS PrinterBrand,
              pp.DriverType, pp.TwainCapabilities
       FROM Scan_Workstations w
       LEFT JOIN Scan_PrinterProfiles pp ON w.PrinterProfileID = pp.ProfileID
       WHERE w.LocationID = ? AND w.IsActive = 1 AND w.IsDeleted = 0`,
      [locationId]
    );

    const [templates] = await this.db.execute(
      `SELECT TemplateID, TemplateName, Description, PageCount, DPI, ColorMode, PageSize,
              DuplexMode, JpegQuality, BrightnessAdj, ContrastAdj, SkipBlankPages, DeSkew,
              Threshold, PdfJpegQuality, PdfMaxDpi,
              PdfFilenameFormat, BarcodeStartPage, BarcodeZonesJson,
              UploadScheduleMode, UploadScheduleParam
       FROM Scan_ScanTemplates WHERE IsActive = 1 AND IsDeleted = 0 ORDER BY TemplateName`
    );

    const [printerProfiles] = await this.db.execute(
      `SELECT ProfileID, ProfileName, Brand, DriverType, TwainCapabilities
       FROM Scan_PrinterProfiles WHERE IsActive = 1 AND IsDeleted = 0 ORDER BY Brand, ProfileName`
    );

    // Stringify TwainCapabilities JSON objects so C# can deserialize them as strings
    const stringifyTwain = (row) =>
      row.TwainCapabilities && typeof row.TwainCapabilities === 'object'
        ? { ...row, TwainCapabilities: JSON.stringify(row.TwainCapabilities) }
        : row;

    return {
      location: locations[0] || null,
      exams,
      papers,
      workstations: workstations.map(stringifyTwain),
      templates: templates.map(t => {
        const zones = t.BarcodeZonesJson != null && typeof t.BarcodeZonesJson === 'object'
          ? JSON.stringify(t.BarcodeZonesJson)
          : (t.BarcodeZonesJson || null);
        return {
          ...t,
          BarcodeZonesJson: zones,
          SkipBlankPages: t.SkipBlankPages === 1 || t.SkipBlankPages === true,
          DeSkew: t.DeSkew === 1 || t.DeSkew === true,
        };
      }),
      printerProfiles: printerProfiles.map(stringifyTwain),
      defaults: {
        dpi: 300,
        colorMode: 'Grayscale',
        pageSize: 'A4',
        duplexMode: 'Simplex',
        imageFormat: 'jpeg',
        jpegQuality: 85,
      },
    };
  }

  async getMyWorkstation(username) {
    const [rows] = await this.db.execute(
      `SELECT w.WorkstationID, w.WorkstationCode, w.WorkstationName,
              w.LocationID, w.AssignedUsername, w.PrinterProfileID,
              l.LocationCode, l.LocationName,
              pp.ProfileName AS PrinterProfileName, pp.Brand AS PrinterBrand,
              pp.DriverType, pp.TwainCapabilities
       FROM Scan_Workstations w
       JOIN Scan_Locations l ON w.LocationID = l.LocationID
       LEFT JOIN Scan_PrinterProfiles pp ON w.PrinterProfileID = pp.ProfileID
       WHERE w.AssignedUsername = ? AND w.IsActive = 1 AND w.IsDeleted = 0
       LIMIT 1`,
      [username]
    );
    if (!rows[0]) return null;
    const row = rows[0];
    return row.TwainCapabilities && typeof row.TwainCapabilities === 'object'
      ? { ...row, TwainCapabilities: JSON.stringify(row.TwainCapabilities) }
      : row;
  }

  async getTemplates() {
    const [rows] = await this.db.execute(
      `SELECT TemplateID, TemplateName, Description, PageCount, DPI, ColorMode, PageSize,
              DuplexMode, JpegQuality, BrightnessAdj, ContrastAdj, SkipBlankPages, DeSkew,
              Threshold, PdfJpegQuality, PdfMaxDpi,
              PdfFilenameFormat, BarcodeStartPage, BarcodeZonesJson,
              UploadScheduleMode, UploadScheduleParam
       FROM Scan_ScanTemplates WHERE IsActive = 1 AND IsDeleted = 0 ORDER BY TemplateName`
    );
    return rows.map(t => {
      const zones = t.BarcodeZonesJson != null && typeof t.BarcodeZonesJson === 'object'
        ? JSON.stringify(t.BarcodeZonesJson)
        : (t.BarcodeZonesJson || null);
      return {
        ...t,
        BarcodeZonesJson: zones,
        SkipBlankPages: t.SkipBlankPages === 1 || t.SkipBlankPages === true,
        DeSkew: t.DeSkew === 1 || t.DeSkew === true,
      };
    });
  }

  async getPrinterProfiles() {
    const [rows] = await this.db.execute(
      `SELECT ProfileID, ProfileName, Brand, DriverType, TwainCapabilities
       FROM Scan_PrinterProfiles WHERE IsActive = 1 AND IsDeleted = 0 ORDER BY Brand, ProfileName`
    );
    return rows.map(r =>
      r.TwainCapabilities && typeof r.TwainCapabilities === 'object'
        ? { ...r, TwainCapabilities: JSON.stringify(r.TwainCapabilities) }
        : r
    );
  }

  async getBookletExpectedPages(bookletId) {
    const [rows] = await this.db.execute(
      `SELECT b.BookletID, b.ExamID, b.PaperID, b.TotalPagesExpected,
              p.PaperCode, p.PaperName, p.BookletPageCounts,
              e.ExamCode, e.ExamName
       FROM Scan_Booklets b
       JOIN Scan_Papers p ON b.PaperID = p.PaperID
       JOIN Scan_Exams e ON b.ExamID = e.ExamID
       WHERE b.BookletID = ? AND b.IsDeleted = 0`,
      [bookletId]
    );
    return rows[0] || null;
  }

  async lookupBookletByBarcode(barcodeValue) {
    const [rows] = await this.db.execute(
      `SELECT BookletID, ExamID, PaperID, TotalPagesExpected, ValidationStatus
       FROM Scan_Booklets
       WHERE BookletID = ? AND IsDeleted = 0`,
      [barcodeValue]
    );
    return rows[0] || null;
  }

  async getPaperSettings(examId, paperCode) {
    const [rows] = await this.db.execute(
      `SELECT p.PaperID, p.PaperCode, p.PaperName, p.TotalPages, p.BookletPageCounts
       FROM Scan_Papers p
       WHERE p.ExamID = ? AND p.PaperCode = ? AND p.IsDeleted = 0`,
      [examId, paperCode]
    );
    return rows[0] || null;
  }

  /**
   * Resolve ExamID and PaperID from a bookletId string (format: EXAMCODE_PAPERCODE_...).
   * Returns { examId, paperId } or null if not found or format unrecognized.
   */
  async resolveExamAndPaperFromBookletId(bookletId) {
    if (!bookletId || typeof bookletId !== 'string') return null;
    const parts = bookletId.trim().split('_');
    if (parts.length < 2) return null;
    const examCode = parts[0];
    const paperCode = parts[1];
    const [examRows] = await this.db.execute(
      'SELECT ExamID FROM Scan_Exams WHERE ExamCode = ? AND IsDeleted = 0 LIMIT 1',
      [examCode]
    );
    if (!examRows || examRows.length === 0) return null;
    const examId = examRows[0].ExamID;
    const [paperRows] = await this.db.execute(
      'SELECT PaperID FROM Scan_Papers WHERE ExamID = ? AND PaperCode = ? AND IsDeleted = 0 LIMIT 1',
      [examId, paperCode]
    );
    if (!paperRows || paperRows.length === 0) return null;
    return { examId, paperId: paperRows[0].PaperID };
  }

  /**
   * Resolve ExamID and PaperID from explicit exam/paper codes (from scanner queue / barcode).
   */
  async resolveExamAndPaperFromCodes(examCode, paperCode) {
    if (!examCode || !paperCode) return null;
    const ec = String(examCode).trim();
    const pc = String(paperCode).trim();
    if (!ec || !pc) return null;
    const [examRows] = await this.db.execute(
      'SELECT ExamID FROM Scan_Exams WHERE ExamCode = ? AND IsDeleted = 0 LIMIT 1',
      [ec]
    );
    if (!examRows || examRows.length === 0) return null;
    const examId = examRows[0].ExamID;
    const [paperRows] = await this.db.execute(
      'SELECT PaperID FROM Scan_Papers WHERE ExamID = ? AND PaperCode = ? AND IsDeleted = 0 LIMIT 1',
      [examId, pc]
    );
    if (!paperRows || paperRows.length === 0) return null;
    return { examId, paperId: paperRows[0].PaperID };
  }

  async getLocationQcSettings(locationId) {
    const [rows] = await this.db.execute(
      `SELECT LocationID,
              COALESCE(VendorQcEnabled, 1) AS VendorQcEnabled,
              COALESCE(CustomerQcEnabled, 1) AS CustomerQcEnabled
       FROM Scan_Locations WHERE LocationID = ? AND IsDeleted = 0`,
      [locationId]
    );
    return rows[0] || { VendorQcEnabled: 1, CustomerQcEnabled: 1 };
  }

  async getBookletScanMeta(bookletId) {
    const [rows] = await this.db.execute(
      `SELECT BookletID, LocationID, PaperID, ScanDate,
              VendorQcStatus, CustomerQcStatus
       FROM Scan_Booklets WHERE BookletID = ? AND IsDeleted = 0`,
      [bookletId]
    );
    return rows[0] || null;
  }

  async createBooklet(booklet) {
    const n = v => (v === undefined ? null : v);
    const workstationId = booklet.workstationId && booklet.workstationId !== 0
      ? booklet.workstationId
      : null;
    const [result] = await this.db.execute(
      `INSERT INTO Scan_Booklets
        (BookletID, ExamID, PaperID, LocationID, CentreCode, WorkstationID,
         TotalPagesExpected, TotalPagesScanned, ValidationStatus,
         FileHashSHA256, FilePath, UploadStatus, ScanDate,
         VendorQcStatus, VendorQcAt, VendorQcByUserID, VendorQcReason,
         CustomerQcStatus, CustomerQcAt, CustomerQcByUserID, CustomerQcReason,
         CreatedBy, CreatedFromIP, CreatedFromSystem)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         ExamID             = VALUES(ExamID),
         PaperID            = VALUES(PaperID),
         LocationID         = VALUES(LocationID),
         CentreCode         = VALUES(CentreCode),
         WorkstationID      = VALUES(WorkstationID),
         TotalPagesExpected = VALUES(TotalPagesExpected),
         TotalPagesScanned  = VALUES(TotalPagesScanned),
         ValidationStatus   = VALUES(ValidationStatus),
         FileHashSHA256     = VALUES(FileHashSHA256),
         FilePath           = VALUES(FilePath),
         UploadStatus       = VALUES(UploadStatus),
         ScanDate           = VALUES(ScanDate),
         VendorQcStatus     = VALUES(VendorQcStatus),
         VendorQcAt         = VALUES(VendorQcAt),
         VendorQcByUserID   = VALUES(VendorQcByUserID),
         VendorQcReason     = VALUES(VendorQcReason),
         CustomerQcStatus   = VALUES(CustomerQcStatus),
         CustomerQcAt       = VALUES(CustomerQcAt),
         CustomerQcByUserID = VALUES(CustomerQcByUserID),
         CustomerQcReason   = VALUES(CustomerQcReason),
         CreatedBy          = VALUES(CreatedBy),
         CreatedFromIP      = VALUES(CreatedFromIP),
         CreatedFromSystem  = VALUES(CreatedFromSystem)`,
      [
        n(booklet.bookletId), n(booklet.examId),    n(booklet.paperId),
        n(booklet.locationId), n(booklet.centreCode) ?? '', workstationId,
        n(booklet.totalPagesExpected), n(booklet.totalPagesScanned),
        n(booklet.validationStatus),   n(booklet.fileHash), n(booklet.filePath) ?? '',
        booklet.uploadStatus || 'Local', n(booklet.scanDate) ?? new Date().toISOString().split('T')[0],
        n(booklet.vendorQcStatus),
        n(booklet.vendorQcAt),
        n(booklet.vendorQcByUserId),
        n(booklet.vendorQcReason),
        n(booklet.customerQcStatus),
        n(booklet.customerQcAt),
        n(booklet.customerQcByUserId),
        n(booklet.customerQcReason),
        n(booklet.createdBy), n(booklet.createdFromIP), n(booklet.createdFromSystem),
      ]
    );
    return result;
  }

  async createBookletPage(page) {
    const n = v => (v === undefined ? null : v);
    const [result] = await this.db.execute(
      `INSERT INTO Scan_BookletPages
        (BookletID, PageNumber, ImagePath, PageHash, BarcodeData, ValidationStatus, IsRoughPage,
         CreatedBy, CreatedFromIP, CreatedFromSystem)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         ImagePath        = VALUES(ImagePath),
         PageHash         = VALUES(PageHash),
         BarcodeData      = VALUES(BarcodeData),
         ValidationStatus = VALUES(ValidationStatus),
         IsRoughPage      = VALUES(IsRoughPage),
         CreatedBy        = VALUES(CreatedBy),
         CreatedFromIP    = VALUES(CreatedFromIP),
         CreatedFromSystem = VALUES(CreatedFromSystem)`,
      [
        n(page.bookletId), n(page.pageNumber), n(page.imagePath) ?? '',
        n(page.pageHash), n(page.barcodeData),
        page.validationStatus || 'Valid', page.isRoughPage ?? 0,
        n(page.createdBy), n(page.createdFromIP), n(page.createdFromSystem),
      ]
    );
    return result;
  }

  async getBookletsByDate(locationId, scanDate) {
    const [rows] = await this.db.execute(
      `SELECT b.BookletID, b.ExamID, b.PaperID, b.TotalPagesExpected,
              b.TotalPagesScanned, b.ValidationStatus, b.ScanDate,
              b.CreatedBy, b.CreatedAt
       FROM Scan_Booklets b
       WHERE b.LocationID = ? AND b.ScanDate = ? AND b.IsDeleted = 0
       ORDER BY b.CreatedAt DESC`,
      [locationId, scanDate]
    );
    return rows;
  }

  async getProductivitySummary(locationId, scanDate) {
    const [rows] = await this.db.execute(
      `SELECT b.CreatedBy AS username, COUNT(*) AS bookletCount,
              SUM(b.TotalPagesScanned) AS totalPages,
              SUM(CASE WHEN b.ValidationStatus = 'Valid' THEN 1 ELSE 0 END) AS validCount,
              SUM(CASE WHEN b.ValidationStatus != 'Valid' THEN 1 ELSE 0 END) AS invalidCount
       FROM Scan_Booklets b
       WHERE b.LocationID = ? AND b.ScanDate = ? AND b.IsDeleted = 0
       GROUP BY b.CreatedBy`,
      [locationId, scanDate]
    );
    return rows;
  }

  async enqueueSyncBooklet(bookletId) {
    const [result] = await this.db.execute(
      `INSERT INTO Scan_SyncQueue (BookletID, SyncStatus) VALUES (?, 'Pending')`,
      [bookletId]
    );
    return result;
  }

  /** Returns all Scan_Booklets (for sync-to-eval backfill). */
  async getAllBookletsForSync() {
    const [rows] = await this.db.execute(
      `SELECT BookletID, ExamID, PaperID, LocationID, CentreCode,
              TotalPagesScanned, FilePath, CreatedBy, CreatedFromIP, CreatedFromSystem
       FROM Scan_Booklets WHERE IsDeleted = 0 ORDER BY CreatedAt DESC`
    );
    return rows;
  }
}
