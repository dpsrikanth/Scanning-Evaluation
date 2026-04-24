-- =========================================================
-- Migration 003: User Lifecycle, System Settings, Email Templates,
--               OTP Tokens, Eval_Annotations, Eval_PageVisitLog update
-- Target DB: EvaluationDB
-- Idempotent: safe to re-run
-- =========================================================

USE EvaluationDB;

-- ── 1. Users lifecycle columns are already present (added in prior migration)
-- UserStatus, IsFirstLogin, Email, PasswordChangedAt exist.
-- Just ensure existing seeded users are Active.
UPDATE Users SET UserStatus = 'Active', IsFirstLogin = 0
WHERE UserStatus IS NULL OR UserStatus != 'Active';

-- ── 2. Roles: add HeadEvaluator role if missing ──────────────────────────────
INSERT INTO Roles (RoleName, RoleHierarchyLevel, SubjectCategory)
  SELECT 'HeadEvaluator', 1, NULL
  WHERE NOT EXISTS (SELECT 1 FROM Roles WHERE RoleName = 'HeadEvaluator');

-- ── 3. System_Settings — already created, seed missing defaults ───────────────
INSERT INTO System_Settings (SettingKey, SettingValue, Description) VALUES
  ('smtp_host',            '',      'SMTP server hostname'),
  ('smtp_port',            '587',   'SMTP server port'),
  ('smtp_secure',          '0',     '1 = TLS/SSL, 0 = STARTTLS'),
  ('smtp_user',            '',      'SMTP authentication username'),
  ('smtp_password',        '',      'SMTP authentication password'),
  ('smtp_from_name',       'Scanning & Evaluation System', 'Display name for outgoing emails'),
  ('smtp_from_email',      '',      'From address for outgoing emails'),
  ('email_enabled',        '1',     '1 = send emails; 0 = disable all email sending'),
  ('app_base_url',         'http://localhost:5173', 'Frontend base URL used in email links'),
  ('otp_expiry_minutes',   '10',    'OTP validity window in minutes'),
  ('max_login_attempts',   '5',     'Max failed logins before temporary lockout')
ON DUPLICATE KEY UPDATE SettingKey = SettingKey;

-- ── 4. Email_Templates — seed default templates ──────────────────────────────
INSERT INTO Email_Templates (TemplateType, Subject, BodyHtml) VALUES
('first_login',
 'Welcome to Scanning & Evaluation System — Your Login Details',
 '<!DOCTYPE html><html><body style="font-family:Segoe UI,sans-serif;color:#333"><h2 style="color:#0d6e4a">Welcome, {{fullName}}!</h2><p>Your account has been created on the <strong>Scanning &amp; Evaluation System</strong>.</p><table><tr><td><strong>Username:</strong></td><td>{{username}}</td></tr><tr><td><strong>Temporary Password:</strong></td><td><code>{{tempPassword}}</code></td></tr></table><p>Please <a href="{{loginUrl}}" style="color:#0d6e4a">login here</a> and change your password immediately.</p><p style="color:#999;font-size:12px">This is an automated message. Do not reply.</p></body></html>'),

('reset_password',
 'Your Password Has Been Reset',
 '<!DOCTYPE html><html><body style="font-family:Segoe UI,sans-serif;color:#333"><h2 style="color:#0d6e4a">Password Reset</h2><p>Hi <strong>{{fullName}}</strong>, your password has been reset by an administrator.</p><table><tr><td><strong>Username:</strong></td><td>{{username}}</td></tr><tr><td><strong>Temporary Password:</strong></td><td><code>{{tempPassword}}</code></td></tr></table><p>Please login and change your password immediately.</p></body></html>'),

('change_password',
 'Your Password Has Been Updated',
 '<!DOCTYPE html><html><body style="font-family:Segoe UI,sans-serif;color:#333"><h2 style="color:#0d6e4a">Password Changed</h2><p>Hi <strong>{{fullName}}</strong>, your password was successfully updated on <strong>{{changedAt}}</strong>.</p><p>Your new password: <code>{{newPassword}}</code></p><p>If you did not make this change, contact your administrator immediately.</p></body></html>'),

('otp',
 'Your OTP for Password Reset',
 '<!DOCTYPE html><html><body style="font-family:Segoe UI,sans-serif;color:#333"><h2 style="color:#0d6e4a">Password Reset OTP</h2><p>Hi <strong>{{fullName}}</strong>, use the following OTP to reset your password:</p><div style="font-size:36px;font-weight:bold;letter-spacing:10px;color:#0d6e4a;margin:20px 0">{{otpCode}}</div><p>Valid for <strong>{{expiryMinutes}} minutes</strong>. If you did not request this, ignore email.</p></body></html>')

ON DUPLICATE KEY UPDATE TemplateType = TemplateType;

-- ── 5-8. All other tables (Password_OTP_Tokens, Eval_Annotations, etc.)
-- already created in current schema. Migration 003 is fully applied.
SELECT 'Migration 003 complete' AS Status;
