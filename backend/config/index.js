const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
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

/**
 * Resolve a JWT signing secret.
 *
 * Security: jsonwebtoken will happily sign tokens with an empty-string secret,
 * which would let anyone forge valid tokens. In production we REFUSE to start
 * without a secret. In other environments (development/test) we fall back to
 * a process-lifetime random secret and emit a loud warning — this keeps local
 * `npm run dev` working without eagerly shipping a guessable default, and any
 * existing tokens become invalid on restart (which is the correct behavior
 * for an un-configured dev environment).
 */
function resolveJwtSecret(envValue, fallbackValue, envName, nodeEnv) {
  const fromEnv = (envValue || '').trim();
  if (fromEnv) {
    return fromEnv;
  }

  const fromDefaults = (fallbackValue || '').trim();
  if (fromDefaults) {
    return fromDefaults;
  }

  if (nodeEnv === 'production') {
    throw new Error(`${envName} is required in production`);
  }

  const generated = crypto.randomBytes(48).toString('hex');
  // eslint-disable-next-line no-console
  console.warn(
    `[config] ${envName} is not set — generated an ephemeral random secret for this ` +
    'process. All issued tokens will be invalidated on restart. Set a stable ' +
    `${envName} via environment variables for non-ephemeral setups.`
  );
  return generated;
}

const nodeEnv = process.env.NODE_ENV || defaults.nodeEnv;

const config = {
  port: parseEnvInt(process.env.PORT, defaults.port),
  nodeEnv,
  jwtSecret: resolveJwtSecret(process.env.JWT_SECRET, defaults.jwtSecret, 'JWT_SECRET', nodeEnv),
  jwtRefreshSecret: resolveJwtSecret(
    process.env.JWT_REFRESH_SECRET,
    defaults.jwtRefreshSecret,
    'JWT_REFRESH_SECRET',
    nodeEnv
  ),
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

if (!fs.existsSync(config.dataDir)) {
  fs.mkdirSync(config.dataDir, { recursive: true });
}

if (!fs.existsSync(config.logDir)) {
  fs.mkdirSync(config.logDir, { recursive: true });
}

Object.freeze(config);

module.exports = config;
