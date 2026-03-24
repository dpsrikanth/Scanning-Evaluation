import mysql from 'mysql2/promise';
import env from './env.js';
import logger from '../utils/logger.js';

let scanPool = null;
let evalPool = null;

export function getScanDb() {
  if (!scanPool) {
    scanPool = mysql.createPool({
      ...env.scanDb,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      enableKeepAlive: true,
    });
    logger.info('ScanningDB connection pool created');
  }
  return scanPool;
}

export function getEvalDb() {
  if (!evalPool) {
    evalPool = mysql.createPool({
      ...env.evalDb,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      enableKeepAlive: true,
    });
    logger.info('EvaluationDB connection pool created');
  }
  return evalPool;
}

export async function testConnections() {
  try {
    const scanConn = await getScanDb().getConnection();
    scanConn.release();
    logger.info('ScanningDB connection verified');
  } catch (err) {
    logger.warn(`ScanningDB connection failed: ${err.message}`);
  }

  try {
    const evalConn = await getEvalDb().getConnection();
    evalConn.release();
    logger.info('EvaluationDB connection verified');
  } catch (err) {
    logger.warn(`EvaluationDB connection failed: ${err.message}`);
  }
}
