/**
 * Client-side PDF rendering for evaluator booklet (thumbnails + main page).
 * Worker is served from /public/pdf.worker.min.mjs (stable URL) so it works when the app
 * is hosted on a different port/path than Vite’s hashed /assets/*.mjs chunks (avoids
 * "Failed to fetch dynamically imported module" for the worker).
 */
import * as pdfjsLib from 'pdfjs-dist';

let workerConfigured = false;

function getWorkerSrc() {
  const base = import.meta.env.BASE_URL || '/';
  const rel = `${base}pdf.worker.min.mjs`.replace(/([^:]\/)\/+/g, '$1');
  return new URL(rel, window.location.origin).href;
}

export function configurePdfWorker() {
  if (workerConfigured) return;
  pdfjsLib.GlobalWorkerOptions.workerSrc = getWorkerSrc();
  workerConfigured = true;
}

/**
 * @param {string} url - Booklet PDF URL (e.g. with token query)
 * @returns {Promise<import('pdfjs-dist').PDFDocumentProxy>}
 */
export function loadPdfFromUrl(url) {
  configurePdfWorker();
  return pdfjsLib.getDocument({ url, disableRange: true, disableStream: true }).promise;
}

/**
 * Render a single page to a JPEG data URL for display / thumbnails.
 * @param {import('pdfjs-dist').PDFDocumentProxy} pdf
 * @param {number} pageNumber - 1-based
 * @param {number} scale - viewport scale (e.g. 0.2 for thumb, 1.6 for main)
 */
export async function renderPageToDataUrl(pdf, pageNumber, scale) {
  const page = await pdf.getPage(pageNumber);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D not available');
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  const renderTask = page.render({
    canvasContext: ctx,
    viewport,
  });
  await renderTask.promise;
  return canvas.toDataURL('image/jpeg', 0.88);
}
