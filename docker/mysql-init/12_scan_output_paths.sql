-- Scan output path configuration (scanned documents only).
-- Profile photos and other assets use common API storage.
USE ScanningDB;

CREATE TABLE IF NOT EXISTS Scan_OutputPaths (
  PathID INT AUTO_INCREMENT PRIMARY KEY,
  PathLabel VARCHAR(200) NOT NULL COMMENT 'Display label e.g. Primary Store',
  PathValue VARCHAR(1000) NOT NULL COMMENT 'Absolute or network path for booklet storage',
  IsActive TINYINT NOT NULL DEFAULT 0 COMMENT 'Only one path can be active; uploads go here',
  DisplayOrder INT NOT NULL DEFAULT 0,
  CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  ModifiedAt DATETIME NULL ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- Ensure only one active: use trigger or app logic. For simplicity app sets IsActive=1 for chosen, 0 for others.
INSERT INTO Scan_OutputPaths (PathLabel, PathValue, IsActive, DisplayOrder)
SELECT 'Default (server storage)', 'storage/scan_output', 1, 0
WHERE NOT EXISTS (SELECT 1 FROM Scan_OutputPaths LIMIT 1);
