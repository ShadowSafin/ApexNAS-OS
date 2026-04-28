/**
 * FTP Routes — Per-User Share Jailing with Unified Linux Users
 * 
 * API endpoints for FTP service management.
 * FTP uses Linux system users (no separate FTP user DB).
 */

const express = require('express');
const router = express.Router();
const { FTPService } = require('./ftp.service');
const logger = require('../../lib/logger');

// Middleware: Authentication (compatible with both auth systems)
const requireAuth = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ error: 'UNAUTHORIZED', message: 'Authentication required' });
  }
  next();
};

// Middleware: Admin role check
const requireAdmin = (req, res, next) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'FORBIDDEN', message: 'Admin access required' });
  }
  next();
};

/**
 * GET /ftp/status
 * Get FTP service status (enhanced with global state + unified users)
 */
router.get('/status', requireAuth, async (req, res) => {
  try {
    const status = await FTPService.getStatus();
    return res.json({ success: true, data: status });
  } catch (err) {
    logger.error('FTP status error', { error: err.message });
    return res.status(500).json({ error: 'STATUS_ERROR', message: err.message });
  }
});

/**
 * POST /ftp/enable
 * Enable FTP service globally
 */
router.post('/enable', requireAuth, requireAdmin, async (req, res) => {
  try {
    logger.info('FTP: Enable service request', { user: req.user?.id });
    const { port, passivePortMin, passivePortMax } = req.body;
    const result = await FTPService.enable({ port, passivePortMin, passivePortMax });
    const status = await FTPService.getStatus();
    return res.json({ success: true, message: result.message, data: status });
  } catch (err) {
    logger.error('FTP enable error', { error: err.message });
    return res.status(500).json({ error: err.code || 'ENABLE_FAILED', message: err.message });
  }
});

/**
 * POST /ftp/disable
 * Disable FTP service globally
 */
router.post('/disable', requireAuth, requireAdmin, async (req, res) => {
  try {
    logger.info('FTP: Disable service request', { user: req.user?.id });
    const result = await FTPService.disable();
    return res.json({
      success: true,
      message: result.message,
      data: { enabled: false, running: false, active: false }
    });
  } catch (err) {
    logger.error('FTP disable error', { error: err.message });
    return res.status(500).json({ error: err.code || 'DISABLE_FAILED', message: err.message });
  }
});

/**
 * GET /ftp/users
 * List system users that have FTP access (unified Linux users, UID >= 1000)
 */
router.get('/users', requireAuth, async (req, res) => {
  try {
    const users = FTPService.listUsers();
    return res.json({
      success: true,
      data: users,
      message: 'FTP uses system users. Manage users from the Users page.'
    });
  } catch (err) {
    logger.error('FTP list users error', { error: err.message });
    return res.status(500).json({ error: 'LIST_FAILED', message: err.message });
  }
});

/**
 * POST /ftp/sync-users
 * Manually sync per-user FTP configs based on share assignments
 */
router.post('/sync-users', requireAuth, requireAdmin, async (req, res) => {
  try {
    logger.info('FTP: Manual user config sync requested', { user: req.user?.id });
    const result = await FTPService.syncFtpUserConfigs();

    // Restart vsftpd to pick up changes
    try {
      const { execute } = require('../../lib/executor');
      await execute('systemctl', ['restart', 'vsftpd'], { timeout: 10000 });
    } catch {}

    return res.json({
      success: true,
      message: `FTP user configs synced. ${result.synced || 0} user(s) mapped to shares.`,
      data: result
    });
  } catch (err) {
    logger.error('FTP sync-users error', { error: err.message });
    return res.status(500).json({ error: 'SYNC_FAILED', message: err.message });
  }
});

/**
 * POST /ftp/update (compat with old frontend)
 * Update FTP configuration
 */
router.post('/update', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { enabled, ...options } = req.body;
    let result;
    if (enabled === false) {
      result = await FTPService.disable();
    } else {
      result = await FTPService.enable(options);
    }
    return res.json({ success: true, message: result.message });
  } catch (err) {
    logger.error('FTP update error', { error: err.message });
    return res.status(500).json({ error: 'UPDATE_FAILED', message: err.message });
  }
});

/**
 * Error handler
 */
router.use((err, req, res, next) => {
  logger.error('FTP route error', { error: err.message });
  return res.status(500).json({ error: 'INTERNAL_ERROR', message: 'An internal error occurred' });
});

module.exports = router;
