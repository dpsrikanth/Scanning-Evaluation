/**
 * Runs newly added SQL files against EvaluationDB using api/.env (EVAL_DB_*).
 * Usage: from repo root: node api/scripts/run-new-sql.mjs
 *         or from api/:   node scripts/run-new-sql.mjs
 */
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mysql from 'mysql2/promise';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.join(__dirname, '..');
const repoRoot = path.join(apiRoot, '..');

const envPath = path.join(apiRoot, '.env');
const loaded = dotenv.config({ path: envPath });
if (loaded.error && !process.env.EVAL_DB_HOST) {
  console.error('Missing or unreadable', envPath, loaded.error.message);
  process.exit(1);
}

const files = [
  path.join(repoRoot, 'migrations', '18_allocation_mode.sql'),
  path.join(repoRoot, 'sql', 'mysql-init', '18_allocation_mode.sql'),
];

let conn;
try {
  conn = await mysql.createConnection({
    host: process.env.EVAL_DB_HOST || 'localhost',
    port: parseInt(process.env.EVAL_DB_PORT || '3307', 10),
    user: process.env.EVAL_DB_USER || 'root',
    password: process.env.EVAL_DB_PASSWORD ?? '',
    multipleStatements: true,
  });
} catch (e) {
  console.error('Could not connect to MySQL (EvaluationDB). Check EVAL_DB_* in api/.env:', e.message);
  process.exit(1);
}

try {
  for (const file of files) {
    if (!fs.existsSync(file)) {
      console.warn('Skip (missing):', file);
      continue;
    }
    const sql = fs.readFileSync(file, 'utf8');
    console.log('Executing:', path.relative(repoRoot, file));
    const [result] = await conn.query(sql);
    console.log('Result:', result);
  }
  console.log('Done.');
} catch (e) {
  console.error('SQL error:', e.message);
  process.exit(1);
} finally {
  await conn.end();
}
