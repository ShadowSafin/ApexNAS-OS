/**
 * Filesystem API Routes
 * 
 * POST /api/filesystem/create
 * POST /api/filesystem/detect
 * POST /api/filesystem/mount
 * POST /api/filesystem/unmount
 * GET  /api/filesystem/list
 */

const express = require('express');
const logger = require('../../lib/logger');
const { FilesystemService } = require('./filesystem.service');
const { requireRole } = require('../../middleware/auth');

const router = express.Router();

// All filesystem routes are mounted behind `requireAuth` in app.js.
// Destructive operations (format/mount/unmount) additionally require the
// `admin` role to prevent any authenticated user from reformatting block
// devices or unmounting storage.

/**
 * POST /api/filesystem/create
 * Create filesystem on device
 */
router.post('/create', requireRole('admin'), async (req, res) => {
  try {
    logger.info('Filesystem API: Create request');

    const { device, type = 'ext4', confirm = '', simulation = false } = req.body;

    const result = await FilesystemService.createFilesystem({
      device,
      type,
      confirm,
      simulation
    });

    if (result.success || result.simulation) {
      res.status(200).json(result);
      if (result.simulation) {
        req.io?.emit('filesystem:simulated', { device, type, command: result.command });
      } else if (result.created) {
        req.io?.emit('filesystem:created', { device, type });
      }
    } else {
      res.status(400).json(result);
    }
  } catch (err) {
    logger.error('Filesystem create error', { error: err.message });
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: err.message
    });
  }
});

/**
 * POST /api/filesystem/detect
 * Detect filesystem type
 */
router.post('/detect', async (req, res) => {
  try {
    logger.info('Filesystem API: Detect request');

    const { device } = req.body;

    const result = await FilesystemService.detectFilesystem(device);

    res.status(200).json(result);
  } catch (err) {
    logger.error('Filesystem detect error', { error: err.message });
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: err.message
    });
  }
});

/**
 * POST /api/filesystem/mount
 * Mount filesystem
 */
router.post('/mount', requireRole('admin'), async (req, res) => {
  try {
    logger.info('Filesystem API: Mount request');

    const { device, uuid } = req.body;

    const result = await FilesystemService.mountFilesystem({
      device,
      uuid
    });

    if (result.success) {
      res.status(200).json(result);
      req.io?.emit('filesystem:mounted', { device, mountpoint: result.mountpoint });
    } else {
      res.status(400).json(result);
    }
  } catch (err) {
    logger.error('Filesystem mount error', { error: err.message });
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: err.message
    });
  }
});

/**
 * POST /api/filesystem/unmount
 * Unmount filesystem
 */
router.post('/unmount', requireRole('admin'), async (req, res) => {
  try {
    logger.info('Filesystem API: Unmount request');

    const { mountpoint } = req.body;

    const result = await FilesystemService.unmountFilesystem({
      mountpoint
    });

    if (result.success) {
      res.status(200).json(result);
      req.io?.emit('filesystem:unmounted', { mountpoint });
    } else {
      res.status(400).json(result);
    }
  } catch (err) {
    logger.error('Filesystem unmount error', { error: err.message });
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: err.message
    });
  }
});

/**
 * GET /api/filesystem/list
 * List filesystems
 */
router.get('/list', async (req, res) => {
  try {
    logger.info('Filesystem API: List request');

    const result = await FilesystemService.listFilesystems();

    res.status(200).json({
      success: result.success,
      data: result.filesystems,
      count: result.count,
      ...(result.error && { error: result.error, message: result.message })
    });
  } catch (err) {
    logger.error('Filesystem list error', { error: err.message });
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: err.message
    });
  }
});

module.exports = router;
