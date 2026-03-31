-- =========================================================
-- MIGRATION 015 — Zone Barcodes, Upload Schedule, PDF Filename Format
-- Database: ScanningDB
-- =========================================================
USE ScanningDB;

-- BarcodeZones: JSON array of zone objects
-- [{name, pageScope, pageScopeValue, x, y, w, h, hint}]
SET @col_bz = (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = 'ScanningDB'
      AND TABLE_NAME   = 'Scan_ScanTemplates'
      AND COLUMN_NAME  = 'BarcodeZones'
);
SET @sql_bz = IF(@col_bz = 0,
    'ALTER TABLE Scan_ScanTemplates ADD COLUMN BarcodeZones JSON NULL COMMENT ''Zone-based barcode/QR reading definitions (JSON array)''',
    'SELECT ''BarcodeZones already exists'' AS info'
);
PREPARE stmt_bz FROM @sql_bz; EXECUTE stmt_bz; DEALLOCATE PREPARE stmt_bz;

-- PageBarcodeStartPage: page number where per-page order barcodes begin
SET @col_pbsp = (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = 'ScanningDB'
      AND TABLE_NAME   = 'Scan_ScanTemplates'
      AND COLUMN_NAME  = 'PageBarcodeStartPage'
);
SET @sql_pbsp = IF(@col_pbsp = 0,
    'ALTER TABLE Scan_ScanTemplates ADD COLUMN PageBarcodeStartPage INT NOT NULL DEFAULT 2 COMMENT ''Page number from which sequential page-order barcodes are expected''',
    'SELECT ''PageBarcodeStartPage already exists'' AS info'
);
PREPARE stmt_pbsp FROM @sql_pbsp; EXECUTE stmt_pbsp; DEALLOCATE PREPARE stmt_pbsp;

-- PdfFilenameFormat: token-based filename template
-- Tokens: {BookletId} {ExamCode} {PaperCode} {RollNo} {Serial} {ScanDate} {PageCount} {ZoneName}
SET @col_pff = (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = 'ScanningDB'
      AND TABLE_NAME   = 'Scan_ScanTemplates'
      AND COLUMN_NAME  = 'PdfFilenameFormat'
);
SET @sql_pff = IF(@col_pff = 0,
    'ALTER TABLE Scan_ScanTemplates ADD COLUMN PdfFilenameFormat VARCHAR(200) NOT NULL DEFAULT ''{BookletId}'' COMMENT ''Token-based PDF filename format; {BookletId},{ExamCode},{PaperCode},{ScanDate},or any zone name''',
    'SELECT ''PdfFilenameFormat already exists'' AS info'
);
PREPARE stmt_pff FROM @sql_pff; EXECUTE stmt_pff; DEALLOCATE PREPARE stmt_pff;

-- UploadScheduleMode: when to trigger background uploads
-- Values: Immediate | Every4h | Every8h | Every12h | Custom | EndOfDay
SET @col_usm = (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = 'ScanningDB'
      AND TABLE_NAME   = 'Scan_ScanTemplates'
      AND COLUMN_NAME  = 'UploadScheduleMode'
);
SET @sql_usm = IF(@col_usm = 0,
    'ALTER TABLE Scan_ScanTemplates ADD COLUMN UploadScheduleMode VARCHAR(30) NOT NULL DEFAULT ''Immediate'' COMMENT ''Upload trigger mode: Immediate|Every4h|Every8h|Every12h|Custom|EndOfDay''',
    'SELECT ''UploadScheduleMode already exists'' AS info'
);
PREPARE stmt_usm FROM @sql_usm; EXECUTE stmt_usm; DEALLOCATE PREPARE stmt_usm;

-- UploadIntervalHours: interval in hours when UploadScheduleMode = Custom
SET @col_uih = (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = 'ScanningDB'
      AND TABLE_NAME   = 'Scan_ScanTemplates'
      AND COLUMN_NAME  = 'UploadIntervalHours'
);
SET @sql_uih = IF(@col_uih = 0,
    'ALTER TABLE Scan_ScanTemplates ADD COLUMN UploadIntervalHours DECIMAL(4,1) NOT NULL DEFAULT 0 COMMENT ''Custom upload interval in hours (used when UploadScheduleMode=Custom)''',
    'SELECT ''UploadIntervalHours already exists'' AS info'
);
PREPARE stmt_uih FROM @sql_uih; EXECUTE stmt_uih; DEALLOCATE PREPARE stmt_uih;

-- Scan_TemplateImages: stores reference sample page images per template
-- Used by the admin zone picker canvas
SET @tbl_ti = (
    SELECT COUNT(*) FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = 'ScanningDB'
      AND TABLE_NAME   = 'Scan_TemplateImages'
);
SET @sql_ti = IF(@tbl_ti = 0,
    'CREATE TABLE Scan_TemplateImages (
        ImageID    INT          NOT NULL AUTO_INCREMENT,
        TemplateID INT          NOT NULL,
        ImageType  VARCHAR(30)  NOT NULL DEFAULT ''SamplePage'',
        FilePath   VARCHAR(500) NOT NULL,
        UploadedAt DATETIME     NOT NULL DEFAULT NOW(),
        PRIMARY KEY (ImageID),
        CONSTRAINT fk_tplimg_tpl FOREIGN KEY (TemplateID)
            REFERENCES Scan_ScanTemplates(TemplateID)
            ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',
    'SELECT ''Scan_TemplateImages already exists'' AS info'
);
PREPARE stmt_ti FROM @sql_ti; EXECUTE stmt_ti; DEALLOCATE PREPARE stmt_ti;
