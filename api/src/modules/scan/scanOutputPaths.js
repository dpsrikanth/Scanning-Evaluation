import path from 'path';
import fs from 'fs';
import env from '../../config/env.js';

let cachedActivePath = null;
let cachedDb = null;

/**
 * Windows-style absolute path (e.g. D:\foo) — not POSIX-absolute, so Node would wrongly prefix cwd.
 */
function isWindowsAbsolutePath(p) {
  return /^[A-Za-z]:[\\/]/.test((p || '').trim());
}

/**
 * Resolve path: if relative, resolve against process.cwd().
 * Windows drive paths are returned as-is (they only apply on Windows hosts, not Linux containers).
 * @param {string} rawPath
 * @returns {string}
 */
export function resolveStoredScanPath(rawPath) {
  if (!rawPath || typeof rawPath !== 'string') return null;
  const trimmed = rawPath.trim();
  if (!trimmed) return null;
  if (path.isAbsolute(trimmed) || isWindowsAbsolutePath(trimmed)) return trimmed;
  return path.resolve(process.cwd(), trimmed);
}

/**
 * Ensure the configured scan output directory exists (creates parent dirs if missing).
 * Used when admin adds or updates Scan_OutputPaths.
 * @param {string} rawPath - stored PathValue from form/DB
 * @returns {{ created: boolean, resolved: string }}
 */
export function ensureScanOutputDirectory(rawPath) {
  const resolved = resolveStoredScanPath(rawPath);
  if (!resolved) {
    const err = new Error('Invalid path');
    err.statusCode = 400;
    throw err;
  }
  if (fs.existsSync(resolved)) {
    const st = fs.statSync(resolved);
    if (!st.isDirectory()) {
      const err = new Error(`Path exists but is not a directory: ${resolved}`);
      err.statusCode = 400;
      throw err;
    }
    return { created: false, resolved };
  }
  try {
    fs.mkdirSync(resolved, { recursive: true });
    return { created: true, resolved };
  } catch (e) {
    const err = new Error(`Could not create directory: ${e.message}`);
    err.statusCode = 422;
    throw err;
  }
}

/**
 * Raw configured path string (as stored in DB / env) for the active scan output root.
 * @param {import('mysql2/promise').Pool} [db]
 * @returns {Promise<string>}
 */
export async function getActiveScanOutputPathRaw(db) {
  if (db) {
    try {
      const [rows] = await db.execute(
        'SELECT PathValue FROM Scan_OutputPaths WHERE IsActive = 1 LIMIT 1'
      );
      if (rows && rows[0] && rows[0].PathValue) {
        return String(rows[0].PathValue).trim();
      }
    } catch {
      /* table missing */
    }
  }
  const fromEnv = env.storage?.scanOutputPath || env.storage?.getScanOutputPaths?.()?.[0];
  if (fromEnv) return String(fromEnv).trim();
  return path.join('storage', 'scan_output');
}

/**
 * Get the active scan output path (for scanned booklets only).
 * Uses DB if available, else env SCAN_OUTPUT_PATH, else default storage/scan_output.
 * @param {import('mysql2/promise').Pool} [db] - ScanningDB pool (optional; if provided, reads from Scan_OutputPaths)
 * @param {{ ensureDirectory?: boolean }} [options] - if ensureDirectory, create missing root folder (upload / first use)
 * @returns {Promise<string>} Absolute path where booklet PDFs should be saved
 */
export async function getActiveScanOutputPath(db, options = {}) {
  const raw = await getActiveScanOutputPathRaw(db);
  if (options.ensureDirectory) {
    ensureScanOutputDirectory(raw);
  }
  return resolveStoredScanPath(raw);
}

/**
 * Count files under a directory tree (cap for performance).
 * @param {string} rootDir - absolute path
 * @param {number} [maxFiles]
 * @returns {{ fileCount: number, truncated: boolean }}
 */
export function countFilesUnderDirectory(rootDir, maxFiles = 20000) {
  if (!rootDir || !fs.existsSync(rootDir)) {
    return { fileCount: 0, truncated: false };
  }
  let n = 0;
  let truncated = false;
  const walk = (d) => {
    if (truncated) return;
    let entries;
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (n >= maxFiles) {
        truncated = true;
        return;
      }
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else n += 1;
    }
  };
  try {
    walk(rootDir);
  } catch {
    return { fileCount: n, truncated };
  }
  return { fileCount: n, truncated };
}

/**
 * Synchronous fallback when DB is not available (e.g. in multer).
 * Prefer getActiveScanOutputPath(db) in request handlers.
 * @returns {string}
 */
export function getActiveScanOutputPathSync() {
  const fromEnv = env.storage?.scanOutputPath || env.storage?.getScanOutputPaths?.()?.[0];
  if (fromEnv) return resolveStoredScanPath(fromEnv);
  return path.resolve(process.cwd(), 'storage', 'scan_output');
}

/**
 * All configured scan output roots for reading (booklet availability, page images).
 * Uses DB Scan_OutputPaths if available, else env.
 * @param {import('mysql2/promise').Pool} [db]
 * @returns {Promise<string[]>}
 */
export async function getScanOutputPathsForReading(db) {
  if (db) {
    try {
      const [rows] = await db.execute(
        'SELECT PathValue FROM Scan_OutputPaths ORDER BY IsActive DESC, DisplayOrder ASC, PathID ASC'
      );
      if (rows && rows.length > 0) {
        return rows.map((r) => resolveStoredScanPath(r.PathValue)).filter(Boolean);
      }
    } catch {
      /* table may not exist */
    }
  }
  const fromEnv = env.storage?.getScanOutputPaths?.() || [];
  if (fromEnv.length) return fromEnv.map((p) => resolveStoredScanPath(p)).filter(Boolean);
  return [path.resolve(process.cwd(), 'storage', 'scan_output')];
}

/**
 * Check if a path exists and is writable (for accessibility status).
 * @param {string} dirPath
 * @returns {{ accessible: boolean, error?: string }}
 */
export function checkPathAccessibility(dirPath) {
  try {
    const resolved = resolveStoredScanPath(dirPath);
    if (!resolved) return { accessible: false, error: 'Invalid path' };
    if (!fs.existsSync(resolved)) return { accessible: false, error: 'Path does not exist' };
    try {
      fs.accessSync(resolved, fs.constants.W_OK);
    } catch (e) {
      return { accessible: false, error: 'Not writable' };
    }
    return { accessible: true };
  } catch (e) {
    return { accessible: false, error: e.message || 'Unknown error' };
  }
}
