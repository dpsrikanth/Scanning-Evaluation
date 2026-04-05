-- =========================================================
-- 006 — Scan_ScanTemplates: PDF filename, barcode zones, upload schedule
-- Run on EXISTING ScanningDB (Docker mysql-init only runs on first volume create):
--   mysql -u root -p -h 127.0.0.1 -P 3307 ScanningDB < migrations/006_scan_template_extended.sql
-- Idempotent: skips columns that already exist.
-- =========================================================
USE ScanningDB;

SET @col_fn = (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = 'ScanningDB'
      AND TABLE_NAME   = 'Scan_ScanTemplates'
      AND COLUMN_NAME  = 'PdfFilenameFormat'
);
SET @sql_fn = IF(@col_fn = 0,
    'ALTER TABLE Scan_ScanTemplates ADD COLUMN PdfFilenameFormat VARCHAR(512) NULL DEFAULT NULL COMMENT ''Tokens: {BookletId},{ExamCode},{RollNo},{Serial},{Time},{zone:name}''',
    'SELECT ''PdfFilenameFormat already exists'' AS info'
);
PREPARE s FROM @sql_fn; EXECUTE s; DEALLOCATE PREPARE s;

SET @col_bp = (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = 'ScanningDB'
      AND TABLE_NAME   = 'Scan_ScanTemplates'
      AND COLUMN_NAME  = 'BarcodeStartPage'
);
SET @sql_bp = IF(@col_bp = 0,
    'ALTER TABLE Scan_ScanTemplates ADD COLUMN BarcodeStartPage INT NOT NULL DEFAULT 3 COMMENT ''1-based page to start footer page-number barcode checks''',
    'SELECT ''BarcodeStartPage already exists'' AS info'
);
PREPARE s FROM @sql_bp; EXECUTE s; DEALLOCATE PREPARE s;

SET @col_zj = (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = 'ScanningDB'
      AND TABLE_NAME   = 'Scan_ScanTemplates'
      AND COLUMN_NAME  = 'BarcodeZonesJson'
);
SET @sql_zj = IF(@col_zj = 0,
    'ALTER TABLE Scan_ScanTemplates ADD COLUMN BarcodeZonesJson JSON NULL COMMENT ''Array of {zoneName,pageScope,pageNumber,xPct,yPct,wPct,hPct,hint}''',
    'SELECT ''BarcodeZonesJson already exists'' AS info'
);
PREPARE s FROM @sql_zj; EXECUTE s; DEALLOCATE PREPARE s;

SET @col_um = (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = 'ScanningDB'
      AND TABLE_NAME   = 'Scan_ScanTemplates'
      AND COLUMN_NAME  = 'UploadScheduleMode'
);
SET @sql_um = IF(@col_um = 0,
    'ALTER TABLE Scan_ScanTemplates ADD COLUMN UploadScheduleMode VARCHAR(40) NOT NULL DEFAULT ''immediate'' COMMENT ''immediate|every_4h|every_8h|every_12h|end_of_day|custom''',
    'SELECT ''UploadScheduleMode already exists'' AS info'
);
PREPARE s FROM @sql_um; EXECUTE s; DEALLOCATE PREPARE s;

SET @col_up = (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = 'ScanningDB'
      AND TABLE_NAME   = 'Scan_ScanTemplates'
      AND COLUMN_NAME  = 'UploadScheduleParam'
);
SET @sql_up = IF(@col_up = 0,
    'ALTER TABLE Scan_ScanTemplates ADD COLUMN UploadScheduleParam VARCHAR(64) NULL DEFAULT NULL COMMENT ''For custom: minutes after scan before upload allowed''',
    'SELECT ''UploadScheduleParam already exists'' AS info'
);
PREPARE s FROM @sql_up; EXECUTE s; DEALLOCATE PREPARE s;
