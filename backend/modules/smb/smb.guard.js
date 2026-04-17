/**
 * SMB Guard - Phase 5
 * 
 * Authorization guards for SMB operations
 * - Verify admin access for sensitive operations
 * - Validate request parameters
 * - Check share ownership/permissions
 */

const logger = require('../../lib/logger');

/**
 * Verify user is authenticated
 */
const isAuthenticated = (req, res, next) => {
  if (!req.user || !req.user.id) {
    logger.warn('Unauthenticated SMB operation', { ip: req.ip });
    return res.status(401).json({
      error: 'UNAUTHORIZED',
      message: 'Authentication required'
    });
  }
  next();
};

/**
 * Verify user has admin role
 */
const isAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      error: 'UNAUTHORIZED',
      message: 'Authentication required'
    });
  }

  if (req.user.role !== 'admin') {
    logger.warn('Unauthorized admin operation', {
      user: req.user.id,
      role: req.user.role,
      operation: `${req.method} ${req.path}`
    });
    return res.status(403).json({
      error: 'FORBIDDEN',
      message: 'Admin role required for this operation'
    });
  }

  next();
};

/**
 * Validate SMB share name format
 */
const validateShareName = (req, res, next) => {
  const { name } = req.params || req.body;

  if (!name || typeof name !== 'string') {
    return res.status(400).json({
      error: 'INVALID_NAME',
      message: 'Share name must be provided'
    });
  }

  // SMB share names: alphanumeric, hyphen, underscore, 1-32 chars
  if (!/^[a-zA-Z0-9_-]{1,32}$/.test(name)) {
    return res.status(400).json({
      error: 'INVALID_NAME',
      message: 'Share name must be 1-32 characters: alphanumeric, hyphen, underscore'
    });
  }

  req.validated = req.validated || {};
  req.validated.shareName = name;
  next();
};

/**
 * Validate share creation parameters
 */
const validateCreateParams = (req, res, next) => {
  const { name, path, browseable, writable, guestOk, validUsers, comment } = req.body;

  // Name is required
  if (!name || typeof name !== 'string') {
    return res.status(400).json({
      error: 'INVALID_PARAMS',
      message: 'Share name is required'
    });
  }

  // Path is required
  if (!path || typeof path !== 'string') {
    return res.status(400).json({
      error: 'INVALID_PARAMS',
      message: 'Share path is required'
    });
  }

  // Boolean fields
  if (browseable !== undefined && typeof browseable !== 'boolean') {
    return res.status(400).json({
      error: 'INVALID_PARAMS',
      message: 'browseable must be boolean'
    });
  }

  if (writable !== undefined && typeof writable !== 'boolean') {
    return res.status(400).json({
      error: 'INVALID_PARAMS',
      message: 'writable must be boolean'
    });
  }

  if (guestOk !== undefined && typeof guestOk !== 'boolean') {
    return res.status(400).json({
      error: 'INVALID_PARAMS',
      message: 'guestOk must be boolean'
    });
  }

  // Valid users (array)
  if (validUsers !== undefined && !Array.isArray(validUsers)) {
    return res.status(400).json({
      error: 'INVALID_PARAMS',
      message: 'validUsers must be an array'
    });
  }

  // Comment (string)
  if (comment !== undefined && typeof comment !== 'string') {
    return res.status(400).json({
      error: 'INVALID_PARAMS',
      message: 'comment must be string'
    });
  }

  // Comment length limit
  if (comment && comment.length > 200) {
    return res.status(400).json({
      error: 'INVALID_PARAMS',
      message: 'comment must be 200 characters or less'
    });
  }

  req.validated = req.validated || {};
  req.validated.params = { name, path, browseable, writable, guestOk, validUsers, comment };
  next();
};

/**
 * Rate limiting check (prevent share spam)
 */
const rateLimitShares = (req, res, next) => {
  // In production, implement proper rate limiting
  // For now, just track attempts per user
  req.app.locals.smbAttempts = req.app.locals.smbAttempts || {};

  const userId = req.user?.id;
  if (!userId) {
    return next();
  }

  const now = Date.now();
  const userAttempts = req.app.locals.smbAttempts[userId] || [];

  // Keep only last 60 seconds of attempts
  const recentAttempts = userAttempts.filter(t => now - t < 60000);
  req.app.locals.smbAttempts[userId] = recentAttempts;

  // Limit to 10 operations per minute
  if (recentAttempts.length >= 10) {
    logger.warn('SMB rate limit exceeded', { user: userId, attempts: recentAttempts.length });
    return res.status(429).json({
      error: 'RATE_LIMITED',
      message: 'Too many SMB operations. Please try again later.'
    });
  }

  recentAttempts.push(now);
  next();
};

/**
 * Log all SMB operations for audit
 */
const auditLog = (req, res, next) => {
  const operation = `${req.method} ${req.path}`;
  const user = req.user?.id || 'anonymous';

  const logEntry = {
    timestamp: new Date().toISOString(),
    operation,
    user,
    ip: req.ip,
    share: req.params.name || req.body?.name
  };

  logger.info('SMB_AUDIT', logEntry);

  // Capture response for logging
  const originalJson = res.json;
  res.json = function (data) {
    logEntry.status = res.statusCode;
    logEntry.success = res.statusCode >= 200 && res.statusCode < 300;
    if (!logEntry.success && data.error) {
      logEntry.error = data.error;
    }
    return originalJson.call(this, data);
  };

  next();
};

module.exports = {
  isAuthenticated,
  isAdmin,
  validateShareName,
  validateCreateParams,
  rateLimitShares,
  auditLog
};
