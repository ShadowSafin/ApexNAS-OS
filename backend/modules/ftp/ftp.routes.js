/**
 * FTP Routes - Phase 7
 * 
 * API endpoints for FTP service management
 * - Enable / disable FTP
 * - Get FTP status
 * - User management
 */

const express = require('express');
const router = express.Router();
const { FTPService, FTPError } = require('./ftp.service');
const { validate } = require('../../middleware/validate');
const { requireAuth, requireRole } = require('../../middleware/auth');
const { broadcast } = require('../../lib/websocket');
const logger = require('../../lib/logger');
const {
  enableFTPSchema,
  updateFTPSchema,
  addFTPUserSchema,
  removeFTPUserSchema
} = require('./ftp.schema');

/**
 * GET /api/ftp/status
 * Get FTP service status
 */
router.get('/status', requireAuth, async (req, res, next) => {
  try {
    const status = await FTPService.getStatus();
    res.json({ success: true, data: status });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/ftp/enable
 * Enable FTP service
 */
router.post('/enable', requireAuth, requireRole('admin'), validate(enableFTPSchema), async (req, res, next) => {
  try {
    const options = req.body;
    const result = await FTPService.enable(options);
    broadcast('ftp:enabled', result);
    res.json({ success: true, message: result.message });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/ftp/disable
 * Disable FTP service
 */
router.post('/disable', requireAuth, requireRole('admin'), async (req, res, next) => {
  try {
    const result = await FTPService.disable();
    broadcast('ftp:disabled', result);
    res.json({ success: true, message: result.message });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/ftp/update
 * Update FTP configuration
 */
router.post('/update', requireAuth, requireRole('admin'), validate(updateFTPSchema), async (req, res, next) => {
  try {
    const { enabled, ...options } = req.body;
    
    if (enabled === false) {
      const result = await FTPService.disable();
      broadcast('ftp:updated', result);
      res.json({ success: true, message: result.message });
    } else if (enabled === true) {
      const result = await FTPService.enable(options);
      broadcast('ftp:updated', result);
      res.json({ success: true, message: result.message });
    } else {
      const result = await FTPService.enable(options);
      broadcast('ftp:updated', result);
      res.json({ success: true, message: result.message });
    }
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/ftp/users
 * Add FTP user
 */
router.post('/users', requireAuth, requireRole('admin'), validate(addFTPUserSchema), async (req, res, next) => {
  try {
    const { username, password, homeDir } = req.body;
    const result = await FTPService.addUser(username, password, homeDir);
    broadcast('ftp:user_added', result);
    res.json({ success: true, data: result.userData, message: result.message });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/ftp/users
 * List FTP users
 */
router.get('/users', requireAuth, requireRole('admin'), async (req, res, next) => {
  try {
    const users = FTPService.listUsers();
    res.json({ success: true, data: users });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/ftp/users/:username
 * Remove FTP user
 */
router.delete('/users/:username', requireAuth, requireRole('admin'), async (req, res, next) => {
  try {
    const { username } = req.params;
    const result = await FTPService.removeUser(username);
    broadcast('ftp:user_removed', result);
    res.json({ success: true, message: result.message });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/ftp/set-root
 * Set FTP root directory
 */
router.post('/set-root', requireAuth, requireRole('admin'), async (req, res, next) => {
  try {
    const { path } = req.body;
    const accessService = require('../../lib/access.service');
    
    if (!path) {
      return res.status(400).json({
        error: 'INVALID_INPUT',
        message: 'Path is required'
      });
    }
    
    const result = await accessService.setFtpRoot(path);
    broadcast('ftp:root_changed', result);
    res.ok(result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
