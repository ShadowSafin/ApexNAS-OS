/**
 * NFS Routes — Dual-Layer Service Activation
 * 
 * API endpoints for NFS (Network File System) sharing
 * - Create NFS exports
 * - List NFS exports
 * - Remove NFS exports
 * - Enable/disable with full sync
 */

const express = require('express');
const router = express.Router();
const { NFSService } = require('./nfs.service');
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
    logger.warn('Unauthorized NFS operation attempted', { user: req.user?.id, operation: req.method });
    return res.status(403).json({ error: 'FORBIDDEN', message: 'Admin access required' });
  }
  next();
};

/**
 * POST /nfs/exports
 * Create a new NFS export
 */
router.post('/exports', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { name, path, clients } = req.body;

    logger.info('NFS: Create export request', { name, path, user: req.user.id });

    const result = await NFSService.createShare({
      name,
      path,
      clients: clients || []
    });

    if (!result.success) {
      const statusCode = result.error === 'DUPLICATE_SHARE' ? 409 : 400;
      return res.status(statusCode).json({
        error: result.error,
        message: result.message
      });
    }

    logger.info('NFS export created', { name, user: req.user.id });

    return res.status(201).json({
      success: true,
      message: result.message,
      export: result.share
    });
  } catch (err) {
    logger.error('NFS create export error', { error: err.message });
    return res.status(500).json({
      error: 'SERVICE_ERROR',
      message: 'Failed to create NFS export'
    });
  }
});

/**
 * GET /nfs/exports
 * List all NFS exports
 */
router.get('/exports', requireAuth, async (req, res) => {
  try {
    logger.info('NFS: List exports request', { user: req.user.id });

    const result = await NFSService.listShares();

    if (!result.success) {
      return res.status(500).json({
        error: result.error,
        message: result.message
      });
    }

    return res.json({
      success: true,
      exports: result.shares,
      count: result.count
    });
  } catch (err) {
    logger.error('NFS list exports error', { error: err.message });
    return res.status(500).json({
      error: 'SERVICE_ERROR',
      message: 'Failed to list NFS exports'
    });
  }
});

/**
 * GET /nfs/available-paths
 */
router.get('/available-paths', requireAuth, async (req, res) => {
  try {
    const result = await NFSService.getAvailablePaths();
    return res.json({ success: true, paths: result.paths || [] });
  } catch (err) {
    return res.json({ success: true, paths: [] });
  }
});

/**
 * DELETE /nfs/exports/:name
 */
router.delete('/exports/:name', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { name } = req.params;

    if (!name || typeof name !== 'string' || name.length === 0) {
      return res.status(400).json({ error: 'INVALID_NAME', message: 'Export name is required' });
    }

    const result = await NFSService.removeShare({ name });

    if (!result.success) {
      return res.status(404).json({ error: result.error, message: result.message });
    }

    return res.json({ success: true, message: result.message });
  } catch (err) {
    logger.error('NFS remove export error', { error: err.message });
    return res.status(500).json({ error: 'SERVICE_ERROR', message: 'Failed to remove NFS export' });
  }
});

/**
 * POST /nfs/test/:name
 */
router.post('/test/:name', requireAuth, async (req, res) => {
  try {
    const { name } = req.params;

    if (!name || typeof name !== 'string') {
      return res.status(400).json({ error: 'INVALID_NAME', message: 'Export name is required' });
    }

    const result = await NFSService.testShare({ name });

    if (!result.success) {
      return res.status(404).json({ error: result.error, message: result.message });
    }

    return res.json({ success: true, name: result.name, exported: result.exported, message: result.message });
  } catch (err) {
    logger.error('NFS test export error', { error: err.message });
    return res.status(500).json({ error: 'TEST_ERROR', message: 'Failed to test NFS export' });
  }
});

/**
 * GET /nfs/exports/:name
 */
