/**
 * Copy PDF.js worker into public/ for a stable URL (/pdf.worker.min.mjs).
 * Creates public/ if missing (required for Docker: npm ci runs before COPY public/).
 */
const fs = require('fs');
const path = require('path');

const destDir = path.join(__dirname, '..', 'public');
const dest = path.join(destDir, 'pdf.worker.min.mjs');
const buildDir = path.join(__dirname, '..', 'node_modules', 'pdfjs-dist', 'build');
const candidates = ['pdf.worker.min.mjs', 'pdf.worker.mjs'];

fs.mkdirSync(destDir, { recursive: true });

if (!fs.existsSync(buildDir)) {
  console.warn('sync-pdf-worker: pdfjs-dist not installed yet, skip');
  process.exit(0);
}

const name = candidates.find((f) => fs.existsSync(path.join(buildDir, f)));
if (!name) {
  console.error('sync-pdf-worker: no worker in pdfjs-dist/build');
  process.exit(1);
}

fs.copyFileSync(path.join(buildDir, name), dest);
console.log('sync-pdf-worker:', name, '-> public/pdf.worker.min.mjs');
