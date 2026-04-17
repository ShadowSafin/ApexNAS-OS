/**
 * Group API Routes
 * 
 * GET    /api/groups                     - List all groups
 * POST   /api/groups                     - Create group
 * DELETE /api/groups/:name               - Delete group
 * POST   /api/groups/:name/members       - Add user to group
 * DELETE /api/groups/:name/members/:user - Remove user from group
 */

const express = require('express');
const logger = require('../../lib/logger');
const { GroupService } = require('./group.service');
const { validate } = require('../../middleware/validate');
const { createGroupSchema, addMemberSchema } = require('./group.schema');

const router = express.Router();

/**
 * GET /api/groups
 * List all non-system groups
 */
router.get('/', async (req, res) => {
  try {
    logger.info('Group API: List groups');
    const result = await GroupService.listGroups();

    if (result.success) {
      res.ok(result);
    } else {
      res.status(500).json(result);
    }
  } catch (err) {
    logger.error('Group API: List error', { error: err.message });
    res.status(500).json({ success: false, error: 'INTERNAL_ERROR', message: err.message });
  }
});

/**
 * POST /api/groups
 * Create a new group
 */
router.post('/', validate(createGroupSchema), async (req, res) => {
  try {
    const { name } = req.body;
    logger.info('Group API: Create group', { name });
    const result = await GroupService.createGroup(name);

    if (result.success) {
      res.created(result);
      req.io?.emit('group:created', { name });
    } else {
      const status = result.error === 'GROUP_EXISTS' ? 409 : 400;
      res.status(status).json(result);
    }
  } catch (err) {
    logger.error('Group API: Create error', { error: err.message });
    res.status(500).json({ success: false, error: 'INTERNAL_ERROR', message: err.message });
  }
});

/**
 * DELETE /api/groups/:name
 * Delete a group
 */
router.delete('/:name', async (req, res) => {
  try {
    const { name } = req.params;
    logger.info('Group API: Delete group', { name });
    const result = await GroupService.deleteGroup(name);

    if (result.success) {
      res.ok(result);
      req.io?.emit('group:deleted', { name });
    } else {
      const status = result.error === 'GROUP_NOT_FOUND' ? 404 : 400;
      res.status(status).json(result);
    }
  } catch (err) {
    logger.error('Group API: Delete error', { error: err.message });
    res.status(500).json({ success: false, error: 'INTERNAL_ERROR', message: err.message });
  }
});

/**
 * POST /api/groups/:name/members
 * Add a user to a group
 */
router.post('/:name/members', validate(addMemberSchema), async (req, res) => {
  try {
    const { name } = req.params;
    const { username } = req.body;
    logger.info('Group API: Add member', { group: name, username });
    const result = await GroupService.addUserToGroup(username, name);

    if (result.success) {
      res.ok(result);
      req.io?.emit('group:memberAdded', { group: name, username });
    } else {
      res.status(400).json(result);
    }
  } catch (err) {
    logger.error('Group API: Add member error', { error: err.message });
    res.status(500).json({ success: false, error: 'INTERNAL_ERROR', message: err.message });
  }
});

/**
 * DELETE /api/groups/:name/members/:user
 * Remove a user from a group
 */
router.delete('/:name/members/:user', async (req, res) => {
  try {
    const { name, user } = req.params;
    logger.info('Group API: Remove member', { group: name, username: user });
    const result = await GroupService.removeUserFromGroup(user, name);

    if (result.success) {
      res.ok(result);
      req.io?.emit('group:memberRemoved', { group: name, username: user });
    } else {
      res.status(400).json(result);
    }
  } catch (err) {
    logger.error('Group API: Remove member error', { error: err.message });
    res.status(500).json({ success: false, error: 'INTERNAL_ERROR', message: err.message });
  }
});

module.exports = router;
