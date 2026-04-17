const path = require('path');
const { createLogger, format, transports } = require('winston');
require('winston-daily-rotate-file');
const config = require('../config');

const isProd = config.nodeEnv === 'production';

const consoleTransport = new transports.Console({
  format: format.combine(
    format.colorize({ all: !isProd }),
    format.timestamp(),
    format.printf(({ timestamp, level, message, ...meta }) => {
      const metaString = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
      return `${timestamp} ${level}: ${message} ${metaString}`;
    })
  )
});

const fileTransport = new transports.DailyRotateFile({
  filename: path.join(config.logDir, 'nasos-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  maxFiles: '14d',
  zippedArchive: false,
  format: format.combine(format.timestamp(), format.json())
});

const errorTransport = new transports.File({
  filename: path.join(config.logDir, 'error.log'),
  level: 'error',
  format: format.combine(format.timestamp(), format.json())
});

const logger = createLogger({
  level: config.logLevel || 'info',
  levels: { error: 0, warn: 1, info: 2, http: 3, debug: 4 },
  format: format.combine(format.timestamp(), format.json()),
  transports: [consoleTransport, fileTransport, errorTransport],
  exitOnError: false
});

logger.child = (meta) => {
  return logger.child(meta);
};

module.exports = logger;
