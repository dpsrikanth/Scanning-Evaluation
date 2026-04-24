-- =========================================================
-- MIGRATION 010 — Scan Template PDF quality + Threshold
-- Database: ScanningDB
-- =========================================================
USE ScanningDB;

-- Add Threshold (for BlackWhite scans), PdfJpegQuality, and PdfMaxDpi
-- Uses information_schema guards for idempotency on MySQL 8.

SET @col_thr = (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = 'ScanningDB'
      AND TABLE_NAME   = 'Scan_ScanTemplates'
      AND COLUMN_NAME  = 'Threshold'
);
SET @sql_thr = IF(@col_thr = 0,
    'ALTER TABLE Scan_ScanTemplates ADD COLUMN Threshold INT NOT NULL DEFAULT 128 COMMENT ''0-255, greyscale cutoff for BlackWhite pixel mode''',
    'SELECT ''Threshold already exists'' AS info'
);
PREPARE stmt_thr FROM @sql_thr; EXECUTE stmt_thr; DEALLOCATE PREPARE stmt_thr;

SET @col_pq = (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = 'ScanningDB'
      AND TABLE_NAME   = 'Scan_ScanTemplates'
      AND COLUMN_NAME  = 'PdfJpegQuality'
);
SET @sql_pq = IF(@col_pq = 0,
    'ALTER TABLE Scan_ScanTemplates ADD COLUMN PdfJpegQuality INT NOT NULL DEFAULT 85 COMMENT ''1-100 JPEG quality used when embedding images in the PDF''',
    'SELECT ''PdfJpegQuality already exists'' AS info'
);
PREPARE stmt_pq FROM @sql_pq; EXECUTE stmt_pq; DEALLOCATE PREPARE stmt_pq;

SET @col_pd = (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = 'ScanningDB'
      AND TABLE_NAME   = 'Scan_ScanTemplates'
      AND COLUMN_NAME  = 'PdfMaxDpi'
);
SET @sql_pd = IF(@col_pd = 0,
    'ALTER TABLE Scan_ScanTemplates ADD COLUMN PdfMaxDpi INT NOT NULL DEFAULT 0 COMMENT ''Max DPI when embedding in PDF; 0 = no downscale (preserve original resolution)''',
    'SELECT ''PdfMaxDpi already exists'' AS info'
);
PREPARE stmt_pd FROM @sql_pd; EXECUTE stmt_pd; DEALLOCATE PREPARE stmt_pd;
