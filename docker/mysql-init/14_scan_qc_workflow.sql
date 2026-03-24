-- Scan QC: vendor/customer stages, daily lots, location toggles
USE ScanningDB;

SET @dbname = DATABASE();

-- Scan_Locations: QC toggles (per centre)
SET @sqlL1 = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'Scan_Locations' AND COLUMN_NAME = 'VendorQcEnabled') = 0,
  'ALTER TABLE Scan_Locations ADD COLUMN VendorQcEnabled TINYINT(1) NOT NULL DEFAULT 1 COMMENT ''If 0, booklets skip vendor QC''',
  'SELECT 1'
);
PREPARE s FROM @sqlL1; EXECUTE s; DEALLOCATE PREPARE s;

SET @sqlL2 = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'Scan_Locations' AND COLUMN_NAME = 'CustomerQcEnabled') = 0,
  'ALTER TABLE Scan_Locations ADD COLUMN CustomerQcEnabled TINYINT(1) NOT NULL DEFAULT 1 COMMENT ''If 0, booklets skip customer QC''',
  'SELECT 1'
);
PREPARE s FROM @sqlL2; EXECUTE s; DEALLOCATE PREPARE s;

-- Scan_Booklets: per-booklet QC
SET @sqlB1 = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'Scan_Booklets' AND COLUMN_NAME = 'VendorQcStatus') = 0,
  "ALTER TABLE Scan_Booklets ADD COLUMN VendorQcStatus VARCHAR(20) NULL COMMENT 'Pending, Approved, Rejected, Skipped'",
  'SELECT 1'
);
PREPARE s FROM @sqlB1; EXECUTE s; DEALLOCATE PREPARE s;

SET @sqlB2 = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'Scan_Booklets' AND COLUMN_NAME = 'VendorQcAt') = 0,
  'ALTER TABLE Scan_Booklets ADD COLUMN VendorQcAt DATETIME NULL',
  'SELECT 1'
);
PREPARE s FROM @sqlB2; EXECUTE s; DEALLOCATE PREPARE s;

SET @sqlB3 = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'Scan_Booklets' AND COLUMN_NAME = 'VendorQcByUserID') = 0,
  'ALTER TABLE Scan_Booklets ADD COLUMN VendorQcByUserID INT NULL',
  'SELECT 1'
);
PREPARE s FROM @sqlB3; EXECUTE s; DEALLOCATE PREPARE s;

SET @sqlB4 = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'Scan_Booklets' AND COLUMN_NAME = 'VendorQcReason') = 0,
  'ALTER TABLE Scan_Booklets ADD COLUMN VendorQcReason VARCHAR(500) NULL',
  'SELECT 1'
);
PREPARE s FROM @sqlB4; EXECUTE s; DEALLOCATE PREPARE s;

SET @sqlB5 = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'Scan_Booklets' AND COLUMN_NAME = 'CustomerQcStatus') = 0,
  "ALTER TABLE Scan_Booklets ADD COLUMN CustomerQcStatus VARCHAR(20) NULL COMMENT 'Pending, Approved, Rejected, Skipped'",
  'SELECT 1'
);
PREPARE s FROM @sqlB5; EXECUTE s; DEALLOCATE PREPARE s;

SET @sqlB6 = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'Scan_Booklets' AND COLUMN_NAME = 'CustomerQcAt') = 0,
  'ALTER TABLE Scan_Booklets ADD COLUMN CustomerQcAt DATETIME NULL',
  'SELECT 1'
);
PREPARE s FROM @sqlB6; EXECUTE s; DEALLOCATE PREPARE s;

SET @sqlB7 = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'Scan_Booklets' AND COLUMN_NAME = 'CustomerQcByUserID') = 0,
  'ALTER TABLE Scan_Booklets ADD COLUMN CustomerQcByUserID INT NULL',
  'SELECT 1'
);
PREPARE s FROM @sqlB7; EXECUTE s; DEALLOCATE PREPARE s;

SET @sqlB8 = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'Scan_Booklets' AND COLUMN_NAME = 'CustomerQcReason') = 0,
  'ALTER TABLE Scan_Booklets ADD COLUMN CustomerQcReason VARCHAR(500) NULL',
  'SELECT 1'
);
PREPARE s FROM @sqlB8; EXECUTE s; DEALLOCATE PREPARE s;

-- Daily lots (paper + calendar day + location); implicit membership via Scan_Booklets.ScanDate
CREATE TABLE IF NOT EXISTS Scan_DailyLots (
  LotID BIGINT AUTO_INCREMENT PRIMARY KEY,
  LocationID INT NOT NULL,
  PaperID INT NOT NULL,
  LotDate DATE NOT NULL,
  CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  VendorApprovedAt DATETIME NULL,
  VendorApprovedByUserID INT NULL,
  CustomerApprovedAt DATETIME NULL,
  CustomerApprovedByUserID INT NULL,
  UNIQUE KEY uq_scan_daily_lot (LocationID, PaperID, LotDate),
  FOREIGN KEY (LocationID) REFERENCES Scan_Locations(LocationID),
  FOREIGN KEY (PaperID) REFERENCES Scan_Papers(PaperID)
) ENGINE=InnoDB;

SET @sqlIdx = IF(
  (SELECT COUNT(*) FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'Scan_Booklets' AND INDEX_NAME = 'idx_scan_booklets_qc_loc_date') = 0,
  'CREATE INDEX idx_scan_booklets_qc_loc_date ON Scan_Booklets (LocationID, PaperID, ScanDate)',
  'SELECT 1'
);
PREPARE s FROM @sqlIdx; EXECUTE s; DEALLOCATE PREPARE s;

-- Roles & sample QC users (idempotent)
INSERT INTO Scan_Roles (RoleName, RoleHierarchyLevel, CreatedBy)
SELECT 'VendorQC', 3, 'system' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM Scan_Roles WHERE RoleName = 'VendorQC' AND IFNULL(IsDeleted,0) = 0);

INSERT INTO Scan_Roles (RoleName, RoleHierarchyLevel, CreatedBy)
SELECT 'CustomerQC', 3, 'system' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM Scan_Roles WHERE RoleName = 'CustomerQC' AND IFNULL(IsDeleted,0) = 0);

-- Same password as operator1 seed: password123
INSERT INTO Scan_Users (Username, PasswordHash, FullName, RoleID, LocationID, CreatedBy)
SELECT
  'vendorqc1',
  '$2a$10$E98PmmCqajVZd4qwH/pZwe/iyf5BtE0Q0Yp2kyG23ZK7FMuKADAV2',
  'Vendor QC (demo)',
  (SELECT RoleID FROM Scan_Roles WHERE RoleName = 'VendorQC' LIMIT 1),
  1,
  'system'
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM Scan_Users WHERE Username = 'vendorqc1');

INSERT INTO Scan_Users (Username, PasswordHash, FullName, RoleID, LocationID, CreatedBy)
SELECT
  'customerqc1',
  '$2a$10$E98PmmCqajVZd4qwH/pZwe/iyf5BtE0Q0Yp2kyG23ZK7FMuKADAV2',
  'Customer QC (demo)',
  (SELECT RoleID FROM Scan_Roles WHERE RoleName = 'CustomerQC' LIMIT 1),
  1,
  'system'
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM Scan_Users WHERE Username = 'customerqc1');
