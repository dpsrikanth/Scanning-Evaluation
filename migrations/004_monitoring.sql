-- =========================================================
-- Migration 004: Evaluator Monitoring, Photo Capture,
--               Session Context, Activity Audit enhancements
-- Target DB: EvaluationDB
-- Idempotent: safe to re-run (MySQL 8 compatible)
-- =========================================================
USE EvaluationDB;

-- ── 1. Users — add ProfilePhotoPath column ─────────────────────────────────
SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = 'EvaluationDB'
    AND TABLE_NAME   = 'Users'
    AND COLUMN_NAME  = 'ProfilePhotoPath'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE Users ADD COLUMN ProfilePhotoPath VARCHAR(500) NULL COMMENT ''Path to evaluator profile/registration photo''',
  'SELECT ''ProfilePhotoPath already exists'' AS info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── 2. EvaluatorPhotos — random capture during evaluation ──────────────────
CREATE TABLE IF NOT EXISTS EvaluatorPhotos (
  PhotoID           BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  UserID            INT NOT NULL,
  EvaluationID      BIGINT NULL,
  CapturedAt        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PhotoPath         VARCHAR(500) NOT NULL,
  FaceMatchScore    DECIMAL(5,2) NULL COMMENT '0-100 similarity score from face-api.js',
  FaceMatchResult   ENUM('Matched','Mismatch','Skipped','Error','VerifyStart') NOT NULL DEFAULT 'Skipped',
  CaptureType       ENUM('SessionStart','RandomCapture') NOT NULL DEFAULT 'RandomCapture',
  IPAddress         VARCHAR(45) NULL,
  CreatedAt         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_evalphotos_user  FOREIGN KEY (UserID) REFERENCES Users(UserID),
  CONSTRAINT fk_evalphotos_eval  FOREIGN KEY (EvaluationID) REFERENCES Evaluations(EvaluationID)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── 3. Eval_Sessions — login session context ──────────────────────────────
CREATE TABLE IF NOT EXISTS Eval_Sessions (
  SessionID       BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  UserID          INT NOT NULL,
  LocationID      INT NULL,
  WorkstationID   INT NULL,
  SessionPeriod   ENUM('Morning','Afternoon','Evening') NOT NULL DEFAULT 'Morning',
  ExamID          INT NULL,
  PaperID         INT NULL,
  LoginTime       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  LogoutTime      DATETIME NULL,
  HeartbeatAt     DATETIME NULL,
  IPAddress       VARCHAR(45) NULL,
  DeviceInfo      VARCHAR(500) NULL,
  IsActive        TINYINT(1) NOT NULL DEFAULT 1,
  CreatedAt       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_evalsess_user     FOREIGN KEY (UserID)     REFERENCES Users(UserID),
  CONSTRAINT fk_evalsess_loc      FOREIGN KEY (LocationID) REFERENCES Eval_Locations(LocationID),
  CONSTRAINT fk_evalsess_exam     FOREIGN KEY (ExamID)     REFERENCES Eval_Exams(ExamID),
  CONSTRAINT fk_evalsess_paper    FOREIGN KEY (PaperID)    REFERENCES Eval_Papers(PaperID)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── 4. Eval_PageVisitLog — add DurationSeconds column ─────────────────────
SET @c1 = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA='EvaluationDB' AND TABLE_NAME='Eval_PageVisitLog' AND COLUMN_NAME='DurationSeconds');
SET @s1 = IF(@c1=0, 'ALTER TABLE Eval_PageVisitLog ADD COLUMN DurationSeconds INT NULL COMMENT ''Seconds spent on this page''', 'SELECT 1');
PREPARE stmt FROM @s1; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c2 = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA='EvaluationDB' AND TABLE_NAME='Eval_PageVisitLog' AND COLUMN_NAME='ZoomLevel');
SET @s2 = IF(@c2=0, 'ALTER TABLE Eval_PageVisitLog ADD COLUMN ZoomLevel DECIMAL(4,2) NULL', 'SELECT 1');
PREPARE stmt FROM @s2; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c3 = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA='EvaluationDB' AND TABLE_NAME='Eval_PageVisitLog' AND COLUMN_NAME='AnnotationsMade');
SET @s3 = IF(@c3=0, 'ALTER TABLE Eval_PageVisitLog ADD COLUMN AnnotationsMade INT NOT NULL DEFAULT 0', 'SELECT 1');
PREPARE stmt FROM @s3; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c4 = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA='EvaluationDB' AND TABLE_NAME='Eval_PageVisitLog' AND COLUMN_NAME='TabSwitchCount');
SET @c4 = IF(@c4=0, 'ALTER TABLE Eval_PageVisitLog ADD COLUMN TabSwitchCount INT NOT NULL DEFAULT 0', 'SELECT 1');
PREPARE stmt FROM @c4; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── 5. ActivityLogs — add TabSwitchCount + SessionID columns ──────────────
SET @a1 = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA='EvaluationDB' AND TABLE_NAME='ActivityLogs' AND COLUMN_NAME='TabSwitchCount');
SET @as1 = IF(@a1=0, 'ALTER TABLE ActivityLogs ADD COLUMN TabSwitchCount INT NOT NULL DEFAULT 0', 'SELECT 1');
PREPARE stmt FROM @as1; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @a2 = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA='EvaluationDB' AND TABLE_NAME='ActivityLogs' AND COLUMN_NAME='SessionID');
SET @as2 = IF(@a2=0, 'ALTER TABLE ActivityLogs ADD COLUMN SessionID BIGINT UNSIGNED NULL COMMENT ''Eval_Sessions.SessionID for traceability''', 'SELECT 1');
PREPARE stmt FROM @as2; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── 6. System_Settings — seed monitoring keys ─────────────────────────────
INSERT INTO System_Settings (SettingKey, SettingValue, Description) VALUES
  ('photo_verify_enabled',        '1',              'Enable face verification when starting evaluation'),
  ('photo_verify_action',         'warn_continue',  'Action on mismatch: block|warn_continue|flag_notify|warn_and_flag'),
  ('photo_capture_enabled',       '1',              'Enable random photo capture during evaluation'),
  ('photo_capture_interval_min',  '15',             'Minimum minutes between random captures'),
  ('photo_capture_interval_max',  '30',             'Maximum minutes between random captures'),
  ('min_time_default',            '300',            'Default minimum seconds per answer sheet (red-flag threshold)'),
  ('min_time_warning_email',      '1',              'Send email alert to Admin/HE when evaluator is red-flagged'),
  ('tab_switch_flag_threshold',   '3',              'Number of tab switches per page before flagging as suspicious')
ON DUPLICATE KEY UPDATE SettingKey = SettingKey;

-- ── 7. Verify completion ───────────────────────────────────────────────────
SELECT 'Migration 004 complete' AS Status;
