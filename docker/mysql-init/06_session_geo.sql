-- Migration: add geolocation + login photo columns to Eval_Sessions
-- Safe to run multiple times (checks information_schema before ALTER)

SET @dbname = DATABASE();

-- GeoLatitude
SET @sql1 = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'Eval_Sessions' AND COLUMN_NAME = 'GeoLatitude') = 0,
  'ALTER TABLE Eval_Sessions ADD COLUMN GeoLatitude DECIMAL(10,8) NULL AFTER DeviceInfo',
  'SELECT 1 AS already_exists'
);
PREPARE stmt FROM @sql1; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- GeoLongitude
SET @sql2 = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'Eval_Sessions' AND COLUMN_NAME = 'GeoLongitude') = 0,
  'ALTER TABLE Eval_Sessions ADD COLUMN GeoLongitude DECIMAL(11,8) NULL AFTER GeoLatitude',
  'SELECT 1 AS already_exists'
);
PREPARE stmt FROM @sql2; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- LoginPhotoPath
SET @sql3 = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'Eval_Sessions' AND COLUMN_NAME = 'LoginPhotoPath') = 0,
  'ALTER TABLE Eval_Sessions ADD COLUMN LoginPhotoPath VARCHAR(500) NULL AFTER GeoLongitude',
  'SELECT 1 AS already_exists'
);
PREPARE stmt FROM @sql3; EXECUTE stmt; DEALLOCATE PREPARE stmt;
