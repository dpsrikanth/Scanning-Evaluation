
-- =========================================================
-- SCANNING & EVALUATION SYSTEM - FULL PRODUCTION DDL
-- Database Engine: MySQL 8+
-- Generated On: 2026-02-16T10:24:09.568037 UTC
-- Updated: 2026-02-19 (Additions based on requirements analysis)
-- =========================================================

-- ==========================
-- DATABASES
-- ==========================
CREATE DATABASE IF NOT EXISTS ScanningDB CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE IF NOT EXISTS EvaluationDB CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- =========================================================
-- SCANNING DATABASE
-- =========================================================
USE ScanningDB;

-- --------------------------
-- Common Audit Columns Macro (Reference Only)
-- CreatedBy VARCHAR(100)
-- CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
-- CreatedFromIP VARCHAR(50)
-- CreatedFromSystem VARCHAR(50)
-- ModifiedBy VARCHAR(100)
-- ModifiedAt DATETIME NULL ON UPDATE CURRENT_TIMESTAMP
-- ModifiedFromIP VARCHAR(50)
-- ModifiedFromSystem VARCHAR(50)
-- IsDeleted TINYINT DEFAULT 0
-- DeletedBy VARCHAR(100)
-- DeletedAt DATETIME NULL
-- DeletedFromIP VARCHAR(50)
-- --------------------------

