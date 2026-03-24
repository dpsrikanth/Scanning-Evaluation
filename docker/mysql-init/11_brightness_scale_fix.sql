-- =========================================================
-- MIGRATION 011 — Brightness/Contrast scale change
-- Change BrightnessAdj/ContrastAdj from WIA offset (-1000..+1000, 0=neutral)
-- to ScanAll Pro absolute scale (0..255, 128=neutral).
-- This makes the admin UI match the physical scanner control labels.
-- =========================================================
USE ScanningDB;

-- Change column defaults to 128 (neutral on 0-255 scale)
ALTER TABLE Scan_ScanTemplates
  MODIFY COLUMN BrightnessAdj INT NOT NULL DEFAULT 128
    COMMENT '0-255 absolute, matching ScanAll Pro scale. 128 = hardware neutral.',
  MODIFY COLUMN ContrastAdj   INT NOT NULL DEFAULT 128
    COMMENT '0-255 absolute, matching ScanAll Pro scale. 128 = hardware neutral.';

-- Any template that still has the old "no adjustment = 0" value
-- should be migrated to 128 (neutral in the new scale).
UPDATE Scan_ScanTemplates SET BrightnessAdj = 128 WHERE BrightnessAdj = 0;
UPDATE Scan_ScanTemplates SET ContrastAdj   = 128 WHERE ContrastAdj   = 0;
