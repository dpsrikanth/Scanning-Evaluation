/**
 * Scan QC — vendor/customer workflows and daily lots (ScanningDB).
 */
export default class ScanQcRepository {
  constructor(db) {
    this.db = db;
  }

  async getDailyLot(locationId, paperId, lotDate) {
    const [rows] = await this.db.execute(
      `SELECT LotID, LocationID, PaperID, LotDate, VendorApprovedAt, VendorApprovedByUserID,
              CustomerApprovedAt, CustomerApprovedByUserID
       FROM Scan_DailyLots
       WHERE LocationID = ? AND PaperID = ? AND LotDate = ?`,
      [locationId, paperId, lotDate]
    );
    return rows[0] || null;
  }

  async upsertVendorLotApproval(locationId, paperId, lotDate, userId) {
    await this.db.execute(
      `INSERT INTO Scan_DailyLots (LocationID, PaperID, LotDate, VendorApprovedAt, VendorApprovedByUserID)
       VALUES (?, ?, ?, NOW(), ?)
       ON DUPLICATE KEY UPDATE
         VendorApprovedAt = NOW(),
         VendorApprovedByUserID = VALUES(VendorApprovedByUserID)`,
      [locationId, paperId, lotDate, userId]
    );
  }

  async upsertCustomerLotApproval(locationId, paperId, lotDate, userId) {
    await this.db.execute(
      `INSERT INTO Scan_DailyLots (LocationID, PaperID, LotDate, CustomerApprovedAt, CustomerApprovedByUserID)
       VALUES (?, ?, ?, NOW(), ?)
       ON DUPLICATE KEY UPDATE
         CustomerApprovedAt = NOW(),
         CustomerApprovedByUserID = VALUES(CustomerApprovedByUserID)`,
      [locationId, paperId, lotDate, userId]
    );
  }

  /**
   * Vendor lot summaries: one row per (PaperID, ScanDate) with counts.
   */
  async listVendorLotSummaries(locationId, { paperId, lotDate }) {
    const params = [locationId];
    let paperClause = '';
    let dateClause = '';
    if (paperId != null && paperId !== '') {
      paperClause = ' AND b.PaperID = ?';
      params.push(Number(paperId));
    }
    if (lotDate != null && lotDate !== '') {
      dateClause = ' AND b.ScanDate = ?';
      params.push(lotDate);
    }
    const [rows] = await this.db.execute(
      `SELECT
         b.PaperID,
         p.PaperCode,
         p.PaperName,
         b.ScanDate AS lotDate,
         COUNT(*) AS totalBooklets,
         SUM(CASE WHEN COALESCE(b.VendorQcStatus, 'Pending') = 'Pending' THEN 1 ELSE 0 END) AS pendingVendor,
         SUM(CASE WHEN b.VendorQcStatus = 'Approved' THEN 1 ELSE 0 END) AS approvedVendor,
         SUM(CASE WHEN b.VendorQcStatus = 'Rejected' THEN 1 ELSE 0 END) AS rejectedVendor,
         SUM(CASE WHEN b.VendorQcStatus = 'Skipped' THEN 1 ELSE 0 END) AS skippedVendor,
         l.VendorApprovedAt AS vendorLotApprovedAt,
         l.CustomerApprovedAt AS customerLotApprovedAt
       FROM Scan_Booklets b
       JOIN Scan_Papers p ON p.PaperID = b.PaperID AND p.IsDeleted = 0
       LEFT JOIN Scan_DailyLots l
         ON l.LocationID = b.LocationID AND l.PaperID = b.PaperID AND l.LotDate = b.ScanDate
       WHERE b.LocationID = ? AND b.IsDeleted = 0${paperClause}${dateClause}
       GROUP BY b.PaperID, b.ScanDate, p.PaperCode, p.PaperName, l.VendorApprovedAt, l.CustomerApprovedAt
       ORDER BY b.ScanDate DESC, p.PaperCode`,
      params
    );
    return rows;
  }

  async listVendorLotBooklets(locationId, paperId, lotDate) {
    const [rows] = await this.db.execute(
      `SELECT b.BookletID, b.ExamID, b.PaperID, b.ScanDate, b.TotalPagesScanned, b.ValidationStatus,
              b.UploadStatus, b.VendorQcStatus, b.VendorQcAt, b.VendorQcReason,
              b.CustomerQcStatus, b.CreatedAt
       FROM Scan_Booklets b
       WHERE b.LocationID = ? AND b.PaperID = ? AND b.ScanDate = ? AND b.IsDeleted = 0
       ORDER BY b.CreatedAt DESC`,
      [locationId, paperId, lotDate]
    );
    return rows;
  }

