import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { readFileSync, existsSync } from 'fs';
import { resolve, join } from 'path';
import { sendMail, testSmtp } from '../../services/mailer.js';
import logger from '../../utils/logger.js';

function generateTempPassword(length = 10) {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789@#$';
  return Array.from(crypto.randomBytes(length))
    .map((b) => chars[b % chars.length])
    .join('');
}

export default class AdminService {
  constructor(repo) {
    this.repo = repo;
  }

  // ── Users ───────────────────────────────────────────────────────────────────
  async listUsers(filters) {
    return this.repo.listUsers(filters);
  }

  async getUser(userId) {
    const user = await this.repo.getUserById(userId);
    if (!user) throw Object.assign(new Error('User not found'), { statusCode: 404 });
    return user;
  }

  async createUser({ username, fullName, email, roleId, locationId, profilePhotoPath }, createdBy) {
    if (!username || !fullName || !email || !roleId) {
      throw Object.assign(new Error('username, fullName, email, roleId are required'), { statusCode: 400 });
    }

    const role = await this.repo.getRoleById(roleId);
    if (role?.RoleName === 'Evaluator' && !profilePhotoPath) {
      throw Object.assign(
        new Error('Profile photo is required for Evaluator. Please upload a photo that clearly shows the face.'),
        { statusCode: 400 }
      );
    }

    const tempPassword = generateTempPassword();
    const passwordHash = await bcrypt.hash(tempPassword, 10);

    const userId = await this.repo.createUser({
      username, passwordHash, fullName, email, roleId, locationId, createdBy, profilePhotoPath,
    });

    sendMail('first_login', email, { fullName, username, tempPassword })
      .catch((e) => logger.error('first_login email error', { error: e.message }));

    return { userId, username, tempPassword };
  }

  async updateUserPhoto(userId, profilePhotoPath, updatedBy) {
    await this.repo.updateUserPhoto(userId, profilePhotoPath, updatedBy);
    return { message: 'Profile photo updated' };
  }

  async getUserPhoto(userId) {
    return this.repo.getUserPhoto(userId);
  }

  async updateUser(userId, data, updatedBy) {
    const existing = await this.getUser(userId);
    const role = await this.repo.getRoleById(data.roleId);
    if (role?.RoleName === 'Evaluator' && !existing.ProfilePhotoPath) {
      throw Object.assign(
        new Error('Evaluator role requires a profile photo on file. Use “Update photo” before assigning this role.'),
        { statusCode: 400 }
      );
    }
    const { userStatus, ...rest } = data;
    await this.repo.updateUser(userId, { ...rest, userStatus, updatedBy });
    return { message: 'User updated' };
  }

  async deleteUser(userId, deletedBy) {
    const affected = await this.repo.softDeleteUser(userId, deletedBy);
    if (!affected) {
      throw Object.assign(
        new Error('Cannot delete — user is not in Pending status'),
        { statusCode: 409 }
      );
    }
    return { message: 'User deleted' };
  }

  async resetUserPassword(userId, updatedBy) {
    const user = await this.getUser(userId);
    const tempPassword = generateTempPassword();
    const passwordHash = await bcrypt.hash(tempPassword, 10);

    await this.repo.resetUserPassword(userId, passwordHash, updatedBy);

    if (user.Email) {
      sendMail('reset_password', user.Email, {
        fullName: user.FullName,
        username: user.Username,
        tempPassword,
      }).catch((e) => logger.error('reset_password email error', { error: e.message }));
    }

    return { message: 'Password reset. Email sent to user.' };
  }

  async listRoles() {
    return this.repo.listRoles();
  }

  async listLocations() {
    return this.repo.listLocations();
  }

  // ── Settings ────────────────────────────────────────────────────────────────
  async getSettings() {
    return this.repo.getAllSettings();
  }

  async updateSettings(settings, updatedBy) {
    await this.repo.upsertSettings(settings, updatedBy);
    return { message: 'Settings saved' };
  }

