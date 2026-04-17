const express = require('express');
const { requireAuth } = require('../../middleware/auth');
const networkService = require('../network/network.service');

const router = express.Router();

/**
 * GET /api/network/interfaces
 * Get all network interfaces
 */
router.get('/interfaces', requireAuth, async (req, res, next) => {
  try {
    const interfaces = await networkService.getNetworkInterfaces();
    res.ok(interfaces);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/network/stats
 * Get network statistics
 */
router.get('/stats', requireAuth, async (req, res, next) => {
  try {
    const stats = await networkService.getNetworkStats();
    res.ok(stats);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
