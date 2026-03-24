-- =========================================================
-- Migration 001: Scanning DB - Locations, Workstations, Sync
-- Run against existing ScanningDB
-- =========================================================

USE ScanningDB;

-- 1. Create Scan_Locations
CREATE TABLE IF NOT EXISTS Scan_Locations (
    LocationID INT AUTO_INCREMENT PRIMARY KEY,
    LocationCode VARCHAR(50) UNIQUE NOT NULL,
    LocationName VARCHAR(200) NOT NULL,
    Address VARCHAR(500),
    IsActive TINYINT DEFAULT 1,
    CreatedBy VARCHAR(100),
    CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    CreatedFromIP VARCHAR(50),
    CreatedFromSystem VARCHAR(50),
    ModifiedBy VARCHAR(100),
    ModifiedAt DATETIME NULL ON UPDATE CURRENT_TIMESTAMP,
    ModifiedFromIP VARCHAR(50),
    ModifiedFromSystem VARCHAR(50),
    IsDeleted TINYINT DEFAULT 0,
    DeletedBy VARCHAR(100),
    DeletedAt DATETIME NULL,
    DeletedFromIP VARCHAR(50)
) ENGINE=InnoDB;

-- 2. Create Scan_Workstations
CREATE TABLE IF NOT EXISTS Scan_Workstations (
    WorkstationID INT AUTO_INCREMENT PRIMARY KEY,
    LocationID INT,
    WorkstationCode VARCHAR(50) NOT NULL,
    WorkstationName VARCHAR(200),
    IsActive TINYINT DEFAULT 1,
    CreatedBy VARCHAR(100),
    CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    CreatedFromIP VARCHAR(50),
    CreatedFromSystem VARCHAR(50),
    ModifiedBy VARCHAR(100),
    ModifiedAt DATETIME NULL ON UPDATE CURRENT_TIMESTAMP,
    ModifiedFromIP VARCHAR(50),
    ModifiedFromSystem VARCHAR(50),
    IsDeleted TINYINT DEFAULT 0,
    DeletedBy VARCHAR(100),
    DeletedAt DATETIME NULL,
    DeletedFromIP VARCHAR(50),
    FOREIGN KEY (LocationID) REFERENCES Scan_Locations(LocationID)
) ENGINE=InnoDB;

-- 3. Alter Scan_Users - add LocationID
ALTER TABLE Scan_Users ADD COLUMN LocationID INT NULL AFTER RoleID;
ALTER TABLE Scan_Users ADD CONSTRAINT fk_Scan_Users_Location 
    FOREIGN KEY (LocationID) REFERENCES Scan_Locations(LocationID);

-- 4. Alter Scan_Papers - add BookletPageCounts
ALTER TABLE Scan_Papers ADD COLUMN BookletPageCounts VARCHAR(50) NULL 
    COMMENT 'e.g. 12,24,36 for allowed booklet sizes' AFTER TotalPages;

-- 5. Alter Scan_Booklets - add new columns (run individually if FK constraints fail)
ALTER TABLE Scan_Booklets ADD COLUMN LocationID INT NULL AFTER PaperID;
ALTER TABLE Scan_Booklets ADD COLUMN WorkstationID INT NULL AFTER CentreCode;
ALTER TABLE Scan_Booklets ADD COLUMN ExportedAt DATETIME NULL AFTER IsExportedToEvaluation;
ALTER TABLE Scan_Booklets ADD COLUMN ScanDate DATE NULL AFTER ExportedAt;

-- Add FKs only if Locations/Workstations have data
-- ALTER TABLE Scan_Booklets ADD CONSTRAINT fk_Scan_Booklets_Location 
--     FOREIGN KEY (LocationID) REFERENCES Scan_Locations(LocationID);
-- ALTER TABLE Scan_Booklets ADD CONSTRAINT fk_Scan_Booklets_Workstation 
--     FOREIGN KEY (WorkstationID) REFERENCES Scan_Workstations(WorkstationID);

-- 6. Alter Scan_BookletPages - add BarcodeData
ALTER TABLE Scan_BookletPages ADD COLUMN BarcodeData VARCHAR(500) NULL 
    COMMENT 'Per-page barcode/QR extracted value' AFTER PageHash;

-- 7. Create Scan_SyncQueue
CREATE TABLE IF NOT EXISTS Scan_SyncQueue (
    SyncQueueID BIGINT AUTO_INCREMENT PRIMARY KEY,
    BookletID VARCHAR(100),
    SyncStatus VARCHAR(50) DEFAULT 'Pending',
    SyncAttempts INT DEFAULT 0,
    LastSyncAttempt DATETIME NULL,
    ErrorMessage TEXT NULL,
    CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    CompletedAt DATETIME NULL,
    FOREIGN KEY (BookletID) REFERENCES Scan_Booklets(BookletID)
) ENGINE=InnoDB;

-- 8. Indexes (skip if already exist)
CREATE INDEX idx_Scan_Booklets_LocationID ON Scan_Booklets(LocationID);
CREATE INDEX idx_Scan_Booklets_ScanDate ON Scan_Booklets(ScanDate);