  async testSmtpConnection(config) {
    try {
      await testSmtp(config);
      return { success: true, message: 'SMTP connection successful' };
    } catch (err) {
      throw Object.assign(new Error(`SMTP test failed: ${err.message}`), { statusCode: 400 });
    }
  }

  // ── Question Paper Config ────────────────────────────────────────────────────
  async listExamsForQPaper() {
    return this.repo.listExams();
  }

  async listPapersForQPaper(examId) {
    return this.repo.listPapersByExam(examId);
  }

  async getQPaperConfig(paperId) {
    const config = await this.repo.getQPaperConfig(paperId);
    if (!config) throw Object.assign(new Error('Paper not found'), { statusCode: 404 });
    return config;
  }

  async uploadQuestionPaperFile(paperId, filePath, userId) {
    await this.repo.updateQuestionPaperPath(paperId, filePath, userId);
    return { paperId, questionPaperPath: filePath };
  }

  async extractQPaperStructure(paperId) {
    const config = await this.repo.getQPaperConfig(paperId);
    if (!config) throw Object.assign(new Error('Paper not found'), { statusCode: 404 });
    if (!config.paper.QuestionPaperPath) {
      throw Object.assign(new Error('No question paper file uploaded yet'), { statusCode: 400 });
    }

    // Resolve the stored path — it may be absolute (from multer) or just a filename
    const storedPath = config.paper.QuestionPaperPath;
    let filePath = storedPath;

    // If the stored path is not absolute, treat it as relative to SCAN_OUTPUT_PATH
    if (!storedPath.startsWith('/') && !storedPath.match(/^[A-Za-z]:[/\\]/)) {
      filePath = join(process.env.SCAN_OUTPUT_PATH || 'D:/ScanOutput', storedPath);
    }
    filePath = resolve(filePath);

    if (!existsSync(filePath)) {
      // Fallback: treat stored path as just a filename inside question_papers/
      const filename = storedPath.split('/').pop();
      const fallback = resolve(join(process.env.SCAN_OUTPUT_PATH || 'D:/ScanOutput', 'question_papers', filename));
      if (existsSync(fallback)) {
        filePath = fallback;
      } else {
        logger.error(`QP extract: file not found at "${filePath}" (paperId=${paperId})`);
        throw Object.assign(
          new Error(`Question paper file not found on server. Please re-upload the PDF.`),
          { statusCode: 400 }
        );
      }
    }

    // Load pdf-parse v2.x — uses class-based API: new PDFParse({ data }) → load() → getText()
    let PDFParse;
    try {
      const pdfModule = await import('pdf-parse');
      PDFParse = pdfModule.PDFParse;
      if (typeof PDFParse !== 'function') {
        throw new Error(`Expected PDFParse class, got ${typeof PDFParse}`);
      }
    } catch (e) {
      logger.error('pdf-parse module load failed', { error: e.message });
      throw Object.assign(new Error('PDF parsing module unavailable: ' + e.message), { statusCode: 500 });
    }

    let text = '';
    try {
      const buffer = readFileSync(filePath);
      const parser = new PDFParse({ data: buffer });
      await parser.load();
      const result = await parser.getText();
      // v2.x getText() returns { pages: [{ text: string }, ...] }
      text = result.pages ? result.pages.map(p => p.text || '').join('\n') : (result.text || '');
    } catch (e) {
      logger.error(`QP extract: pdf-parse failed for "${filePath}"`, { error: e.message });
      throw Object.assign(
        new Error('Failed to read PDF content: ' + e.message),
        { statusCode: 400 }
      );
    }

    if (!text.trim()) {
      logger.warn(`QP extract: no text found in PDF paperId=${paperId} path="${filePath}"`);
      return {
        subject: config.paper.PaperName || '',
        totalMarks: 0,
        totalQuestions: 0,
        sections: [],
        confidence: 'low',
        warning: 'No selectable text found in the PDF. This may be a scanned/image-only PDF. Please enter section details manually.',
      };
    }

    const result = parseQPaperText(text, config.paper.PaperName);
    logger.info(`QP extract paperId=${paperId} sections=${result.sections.length} totalMarks=${result.totalMarks} path="${filePath}"`);
    return result;
  }