router.get('/exports/:name', requireAuth, async (req, res) => {
  try {
    const { name } = req.params;

    const shareCheck = NFSService.validateShareExists(name);
    if (!shareCheck.valid) {
      return res.status(404).json({ error: shareCheck.error, message: shareCheck.message });
    }

    return res.json({ success: true, export: shareCheck.share });
  } catch (err) {
    logger.error('NFS get export error', { error: err.message });
    return res.status(500).json({ error: 'SERVICE_ERROR', message: 'Failed to get NFS export details' });
  }
});

/**
 * GET /nfs/status
 * Get NFS service status (enhanced with global state + detected subnet)
 */
router.get('/status', requireAuth, async (req, res) => {
  try {
    const status = await NFSService.getServiceStatus();

    return res.json({
      success: true,
      service: 'nfs-server',
      active: status.active,
      enabled: status.enabled,
      running: status.running,
      installed: status.installed,
      status: status.active ? 'running' : 'stopped',
      detectedSubnet: status.detectedSubnet
    });
  } catch (err) {
    logger.error('NFS status check error', { error: err.message });
    return res.status(500).json({ error: 'STATUS_ERROR', message: 'Failed to get NFS service status' });
  }
});

/**
 * POST /nfs/enable
 * Enable NFS service — syncs all exports, opens firewall
 */
router.post('/enable', requireAuth, requireAdmin, async (req, res) => {
  try {
    logger.info('NFS: Enable service request', { user: req.user.id });

    const result = await NFSService.enableService();

    if (!result.success) {
      return res.status(400).json({ error: result.error, message: result.message });
    }

    const status = await NFSService.getServiceStatus();

    return res.json({
      success: true,
      message: result.message,
      active: status.active,
      enabled: status.enabled,
      running: status.running,
      detectedSubnet: status.detectedSubnet
    });
  } catch (err) {
    logger.error('NFS enable service error', { error: err.message });
    return res.status(500).json({ error: 'SERVICE_ERROR', message: 'Failed to enable NFS service' });
  }
});

/**
 * POST /nfs/disable
 * Disable NFS service — all exports become inaccessible
 */
router.post('/disable', requireAuth, requireAdmin, async (req, res) => {
  try {
    logger.info('NFS: Disable service request', { user: req.user.id });

    const result = await NFSService.disableService();

    if (!result.success) {
      return res.status(400).json({ error: result.error, message: result.message });
    }

    return res.json({
      success: true,
      message: result.message,
      active: false,
      enabled: false,
      running: false
    });
  } catch (err) {
    logger.error('NFS disable service error', { error: err.message });
    return res.status(500).json({ error: 'SERVICE_ERROR', message: 'Failed to disable NFS service' });
  }
});

/**
 * POST /api/nfs/attach (legacy compat)
 */
router.post('/attach', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { name, path } = req.body;
    const accessService = require('../../lib/access.service');
    
    if (!name || !path) {
      return res.status(400).json({ error: 'INVALID_INPUT', message: 'Name and path are required' });
    }
    
    const result = await accessService.attachNfsShare(name, path);
    return res.json({ success: true, ...result });
  } catch (err) {
    logger.error('NFS attach error', { error: err.message });
    return res.status(400).json({ error: 'ATTACH_FAILED', message: err.message });
  }
});

/**
 * DELETE /api/nfs/attach/:name (legacy compat)
 */
router.delete('/attach/:name', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { name } = req.params;
    const accessService = require('../../lib/access.service');
    
    const result = await accessService.detachNfsShare(name);
    return res.json({ success: true, ...result });
  } catch (err) {
    logger.error('NFS detach error', { error: err.message });
    return res.status(400).json({ error: 'DETACH_FAILED', message: err.message });
  }
});

/**
 * Error handler for this router
 */
router.use((err, req, res, next) => {
  logger.error('NFS route error', { error: err.message, method: req.method, path: req.path });
  return res.status(500).json({ error: 'INTERNAL_ERROR', message: 'An internal error occurred' });
});

module.exports = router;
