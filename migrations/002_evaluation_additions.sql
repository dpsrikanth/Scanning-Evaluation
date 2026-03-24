-- =========================================================
-- Migration 002: Evaluation DB - Locations, Metadata, Scheme, etc.
-- Run against existing EvaluationDB
-- =========================================================

USE EvaluationDB;

-- 1. Create Eval_Locations
CREATE TABLE IF NOT EXISTS Eval_Locations (
    LocationID INT AUTO_INCREMENT PRIMARY KEY,
    LocationCode VARCHAR(50) UNIQUE NOT NULL,
    LocationName VARCHAR(200) NOT NULL,
    Address VARCHAR(500),
    IsActive TINYINT DEFAULT 1,
    CreatedBy VARCHAR(100),
    CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    CreatedFromIP VARCHAR(50),
    CreatedFromSystem VARCHAR(50),
    ModifiedBy VARCHAR(100),
    ModifiedAt DATETIME NULL ON UPDATE CURRENT_TIMESTAMP,
    ModifiedFromIP VARCHAR(50),
    ModifiedFromSystem VARCHAR(50),
    IsDeleted TINYINT DEFAULT 0,
    DeletedBy VARCHAR(100),
    DeletedAt DATETIME NULL,
    DeletedFromIP VARCHAR(50)
) ENGINE=InnoDB;

-- 2. Alter Roles - add SubjectCategory
ALTER TABLE Roles ADD COLUMN SubjectCategory VARCHAR(200) NULL 
    COMMENT 'Subject/category for evaluator hierarchy' AFTER RoleHierarchyLevel;

-- 3. Alter Users - add LocationID
ALTER TABLE Users ADD COLUMN LocationID INT NULL AFTER RoleID;
ALTER TABLE Users ADD CONSTRAINT fk_Users_Location 
    FOREIGN KEY (LocationID) REFERENCES Eval_Locations(LocationID);

-- 4. Alter Eval_Papers - add new columns
ALTER TABLE Eval_Papers ADD COLUMN QuestionPaperPath VARCHAR(1000) NULL AFTER MaxMarks;
ALTER TABLE Eval_Papers ADD COLUMN ModelAnswersPath VARCHAR(1000) NULL AFTER QuestionPaperPath;
ALTER TABLE Eval_Papers ADD COLUMN SecondaryEvalPercent DECIMAL(5,2) NULL 
    COMMENT 'Random % for secondary evaluation' AFTER VarianceDecisionMode;
ALTER TABLE Eval_Papers ADD COLUMN SecondaryEvalByTime TINYINT DEFAULT 1 
    COMMENT '1=flag by time taken, 0=disabled' AFTER SecondaryEvalPercent;

