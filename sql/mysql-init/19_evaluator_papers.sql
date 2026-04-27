-- Evaluator ↔ paper scope (see migrations/019_evaluator_papers.sql)

CREATE TABLE IF NOT EXISTS Eval_EvaluatorPapers (
  UserID   INT NOT NULL,
  PaperID  INT NOT NULL,
  CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  CreatedBy VARCHAR(100),
  PRIMARY KEY (UserID, PaperID),
  CONSTRAINT fk_eep_user  FOREIGN KEY (UserID)  REFERENCES Users(UserID),
  CONSTRAINT fk_eep_paper FOREIGN KEY (PaperID) REFERENCES Eval_Papers(PaperID)
) ENGINE=InnoDB;

CREATE INDEX idx_evaluator_papers_paper ON Eval_EvaluatorPapers (PaperID);
