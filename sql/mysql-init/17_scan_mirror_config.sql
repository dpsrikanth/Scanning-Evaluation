-- Offsite copy after booklet upload: SFTP or second local/network path (SMB/UNC mount).
USE ScanningDB;

CREATE TABLE IF NOT EXISTS Scan_MirrorConfig (
  ConfigID TINYINT NOT NULL PRIMARY KEY DEFAULT 1,
  MirrorEnabled TINYINT NOT NULL DEFAULT 0,
  MirrorMode VARCHAR(20) NOT NULL DEFAULT 'none' COMMENT 'none, sftp, network',
  SftpHost VARCHAR(500) NULL,
  SftpPort INT NOT NULL DEFAULT 22,
  SftpUsername VARCHAR(255) NULL,
  SftpPassword VARCHAR(2000) NULL COMMENT 'Restrict DB access in production',
  SftpRemotePath VARCHAR(1000) NULL COMMENT 'e.g. /data/incoming',
  NetworkPath VARCHAR(1000) NULL COMMENT 'Local path, UNC, or mounted share visible to the API',
  CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  UpdatedAt DATETIME NULL ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

INSERT IGNORE INTO Scan_MirrorConfig (ConfigID, MirrorEnabled, MirrorMode)
VALUES (1, 0, 'none');
