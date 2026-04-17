const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');
const defaults = require('./defaults');

const baseDir = path.resolve(__dirname, '..');
const envPath = path.resolve(baseDir, '.env');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
} else {
  dotenv.config({ path: path.resolve(process.cwd(), '.env') });
}

function parseEnvInt(value, fallback) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

const config = {
  port: parseEnvInt(process.env.PORT, defaults.port),
  nodeEnv: process.env.NODE_ENV || defaults.nodeEnv,
  jwtSecret: process.env.JWT_SECRET || defaults.jwtSecret,
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET || defaults.jwtRefreshSecret,
  accessTokenTtl: defaults.accessTokenTtl,
  refreshTokenTtl: defaults.refreshTokenTtl,
  logLevel: process.env.LOG_LEVEL || defaults.logLevel,
  logDir: path.resolve(baseDir, process.env.LOG_DIR || defaults.logDir),
  corsOrigins: process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',').map((v) => v.trim()).filter(Boolean)
    : defaults.corsOrigins,
  dataDir: path.resolve(baseDir, process.env.DATA_DIR || defaults.dataDir),
  pluginsDir: path.resolve(baseDir, process.env.PLUGINS_DIR || defaults.pluginsDir),
  allowedCommands: defaults.allowedCommands
};

if (config.nodeEnv === 'production') {
  if (!config.jwtSecret) {
    throw new Error('JWT_SECRET is required in production');
  }
  if (!config.jwtRefreshSecret) {
    throw new Error('JWT_REFRESH_SECRET is required in production');
  }
}

if (!fs.existsSync(config.dataDir)) {
  fs.mkdirSync(config.dataDir, { recursive: true });
}

if (!fs.existsSync(config.logDir)) {
  fs.mkdirSync(config.logDir, { recursive: true });
}

Object.freeze(config);

module.exports = config;
