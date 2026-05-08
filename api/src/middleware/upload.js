import multer from 'multer';
import path from 'path';
import fs from 'fs';
import env from '../config/env.js';

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function getCommonBase() {
  return env.storage?.getCommonPath?.() || path.resolve(process.cwd(), env.storage?.commonPath || 'storage');
}

/** Directory where evaluator profile/registration photos are stored (multer + GET /admin/photo-file). */
export function getProfilePhotoDir() {
  return path.join(getCommonBase(), 'profiles');
}

// ── Profile photos (common API folder, not scan output) ─────────────────────
const profileStorage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const dir = path.join(getCommonBase(), 'profiles');
    ensureDir(dir);
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const userId = req.params.userId || req.user?.userId || 'unknown';
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    cb(null, `profile_${userId}_${Date.now()}${ext}`);
  },
});

// ── Evaluator captured photos (common API folder) ───────────────────────────
const capturedStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const dir = path.join(getCommonBase(), 'captured_photos');
    ensureDir(dir);
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    cb(null, `capture_${Date.now()}${ext}`);
  },
});

// ── Question paper documents (common API folder) ────────────────────────────
const questionPaperStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const dir = path.join(getCommonBase(), 'question_papers');
    ensureDir(dir);
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const paperId = req.params.paperId || 'unknown';
    const ext = path.extname(file.originalname).toLowerCase() || '.pdf';
    cb(null, `qpaper_${paperId}_${Date.now()}${ext}`);
  },
});

const questionPaperFilter = (_req, file, cb) => {
  const allowed = ['.pdf', '.jpg', '.jpeg', '.png', '.webp'];
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowed.includes(ext)) return cb(null, true);
  cb(new Error('Only PDF or image files are allowed'));
};

const imageFilter = (_req, file, cb) => {
  const allowed = ['.jpg', '.jpeg', '.png', '.webp'];
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowed.includes(ext)) return cb(null, true);
  cb(new Error('Only image files are allowed (jpg, png, webp)'));
};

export const uploadProfilePhoto = multer({
  storage: profileStorage,
  fileFilter: imageFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
}).single('profilePhoto');

export const uploadCapturedPhoto = multer({
  storage: capturedStorage,
  fileFilter: imageFilter,
  limits: { fileSize: 3 * 1024 * 1024 }, // 3 MB
}).single('photo');

export const uploadQuestionPaper = multer({
  storage: questionPaperStorage,
  fileFilter: questionPaperFilter,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
}).single('questionPaper');

// ── Answer sheet logo image ─────────────────────────────────────────────────
const answerSheetLogoStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const dir = path.join(getCommonBase(), 'answer-sheet-logos');
    ensureDir(dir);
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.png';
    cb(null, `logo_${Date.now()}${ext}`);
  },
});

export const uploadAnswerSheetLogo = multer({
  storage: answerSheetLogoStorage,
  fileFilter: imageFilter,
  limits: { fileSize: 2 * 1024 * 1024 },
}).single('logo');

export function getAnswerSheetLogoDir() {
  return path.join(getCommonBase(), 'answer-sheet-logos');
}

// ── Scan template sample page image ─────────────────────────────────────────
const templateImageStorage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const templateId = req.params.templateId || 'unknown';
    const dir = path.join(getCommonBase(), 'scan-templates', String(templateId));
    ensureDir(dir);
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    cb(null, `sample${ext}`);
  },
});

export const uploadTemplateSampleImage = multer({
  storage: templateImageStorage,
  fileFilter: imageFilter,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
}).single('sampleImage');

// ── Booklet PDF upload (scanned document; saved to active scan output path in controller)
const bookletPdfStorage = multer.memoryStorage();
const pdfFilter = (_req, file, cb) => {
  const ext = path.extname(file.originalname || '').toLowerCase();
  if (ext === '.pdf') return cb(null, true);
  cb(new Error('Only PDF files are allowed for booklet upload'));
};
export const uploadBookletPdf = multer({
  storage: bookletPdfStorage,
  fileFilter: pdfFilter,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100 MB
}).fields([
  { name: 'booklet', maxCount: 1 },
  { name: 'pages', maxCount: 1 },
  { name: 'pdf', maxCount: 1 },
]);
