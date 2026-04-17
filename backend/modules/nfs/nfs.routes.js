/**
 * NFS Routes - Phase 5
 * 
 * API endpoints for NFS (Network File System) sharing
 * - Create NFS exports
 * - List NFS exports
 * - Remove NFS exports
 * - Test NFS accessibility
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
 * 
 * Body:
 * {
 *   "name": "export-name",
 *   "path": "/mnt/storage/folder",
 *   "clients": [
 *     {
 *       "ip": "192.168.1.0/24",
 *       "options": "rw,sync,no_subtree_check"
 *     }
 *   ]
 * }
 */
router.post('/exports', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { name, path, clients } = req.body;

    logger.info('NFS: Create export request', { name, path, user: req.user.id });

    // Call service
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
 * Get available storage paths for creating exports
 */
router.get('/available-paths', requireAuth, async (req, res) => {
  try {
    logger.info('NFS: Get available paths request', { user: req.user.id });

    const result = await NFSService.getAvailablePaths();

    return res.json({
      success: true,
      paths: result.paths || []
    });
  } catch (err) {
    logger.error('NFS get available paths error', { error: err.message });
    return res.json({
      success: true,
      paths: []
    });
  }
});

/**
 * DELETE /nfs/exports/:name
 * Remove an NFS export
 * 
 * Params:
 * - name: export name
 */
router.delete('/exports/:name', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { name } = req.params;

    logger.info('NFS: Remove export request', { name, user: req.user.id });

    // Validate export name
    if (!name || typeof name !== 'string' || name.length === 0) {
      return res.status(400).json({
        error: 'INVALID_NAME',
        message: 'Export name is required'
      });
    }

    const result = await NFSService.removeShare({ name });

    if (!result.success) {
      return res.status(404).json({
        error: result.error,
        message: result.message
      });
    }

    logger.info('NFS export removed', { name, user: req.user.id });

    return res.json({
      success: true,
      message: result.message
    });
  } catch (err) {
    logger.error('NFS remove export error', { error: err.message });
    return res.status(500).json({
      error: 'SERVICE_ERROR',
      message: 'Failed to remove NFS export'
    });
  }
});

/**
 * POST /nfs/test/:name
 * Test NFS export accessibility
 * 
 * Params:
 * - name: export name
 */
router.post('/test/:name', requireAuth, async (req, res) => {
  try {
    const { name } = req.params;

    logger.info('NFS: Test export request', { name, user: req.user.id });

    if (!name || typeof name !== 'string') {
      return res.status(400).json({
        error: 'INVALID_NAME',
        message: 'Export name is required'
      });
    }

    const result = await NFSService.testShare({ name });

    if (!result.success) {
      return res.status(404).json({
        error: result.error,
        message: result.message
      });
    }

    return res.json({
      success: true,
      name: result.name,
      exported: result.exported,
      message: result.message
    });
  } catch (err) {
    logger.error('NFS test export error', { error: err.message });
    return res.status(500).json({
      error: 'TEST_ERROR',
      message: 'Failed to test NFS export'
    });
  }
});

/**
 * GET /nfs/exports/:name
 * Get details of a specific NFS export
 */
router.get('/exports/:name', requireAuth, async (req, res) => {
  try {
    const { name } = req.params;

    logger.info('NFS: Get export details', { name, user: req.user.id });

    const shareCheck = NFSService.validateShareExists(name);
    if (!shareCheck.valid) {
      return res.status(404).json({
        error: shareCheck.error,
        message: shareCheck.message
      });
    }

    return res.json({
      success: true,
      export: shareCheck.share
    });
  } catch (err) {
    logger.error('NFS get export error', { error: err.message });
    return res.status(500).json({
      error: 'SERVICE_ERROR',
      message: 'Failed to get NFS export details'
    });
  }
});

/**
 * GET /nfs/status
 * Get NFS service status
 */
router.get('/status', requireAuth, async (req, res) => {
  try {
    const status = await NFSService.getServiceStatus();

    return res.json({
      success: true,
      service: 'nfs-server',
      active: status.active,
      status: status.active ? 'running' : 'stopped'
    });
  } catch (err) {
    logger.error('NFS status check error', { error: err.message });
    return res.status(500).json({
      error: 'STATUS_ERROR',
      message: 'Failed to get NFS service status'
    });
  }
});

/**
 * POST /nfs/enable
 * Enable NFS service
 */
router.post('/enable', requireAuth, requireAdmin, async (req, res) => {
  try {
    logger.info('NFS: Enable service request', { user: req.user.id });

    const result = await NFSService.enableService();

    if (!result.success) {
      return res.status(400).json({
        error: result.error,
        message: result.message
      });
    }

    logger.info('NFS service enabled', { user: req.user.id });

    return res.json({
      success: true,
      message: result.message,
      active: true
    });
  } catch (err) {
    logger.error('NFS enable service error', { error: err.message });
    return res.status(500).json({
      error: 'SERVICE_ERROR',
      message: 'Failed to enable NFS service'
    });
  }
});

/**
 * POST /nfs/disable
 * Disable NFS service
 */
router.post('/disable', requireAuth, requireAdmin, async (req, res) => {
  try {
    logger.info('NFS: Disable service request', { user: req.user.id });

    const result = await NFSService.disableService();

    if (!result.success) {
      return res.status(400).json({
        error: result.error,
        message: result.message
      });
    }

    logger.info('NFS service disabled', { user: req.user.id });

    return res.json({
      success: true,
      message: result.message,
      active: false
    });
  } catch (err) {
    logger.error('NFS disable service error', { error: err.message });
    return res.status(500).json({
      error: 'SERVICE_ERROR',
      message: 'Failed to disable NFS service'
    });
  }
});

/**
 * POST /api/nfs/attach
 * Attach a shared folder to NFS
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
    
    const result = await accessService.attachNfsShare(name, path);
    res.ok(result);
  } catch (err) {
    logger.error('NFS attach error', { error: err.message });
    return res.status(400).json({
      error: 'ATTACH_FAILED',
      message: err.message
    });
  }
});

/**
 * DELETE /api/nfs/attach/:name
 * Detach a shared folder from NFS
 */
router.delete('/attach/:name', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { name } = req.params;
    const accessService = require('../../lib/access.service');
    
    const result = await accessService.detachNfsShare(name);
    res.ok(result);
  } catch (err) {
    logger.error('NFS detach error', { error: err.message });
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
  logger.error('NFS route error', { error: err.message, method: req.method, path: req.path });
  return res.status(500).json({
    error: 'INTERNAL_ERROR',
    message: 'An internal error occurred'
  });
});

module.exports = router;