CREATE TABLE Scan_Locations (
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

CREATE TABLE Scan_Workstations (
    WorkstationID INT AUTO_INCREMENT PRIMARY KEY,
    LocationID INT,
    WorkstationCode VARCHAR(50) NOT NULL,
    WorkstationName VARCHAR(200),
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
    DeletedFromIP VARCHAR(50),
    FOREIGN KEY (LocationID) REFERENCES Scan_Locations(LocationID)
) ENGINE=InnoDB;

CREATE TABLE Scan_Roles (
    RoleID INT AUTO_INCREMENT PRIMARY KEY,
    RoleName VARCHAR(100) NOT NULL,
    RoleHierarchyLevel INT NOT NULL,
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

CREATE TABLE Scan_Users (
    UserID INT AUTO_INCREMENT PRIMARY KEY,
    Username VARCHAR(100) UNIQUE,
    PasswordHash VARCHAR(500),
    FullName VARCHAR(200),
    RoleID INT,
    LocationID INT,
    IsActive TINYINT DEFAULT 1,
    FOREIGN KEY (RoleID) REFERENCES Scan_Roles(RoleID),
    FOREIGN KEY (LocationID) REFERENCES Scan_Locations(LocationID),
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

CREATE TABLE Scan_Exams (
    ExamID INT AUTO_INCREMENT PRIMARY KEY,
    ExamCode VARCHAR(50),
    ExamName VARCHAR(200),
    ExamYear INT,
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

CREATE TABLE Scan_Papers (
    PaperID INT AUTO_INCREMENT PRIMARY KEY,
    ExamID INT,
    PaperCode VARCHAR(50),
    PaperName VARCHAR(200),
    TotalPages INT,
    BookletPageCounts VARCHAR(50) COMMENT 'e.g. 12,24,36 for allowed booklet sizes',
    FOREIGN KEY (ExamID) REFERENCES Scan_Exams(ExamID),
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

CREATE TABLE Scan_Booklets (
    BookletID VARCHAR(100) PRIMARY KEY,
    ExamID INT,
    PaperID INT,
    LocationID INT,
    CentreCode VARCHAR(50),
    WorkstationID INT,
    TotalPagesExpected INT,
    TotalPagesScanned INT,
    ValidationStatus VARCHAR(50) COMMENT 'Valid, PageCountMismatch, BarcodeError, Duplicate',
    FileHashSHA256 VARCHAR(256),
    FilePath VARCHAR(1000),
    UploadStatus VARCHAR(50),
    IsExportedToEvaluation TINYINT DEFAULT 0,
    ExportedAt DATETIME NULL,
    ScanDate DATE,
    FOREIGN KEY (ExamID) REFERENCES Scan_Exams(ExamID),
    FOREIGN KEY (PaperID) REFERENCES Scan_Papers(PaperID),
    FOREIGN KEY (LocationID) REFERENCES Scan_Locations(LocationID),
    FOREIGN KEY (WorkstationID) REFERENCES Scan_Workstations(WorkstationID),
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

CREATE TABLE Scan_BookletPages (
    PageID BIGINT AUTO_INCREMENT PRIMARY KEY,
    BookletID VARCHAR(100),
    PageNumber INT,
    ImagePath VARCHAR(1000),
    PageHash VARCHAR(256),
    BarcodeData VARCHAR(500) COMMENT 'Per-page barcode/QR extracted value',
    ValidationStatus VARCHAR(50),
    IsRoughPage TINYINT DEFAULT 0,
    FOREIGN KEY (BookletID) REFERENCES Scan_Booklets(BookletID),
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

CREATE TABLE Scan_ActivityLogs (
    ActivityID BIGINT AUTO_INCREMENT PRIMARY KEY,
    UserID INT,
    ModuleName VARCHAR(100),
    ActionType VARCHAR(100),
    ReferenceID VARCHAR(100),
    OldValues JSON,
    NewValues JSON,
    IPAddress VARCHAR(50),
    DeviceInfo VARCHAR(200),
    AuthorityLevel INT,
    CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE Scan_SyncQueue (
    SyncQueueID BIGINT AUTO_INCREMENT PRIMARY KEY,
    BookletID VARCHAR(100),
    SyncStatus VARCHAR(50) DEFAULT 'Pending' COMMENT 'Pending, InProgress, Completed, Failed',
    SyncAttempts INT DEFAULT 0,
    LastSyncAttempt DATETIME NULL,
    ErrorMessage TEXT NULL,
    CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    CompletedAt DATETIME NULL,
    FOREIGN KEY (BookletID) REFERENCES Scan_Booklets(BookletID)
) ENGINE=InnoDB;

-- =========================================================
-- EVALUATION DATABASE
-- =========================================================
USE EvaluationDB;

CREATE TABLE Roles (
    RoleID INT AUTO_INCREMENT PRIMARY KEY,
    RoleName VARCHAR(100),
    RoleHierarchyLevel INT,
    SubjectCategory VARCHAR(200) COMMENT 'Subject/category for evaluator hierarchy',
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

CREATE TABLE Eval_Locations (
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

CREATE TABLE Users (
    UserID INT AUTO_INCREMENT PRIMARY KEY,
    Username VARCHAR(100) UNIQUE,
    PasswordHash VARCHAR(500),
    FullName VARCHAR(200),
    RoleID INT,
    LocationID INT,
    IsActive TINYINT DEFAULT 1,
    FOREIGN KEY (RoleID) REFERENCES Roles(RoleID),
    FOREIGN KEY (LocationID) REFERENCES Eval_Locations(LocationID),
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

CREATE TABLE Eval_Exams (
    ExamID INT AUTO_INCREMENT PRIMARY KEY,
    ExamCode VARCHAR(50),
    ExamName VARCHAR(200),
    ExamYear INT,
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

CREATE TABLE Eval_Papers (
    PaperID INT AUTO_INCREMENT PRIMARY KEY,
    ExamID INT,
    PaperCode VARCHAR(50),
    PaperName VARCHAR(200),
    MaxMarks DECIMAL(10,2),
    QuestionPaperPath VARCHAR(1000),
    ModelAnswersPath VARCHAR(1000),
    VarianceThresholdPercent DECIMAL(5,2),
    VarianceDecisionMode VARCHAR(50) COMMENT 'Average, Primary, Secondary, Moderation',
    SecondaryEvalPercent DECIMAL(5,2) COMMENT 'Random % for secondary evaluation',
    SecondaryEvalByTime TINYINT DEFAULT 1 COMMENT '1=flag by time taken, 0=disabled',
    FOREIGN KEY (ExamID) REFERENCES Eval_Exams(ExamID),
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

CREATE TABLE Eval_QuestionScheme (
    SchemeID INT AUTO_INCREMENT PRIMARY KEY,
    PaperID INT,
    PageNumber INT,
    QuestionNumber VARCHAR(20) COMMENT 'e.g. 01, 03, 10',
    SubQuestionCode VARCHAR(20) COMMENT 'e.g. A, B, C for 10-A, 10-B',
    MaxMarks DECIMAL(10,2),
    SortOrder INT DEFAULT 0,
    FOREIGN KEY (PaperID) REFERENCES Eval_Papers(PaperID),
    CreatedBy VARCHAR(100),
    CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    ModifiedBy VARCHAR(100),
    ModifiedAt DATETIME NULL ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE Eval_Booklets (
    BookletID VARCHAR(100) PRIMARY KEY,
    ExamID INT,
    PaperID INT,
    LocationID INT,
    CentreCode VARCHAR(50),
    TotalPages INT,
    FileHashSHA256 VARCHAR(256),
    FilePath VARCHAR(1000),
    EvaluationStatus VARCHAR(50) COMMENT 'Open, Allocated, InProgress, Evaluated, Rejected, Recheck',
    RejectionReason TEXT,
    FOREIGN KEY (ExamID) REFERENCES Eval_Exams(ExamID),
    FOREIGN KEY (PaperID) REFERENCES Eval_Papers(PaperID),
    FOREIGN KEY (LocationID) REFERENCES Eval_Locations(LocationID),
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

CREATE TABLE Eval_BookletMetadata (
    BookletID VARCHAR(100) PRIMARY KEY,
    StudentName VARCHAR(200),
    ProgramLevel VARCHAR(50) COMMENT 'UG/PG, B.Tech, M.Tech, etc.',
    Branch VARCHAR(100),
    Year VARCHAR(20),
    Semester VARCHAR(20),
    Subject VARCHAR(200),
    DocumentNumber VARCHAR(100),
    CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    ModifiedAt DATETIME NULL ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (BookletID) REFERENCES Eval_Booklets(BookletID)
) ENGINE=InnoDB;

CREATE TABLE AllocationQueue (
    AllocationID BIGINT AUTO_INCREMENT PRIMARY KEY,
    BookletID VARCHAR(100),
    AllocatedToUserID INT,
    AllocationType VARCHAR(50) COMMENT 'Primary, Secondary, Moderation',
    EvaluationStatus VARCHAR(50) COMMENT 'Allocated, InProgress, Evaluated, Rejected',
    SessionDate DATE,
    AllocatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    DailyBookletLimit INT COMMENT 'Max booklets per evaluator per day if applicable',
    EvaluationCharges DECIMAL(10,2),
    FOREIGN KEY (BookletID) REFERENCES Eval_Booklets(BookletID),
    FOREIGN KEY (AllocatedToUserID) REFERENCES Users(UserID),
    CreatedBy VARCHAR(100),
    CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    CreatedFromIP VARCHAR(50),
    CreatedFromSystem VARCHAR(50),
    IsDeleted TINYINT DEFAULT 0
) ENGINE=InnoDB;

CREATE TABLE Evaluations (
    EvaluationID BIGINT AUTO_INCREMENT PRIMARY KEY,
    BookletID VARCHAR(100),
    EvaluatorUserID INT,
    EvaluationType VARCHAR(50) COMMENT 'Primary, Secondary, Moderation',
    StartTime DATETIME,
    EndTime DATETIME,
    TotalMarks DECIMAL(10,2),
    IsSubmitted TINYINT DEFAULT 0,
    SubmittedAt DATETIME NULL,
    AllPagesVisited TINYINT DEFAULT 0 COMMENT '1=every page review completed',
    FOREIGN KEY (BookletID) REFERENCES Eval_Booklets(BookletID),
    FOREIGN KEY (EvaluatorUserID) REFERENCES Users(UserID),
    CreatedBy VARCHAR(100),
    CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE EvaluationDetails (
    EvaluationDetailID BIGINT AUTO_INCREMENT PRIMARY KEY,
    EvaluationID BIGINT,
    PageNumber INT,
    QuestionNumber VARCHAR(20),
    SubQuestionCode VARCHAR(20) COMMENT 'e.g. A, B for 10-A, 10-B',
    MarksAwarded DECIMAL(10,2),
    MaxMarks DECIMAL(10,2),
    Notes TEXT,
    IsFlagged TINYINT DEFAULT 0 COMMENT 'Same answer, partial, no Q#, etc.',
    FlagReason VARCHAR(500),
    FOREIGN KEY (EvaluationID) REFERENCES Evaluations(EvaluationID),
    CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE Eval_PageVisitLog (
    VisitID BIGINT AUTO_INCREMENT PRIMARY KEY,
    EvaluationID BIGINT,
    PageNumber INT,
    VisitedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (EvaluationID) REFERENCES Evaluations(EvaluationID)
) ENGINE=InnoDB;

CREATE TABLE VarianceRecords (
    VarianceID BIGINT AUTO_INCREMENT PRIMARY KEY,
    BookletID VARCHAR(100),
    PrimaryEvaluationID BIGINT,
    SecondaryEvaluationID BIGINT,
    PrimaryMarks DECIMAL(10,2),
    SecondaryMarks DECIMAL(10,2),
    DifferencePercent DECIMAL(5,2),
    FinalMarks DECIMAL(10,2),
    Decision VARCHAR(50) COMMENT 'AcceptPrimary, AcceptSecondary, Moderation',
    ApprovedByUserID INT,
    CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (BookletID) REFERENCES Eval_Booklets(BookletID),
    FOREIGN KEY (PrimaryEvaluationID) REFERENCES Evaluations(EvaluationID),
    FOREIGN KEY (SecondaryEvaluationID) REFERENCES Evaluations(EvaluationID),
    FOREIGN KEY (ApprovedByUserID) REFERENCES Users(UserID)
) ENGINE=InnoDB;

CREATE TABLE OverrideLogs (
    OverrideID BIGINT AUTO_INCREMENT PRIMARY KEY,
    BookletID VARCHAR(100),
    OldMarks DECIMAL(10,2),
    NewMarks DECIMAL(10,2),
    OverrideReason TEXT,
    OverriddenByUserID INT,
    CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (BookletID) REFERENCES Eval_Booklets(BookletID),
    FOREIGN KEY (OverriddenByUserID) REFERENCES Users(UserID)
) ENGINE=InnoDB;

CREATE TABLE Eval_AttendanceLog (
    AttendanceID BIGINT AUTO_INCREMENT PRIMARY KEY,
    UserID INT,
    SessionDate DATE,
    Status VARCHAR(50) COMMENT 'Present, Absent, Suspended, DeRoster',
    LoginTime DATETIME NULL,
    LogoutTime DATETIME NULL,
    BookletsEvaluated INT DEFAULT 0,
    CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    ModifiedAt DATETIME NULL ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (UserID) REFERENCES Users(UserID)
) ENGINE=InnoDB;

CREATE TABLE ActivityLogs (
    ActivityID BIGINT AUTO_INCREMENT PRIMARY KEY,
    UserID INT,
    ModuleName VARCHAR(100),
    ActionType VARCHAR(100),
    ReferenceID VARCHAR(100),
    OldValues JSON,
    NewValues JSON,
    IPAddress VARCHAR(50),
    DeviceInfo VARCHAR(200),
    AuthorityLevel INT,
    CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- =========================
-- INDEXES (Performance)
-- =========================
USE ScanningDB;

CREATE INDEX idx_Scan_Booklets_ExamID ON Scan_Booklets(ExamID);
CREATE INDEX idx_Scan_Booklets_PaperID ON Scan_Booklets(PaperID);
CREATE INDEX idx_Scan_Booklets_LocationID ON Scan_Booklets(LocationID);
CREATE INDEX idx_Scan_Booklets_ScanDate ON Scan_Booklets(ScanDate);
CREATE INDEX idx_Scan_Booklets_ValidationStatus ON Scan_Booklets(ValidationStatus);
CREATE INDEX idx_Scan_Booklets_IsExported ON Scan_Booklets(IsExportedToEvaluation);
CREATE INDEX idx_Scan_BookletPages_BookletID ON Scan_BookletPages(BookletID);
CREATE INDEX idx_Scan_ActivityLogs_UserID ON Scan_ActivityLogs(UserID);
CREATE INDEX idx_Scan_ActivityLogs_CreatedAt ON Scan_ActivityLogs(CreatedAt);

USE EvaluationDB;

CREATE INDEX idx_Eval_Booklets_ExamID ON Eval_Booklets(ExamID);
CREATE INDEX idx_Eval_Booklets_PaperID ON Eval_Booklets(PaperID);
CREATE INDEX idx_Eval_Booklets_EvaluationStatus ON Eval_Booklets(EvaluationStatus);
CREATE INDEX idx_AllocationQueue_UserID ON AllocationQueue(AllocatedToUserID);
CREATE INDEX idx_AllocationQueue_SessionDate ON AllocationQueue(SessionDate);
CREATE INDEX idx_Evaluations_BookletID ON Evaluations(BookletID);
CREATE INDEX idx_Evaluations_EvaluatorUserID ON Evaluations(EvaluatorUserID);
CREATE INDEX idx_Evaluations_StartTime ON Evaluations(StartTime);
CREATE INDEX idx_EvaluationDetails_EvaluationID ON EvaluationDetails(EvaluationID);
CREATE INDEX idx_Eval_PageVisitLog_EvaluationID ON Eval_PageVisitLog(EvaluationID);
CREATE INDEX idx_Eval_AttendanceLog_UserID ON Eval_AttendanceLog(UserID);
CREATE INDEX idx_Eval_AttendanceLog_SessionDate ON Eval_AttendanceLog(SessionDate);

-- =========================
-- END OF SCRIPT
-- =========================