  /**
   * Customer view: booklets that passed vendor (or vendor skipped) and need customer QC.
   */
  async listCustomerLotSummaries(locationId, { paperId, lotDate }, vendorQcEnabled) {
    const params = [locationId];
    let paperClause = '';
    let dateClause = '';
    if (paperId != null && paperId !== '') {
      paperClause = ' AND b.PaperID = ?';
      params.push(Number(paperId));
    }
    if (lotDate != null && lotDate !== '') {
      dateClause = ' AND b.ScanDate = ?';
      params.push(lotDate);
    }
    const vendorGate = Number(vendorQcEnabled) !== 0
      ? 'AND l.VendorApprovedAt IS NOT NULL'
      : '';
    const [rows] = await this.db.execute(
      `SELECT
         b.PaperID,
         p.PaperCode,
         p.PaperName,
         b.ScanDate AS lotDate,
         COUNT(*) AS totalBooklets,
         SUM(CASE WHEN COALESCE(b.CustomerQcStatus, 'Pending') = 'Pending' THEN 1 ELSE 0 END) AS pendingCustomer,
         SUM(CASE WHEN b.CustomerQcStatus = 'Approved' THEN 1 ELSE 0 END) AS approvedCustomer,
         SUM(CASE WHEN b.CustomerQcStatus = 'Rejected' THEN 1 ELSE 0 END) AS rejectedCustomer,
         l.VendorApprovedAt AS vendorLotApprovedAt,
         l.CustomerApprovedAt AS customerLotApprovedAt
       FROM Scan_Booklets b
       JOIN Scan_Papers p ON p.PaperID = b.PaperID AND p.IsDeleted = 0
       LEFT JOIN Scan_DailyLots l
         ON l.LocationID = b.LocationID AND l.PaperID = b.PaperID AND l.LotDate = b.ScanDate
       WHERE b.LocationID = ? AND b.IsDeleted = 0
         AND b.VendorQcStatus IN ('Approved', 'Skipped')
         ${vendorGate}
         AND b.CustomerQcStatus IN ('Pending', 'Rejected', 'Approved')
         ${paperClause}${dateClause}
       GROUP BY b.PaperID, b.ScanDate, p.PaperCode, p.PaperName, l.VendorApprovedAt, l.CustomerApprovedAt
       ORDER BY b.ScanDate DESC, p.PaperCode`,
      params
    );
    return rows;
  }

  async listCustomerLotBooklets(locationId, paperId, lotDate, vendorQcEnabled) {
    const vendorGate = Number(vendorQcEnabled) !== 0
      ? `AND EXISTS (
           SELECT 1 FROM Scan_DailyLots l
           WHERE l.LocationID = b.LocationID AND l.PaperID = b.PaperID AND l.LotDate = b.ScanDate
             AND l.VendorApprovedAt IS NOT NULL
         )`
      : '';
    const [rows] = await this.db.execute(
      `SELECT b.BookletID, b.ExamID, b.PaperID, b.ScanDate, b.TotalPagesScanned, b.ValidationStatus,
              b.CustomerQcStatus, b.CustomerQcAt, b.CustomerQcReason, b.VendorQcStatus,
              b.CreatedAt
       FROM Scan_Booklets b
       WHERE b.LocationID = ? AND b.PaperID = ? AND b.ScanDate = ? AND b.IsDeleted = 0
         AND b.VendorQcStatus IN ('Approved', 'Skipped')
         AND b.CustomerQcStatus IN ('Pending', 'Rejected')
         ${vendorGate}
       ORDER BY b.CreatedAt DESC`,
      [locationId, paperId, lotDate]
    );
    return rows;
  }

  async setVendorDecision(bookletId, userId, status, reason) {
    const [result] = await this.db.execute(
      `UPDATE Scan_Booklets
       SET VendorQcStatus = ?,
           VendorQcAt = NOW(),
           VendorQcByUserID = ?,
           VendorQcReason = ?,
           ModifiedAt = NOW()
       WHERE BookletID = ? AND IsDeleted = 0`,
      [status, userId, reason ?? null, bookletId]
    );
    return result.affectedRows;
  }

  async setCustomerDecision(bookletId, userId, status, reason) {
    const [result] = await this.db.execute(
      `UPDATE Scan_Booklets
       SET CustomerQcStatus = ?,
           CustomerQcAt = NOW(),
           CustomerQcByUserID = ?,
           CustomerQcReason = ?,
           ModifiedAt = NOW()
       WHERE BookletID = ? AND IsDeleted = 0`,
      [status, userId, reason ?? null, bookletId]
    );
    return result.affectedRows;
  }

  async setCustomerPendingForLotAfterVendorApproval(locationId, paperId, lotDate) {
    const [result] = await this.db.execute(
      `UPDATE Scan_Booklets b
       SET CustomerQcStatus = 'Pending',
           CustomerQcAt = NULL,
           CustomerQcByUserID = NULL,
           CustomerQcReason = NULL
       WHERE b.LocationID = ? AND b.PaperID = ? AND b.ScanDate = ? AND b.IsDeleted = 0
         AND b.VendorQcStatus IN ('Approved', 'Skipped')
         AND b.CustomerQcStatus IS NULL`,
      [locationId, paperId, lotDate]
    );
    return result.affectedRows;
  }

  async pushCustomerPending(bookletId) {
    const [result] = await this.db.execute(
      `UPDATE Scan_Booklets
       SET CustomerQcStatus = 'Pending',
           CustomerQcAt = NULL,
           CustomerQcByUserID = NULL,
           CustomerQcReason = NULL
       WHERE BookletID = ? AND IsDeleted = 0`,
      [bookletId]
    );
    return result.affectedRows;
  }

  async listRejectedForOperator(locationId) {
    const [rows] = await this.db.execute(
      `SELECT b.BookletID, b.PaperID, p.PaperCode, p.PaperName, b.ScanDate,
              b.VendorQcStatus, b.VendorQcReason, b.CustomerQcStatus, b.CustomerQcReason,
              b.ModifiedAt
       FROM Scan_Booklets b
       JOIN Scan_Papers p ON p.PaperID = b.PaperID AND p.IsDeleted = 0
       WHERE b.LocationID = ? AND b.IsDeleted = 0
         AND (b.VendorQcStatus = 'Rejected' OR b.CustomerQcStatus = 'Rejected')
       ORDER BY b.ModifiedAt DESC
       LIMIT 500`,
      [locationId]
    );
    return rows;
  }

}
