-- =========================================================
-- MIGRATION 005 — Scan Templates, Printer Profiles, Workstation Extensions
-- Database: ScanningDB
-- Compatible with: MySQL 8+ (no IF NOT EXISTS on ADD COLUMN)
-- =========================================================

USE ScanningDB;

-- ---------------------------------------------------------
-- 1. Scan_PrinterProfiles — must be created before Scan_Workstations FK
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS Scan_PrinterProfiles (
    ProfileID     INT AUTO_INCREMENT PRIMARY KEY,
    ProfileName   VARCHAR(200) NOT NULL,
    Brand         VARCHAR(50)  NOT NULL COMMENT 'Fujitsu / Kodak / Canon / Avision / HP / Generic',
    DriverType    VARCHAR(10)  NOT NULL DEFAULT 'WIA' COMMENT 'WIA or TWAIN',
    TwainCapabilities JSON NULL COMMENT 'JSON map of TWAIN CAP names to values for advanced scanner control',
    IsActive      TINYINT DEFAULT 1,
    CreatedBy     VARCHAR(100),
    CreatedAt     DATETIME DEFAULT CURRENT_TIMESTAMP,
    CreatedFromIP VARCHAR(50),
    CreatedFromSystem VARCHAR(50),
    ModifiedBy    VARCHAR(100),
    ModifiedAt    DATETIME NULL ON UPDATE CURRENT_TIMESTAMP,
    ModifiedFromIP VARCHAR(50),
    ModifiedFromSystem VARCHAR(50),
    IsDeleted     TINYINT DEFAULT 0,
    DeletedBy     VARCHAR(100),
    DeletedAt     DATETIME NULL,
    DeletedFromIP VARCHAR(50)
) ENGINE=InnoDB;

-- ---------------------------------------------------------
-- 2. Scan_ScanTemplates — page count + scanner settings bundle
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS Scan_ScanTemplates (
    TemplateID    INT AUTO_INCREMENT PRIMARY KEY,
    TemplateName  VARCHAR(200) NOT NULL,
    Description   VARCHAR(500) NULL,
    PageCount     INT NOT NULL DEFAULT 24 COMMENT 'Expected pages per booklet (16, 18, 24 etc.)',
    DPI           INT NOT NULL DEFAULT 300,
    ColorMode     VARCHAR(20) NOT NULL DEFAULT 'Grayscale' COMMENT 'Color / Grayscale / BlackWhite',
    PageSize      VARCHAR(20) NOT NULL DEFAULT 'A4' COMMENT 'A4 / A3 / Letter',
    DuplexMode    VARCHAR(20) NOT NULL DEFAULT 'Simplex' COMMENT 'Simplex / Duplex',
    JpegQuality   INT NOT NULL DEFAULT 85 COMMENT '1-100',
    BrightnessAdj INT NOT NULL DEFAULT 0  COMMENT '-1000 to 1000',
    ContrastAdj   INT NOT NULL DEFAULT 0  COMMENT '-1000 to 1000',
    SkipBlankPages TINYINT NOT NULL DEFAULT 0,
    DeSkew        TINYINT NOT NULL DEFAULT 1,
    IsActive      TINYINT DEFAULT 1,
    CreatedBy     VARCHAR(100),
    CreatedAt     DATETIME DEFAULT CURRENT_TIMESTAMP,
    CreatedFromIP VARCHAR(50),
    CreatedFromSystem VARCHAR(50),
    ModifiedBy    VARCHAR(100),
    ModifiedAt    DATETIME NULL ON UPDATE CURRENT_TIMESTAMP,
    ModifiedFromIP VARCHAR(50),
    ModifiedFromSystem VARCHAR(50),
    IsDeleted     TINYINT DEFAULT 0,
    DeletedBy     VARCHAR(100),
    DeletedAt     DATETIME NULL,
    DeletedFromIP VARCHAR(50)
) ENGINE=InnoDB;

