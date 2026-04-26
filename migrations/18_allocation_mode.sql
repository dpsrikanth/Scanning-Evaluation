-- Idempotent: allocation_mode for installations that already ran migration 004.
USE EvaluationDB;

INSERT INTO System_Settings (SettingKey, SettingValue, Description) VALUES
  ('allocation_mode', 'automatic', 'Booklet assignment: automatic | manual (Head Eval can override; default automatic)')
ON DUPLICATE KEY UPDATE SettingKey = SettingKey;

SELECT 'Migration 18 complete' AS Status;
