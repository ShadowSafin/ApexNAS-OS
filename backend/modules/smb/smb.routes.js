/**
 * SMB Routes — Dual-Layer Service Activation
 * 
 * API endpoints for Samba/SMB network sharing
 * - Create SMB shares
 * - List SMB shares
 * - Remove SMB shares
 * - Test SMB accessibility
 * - Enable/disable with full sync
 */

const express = require('express');
const router = express.Router();
const { SMBService } = require('./smb.service');
const logger = require('../../lib/logger');

// Middleware: Authentication (verify admin access)
const requireAuth = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ error: 'UNAUTHORIZED', message: 'Authentication required' });
  }
  next();
};

// Middleware: Authorization (admin only)
const requireAdmin = (req, res, next) => {
  if (req.user?.role !== 'admin') {
    logger.warn('Unauthorized SMB operation attempted', { user: req.user?.id, operation: req.method });
    return res.status(403).json({ error: 'FORBIDDEN', message: 'Admin access required' });
  }
  next();
};

/**
 * POST /smb/shares
 * Create a new SMB share
 */
router.post('/shares', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { name, path, browseable, writable, guestOk, validUsers, comment } = req.body;

    logger.info('SMB: Create share request', { name, path, user: req.user.id });

    const result = await SMBService.createShare({
      name,
      path,
      browseable: browseable !== false,
      writable: writable === true,
      guestOk: guestOk === true,
      validUsers: validUsers || [],
      comment: comment || ''
    });

    if (!result.success) {
      const statusCode = result.error === 'DUPLICATE_SHARE' ? 409 : 400;
      return res.status(statusCode).json({
        error: result.error,
        message: result.message
      });
    }

    logger.info('SMB share created', { name, user: req.user.id });

    return res.status(201).json({
      success: true,
      message: result.message,
      share: result.share
    });
  } catch (err) {
    logger.error('SMB create share error', { error: err.message });
    return res.status(500).json({
      error: 'SERVICE_ERROR',
      message: 'Failed to create SMB share'
    });
  }
});

/**
 * GET /smb/shares
 * List all SMB shares
 */
router.get('/shares', requireAuth, async (req, res) => {
  try {
    logger.info('SMB: List shares request', { user: req.user.id });

    const result = await SMBService.listShares();

    if (!result.success) {
      return res.status(500).json({
        error: result.error,
        message: result.message
      });
    }

    return res.json({
      success: true,
      shares: result.shares,
      count: result.count
    });
  } catch (err) {
    logger.error('SMB list shares error', { error: err.message });
    return res.status(500).json({
      error: 'SERVICE_ERROR',
      message: 'Failed to list SMB shares'
    });
  }
});

/**
 * GET /smb/available-paths
 * Get available storage paths for creating shares
 */
router.get('/available-paths', requireAuth, async (req, res) => {
  try {
    logger.info('SMB: Get available paths request', { user: req.user.id });

    const result = await SMBService.getAvailablePaths();

    return res.json({
      success: true,
      paths: result.paths || []
    });
  } catch (err) {
    logger.error('SMB get available paths error', { error: err.message });
    return res.json({
      success: true,
      paths: []
    });
  }
});

/**
 * DELETE /smb/shares/:name
 * Remove an SMB share
 */
router.delete('/shares/:name', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { name } = req.params;

    logger.info('SMB: Remove share request', { name, user: req.user.id });

    if (!name || typeof name !== 'string' || name.length === 0) {
      return res.status(400).json({
        error: 'INVALID_NAME',
        message: 'Share name is required'
      });
    }

    const result = await SMBService.removeShare({ name });

    if (!result.success) {
      return res.status(404).json({
        error: result.error,
        message: result.message
      });
    }

    logger.info('SMB share removed', { name, user: req.user.id });

    return res.json({
      success: true,
      message: result.message
    });
  } catch (err) {
    logger.error('SMB remove share error', { error: err.message });
    return res.status(500).json({
      error: 'SERVICE_ERROR',
      message: 'Failed to remove SMB share'
    });
  }
});

/**
 * POST /smb/test/:name
 * Test SMB share accessibility
 */
