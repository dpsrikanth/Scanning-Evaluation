-- Idempotent: allocation_mode (match migrations/18_allocation_mode.sql)
USE EvaluationDB;

INSERT INTO System_Settings (SettingKey, SettingValue, Description) VALUES
  ('allocation_mode', 'automatic', 'Booklet assignment: automatic | manual (Head Eval can override; default automatic)')
ON DUPLICATE KEY UPDATE SettingKey = SettingKey;