-- 5. Create Eval_QuestionScheme
CREATE TABLE IF NOT EXISTS Eval_QuestionScheme (
    SchemeID INT AUTO_INCREMENT PRIMARY KEY,
    PaperID INT,
    PageNumber INT,
    QuestionNumber VARCHAR(20),
    SubQuestionCode VARCHAR(20),
    MaxMarks DECIMAL(10,2),
    SortOrder INT DEFAULT 0,
    FOREIGN KEY (PaperID) REFERENCES Eval_Papers(PaperID),
    CreatedBy VARCHAR(100),
    CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    ModifiedBy VARCHAR(100),
    ModifiedAt DATETIME NULL ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- 6. Alter Eval_Booklets - add LocationID, RejectionReason
ALTER TABLE Eval_Booklets ADD COLUMN LocationID INT NULL AFTER PaperID;
ALTER TABLE Eval_Booklets ADD COLUMN RejectionReason TEXT NULL AFTER EvaluationStatus;

-- FK after Eval_Locations exists:
-- ALTER TABLE Eval_Booklets ADD CONSTRAINT fk_Eval_Booklets_Location 
--     FOREIGN KEY (LocationID) REFERENCES Eval_Locations(LocationID);

-- 7. Create Eval_BookletMetadata
CREATE TABLE IF NOT EXISTS Eval_BookletMetadata (
    BookletID VARCHAR(100) PRIMARY KEY,
    StudentName VARCHAR(200),
    ProgramLevel VARCHAR(50),
    Branch VARCHAR(100),
    Year VARCHAR(20),
    Semester VARCHAR(20),
    Subject VARCHAR(200),
    DocumentNumber VARCHAR(100),
    CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    ModifiedAt DATETIME NULL ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (BookletID) REFERENCES Eval_Booklets(BookletID)
) ENGINE=InnoDB;

-- 8. Alter AllocationQueue
ALTER TABLE AllocationQueue ADD COLUMN SessionDate DATE NULL AFTER AllocatedAt;
ALTER TABLE AllocationQueue ADD COLUMN DailyBookletLimit INT NULL AFTER SessionDate;
ALTER TABLE AllocationQueue ADD COLUMN EvaluationCharges DECIMAL(10,2) NULL AFTER DailyBookletLimit;

-- 9. Alter Evaluations
ALTER TABLE Evaluations ADD COLUMN SubmittedAt DATETIME NULL AFTER IsSubmitted;
ALTER TABLE Evaluations ADD COLUMN AllPagesVisited TINYINT DEFAULT 0 
    COMMENT '1=every page review completed' AFTER SubmittedAt;

-- 10. Alter EvaluationDetails - PageNumber, SubQuestionCode, FlagReason; change QuestionNumber
ALTER TABLE EvaluationDetails ADD COLUMN PageNumber INT NULL AFTER EvaluationID;
ALTER TABLE EvaluationDetails ADD COLUMN SubQuestionCode VARCHAR(20) NULL AFTER QuestionNumber;
ALTER TABLE EvaluationDetails ADD COLUMN FlagReason VARCHAR(500) NULL AFTER IsFlagged;
-- If QuestionNumber is INT, add new column and migrate:
-- ALTER TABLE EvaluationDetails ADD COLUMN QuestionNumberStr VARCHAR(20) NULL;
-- UPDATE EvaluationDetails SET QuestionNumberStr = CAST(QuestionNumber AS CHAR);
-- ALTER TABLE EvaluationDetails DROP COLUMN QuestionNumber;
-- ALTER TABLE EvaluationDetails CHANGE QuestionNumberStr QuestionNumber VARCHAR(20);

-- 11. Create Eval_PageVisitLog
CREATE TABLE IF NOT EXISTS Eval_PageVisitLog (
    VisitID BIGINT AUTO_INCREMENT PRIMARY KEY,
    EvaluationID BIGINT,
    PageNumber INT,
    VisitedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (EvaluationID) REFERENCES Evaluations(EvaluationID)
) ENGINE=InnoDB;

-- 12. Alter VarianceRecords
ALTER TABLE VarianceRecords ADD COLUMN PrimaryEvaluationID BIGINT NULL AFTER BookletID;
ALTER TABLE VarianceRecords ADD COLUMN SecondaryEvaluationID BIGINT NULL AFTER PrimaryEvaluationID;
ALTER TABLE VarianceRecords ADD COLUMN Decision VARCHAR(50) NULL 
    COMMENT 'AcceptPrimary, AcceptSecondary, Moderation' AFTER FinalMarks;

-- 13. Create Eval_AttendanceLog
CREATE TABLE IF NOT EXISTS Eval_AttendanceLog (
    AttendanceID BIGINT AUTO_INCREMENT PRIMARY KEY,
    UserID INT,
    SessionDate DATE,
    Status VARCHAR(50),
    LoginTime DATETIME NULL,
    LogoutTime DATETIME NULL,
    BookletsEvaluated INT DEFAULT 0,
    CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    ModifiedAt DATETIME NULL ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (UserID) REFERENCES Users(UserID)
) ENGINE=InnoDB;

-- 14. Indexes (skip if already exist)
CREATE INDEX idx_Eval_Booklets_LocationID ON Eval_Booklets(LocationID);
CREATE INDEX idx_AllocationQueue_SessionDate ON AllocationQueue(SessionDate);
CREATE INDEX idx_Eval_PageVisitLog_EvaluationID ON Eval_PageVisitLog(EvaluationID);
CREATE INDEX idx_Eval_AttendanceLog_UserID ON Eval_AttendanceLog(UserID);
CREATE INDEX idx_Eval_AttendanceLog_SessionDate ON Eval_AttendanceLog(SessionDate);
