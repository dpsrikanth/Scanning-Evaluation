import morgan from 'morgan';
import logger from '../utils/logger.js';

// Stream morgan output into Winston at http level
const stream = {
  write: (message) => logger.http(message.trim()),
};

// Tokens
morgan.token('user-id', (req) => req.user?.userId ?? '-');
morgan.token('user-name', (req) => req.user?.username ?? '-');
morgan.token('req-body-size', (req) => req.headers['content-length'] ?? '0');

// Format: method, url, status, response-time, user, ip, body-size
const format =
  ':method :url :status :res[content-length]B :response-time ms | user=:user-id(:user-name) ip=:remote-addr body=:req-body-size';

export default morgan(format, { stream });
