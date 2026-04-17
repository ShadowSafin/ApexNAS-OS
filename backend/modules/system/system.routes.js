const express = require('express');
const { requireAuth, requireRole } = require('../../middleware/auth');
const { validate } = require('../../middleware/validate');
const systemService = require('./system.service');
const metricsService = require('./metrics.service');
const { rebootSchema, shutdownSchema, logsQuerySchema } = require('./system.schema');

const router = express.Router();

// Public endpoints
router.get('/info', (req, res) => {
  res.ok(systemService.info());
});

// ── Unified real-time metrics (CPU, memory, disk, network, temp, system) ──
router.get('/metrics', requireAuth, async (req, res, next) => {
  try {
    const metrics = await metricsService.getMetrics();
    res.ok(metrics);
  } catch (err) {
    next(err);
  }
});

// Protected endpoints (require auth)
router.get('/stats', requireAuth, async (req, res, next) => {
  try {
    const stats = await systemService.stats();
    res.ok(stats);
  } catch (err) {
    next(err);
  }
});

router.get('/cpu', requireAuth, (req, res) => {
  res.ok(systemService.cpuUsage());
});

router.get('/memory', requireAuth, (req, res) => {
  res.ok(systemService.memoryUsage());
});

router.get('/disk', requireAuth, async (req, res, next) => {
  try {
    const disk = await systemService.diskUsage();
    res.ok(disk);
  } catch (err) {
    next(err);
  }
});

router.get('/temperature', requireAuth, async (req, res, next) => {
  try {
    const temperature = await systemService.getTemperature();
    res.ok(temperature);
  } catch (err) {
    next(err);
  }
});

router.get('/services', requireAuth, async (req, res, next) => {
  try {
    const services = await systemService.getServices();
    res.ok(services);
  } catch (err) {
    next(err);
  }
});

// Logs endpoint with query validation
router.get('/logs', requireAuth, validate(logsQuerySchema, 'query'), async (req, res, next) => {
  try {
    const { service = 'system', limit = 100, since, until } = req.query;
    const logs = await systemService.getLogs({ service, limit: parseInt(limit), since, until });
    res.ok(logs);
  } catch (err) {
    next(err);
  }
});

// Protected endpoints (require admin role)
router.post('/reboot', requireAuth, requireRole('admin'), validate(rebootSchema, 'body'), async (req, res, next) => {
  try {
    const { confirm } = req.body;
    const result = await systemService.reboot(confirm);
    res.ok(result);
  } catch (err) {
    next(err);
  }
});

router.post('/shutdown', requireAuth, requireRole('admin'), validate(shutdownSchema, 'body'), async (req, res, next) => {
  try {
    const { confirm } = req.body;
    const result = await systemService.shutdown(confirm);
    res.ok(result);
  } catch (err) {
    next(err);
  }
});

router.get('/access', requireAuth, async (req, res, next) => {
  try {
    const accessService = require('../../lib/access.service');
    const accessInfo = await accessService.generateAccessInfo();
    res.ok(accessInfo);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