-- ---------------------------------------------------------
-- 3. ALTER Scan_Workstations — add AssignedUsername + PrinterProfileID
--    Uses information_schema check for MySQL 8 idempotency
-- ---------------------------------------------------------
SET @col1 = (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = 'ScanningDB'
      AND TABLE_NAME   = 'Scan_Workstations'
      AND COLUMN_NAME  = 'AssignedUsername'
);
SET @sql1 = IF(@col1 = 0,
    'ALTER TABLE Scan_Workstations ADD COLUMN AssignedUsername VARCHAR(100) NULL COMMENT ''Username of the operator assigned to this workstation''',
    'SELECT ''AssignedUsername already exists'' AS info'
);
PREPARE stmt1 FROM @sql1; EXECUTE stmt1; DEALLOCATE PREPARE stmt1;

SET @col2 = (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = 'ScanningDB'
      AND TABLE_NAME   = 'Scan_Workstations'
      AND COLUMN_NAME  = 'PrinterProfileID'
);
SET @sql2 = IF(@col2 = 0,
    'ALTER TABLE Scan_Workstations ADD COLUMN PrinterProfileID INT NULL COMMENT ''FK to Scan_PrinterProfiles''',
    'SELECT ''PrinterProfileID already exists'' AS info'
);
PREPARE stmt2 FROM @sql2; EXECUTE stmt2; DEALLOCATE PREPARE stmt2;

-- Add FK only if the column was just created (safe to run idempotently via CREATE TABLE guard above)
SET @fk_exists = (
    SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
    WHERE TABLE_SCHEMA    = 'ScanningDB'
      AND TABLE_NAME      = 'Scan_Workstations'
      AND CONSTRAINT_NAME = 'fk_ws_printer_profile'
      AND CONSTRAINT_TYPE = 'FOREIGN KEY'
);
SET @sql3 = IF(@fk_exists = 0,
    'ALTER TABLE Scan_Workstations ADD CONSTRAINT fk_ws_printer_profile FOREIGN KEY (PrinterProfileID) REFERENCES Scan_PrinterProfiles(ProfileID)',
    'SELECT ''FK fk_ws_printer_profile already exists'' AS info'
);
PREPARE stmt3 FROM @sql3; EXECUTE stmt3; DEALLOCATE PREPARE stmt3;

-- ---------------------------------------------------------
-- 4. Seed — default scan templates
-- ---------------------------------------------------------
INSERT INTO Scan_ScanTemplates
    (TemplateName, Description, PageCount, DPI, ColorMode, PageSize, DuplexMode, JpegQuality, SkipBlankPages, DeSkew, IsActive, CreatedBy)
SELECT '16-Page Booklet', 'Standard 16-page answer booklet', 16, 300, 'Grayscale', 'A4', 'Simplex', 85, 0, 1, 1, 'system'
WHERE NOT EXISTS (SELECT 1 FROM Scan_ScanTemplates WHERE TemplateName = '16-Page Booklet' AND IsDeleted = 0);

INSERT INTO Scan_ScanTemplates
    (TemplateName, Description, PageCount, DPI, ColorMode, PageSize, DuplexMode, JpegQuality, SkipBlankPages, DeSkew, IsActive, CreatedBy)
SELECT '24-Page Booklet', 'Standard 24-page answer booklet', 24, 300, 'Grayscale', 'A4', 'Simplex', 85, 0, 1, 1, 'system'
WHERE NOT EXISTS (SELECT 1 FROM Scan_ScanTemplates WHERE TemplateName = '24-Page Booklet' AND IsDeleted = 0);

INSERT INTO Scan_ScanTemplates
    (TemplateName, Description, PageCount, DPI, ColorMode, PageSize, DuplexMode, JpegQuality, SkipBlankPages, DeSkew, IsActive, CreatedBy)
SELECT '24-Page Booklet HQ', 'High-quality color scan for main exam booklets', 24, 300, 'Color', 'A4', 'Simplex', 92, 1, 1, 1, 'system'
WHERE NOT EXISTS (SELECT 1 FROM Scan_ScanTemplates WHERE TemplateName = '24-Page Booklet HQ' AND IsDeleted = 0);

-- ---------------------------------------------------------
-- 5. Seed — default printer profiles
-- ---------------------------------------------------------
INSERT INTO Scan_PrinterProfiles (ProfileName, Brand, DriverType, TwainCapabilities, IsActive, CreatedBy)
SELECT 'Generic WIA Scanner', 'Generic', 'WIA', NULL, 1, 'system'
WHERE NOT EXISTS (SELECT 1 FROM Scan_PrinterProfiles WHERE ProfileName = 'Generic WIA Scanner' AND IsDeleted = 0);