router.post('/test/:name', requireAuth, async (req, res) => {
  try {
    const { name } = req.params;

    logger.info('SMB: Test share request', { name, user: req.user.id });

    if (!name || typeof name !== 'string') {
      return res.status(400).json({
        error: 'INVALID_NAME',
        message: 'Share name is required'
      });
    }

    const result = await SMBService.testShare({ name });

    if (!result.success) {
      return res.status(404).json({
        error: result.error,
        message: result.message
      });
    }

    return res.json({
      success: true,
      name: result.name,
      accessible: result.accessible,
      message: result.message
    });
  } catch (err) {
    logger.error('SMB test share error', { error: err.message });
    return res.status(500).json({
      error: 'TEST_ERROR',
      message: 'Failed to test SMB share'
    });
  }
});

/**
 * GET /smb/status
 * Get SMB service status (enhanced with global state)
 */
router.get('/status', requireAuth, async (req, res) => {
  try {
    const status = await SMBService.getServiceStatus();

    return res.json({
      success: true,
      service: 'smbd',
      active: status.active,
      enabled: status.enabled,
      running: status.running,
      installed: status.installed,
      status: status.active ? 'running' : 'stopped'
    });
  } catch (err) {
    logger.error('SMB status check error', { error: err.message });
    return res.status(500).json({
      error: 'STATUS_ERROR',
      message: 'Failed to get SMB service status'
    });
  }
});

/**
 * POST /smb/enable
 * Enable SMB service — syncs all shares, reloads config, opens firewall
 */
router.post('/enable', requireAuth, requireAdmin, async (req, res) => {
  try {
    logger.info('SMB: Enable service request', { user: req.user.id });

    const result = await SMBService.enableService();

    if (!result.success) {
      return res.status(400).json({
        error: result.error,
        message: result.message
      });
    }

    // Get updated status
    const status = await SMBService.getServiceStatus();

    logger.info('SMB service enabled', { user: req.user.id });

    return res.json({
      success: true,
      message: result.message,
      active: status.active,
      enabled: status.enabled,
      running: status.running
    });
  } catch (err) {
    logger.error('SMB enable service error', { error: err.message });
    return res.status(500).json({
      error: 'SERVICE_ERROR',
      message: 'Failed to enable SMB service'
    });
  }
});

/**
 * POST /smb/disable
 * Disable SMB service — all SMB shares become inaccessible
 */
router.post('/disable', requireAuth, requireAdmin, async (req, res) => {
  try {
    logger.info('SMB: Disable service request', { user: req.user.id });

    const result = await SMBService.disableService();

    if (!result.success) {
      return res.status(400).json({
        error: result.error,
        message: result.message
      });
    }

    logger.info('SMB service disabled', { user: req.user.id });

    return res.json({
      success: true,
      message: result.message,
      active: false,
      enabled: false,
      running: false
    });
  } catch (err) {
    logger.error('SMB disable service error', { error: err.message });
    return res.status(500).json({
      error: 'SERVICE_ERROR',
      message: 'Failed to disable SMB service'
    });
  }
});

/**
 * POST /api/smb/attach
 * Attach a shared folder to SMB (legacy compat)
 */
router.post('/attach', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { name, path } = req.body;
    const accessService = require('../../lib/access.service');
    
    if (!name || !path) {
      return res.status(400).json({
        error: 'INVALID_INPUT',
        message: 'Name and path are required'
      });
    }
    
    const result = await accessService.attachSmbShare(name, path);
    return res.json({ success: true, ...result });
  } catch (err) {
    logger.error('SMB attach error', { error: err.message });
    return res.status(400).json({
      error: 'ATTACH_FAILED',
      message: err.message
    });
  }
});

/**
 * DELETE /api/smb/attach/:name
 * Detach a shared folder from SMB (legacy compat)
 */
router.delete('/attach/:name', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { name } = req.params;
    const accessService = require('../../lib/access.service');
    
    const result = await accessService.detachSmbShare(name);
    return res.json({ success: true, ...result });
  } catch (err) {
    logger.error('SMB detach error', { error: err.message });
    return res.status(400).json({
      error: 'DETACH_FAILED',
      message: err.message
    });
  }
});

/**
 * Error handler for this router
 */
router.use((err, req, res, next) => {
  logger.error('SMB route error', { error: err.message, method: req.method, path: req.path });
  return res.status(500).json({
    error: 'INTERNAL_ERROR',
    message: 'An internal error occurred'
  });
});

module.exports = router;
