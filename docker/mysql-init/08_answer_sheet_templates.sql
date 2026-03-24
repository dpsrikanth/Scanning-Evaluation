-- =========================================================
-- Answer Sheet Template Designer
-- Database: EvaluationDB
-- =========================================================
USE EvaluationDB;

CREATE TABLE IF NOT EXISTS AnswerSheet_Templates (
  TemplateID        INT AUTO_INCREMENT PRIMARY KEY,
  TemplateName      VARCHAR(200)  NOT NULL,
  ExamID            INT           NULL,            -- optional link to Eval_Exams
  CoverFields       JSON          NOT NULL,        -- [{id,label,layout,enabled,order}]
  Instructions2     MEDIUMTEXT    NULL,            -- page-2 text
  Instructions3     MEDIUMTEXT    NULL,            -- page-3 text (NULL = no page 3)
  TotalAnswerPages  INT           NOT NULL DEFAULT 20,  -- 16 | 20 | 24
  PageStyle         VARCHAR(20)   NOT NULL DEFAULT 'lined',  -- 'lined' | 'plain'
  IsActive          TINYINT       NOT NULL DEFAULT 1,
  CreatedBy         VARCHAR(100),
  CreatedAt         DATETIME      DEFAULT CURRENT_TIMESTAMP,
  CreatedFromIP     VARCHAR(50),
  ModifiedBy        VARCHAR(100),
  ModifiedAt        DATETIME      NULL ON UPDATE CURRENT_TIMESTAMP,
  ModifiedFromIP    VARCHAR(50),
  IsDeleted         TINYINT       NOT NULL DEFAULT 0,
  DeletedBy         VARCHAR(100),
  DeletedAt         DATETIME      NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