  async saveSets(paperId, { maxMarks, sets }, userId) {
    if (!Array.isArray(sets)) {
      throw Object.assign(new Error('sets must be an array'), { statusCode: 400 });
    }

    for (const set of sets) {
      if (!['Common', 'Mandatory', 'AnswerAll'].includes(set.setType)) {
        throw Object.assign(new Error(`Invalid setType: ${set.setType}`), { statusCode: 400 });
      }
      if (set.totalQuestions < 1 || set.marksPerQuestion <= 0) {
        throw Object.assign(
          new Error('totalQuestions must be ≥ 1 and marksPerQuestion must be > 0'),
          { statusCode: 400 }
        );
      }
      if (set.setType === 'Common') {
        if (set.attemptQuestions > set.totalQuestions || set.attemptQuestions < 1) {
          throw Object.assign(
            new Error(`attemptQuestions (${set.attemptQuestions}) must be between 1 and totalQuestions (${set.totalQuestions})`),
            { statusCode: 400 }
          );
        }
      } else {
        set.attemptQuestions = set.totalQuestions;
      }
    }

    const calculatedTotal = sets.reduce(
      (sum, s) => sum + s.attemptQuestions * parseFloat(s.marksPerQuestion), 0
    );

    if (maxMarks !== undefined && maxMarks !== null) {
      if (Math.abs(calculatedTotal - parseFloat(maxMarks)) > 0.01) {
        throw Object.assign(
          new Error(
            `Total marks from sets (${calculatedTotal}) must equal paper max marks (${maxMarks})`
          ),
          { statusCode: 400 }
        );
      }
    }

    await this.repo.saveSetsAtomic(paperId, sets, userId);
    return { paperId, setsCount: sets.length, totalMarks: calculatedTotal };
  }

  // ── Email Templates ──────────────────────────────────────────────────────────
  async listTemplates() {
    return this.repo.listTemplates();
  }

  async getTemplate(type) {
    const t = await this.repo.getTemplate(type);
    if (!t) throw Object.assign(new Error('Template not found'), { statusCode: 404 });
    return t;
  }

  async updateTemplate(type, data, updatedBy) {
    await this.repo.updateTemplate(type, { ...data, updatedBy });
    return { message: 'Template updated' };
  }
}

// ── Question paper text parser ────────────────────────────────────────────────

// Word-number map for Indian exam paper phrasing ("TWO marks", "FIVE questions")
const WORD_NUMS = {
  one:1, two:2, three:3, four:4, five:5, six:6, seven:7, eight:8,
  nine:9, ten:10, eleven:11, twelve:12, thirteen:13, fourteen:14,
  fifteen:15, sixteen:16, seventeen:17, eighteen:18, nineteen:19, twenty:20,
};
function toNum(s) {
  if (s == null) return null;
  const n = parseInt(s, 10);
  if (!isNaN(n)) return n;
  return WORD_NUMS[String(s).toLowerCase()] ?? null;
}

