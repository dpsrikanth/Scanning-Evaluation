-- =========================================================
-- Answer Sheet Templates v2 — add paper size, QR/barcode
-- toggles, custom answer-page layout, and fix default pages
-- =========================================================
USE EvaluationDB;

ALTER TABLE AnswerSheet_Templates
  ADD COLUMN  PaperSize        VARCHAR(10)  NOT NULL DEFAULT 'A4'  AFTER TemplateName,
  ADD COLUMN  ShowBarcode      TINYINT      NOT NULL DEFAULT 1      AFTER PageStyle,
  ADD COLUMN  ShowQrCode       TINYINT      NOT NULL DEFAULT 1      AFTER ShowBarcode,
  ADD COLUMN  AnswerPageLayout JSON         NULL                    AFTER ShowQrCode,
  MODIFY COLUMN TotalAnswerPages INT NOT NULL DEFAULT 24;
