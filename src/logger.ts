// ─────────────────────────────────────────────────────────────────────────────
//  SpotCast — Logger (Winston)
// ─────────────────────────────────────────────────────────────────────────────

import winston from 'winston';

const logger = winston.createLogger({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.printf(({ timestamp, level, message }) => {
      return `[${timestamp}] ${level.toUpperCase()}: ${message}`;
    })
  ),
  transports: [
    new winston.transports.File({ filename: 'tracker.log' }),
    new winston.transports.Console({
      silent: process.env.NODE_ENV === 'production',
    }),
  ],
});

export default logger;
