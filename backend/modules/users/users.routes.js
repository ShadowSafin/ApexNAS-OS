/**
 * User API Routes
 * 
 * GET    /api/users                    - List all users
 * GET    /api/users/:username          - Get single user
 * POST   /api/users                    - Create user
 * DELETE /api/users/:username          - Delete user
 * PUT    /api/users/:username/password - Change password
 * GET    /api/users/:username/groups   - List user's groups
 */

const express = require('express');
const logger = require('../../lib/logger');
const { UserService } = require('./user.service');
const { validate } = require('../../middleware/validate');
const { createUserSchema, changePasswordSchema } = require('./user.schema');
const { requireRole } = require('../../middleware/auth');

const router = express.Router();

// All user routes are mounted behind `requireAuth` in app.js. Mutating
// operations additionally require the `admin` role so that non-admin
// authenticated users cannot create, delete, or reset credentials for other
// system accounts.

/**
 * GET /api/users
 * List all non-system users
 */
router.get('/', async (req, res) => {
  try {
    logger.info('User API: List users');
    const result = await UserService.listUsers();

    if (result.success) {
      res.ok(result);
    } else {
      res.status(500).json(result);
    }
  } catch (err) {
    logger.error('User API: List error', { error: err.message });
    res.status(500).json({ success: false, error: 'INTERNAL_ERROR', message: err.message });
  }
});

/**
 * GET /api/users/:username
 * Get a single user
 */
router.get('/:username', async (req, res) => {
  try {
    const { username } = req.params;
    logger.info('User API: Get user', { username });
    const result = await UserService.getUser(username);

    if (result.success) {
      res.ok(result);
    } else {
      const status = result.error === 'USER_NOT_FOUND' ? 404 : 400;
      res.status(status).json(result);
    }
  } catch (err) {
    logger.error('User API: Get error', { error: err.message });
    res.status(500).json({ success: false, error: 'INTERNAL_ERROR', message: err.message });
  }
});

/**
 * POST /api/users
 * Create a new user
 */
router.post('/', requireRole('admin'), validate(createUserSchema), async (req, res) => {
  try {
    const { username, password } = req.body;
    logger.info('User API: Create user', { username });
    const result = await UserService.createUser(username, password);

    if (result.success) {
      res.created(result);
      req.io?.emit('user:created', { username });
    } else {
      const status = result.error === 'USER_EXISTS' ? 409 : 400;
      res.status(status).json(result);
    }
  } catch (err) {
    logger.error('User API: Create error', { error: err.message });
    res.status(500).json({ success: false, error: 'INTERNAL_ERROR', message: err.message });
  }
});

/**
 * DELETE /api/users/:username
 * Delete a user
 */
router.delete('/:username', requireRole('admin'), async (req, res) => {
  try {
    const { username } = req.params;
    logger.info('User API: Delete user', { username });
    const result = await UserService.deleteUser(username);

    if (result.success) {
      res.ok(result);
      req.io?.emit('user:deleted', { username });
    } else {
      const status = result.error === 'USER_NOT_FOUND' ? 404 : 400;
      res.status(status).json(result);
    }
  } catch (err) {
    logger.error('User API: Delete error', { error: err.message });
    res.status(500).json({ success: false, error: 'INTERNAL_ERROR', message: err.message });
  }
});

/**
 * PUT /api/users/:username/password
 * Change user password
 */
router.put('/:username/password', requireRole('admin'), validate(changePasswordSchema), async (req, res) => {
  try {
    const { username } = req.params;
    const { password } = req.body;
    logger.info('User API: Change password', { username });
    const result = await UserService.setPassword(username, password);

    if (result.success) {
      res.ok(result);
    } else {
      const status = result.error === 'USER_NOT_FOUND' ? 404 : 400;
      res.status(status).json(result);
    }
  } catch (err) {
    logger.error('User API: Password error', { error: err.message });
    res.status(500).json({ success: false, error: 'INTERNAL_ERROR', message: err.message });
  }
});

/**
 * GET /api/users/:username/groups
 * Get groups for a user
 */
router.get('/:username/groups', async (req, res) => {
  try {
    const { username } = req.params;
    logger.info('User API: Get user groups', { username });
    const result = await UserService.getUserGroups(username);

    if (result.success) {
      res.ok(result);
    } else {
      res.status(400).json(result);
    }
  } catch (err) {
    logger.error('User API: Groups error', { error: err.message });
    res.status(500).json({ success: false, error: 'INTERNAL_ERROR', message: err.message });
  }
});

module.exports = router;
