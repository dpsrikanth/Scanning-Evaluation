-- Eval_Annotations: ensure table exists + PayloadJSON for strokes (overlay only; PDF file unchanged)
USE EvaluationDB;

CREATE TABLE IF NOT EXISTS Eval_Annotations (
  AnnotationID BIGINT AUTO_INCREMENT PRIMARY KEY,
  EvaluationID BIGINT NOT NULL,
  PageNumber INT NOT NULL,
  AnnotationType VARCHAR(80) NOT NULL,
  PosX DECIMAL(14,12) NULL,
  PosY DECIMAL(14,12) NULL,
  Note TEXT NULL,
  PayloadJSON JSON NULL COMMENT 'Normalized stroke points, shapes; stored per evaluation/booklet',
  CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_eval_ann_eval_page (EvaluationID, PageNumber),
  CONSTRAINT fk_eval_ann_eval FOREIGN KEY (EvaluationID) REFERENCES Evaluations(EvaluationID)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SET @db = 'EvaluationDB';
SET @tbl = 'Eval_Annotations';
SET @col = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = @tbl AND COLUMN_NAME = 'PayloadJSON');
SET @sql = IF(@col = 0,
  'ALTER TABLE Eval_Annotations ADD COLUMN PayloadJSON JSON NULL COMMENT ''Stroke paths; overlay JSON only''',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SELECT 'Migration 13_eval_annotations_payload complete' AS Status;
