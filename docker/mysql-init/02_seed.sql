-- =========================================================
-- Seed data for development
-- =========================================================

-- SCANNING DB SEEDS
USE ScanningDB;

INSERT INTO Scan_Roles (RoleName, RoleHierarchyLevel) VALUES
  ('Admin', 1),
  ('Operator', 2);

INSERT INTO Scan_Locations (LocationCode, LocationName, Address) VALUES
  ('LOC001', 'Main Scanning Centre', 'Block A, Technical University Campus');

INSERT INTO Scan_Workstations (LocationID, WorkstationCode, WorkstationName) VALUES
  (1, 'WS01', 'Workstation 1'),
  (1, 'WS02', 'Workstation 2');

INSERT INTO Scan_Users (Username, PasswordHash, FullName, RoleID, LocationID) VALUES
  ('scanadmin', '$2a$10$E98PmmCqajVZd4qwH/pZwe/iyf5BtE0Q0Yp2kyG23ZK7FMuKADAV2', 'Scan Admin', 1, 1),
  ('operator1', '$2a$10$E98PmmCqajVZd4qwH/pZwe/iyf5BtE0Q0Yp2kyG23ZK7FMuKADAV2', 'Raj Kumar', 2, 1);
-- Password for both: password123

INSERT INTO Scan_Exams (ExamCode, ExamName, ExamYear) VALUES
  ('BTECH2026S1', 'B.Tech 2026 Sem-I', 2026),
  ('BTECH2026S2', 'B.Tech 2026 Sem-II', 2026);

INSERT INTO Scan_Papers (ExamID, PaperCode, PaperName, TotalPages, BookletPageCounts) VALUES
  (1, 'CCE101', 'Circuit and Control Engineering', 32, '12,24,36'),
  (1, 'PHY102', 'Engineering Physics', 32, '12,24,36'),
  (2, 'CCE201', 'Advanced Circuit Engineering', 32, '12,24,36');


-- EVALUATION DB SEEDS
USE EvaluationDB;

INSERT INTO Roles (RoleName, RoleHierarchyLevel, SubjectCategory) VALUES
  ('Admin', 1, NULL),
  ('Evaluator', 2, 'Engineering'),
  ('Moderator', 2, NULL),
  ('Viewer', 3, NULL);

INSERT INTO Eval_Locations (LocationCode, LocationName, Address) VALUES
  ('EVAL001', 'Main Evaluation Centre', 'Block B, Technical University Campus');

INSERT INTO Users (Username, PasswordHash, FullName, Email, RoleID, LocationID, UserStatus, IsFirstLogin, IsActive, CreatedBy) VALUES
  ('admin',      '$2a$10$E98PmmCqajVZd4qwH/pZwe/iyf5BtE0Q0Yp2kyG23ZK7FMuKADAV2', 'System Admin',  'admin@university.edu',      1, 1, 'Active', 0, 1, 'system'),
  ('scanadmin',  '$2a$10$E98PmmCqajVZd4qwH/pZwe/iyf5BtE0Q0Yp2kyG23ZK7FMuKADAV2', 'Scan Admin',    'scanadmin@university.edu',  1, 1, 'Active', 0, 1, 'system'),
  ('ravi.rajan', '$2a$10$E98PmmCqajVZd4qwH/pZwe/iyf5BtE0Q0Yp2kyG23ZK7FMuKADAV2', 'Ravi Rajan',    'ravi.rajan@university.edu', 2, 1, 'Active', 0, 1, 'system'),
  ('evaluator2', '$2a$10$E98PmmCqajVZd4qwH/pZwe/iyf5BtE0Q0Yp2kyG23ZK7FMuKADAV2', 'Priya Sharma',  'priya@university.edu',      2, 1, 'Active', 0, 1, 'system'),
  ('moderator1', '$2a$10$E98PmmCqajVZd4qwH/pZwe/iyf5BtE0Q0Yp2kyG23ZK7FMuKADAV2', 'Dr. Rao',       'drrao@university.edu',      3, 1, 'Active', 0, 1, 'system');
-- Password for all: password123

INSERT INTO Eval_Exams (ExamCode, ExamName, ExamYear) VALUES
  ('BTECH2026S1', 'B.Tech 2026 Sem-I', 2026),
  ('BTECH2026S2', 'B.Tech 2026 Sem-II', 2026);

