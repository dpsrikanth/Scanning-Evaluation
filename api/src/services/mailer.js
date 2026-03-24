import nodemailer from 'nodemailer';
import { getEvalDb } from '../config/database.js';
import logger from '../utils/logger.js';

// ─── Settings cache (reloaded on each send so admin changes take effect) ─────
async function getSettings() {
  const db = getEvalDb();
  const [rows] = await db.execute(
    `SELECT SettingKey, SettingValue FROM System_Settings
     WHERE SettingKey IN (
       'smtp_host','smtp_port','smtp_secure','smtp_user','smtp_password',
       'smtp_from_name','smtp_from_email','email_enabled','app_base_url',
       'otp_expiry_minutes'
     )`
  );
  return Object.fromEntries(rows.map((r) => [r.SettingKey, r.SettingValue]));
}

async function getTemplate(templateType) {
  const db = getEvalDb();
  const [rows] = await db.execute(
    'SELECT Subject, BodyHtml FROM Email_Templates WHERE TemplateType = ? AND IsActive = 1',
    [templateType]
  );
  return rows[0] || null;
}

// ─── Simple {{variable}} substitution ────────────────────────────────────────
function renderTemplate(text, vars) {
  return text.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? '');
}

// ─── Main send function ───────────────────────────────────────────────────────
/**
 * Send a templated email.
 * @param {string} templateType  - first_login | reset_password | change_password | otp
 * @param {string} toEmail       - recipient address
 * @param {object} variables     - template variable substitutions
 */
export async function sendMail(templateType, toEmail, variables = {}) {
  try {
    const settings = await getSettings();

    if (settings.email_enabled !== '1') {
      logger.info(`Email disabled — skipping ${templateType} to ${toEmail}`);
      return { skipped: true };
    }

    if (!settings.smtp_host) {
      logger.warn(`SMTP not configured — skipping ${templateType} to ${toEmail}`);
      return { skipped: true };
    }

    const template = await getTemplate(templateType);
    if (!template) {
      logger.error(`Email template '${templateType}' not found or inactive`);
      return { error: 'template_not_found' };
    }

    // Inject app_base_url into variables for convenience
    const allVars = { loginUrl: settings.app_base_url, ...variables };

    const subject = renderTemplate(template.Subject, allVars);
    const html = renderTemplate(template.BodyHtml, allVars);

    const transporter = nodemailer.createTransport({
      host: settings.smtp_host,
      port: parseInt(settings.smtp_port || '587', 10),
      secure: settings.smtp_secure === '1',
      auth: {
        user: settings.smtp_user,
        pass: settings.smtp_password,
      },
      tls: { rejectUnauthorized: false },
    });

    const info = await transporter.sendMail({
      from: `"${settings.smtp_from_name}" <${settings.smtp_from_email}>`,
      to: toEmail,
      subject,
      html,
    });

    logger.info(`Email sent: ${templateType} → ${toEmail}`, { messageId: info.messageId });
    return { success: true, messageId: info.messageId };
  } catch (err) {
    logger.error(`Email send failed: ${templateType} → ${toEmail}`, { error: err.message });
    return { error: err.message };
  }
}

// ─── Test SMTP connectivity (used by admin settings page) ────────────────────
export async function testSmtp(config) {
  const transporter = nodemailer.createTransport({
    host: config.smtp_host,
    port: parseInt(config.smtp_port || '587', 10),
    secure: config.smtp_secure === '1',
    auth: { user: config.smtp_user, pass: config.smtp_password },
    tls: { rejectUnauthorized: false },
  });
  await transporter.verify();
  return true;
}
