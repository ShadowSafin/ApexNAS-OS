/**
 * NFS Guard - Phase 5
 * 
 * Authorization guards for NFS operations
 * - Verify admin access for sensitive operations
 * - Validate request parameters
 * - Verify export configuration safety
 */

const logger = require('../../lib/logger');

/**
 * Verify user is authenticated
 */
const isAuthenticated = (req, res, next) => {
  if (!req.user || !req.user.id) {
    logger.warn('Unauthenticated NFS operation', { ip: req.ip });
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
 * Validate NFS export name format
 */
const validateExportName = (req, res, next) => {
  const { name } = req.params || req.body;

  if (!name || typeof name !== 'string') {
    return res.status(400).json({
      error: 'INVALID_NAME',
      message: 'Export name must be provided'
    });
  }

  // NFS export names: alphanumeric, hyphen, underscore, 1-32 chars
  if (!/^[a-zA-Z0-9_-]{1,32}$/.test(name)) {
    return res.status(400).json({
      error: 'INVALID_NAME',
      message: 'Export name must be 1-32 characters: alphanumeric, hyphen, underscore'
    });
  }

  req.validated = req.validated || {};
  req.validated.exportName = name;
  next();
};

/**
 * Validate export creation parameters
 */
const validateCreateParams = (req, res, next) => {
  const { name, path, clients } = req.body;

  // Name is required
  if (!name || typeof name !== 'string') {
    return res.status(400).json({
      error: 'INVALID_PARAMS',
      message: 'Export name is required'
    });
  }

  // Path is required
  if (!path || typeof path !== 'string') {
    return res.status(400).json({
      error: 'INVALID_PARAMS',
      message: 'Export path is required'
    });
  }

  // Clients (array)
  if (clients !== undefined && !Array.isArray(clients)) {
    return res.status(400).json({
      error: 'INVALID_PARAMS',
      message: 'clients must be an array'
    });
  }

  // Validate each client
  if (clients && Array.isArray(clients)) {
    for (const client of clients) {
      if (!client.ip || typeof client.ip !== 'string') {
        return res.status(400).json({
          error: 'INVALID_PARAMS',
          message: 'Each client must have an ip field'
        });
      }

      if (!client.options || typeof client.options !== 'string') {
        return res.status(400).json({
          error: 'INVALID_PARAMS',
          message: 'Each client must have options field'
        });
      }

      // Warn if no_root_squash is used
      if (client.options.includes('no_root_squash') && !client.confirmNoRootSquash) {
        return res.status(400).json({
          error: 'SECURITY_RISK',
          message: 'no_root_squash is a security risk. Confirm with confirmNoRootSquash=true if intentional'
        });
      }
    }
  }

  req.validated = req.validated || {};
  req.validated.params = { name, path, clients };
  next();
};

/**
 * Prevent wildcard exports (security)
 */
const preventWildcardExports = (req, res, next) => {
  const { clients } = req.body;

  if (clients && Array.isArray(clients)) {
    const hasWildcard = clients.some(c => c.ip === '*');
    if (hasWildcard && clients.length === 1) {
      logger.warn('Attempted to create wildcard NFS export', { user: req.user?.id });
      return res.status(400).json({
        error: 'SECURITY_VIOLATION',
        message: 'Cannot export to * (wildcard). Specify explicit IP ranges or subnets'
      });
    }
  }

  next();
};

/**
 * Rate limiting check (prevent export spam)
 */
const rateLimitExports = (req, res, next) => {
  // In production, implement proper rate limiting
  // For now, just track attempts per user
  req.app.locals.nfsAttempts = req.app.locals.nfsAttempts || {};

  const userId = req.user?.id;
  if (!userId) {
    return next();
  }

  const now = Date.now();
  const userAttempts = req.app.locals.nfsAttempts[userId] || [];

  // Keep only last 60 seconds of attempts
  const recentAttempts = userAttempts.filter(t => now - t < 60000);
  req.app.locals.nfsAttempts[userId] = recentAttempts;

  // Limit to 10 operations per minute
  if (recentAttempts.length >= 10) {
    logger.warn('NFS rate limit exceeded', { user: userId, attempts: recentAttempts.length });
    return res.status(429).json({
      error: 'RATE_LIMITED',
      message: 'Too many NFS operations. Please try again later.'
    });
  }

  recentAttempts.push(now);
  next();
};

/**
 * Log all NFS operations for audit
 */
const auditLog = (req, res, next) => {
  const operation = `${req.method} ${req.path}`;
  const user = req.user?.id || 'anonymous';

  const logEntry = {
    timestamp: new Date().toISOString(),
    operation,
    user,
    ip: req.ip,
    export: req.params.name || req.body?.name
  };

  logger.info('NFS_AUDIT', logEntry);

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
  validateExportName,
  validateCreateParams,
  preventWildcardExports,
  rateLimitExports,
  auditLog
};
