import fs from 'fs';
import path from 'path';
import logger from './logger.js';
import { resolveStoredScanPath } from '../modules/scan/scanOutputPaths.js';

/**
 * @param {import('mysql2/promise').Pool} scanDb
 */
export async function getMirrorConfigFromDb(scanDb) {
  try {
    const [rows] = await scanDb.execute('SELECT * FROM Scan_MirrorConfig WHERE ConfigID = 1');
    return rows[0] || null;
  } catch {
    return null;
  }
}

/**
 * @param {import('ssh2-sftp-client')} SftpClient
 * @param {import('ssh2-sftp-client')} client instance
 */
async function uploadDirSftp(sftp, localDir, remoteBase) {
  const norm = (p) => p.replace(/\\/g, '/');
  const entries = fs.readdirSync(localDir, { withFileTypes: true });
  for (const e of entries) {
    const lp = path.join(localDir, e.name);
    const rp = `${norm(remoteBase)}/${e.name}`;
    if (e.isDirectory()) {
      try {
        await sftp.mkdir(rp, true);
      } catch {
        /* may exist */
      }
      await uploadDirSftp(sftp, lp, rp);
    } else {
      await sftp.put(fs.createReadStream(lp), rp);
    }
  }
}

/**
 * After a successful PDF/booklet save under localBookletDir, copy to configured SFTP or network path.
 * @param {{ scanDb: import('mysql2/promise').Pool, bookletId: string, localBookletDir: string }} opts
 * @returns {Promise<{ ok: boolean, mode?: string, detail?: string }>}
 */
export async function replicateBookletToMirrorIfConfigured({ scanDb, bookletId, localBookletDir }) {
  const row = await getMirrorConfigFromDb(scanDb);
  if (!row || !row.MirrorEnabled) {
    return { ok: true, detail: 'mirror_disabled' };
  }
  const mode = (row.MirrorMode || 'none').toLowerCase();
  if (mode === 'none' || !bookletId || !localBookletDir) {
    return { ok: true, detail: 'no_action' };
  }
  if (!fs.existsSync(localBookletDir)) {
    return { ok: false, detail: 'local_dir_missing' };
  }

  if (mode === 'network') {
    const raw = row.NetworkPath;
    if (!raw || !String(raw).trim()) {
      return { ok: false, detail: 'network_path_not_set' };
    }
    const root = resolveStoredScanPath(String(raw).trim());
    const dest = path.join(root, 'booklets', bookletId);
    try {
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      if (fs.existsSync(dest)) {
        fs.rmSync(dest, { recursive: true, force: true });
      }
      fs.mkdirSync(dest, { recursive: true });
      fs.cpSync(localBookletDir, dest, { recursive: true });
      logger.info('MIRROR_NETWORK_OK', { bookletId, dest });
      return { ok: true, mode: 'network', detail: dest };
    } catch (e) {
      logger.warn('MIRROR_NETWORK_FAILED', { bookletId, error: e.message });
      return { ok: false, mode: 'network', detail: e.message };
    }
  }

  if (mode === 'sftp') {
    const host = (row.SftpHost || '').trim();
    const user = (row.SftpUsername || '').trim();
    const pass = row.SftpPassword != null ? String(row.SftpPassword) : '';
    const port = Math.max(1, Math.min(65535, parseInt(row.SftpPort, 10) || 22));
    const rem = (row.SftpRemotePath || '').trim().replace(/\\/g, '/');
    if (!host || !user || !rem) {
      return { ok: false, detail: 'sftp_incomplete' };
    }
    let SftpClient;
    try {
      const mod = await import('ssh2-sftp-client');
      SftpClient = mod.default;
    } catch (e) {
      logger.error('MIRROR_SFTP_MODULE', { error: e.message });
      return { ok: false, detail: 'sftp_module_missing' };
    }
    const sftp = new SftpClient();
    try {
      await sftp.connect({
        host,
        port,
        username: user,
        password: pass,
        readyTimeout: 20000,
      });
      const safeId = String(bookletId).replace(/[^a-zA-Z0-9._-]/g, '_');
      const remoteBase = `${rem.replace(/\/$/, '')}/booklets/${safeId}`.replace(/\\/g, '/');
      await sftp.mkdir(remoteBase, true);
      await uploadDirSftp(sftp, localBookletDir, remoteBase);
      await sftp.end();
      logger.info('MIRROR_SFTP_OK', { bookletId, remoteBase });
      return { ok: true, mode: 'sftp', detail: remoteBase };
    } catch (e) {
      try {
        await sftp.end();
      } catch {
        /* */
      }
      logger.warn('MIRROR_SFTP_FAILED', { bookletId, error: e.message });
      return { ok: false, mode: 'sftp', detail: e.message };
    }
  }

  return { ok: true, detail: 'unknown_mode' };
}

/**
 * Test SFTP: connect, list or create remote path, disconnect.
 * @param {{ host: string, port: number, username: string, password: string, remotePath: string }} p
 */
export async function testSftpConnection(p) {
  const mod = await import('ssh2-sftp-client');
  const SftpClient = mod.default;
  const sftp = new SftpClient();
  const host = (p.host || '').trim();
  const user = (p.username || '').trim();
  const rem = (p.remotePath || '').trim().replace(/\\/g, '/');
  const port = Math.max(1, Math.min(65535, parseInt(p.port, 10) || 22));
  if (!host || !user || !rem) {
    const err = new Error('host, username, and remotePath are required');
    err.statusCode = 400;
    throw err;
  }
  try {
    await sftp.connect({
      host,
      port,
      username: user,
      password: p.password != null ? String(p.password) : '',
      readyTimeout: 20000,
    });
    let list;
    try {
      list = await sftp.list(rem);
    } catch {
      await sftp.mkdir(rem, true);
      list = await sftp.list(rem);
    }
    await sftp.end();
    return { ok: true, message: 'Connection OK', path: rem, entryCount: Array.isArray(list) ? list.length : 0 };
  } catch (e) {
    try {
      await sftp.end();
    } catch {
      /* */
    }
    const err = new Error(e.message || 'SFTP test failed');
    err.statusCode = 422;
    throw err;
  }
}

/**
 * Create a temp file in path, then delete (verifies writability).
 */
export function testNetworkPathWritable(rawPath) {
  const root = resolveStoredScanPath(String(rawPath || '').trim());
  if (!root) {
    const e = new Error('Invalid path');
    e.statusCode = 400;
    throw e;
  }
  try {
    fs.mkdirSync(root, { recursive: true });
  } catch (e) {
    const err = new Error(`Cannot create path: ${e.message}`);
    err.statusCode = 422;
    throw err;
  }
  const probe = path.join(root, `.scaneval_write_test_${Date.now()}`);
  try {
    fs.writeFileSync(probe, 'ok', 'utf8');
    fs.unlinkSync(probe);
    return { ok: true, message: 'Path is reachable and writable', resolved: root };
  } catch (e) {
    const err = new Error(`Path not writable: ${e.message}`);
    err.statusCode = 422;
    throw err;
  }
}