INSERT INTO Scan_PrinterProfiles (ProfileName, Brand, DriverType, TwainCapabilities, IsActive, CreatedBy)
SELECT 'Fujitsu fi-Series (TWAIN)', 'Fujitsu', 'TWAIN',
    JSON_OBJECT(
        'ICAP_XRESOLUTION', 300,
        'ICAP_YRESOLUTION', 300,
        'ICAP_PIXELTYPE', 1,
        'CAP_DUPLEXENABLED', 0,
        'ICAP_SUPPORTEDSIZES', 9,
        'ICAP_AUTODISCARDBLANKPAGES', -1,
        'ICAP_AUTOMATICDESKEW', 1,
        'ICAP_AUTOMATICROTATE', 1
    ), 1, 'system'
WHERE NOT EXISTS (SELECT 1 FROM Scan_PrinterProfiles WHERE ProfileName = 'Fujitsu fi-Series (TWAIN)' AND IsDeleted = 0);

INSERT INTO Scan_PrinterProfiles (ProfileName, Brand, DriverType, TwainCapabilities, IsActive, CreatedBy)
SELECT 'Kodak Alaris S-Series (TWAIN)', 'Kodak', 'TWAIN',
    JSON_OBJECT(
        'ICAP_XRESOLUTION', 300,
        'ICAP_YRESOLUTION', 300,
        'ICAP_PIXELTYPE', 1,
        'CAP_DUPLEXENABLED', 0,
        'ICAP_SUPPORTEDSIZES', 9,
        'ICAP_AUTODISCARDBLANKPAGES', -1,
        'ICAP_AUTOMATICDESKEW', 1,
        'ICAP_IMAGEFILTER', 0
    ), 1, 'system'
WHERE NOT EXISTS (SELECT 1 FROM Scan_PrinterProfiles WHERE ProfileName = 'Kodak Alaris S-Series (TWAIN)' AND IsDeleted = 0);

INSERT INTO Scan_PrinterProfiles (ProfileName, Brand, DriverType, TwainCapabilities, IsActive, CreatedBy)
SELECT 'Canon DR-Series (TWAIN)', 'Canon', 'TWAIN',
    JSON_OBJECT(
        'ICAP_XRESOLUTION', 300,
        'ICAP_YRESOLUTION', 300,
        'ICAP_PIXELTYPE', 1,
        'CAP_DUPLEXENABLED', 0,
        'ICAP_SUPPORTEDSIZES', 9,
        'ICAP_AUTODISCARDBLANKPAGES', -1,
        'ICAP_AUTOMATICDESKEW', 1,
        'CAP_PAPERPROTECTIONCALIBRATIONSIZEMETHOD', 1
    ), 1, 'system'
WHERE NOT EXISTS (SELECT 1 FROM Scan_PrinterProfiles WHERE ProfileName = 'Canon DR-Series (TWAIN)' AND IsDeleted = 0);

INSERT INTO Scan_PrinterProfiles (ProfileName, Brand, DriverType, TwainCapabilities, IsActive, CreatedBy)
SELECT 'Avision AV-Series (TWAIN)', 'Avision', 'TWAIN',
    JSON_OBJECT(
        'ICAP_XRESOLUTION', 300,
        'ICAP_YRESOLUTION', 300,
        'ICAP_PIXELTYPE', 1,
        'CAP_DUPLEXENABLED', 0,
        'ICAP_SUPPORTEDSIZES', 9,
        'ICAP_AUTODISCARDBLANKPAGES', -1,
        'ICAP_AUTOMATICDESKEW', 1
    ), 1, 'system'
WHERE NOT EXISTS (SELECT 1 FROM Scan_PrinterProfiles WHERE ProfileName = 'Avision AV-Series (TWAIN)' AND IsDeleted = 0);

INSERT INTO Scan_PrinterProfiles (ProfileName, Brand, DriverType, TwainCapabilities, IsActive, CreatedBy)
SELECT 'HP ScanJet Pro (WIA)', 'HP', 'WIA', NULL, 1, 'system'
WHERE NOT EXISTS (SELECT 1 FROM Scan_PrinterProfiles WHERE ProfileName = 'HP ScanJet Pro (WIA)' AND IsDeleted = 0);
