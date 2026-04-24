-- Migration: Eval_QuestionSets table + SetID on Eval_QuestionScheme & EvaluationDetails

-- 1. Create Eval_QuestionSets
CREATE TABLE IF NOT EXISTS Eval_QuestionSets (
  SetID              INT           AUTO_INCREMENT PRIMARY KEY,
  PaperID            INT           NOT NULL,
  SetLabel           VARCHAR(50)   NOT NULL,
  SetType            VARCHAR(20)   NOT NULL,        -- Common | Mandatory | AnswerAll
  TotalQuestions     INT           NOT NULL,         -- M: total available
  AttemptQuestions   INT           NOT NULL,         -- N: to count (= M for non-Common)
  MarksPerQuestion   DECIMAL(10,2) NOT NULL,
  QuestionRangeFrom  VARCHAR(20)   NULL,             -- display label e.g. "Q1"
  QuestionRangeTo    VARCHAR(20)   NULL,             -- display label e.g. "Q5"
  SortOrder          INT           DEFAULT 0,
  CreatedBy          INT           NULL,
  CreatedAt          DATETIME      DEFAULT CURRENT_TIMESTAMP,
  ModifiedBy         INT           NULL,
  ModifiedAt         DATETIME      NULL,
  FOREIGN KEY (PaperID) REFERENCES Eval_Papers(PaperID)
) ENGINE=InnoDB;

-- 2. Add SetID column to Eval_QuestionScheme (idempotent)
SET @dbname = DATABASE();

SET @sql1 = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'Eval_QuestionScheme' AND COLUMN_NAME = 'SetID') = 0,
  'ALTER TABLE Eval_QuestionScheme ADD COLUMN SetID INT NULL AFTER PaperID',
  'SELECT 1'
);
PREPARE s FROM @sql1; EXECUTE s; DEALLOCATE PREPARE s;

-- 3. Add SetID column to EvaluationDetails (idempotent)
SET @sql2 = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'EvaluationDetails' AND COLUMN_NAME = 'SetID') = 0,
  'ALTER TABLE EvaluationDetails ADD COLUMN SetID INT NULL AFTER SubQuestionCode',
  'SELECT 1'
);
PREPARE s FROM @sql2; EXECUTE s; DEALLOCATE PREPARE s;
