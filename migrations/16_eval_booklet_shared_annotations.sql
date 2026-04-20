-- Same as docker/mysql-init/16_eval_booklet_shared_annotations.sql (for manual apply).

CREATE TABLE IF NOT EXISTS Eval_BookletSharedAnnotations (
  BookletID VARCHAR(100) NOT NULL,
  PageNumber INT NOT NULL,
  ItemsJson JSON NOT NULL COMMENT 'Array of {id,type,x,y,w,h,fullPage?,...}',
  UpdatedByUserID INT NULL,
  UpdatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (BookletID, PageNumber),
  KEY idx_bsa_booklet (BookletID)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
