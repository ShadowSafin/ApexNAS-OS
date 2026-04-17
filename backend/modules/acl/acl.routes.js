/**
 * ACL API Routes - Enhanced
 * 
 * POST   /api/acl/set-user         - Set user ACL
 * POST   /api/acl/set-group        - Set group ACL
 * POST   /api/acl/set-default      - Set base default permissions
 * POST   /api/acl/set-default-acl  - Set inheritable default ACL
 * GET    /api/acl/get              - Get permissions for path
 * DELETE /api/acl/remove-user      - Remove user ACL
 * DELETE /api/acl/remove-group     - Remove group ACL
 * DELETE /api/acl/remove-all       - Remove all extended ACLs
 */

const express = require('express');
const logger = require('../../lib/logger');
const { ACLService } = require('./acl.service');

const router = express.Router();

/**
 * POST /api/acl/set-user
 */
router.post('/set-user', async (req, res) => {
  try {
    logger.info('ACL API: Set user permissions request');
    const { path, user, permissions, recursive = false } = req.body;
    const result = await ACLService.setUserPermissions({ path, user, permissions, recursive });

    if (result.success) {
      res.status(200).json(result);
      req.io?.emit('acl:updated', { path, user, permissions });
    } else {
      res.status(400).json(result);
    }
  } catch (err) {
    logger.error('ACL set-user error', { error: err.message });
    res.status(500).json({ success: false, error: 'INTERNAL_ERROR', message: err.message });
  }
});

/**
 * POST /api/acl/set-group
 */
router.post('/set-group', async (req, res) => {
  try {
    logger.info('ACL API: Set group permissions request');
    const { path, group, permissions, recursive = false } = req.body;
    const result = await ACLService.setGroupPermissions({ path, group, permissions, recursive });

    if (result.success) {
      res.status(200).json(result);
      req.io?.emit('acl:updated', { path, group, permissions });
    } else {
      res.status(400).json(result);
    }
  } catch (err) {
    logger.error('ACL set-group error', { error: err.message });
    res.status(500).json({ success: false, error: 'INTERNAL_ERROR', message: err.message });
  }
});

/**
 * POST /api/acl/set-default
 */
router.post('/set-default', async (req, res) => {
  try {
    logger.info('ACL API: Set default permissions request');
    const { path, recursive = false } = req.body;
    const result = await ACLService.setDefaultPermissions({ path, recursive });

    if (result.success) {
      res.status(200).json(result);
      req.io?.emit('acl:updated', { path, default: true });
    } else {
      res.status(400).json(result);
    }
  } catch (err) {
    logger.error('ACL set-default error', { error: err.message });
    res.status(500).json({ success: false, error: 'INTERNAL_ERROR', message: err.message });
  }
});

/**
 * POST /api/acl/set-default-acl
 * Set inheritable default ACL on a directory
 */
router.post('/set-default-acl', async (req, res) => {
  try {
    logger.info('ACL API: Set default ACL request');
    const { path, type, qualifier, permissions, recursive = false } = req.body;
    const result = await ACLService.setDefaultACL({ path, type, qualifier, permissions, recursive });

    if (result.success) {
      res.status(200).json(result);
      req.io?.emit('acl:updated', { path, defaultACL: true });
    } else {
      res.status(400).json(result);
    }
  } catch (err) {
    logger.error('ACL set-default-acl error', { error: err.message });
    res.status(500).json({ success: false, error: 'INTERNAL_ERROR', message: err.message });
  }
});

/**
 * GET /api/acl/get
 */
router.get('/get', async (req, res) => {
  try {
    logger.info('ACL API: Get permissions request');
    const { path } = req.query;
    const result = await ACLService.getPermissions({ path });

    if (result.success) {
      res.status(200).json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (err) {
    logger.error('ACL get error', { error: err.message });
    res.status(500).json({ success: false, error: 'INTERNAL_ERROR', message: err.message });
  }
});

/**
 * DELETE /api/acl/remove-user
 */
router.delete('/remove-user', async (req, res) => {
  try {
    logger.info('ACL API: Remove user permissions request');
    const { path, user, recursive = false } = req.body;
    const result = await ACLService.removeUserPermissions({ path, user, recursive });

    if (result.success) {
      res.status(200).json(result);
      req.io?.emit('acl:updated', { path, user, removed: true });
    } else {
      res.status(400).json(result);
    }
  } catch (err) {
    logger.error('ACL remove-user error', { error: err.message });
    res.status(500).json({ success: false, error: 'INTERNAL_ERROR', message: err.message });
  }
});

/**
 * DELETE /api/acl/remove-group
 */
router.delete('/remove-group', async (req, res) => {
  try {
    logger.info('ACL API: Remove group permissions request');
    const { path, group, recursive = false } = req.body;
    const result = await ACLService.removeGroupPermissions({ path, group, recursive });

    if (result.success) {
      res.status(200).json(result);
      req.io?.emit('acl:updated', { path, group, removed: true });
    } else {
      res.status(400).json(result);
    }
  } catch (err) {
    logger.error('ACL remove-group error', { error: err.message });
    res.status(500).json({ success: false, error: 'INTERNAL_ERROR', message: err.message });
  }
});

/**
 * DELETE /api/acl/remove-all
 */
router.delete('/remove-all', async (req, res) => {
  try {
    logger.info('ACL API: Remove all ACLs request');
    const { path, recursive = false } = req.body;
    const result = await ACLService.removeAllACLs({ path, recursive });

    if (result.success) {
      res.status(200).json(result);
      req.io?.emit('acl:updated', { path, allRemoved: true });
    } else {
      res.status(400).json(result);
    }
  } catch (err) {
    logger.error('ACL remove-all error', { error: err.message });
    res.status(500).json({ success: false, error: 'INTERNAL_ERROR', message: err.message });
  }
});

module.exports = router;
