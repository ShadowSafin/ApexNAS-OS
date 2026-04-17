/**
 * Share API Routes — Central Share Management
 * 
 * POST   /api/share/create           Create shared folder
 * DELETE /api/share/delete            Delete shared folder
 * GET    /api/share/list              List all shares (enriched)
 * GET    /api/share/get/:name         Get single share (enriched)
 * PUT    /api/share/:name/services    Update protocol services
 * PUT    /api/share/:name/permissions Batch update ACL permissions
 */

const express = require('express');
const logger = require('../../lib/logger');
const { ShareService } = require('./share.service');
const { requireRole } = require('../../middleware/auth');

const router = express.Router();

// All share routes are mounted behind `requireAuth` in app.js. Destructive
// operations additionally require the `admin` role so non-admin authenticated
// users cannot modify the NAS share configuration.

// ── Create share ─────────────────────────────────────────────────────
router.post('/create', requireRole('admin'), async (req, res) => {
  try {
    logger.info('Share API: Create');
    const { name, basePath, filesystem } = req.body;

    const result = await ShareService.createShare({ name, basePath, filesystem });

    if (result.success) {
      res.status(201).json(result);
      req.io?.emit('share:created', { name, path: result.share.path });
    } else {
      res.status(400).json(result);
    }
  } catch (err) {
    logger.error('Share create error', { error: err.message });
    res.status(500).json({ success: false, error: 'INTERNAL_ERROR', message: err.message });
  }
});

// ── Delete share ─────────────────────────────────────────────────────
router.delete('/delete', requireRole('admin'), async (req, res) => {
  try {
    logger.info('Share API: Delete');
    const { name, removeDirectory = false } = req.body;

    const result = await ShareService.deleteShare({ name, removeDirectory });

    if (result.success) {
      res.status(200).json(result);
      req.io?.emit('share:deleted', { name });
    } else {
      res.status(400).json(result);
    }
  } catch (err) {
    logger.error('Share delete error', { error: err.message });
    res.status(500).json({ success: false, error: 'INTERNAL_ERROR', message: err.message });
  }
});

// ── List all shares ──────────────────────────────────────────────────
router.get('/list', async (req, res) => {
  try {
    logger.info('Share API: List');
    const result = await ShareService.listShares();
    res.status(200).json(result);
  } catch (err) {
    logger.error('Share list error', { error: err.message });
    res.status(500).json({ success: false, error: 'INTERNAL_ERROR', message: err.message });
  }
});

// ── Get single share ─────────────────────────────────────────────────
router.get('/get/:name', async (req, res) => {
  try {
    logger.info('Share API: Get');
    const { name } = req.params;
    const result = await ShareService.getShare({ name });

    if (result.success) {
      res.status(200).json(result);
    } else {
      res.status(404).json(result);
    }
  } catch (err) {
    logger.error('Share get error', { error: err.message });
    res.status(500).json({ success: false, error: 'INTERNAL_ERROR', message: err.message });
  }
});

// ── Update services (SMB / NFS / FTP) ────────────────────────────────
router.put('/:name/services', requireRole('admin'), async (req, res) => {
  try {
    const { name } = req.params;
    const serviceUpdates = req.body; // { smb: {...}, nfs: {...}, ftp: {...} }

    logger.info('Share API: Update services', { name, services: Object.keys(serviceUpdates) });

    const result = await ShareService.updateServices(name, serviceUpdates);

    if (result.success) {
      res.status(200).json(result);
      req.io?.emit('share:services-updated', { name });
    } else {
      res.status(400).json(result);
    }
  } catch (err) {
    logger.error('Share services update error', { error: err.message });
    res.status(500).json({ success: false, error: 'INTERNAL_ERROR', message: err.message });
  }
});

// ── Update permissions (batch ACL) ───────────────────────────────────
router.put('/:name/permissions', requireRole('admin'), async (req, res) => {
  try {
    const { name } = req.params;
    const { permissions } = req.body; // [{ subject: "user:john", access: "write" }, ...]

    logger.info('Share API: Update permissions', { name, count: permissions?.length });

    if (!permissions || !Array.isArray(permissions)) {
      return res.status(400).json({ success: false, error: 'INVALID_INPUT', message: 'permissions array required' });
    }

    const result = await ShareService.updatePermissions(name, permissions);

    if (result.success) {
      res.status(200).json(result);
      req.io?.emit('share:permissions-updated', { name });
    } else {
      res.status(400).json(result);
    }
  } catch (err) {
    logger.error('Share permissions update error', { error: err.message });
    res.status(500).json({ success: false, error: 'INTERNAL_ERROR', message: err.message });
  }
});

module.exports = router;
