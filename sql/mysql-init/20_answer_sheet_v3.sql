-- =========================================================
-- Answer Sheet Templates v3 — organisation branding, valuer
-- sections, registration marks, rough-work pages, margins
-- =========================================================
USE EvaluationDB;

ALTER TABLE AnswerSheet_Templates
  ADD COLUMN ThemeColor          VARCHAR(20)   NOT NULL DEFAULT '#1a3a6b'  AFTER PaperSize,
  ADD COLUMN OrgName             VARCHAR(300)  NULL                       AFTER ThemeColor,
  ADD COLUMN OrgNameSecondary    VARCHAR(300)  NULL                       AFTER OrgName,
  ADD COLUMN OrgCode             VARCHAR(50)   NULL                       AFTER OrgNameSecondary,
  ADD COLUMN LogoPath            VARCHAR(500)  NULL                       AFTER OrgCode,
  ADD COLUMN PaperCode           VARCHAR(50)   NULL                       AFTER LogoPath,
  ADD COLUMN SerialNumberPrefix  VARCHAR(20)   NOT NULL DEFAULT ''        AFTER PaperCode,
  ADD COLUMN ValuerConfig        JSON          NULL                       AFTER AnswerPageLayout,
  ADD COLUMN QuestionMapping     JSON          NULL                       AFTER ValuerConfig,
  ADD COLUMN RegistrationMarks   JSON          NULL                       AFTER QuestionMapping,
  ADD COLUMN RoughWorkPages      INT           NOT NULL DEFAULT 0         AFTER RegistrationMarks,
  ADD COLUMN MarginConfig        JSON          NULL                       AFTER RoughWorkPages,
  ADD COLUMN FooterConfig        JSON          NULL                       AFTER MarginConfig,
  ADD COLUMN CoverBarcodePos     VARCHAR(20)   NOT NULL DEFAULT 'left'    AFTER FooterConfig,
  ADD COLUMN CoverLayout         JSON          NULL                       AFTER CoverBarcodePos;