function parseQPaperText(text, fallbackPaperName = '') {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  // ── 1. Subject / title ──────────────────────────────────────────────────────
  // Score candidates: prefer lines with subject keywords, penalise OCR noise chars
  const SUBJECT_KW = /MATHEMATICS|PHYSICS|CHEMISTRY|BIOLOGY|ENGLISH|HINDI|TELUGU|KANNADA|TAMIL|HISTORY|GEOGRAPHY|SCIENCE|ECONOMICS|COMMERCE|CIVICS|STATISTICS|BOTANY|ZOOLOGY|ACCOUNTS/i;
  const NOISE_RE   = /[^A-Za-z0-9\s,.\-\(\)\/\|:]/g;
  const SKIP_RE    = /^(SECTION|PART|Part)\s/i;
  const SKIP_WORDS = /^(Time|Max|Mox|Total|Instructions?|Note|Regd|Very Short|Short Answer|Long Answer|Answer|Attempt)/i;

  let subject = fallbackPaperName;
  // Direct match for "SUBJECT: Physics" or "Subject : Mathematics" lines
  const subjectLineRe = /^SUBJECT\s*:\s*(.+)/im;
  const directMatch = text.match(subjectLineRe);
  if (directMatch) {
    subject = directMatch[1].trim();
  } else {
    const scoreLine = l => {
      const noise = (l.match(NOISE_RE) || []).length;
      const alpha = (l.match(/[A-Za-z]/g) || []).length / Math.max(l.length, 1);
      // Cap length contribution to avoid long question lines winning over short subject lines
      const lenScore = Math.min(l.length, 40) * alpha;
      return lenScore - noise * 3 + (SUBJECT_KW.test(l) ? 60 : 0);
    };
    const candidates = lines.slice(0, 30).filter(l =>
      l.length > 6 && /[A-Za-z]/.test(l) &&
      !/^\d+[\.\)]\s/.test(l) && !SKIP_RE.test(l) && !SKIP_WORDS.test(l) &&
      !/^[a-l]\)\s/.test(l)
    );
    if (candidates.length > 0) {
      const best = candidates.sort((a, b) => scoreLine(b) - scoreLine(a))[0];
      const cleaned = best.replace(/^[^A-Za-z]+/, '').replace(/\s{2,}/g, ' ').trim();
      if (cleaned.length > 4) subject = cleaned;
    }
  }

  // ── 2. Global max marks ─────────────────────────────────────────────────────
  // Handle OCR variants: "Max." → "Mox.", "Maximum Marks: 75", "Marks:75"
  let totalMarks = 0;
  const marksPatterns = [
    /(?:Maximum\s+)?M[ao]x\.?\s*Marks\s*[:\-]\s*(\d+(?:\.\d+)?)/i,
    /Total\s+Marks\s*[:\-]\s*(\d+(?:\.\d+)?)/i,
    /Marks\s*[:\-]\s*(\d+(?:\.\d+)?)/,
  ];
  for (const pat of marksPatterns) {
    const m = text.match(pat);
    if (m) { totalMarks = parseFloat(m[1]); break; }
  }

  // ── 3. Section splitting ────────────────────────────────────────────────────
  // Matches: SECTION-A, SECTION - A, "I SECTION - C" (OCR prefix noise), Part I
  // Allow up to 5 noise chars before the keyword so OCR artefacts don't break splits
  const sectionSplitRe =
    /(?:^|\n)[^\n]{0,5}((?:SECTION|Section)\s*[-–—]?\s*[A-Z](?:[^\n]{0,60})?|(?:PART|Part)\s*[-–—]?\s*[IVXABC0-9]+(?:[^\n]{0,40})?)/gm;

  const rawSections = [];
  let lastIdx = 0;
  let match;
  while ((match = sectionSplitRe.exec(text)) !== null) {
    // Skip "Part - III  MATHEMATICS..." style lines (paper header, not section)
    const heading = match[1].trim();
    if (/^Part\s*[-–]?\s*III?\b/i.test(heading) && SUBJECT_KW.test(heading)) continue;

    if (rawSections.length > 0) {
      rawSections[rawSections.length - 1].body = text.slice(lastIdx, match.index);
    }
    rawSections.push({ heading, body: '' });
    lastIdx = match.index + match[0].length;
  }
  if (rawSections.length > 0) {
    rawSections[rawSections.length - 1].body = text.slice(lastIdx);
  }
  if (rawSections.length === 0) {
    rawSections.push({ heading: 'Section A', body: text });
  }

  // Text before the first section (contains global attempt instructions like
  // "Answer Q1 which is compulsory, any eight from Part-II and any two from Part-III")
  const headerText = rawSections.length > 0 && rawSections[0].heading !== 'Section A'
    ? text.slice(0, text.indexOf(rawSections[0].heading))
    : '';

  // ── 4. Parse each section ───────────────────────────────────────────────────
  const sections = rawSections.map(sec => {
    const heading = sec.heading;
    const body    = sec.body;

    // A) Inline formula in header or first 200 chars of body: "(10x2=20)" "(5x4=20)" "(2 x 10)"
    //    → attemptN × marksEach = sectionMax   OR   marksEach × attemptN
    let formulaAttempt = null, formulaMarks = null;
    let formulaAmbiguous = false, formulaA = null, formulaB = null;
    const fmSrc = heading + '\n' + body.slice(0, 200);
    // With "=" sign: (10x2=20)
    const formulaEqRe = /\(\s*(\d+)\s*[x×*]\s*(\d+(?:\.\d+)?)\s*=\s*\d+\s*\)/i;
    const fmEq = fmSrc.match(formulaEqRe);
    if (fmEq) {
      formulaAttempt = parseInt(fmEq[1]); formulaMarks = parseFloat(fmEq[2]);
    } else {
      // Without "=" sign: (2 x 10) or (16 x 2)
      const formulaNoEqRe = /\(\s*(\d+(?:\.\d+)?)\s*[x×*]\s*(\d+)\s*\)/i;
      const fmNoEq = fmSrc.match(formulaNoEqRe);
      if (fmNoEq) {
        formulaA = parseFloat(fmNoEq[1]); formulaB = parseInt(fmNoEq[2]);
        formulaAmbiguous = true;
        // Tentative heuristic: larger number is question count
        if (formulaB > formulaA) { formulaMarks = formulaA; formulaAttempt = formulaB; }
        else { formulaAttempt = formulaA; formulaMarks = formulaB; }
      }
    }

    // B) Marks per question — in order of specificity
    let marksPerQuestion = formulaMarks || 0;
    if (!marksPerQuestion) {
      // "carries TWO/2 marks" / "worth FOUR marks"
      const wm = body.match(/(?:carries?|carry|worth|of)\s+([A-Za-z]+|\d+(?:\.\d+)?)\s+[Mm]arks?/i);
      if (wm) marksPerQuestion = toNum(wm[1]) || 0;
    }
    if (!marksPerQuestion) {
      // "each question carries TWO marks" / "each carries 4 marks"
      const em = body.match(/each\s+(?:question\s+)?carries?\s+([A-Za-z]+|\d+(?:\.\d+)?)\s+[Mm]arks?/i);
      if (em) marksPerQuestion = toNum(em[1]) || 0;
    }
    if (!marksPerQuestion) {
      const bm = body.match(/\((\d+(?:\.\d+)?)\s*[Mm]arks?\)/);
      if (bm) marksPerQuestion = parseFloat(bm[1]);
    }
    if (!marksPerQuestion) {
      const xm = body.match(/(\d+)\s*[×x*]\s*(\d+(?:\.\d+)?)\s*=\s*\d+/i);
      if (xm) marksPerQuestion = parseFloat(xm[2]);
    }
    if (!marksPerQuestion) {
      const pm = body.slice(0, 400).match(/(\d+(?:\.\d+)?)\s*[Mm]arks?/);
      if (pm) marksPerQuestion = parseFloat(pm[1]);
    }

    // C) Count numbered question lines (tolerate OCR bullets •, *, ., ')
    //    Also match "Q1 ", "Q2 " (no period/paren), and sub-questions "a)", "b)"
    const qMainLines = (body.match(/^\s*[•*.'`\-]?\s*(?:Q\.?\s*)?\d+\s*[.)]\s/gm) || []).length;
    const qAltLines = (body.match(/^\s*Q\.?\s*\d+\s+\S/gm) || []).length;
    const subQLines = (body.match(/^\s*[a-l]\s*\)\s/gm) || []).length;
    const qLineCount = Math.max(qMainLines, qAltLines, subQLines);

    // D) Attempt instructions — digit or word numbers
    let attemptQuestions = formulaAttempt || 0;
    let totalQuestions   = 0;
    let setType          = 'AnswerAll';

    const answerAllRe  = /answer\s+all\s+(?:the\s+)?(?:following\s+)?(?:questions?)?/i;
    const compulsoryRe = /compulsory|mandatory/i;
    const anyNRe       = /(?:answer|attempt)\s+any\s+([A-Za-z]+|\d+)\s*(?:questions?)?/i;
    const nofMRe       = /(?:answer|attempt)\s+(?:any\s+)?([A-Za-z]+|\d+)\s+out\s+of\s+([A-Za-z]+|\d+)/i;

    const combinedText = headerText + '\n' + body;
    const nofM = combinedText.match(nofMRe);
    const anyN = combinedText.match(anyNRe);
    const allQ = combinedText.match(answerAllRe) || combinedText.match(compulsoryRe);

    if (nofM) {
      attemptQuestions = toNum(nofM[1]) || parseInt(nofM[1]) || 0;
      totalQuestions   = toNum(nofM[2]) || parseInt(nofM[2]) || 0;
      setType = 'Common';
    } else if (anyN && !allQ) {
      const n = toNum(anyN[1]);
      if (n) { attemptQuestions = n; setType = 'Common'; }
      totalQuestions = qLineCount > attemptQuestions ? qLineCount : attemptQuestions + 1;
    } else if (allQ) {
      // For AnswerAll with formula but no explicit attempt text, keep formula as-is
      setType = 'AnswerAll';
      // Prefer formula count (exact) over OCR line count (may miss OCR noise)
      totalQuestions   = formulaAttempt || qLineCount || 0;
      attemptQuestions = totalQuestions;
    } else if (formulaAttempt) {
      attemptQuestions = formulaAttempt;
      totalQuestions   = qLineCount > formulaAttempt ? qLineCount : formulaAttempt;
      setType = totalQuestions > formulaAttempt ? 'Common' : 'AnswerAll';
    } else {
      totalQuestions   = qLineCount || 0;
      attemptQuestions = totalQuestions;
      setType = 'AnswerAll';
    }

    // E) Disambiguate ambiguous formula using text-detected attempt count
    if (formulaAmbiguous && attemptQuestions > 0) {
      if (attemptQuestions === formulaA) {
        formulaMarks = formulaB; formulaAttempt = formulaA;
        marksPerQuestion = formulaB;
      } else if (attemptQuestions === formulaB) {
        formulaMarks = formulaA; formulaAttempt = formulaB;
        marksPerQuestion = formulaA;
      }
    }

    if (totalQuestions === 0) totalQuestions = attemptQuestions;
    if (attemptQuestions > totalQuestions && totalQuestions > 0) attemptQuestions = totalQuestions;

    return {
      label: heading.split(/[(\n]/)[0].trim().replace(/\s+/g, ' '),
      setType,
      totalQuestions,
      attemptQuestions,
      marksPerQuestion: marksPerQuestion || 0,
      computedMax: attemptQuestions * (marksPerQuestion || 0),
    };
  }).filter(s => s.totalQuestions > 0 || s.marksPerQuestion > 0);

  // ── 5. Derive totalMarks from sections if header didn't give it ─────────────
  const sectionsTotal = sections.reduce((s, sec) => s + sec.computedMax, 0);
  if (!totalMarks && sectionsTotal > 0) totalMarks = sectionsTotal;

  return {
    subject,
    totalMarks,
    totalQuestions: sections.reduce((s, sec) => s + sec.totalQuestions, 0),
    sections,
    confidence: sections.length > 0 ? 'ok' : 'low',
  };
}