INSERT INTO Eval_Papers (ExamID, PaperCode, PaperName, MaxMarks, VarianceThresholdPercent, VarianceDecisionMode, SecondaryEvalPercent) VALUES
  (1, 'CCE101', 'Circuit and Control Engineering', 60.00, 15.00, 'Average', 20.00),
  (1, 'PHY102', 'Engineering Physics', 60.00, 15.00, 'Average', 20.00),
  (2, 'CCE201', 'Advanced Circuit Engineering', 60.00, 15.00, 'Average', 20.00);

INSERT INTO Eval_QuestionScheme (PaperID, PageNumber, QuestionNumber, SubQuestionCode, MaxMarks, SortOrder) VALUES
  (1, 1, '01', NULL, 2.00, 1),
  (1, 1, '03', NULL, 2.00, 2),
  (1, 1, '03', NULL, 2.00, 3),
  (1, 2, '04', NULL, 2.00, 4),
  (1, 2, '05', NULL, 2.00, 5),
  (1, 2, '06', NULL, 1.00, 6),
  (1, 3, '07', NULL, 1.00, 7),
  (1, 3, '08', NULL, 1.00, 8),
  (1, 3, '09', NULL, 1.00, 9),
  (1, 4, '10', 'A', 5.00, 10),
  (1, 4, '10', 'B', 5.00, 11),
  (1, 5, '10', 'C', 5.00, 12),
  (1, 6, '10', 'D', 5.00, 13),
  (1, 6, '11', 'A', 5.00, 14),
  (1, 7, '11', 'B', 5.00, 15);

INSERT INTO Eval_Booklets (BookletID, ExamID, PaperID, LocationID, CentreCode, TotalPages, EvaluationStatus) VALUES
  ('110293000124', 1, 1, 1, 'EVAL001', 32, 'Open'),
  ('110293009755', 1, 1, 1, 'EVAL001', 32, 'Open'),
  ('110293001235', 1, 1, 1, 'EVAL001', 32, 'Open'),
  ('110293007533', 1, 1, 1, 'EVAL001', 32, 'Evaluated'),
  ('110293004533', 1, 1, 1, 'EVAL001', 32, 'Evaluated'),
  ('110293002353', 1, 1, 1, 'EVAL001', 32, 'Evaluated');

INSERT INTO Eval_BookletMetadata (BookletID, StudentName, ProgramLevel, Branch, Year, Semester, Subject, DocumentNumber) VALUES
  ('110293000124', 'Surendra Reddy', 'B. Tech', 'EEE', '1st', 'II', 'CCE', '110293000124'),
  ('110293009755', 'Anita Kumari', 'B. Tech', 'EEE', '1st', 'II', 'CCE', '110293009755'),
  ('110293001235', 'Vikram Singh', 'B. Tech', 'EEE', '1st', 'II', 'CCE', '110293001235'),
  ('110293007533', 'Pradeep Kumar', 'B. Tech', 'EEE', '1st', 'II', 'CCE', '110293007533'),
  ('110293004533', 'Lakshmi Devi', 'B. Tech', 'EEE', '1st', 'II', 'CCE', '110293004533'),
  ('110293002353', 'Rahul Verma', 'B. Tech', 'EEE', '1st', 'II', 'CCE', '110293002353');

INSERT INTO AllocationQueue (BookletID, AllocatedToUserID, AllocationType, EvaluationStatus, SessionDate) VALUES
  ('110293000124', 2, 'Primary', 'Allocated', CURDATE()),
  ('110293009755', 2, 'Primary', 'Allocated', CURDATE()),
  ('110293001235', 2, 'Primary', 'Allocated', CURDATE()),
  ('110293007533', 2, 'Primary', 'Evaluated', CURDATE()),
  ('110293004533', 2, 'Primary', 'Evaluated', CURDATE()),
  ('110293002353', 2, 'Primary', 'Evaluated', CURDATE());

INSERT INTO Evaluations (BookletID, EvaluatorUserID, EvaluationType, StartTime, EndTime, TotalMarks, IsSubmitted, SubmittedAt, AllPagesVisited) VALUES
  ('110293007533', 2, 'Primary', '2026-03-03 08:00:00', '2026-03-03 08:15:00', 49.00, 1, '2026-03-03 08:15:00', 1),
  ('110293004533', 2, 'Primary', '2026-03-03 08:20:00', '2026-03-03 08:35:00', 49.00, 1, '2026-03-03 08:35:00', 1),
  ('110293002353', 2, 'Primary', '2026-03-03 08:40:00', '2026-03-03 08:55:00', 49.00, 1, '2026-03-03 08:55:00', 1);
