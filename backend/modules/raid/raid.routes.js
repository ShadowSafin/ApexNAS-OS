/**
 * RAID Routes
 * 
 * API endpoints for RAID management:
 * - GET /api/raid/list - List arrays
 * - POST /api/raid/create - Create array (with safety)
 * - POST /api/raid/stop - Stop array
 * - DELETE /api/raid/remove - Remove metadata
 * - GET /api/raid/status/:name - Get array status
 * 
 * ALL destructive operations require simulation + confirmation flow
 */

const express = require('express');
const router = express.Router();
const logger = require('../../lib/logger');
const RAIDService = require('./raid.service');
const RAIDSchema = require('./raid.schema');

/**
 * GET /api/raid/list
 * List all RAID arrays
 */
router.get('/list', async (req, res) => {
  try {
    logger.debug('RAID Route: List request');
    const result = await RAIDService.listArrays();
    
    if (result.success) {
      return res.status(200).json({
        success: true,
        data: result.arrays,
        count: result.count
      });
    }

    return res.status(500).json({
      success: false,
      error: result.error,
      message: result.message
    });
  } catch (err) {
    logger.error('RAID Route: List error', { error: err.message });
    return res.status(500).json({
      success: false,
      error: 'LIST_ERROR',
      message: err.message
    });
  }
});

/**
 * POST /api/raid/create
 * Create RAID array (with safety checks)
 * 
 * Body:
 * {
 *   name: "md0",
 *   level: "raid1",
 *   devices: ["sdb1", "sdc1"],
 *   simulation: true,        // default true (safe!)
 *   confirm: "YES_DESTROY_DATA"  // required if simulation false
 * }
 * 
 * Returns:
 * - simulation: true → command preview, no changes
 * - simulation: false + confirm → real execution
 * - confirm missing → error
 */
router.post('/create', async (req, res) => {
  try {
    logger.info('RAID Route: Create request', { body: req.body });

    // Validate request
    const validation = RAIDSchema.validateCreateRequest(req);
    if (!validation.valid) {
      logger.warn('RAID Route: Create validation failed', { errors: validation.errors });
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        errors: validation.errors,
        warnings: validation.warnings
      });
    }

    // Default to simulation if not specified
    const params = {
      ...validation.data,
      simulation: validation.data.simulation !== false // Default true
    };

    logger.info('RAID Route: Create validated, executing', { 
      simulation: params.simulation,
      name: params.name 
    });

    // Execute
    const result = await RAIDService.createArray(params);

    const statusCode = result.success ? 200 : (result.error === 'CONFIRMATION_REQUIRED' ? 400 : 500);
    return res.status(statusCode).json(result);
  } catch (err) {
    logger.error('RAID Route: Create error', { error: err.message });
    return res.status(500).json({
      success: false,
      error: 'CREATE_ERROR',
      message: err.message
    });
  }
});

/**
 * POST /api/raid/stop
 * Stop RAID array (default: simulation mode)
 * 
 * Body:
 * {
 *   name: "/dev/md0" or "md0",
 *   simulation: true         // default true (safe!)
 * }
 */
router.post('/stop', async (req, res) => {
  try {
    logger.info('RAID Route: Stop request', { body: req.body });

    // Validate
    const validation = RAIDSchema.validateStopRequest(req);
    if (!validation.valid) {
      logger.warn('RAID Route: Stop validation failed', { errors: validation.errors });
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        errors: validation.errors
      });
    }

    // Default to simulation
    const params = {
      ...validation.data,
      simulation: validation.data.simulation !== false // Default true
    };

    logger.info('RAID Route: Stop validated, executing', { simulation: params.simulation });

    // Execute
    const result = await RAIDService.stopArray(params);

    return res.status(result.success ? 200 : 500).json(result);
  } catch (err) {
    logger.error('RAID Route: Stop error', { error: err.message });
    return res.status(500).json({
      success: false,
      error: 'STOP_ERROR',
      message: err.message
    });
  }
});

/**
 * DELETE /api/raid/remove
 * Remove RAID metadata (VERY DESTRUCTIVE - requires confirmation)
 * 
 * Body:
 * {
 *   devices: ["sdb1", "sdc1"],
 *   simulation: true,        // default true (safe!)
 *   confirm: "YES_DESTROY_DATA"  // required if simulation false
 * }
 */
router.delete('/remove', async (req, res) => {
  try {
    logger.info('RAID Route: Remove metadata request', { body: req.body });

    // Validate
    const validation = RAIDSchema.validateRemoveRequest(req);
    if (!validation.valid) {
      logger.warn('RAID Route: Remove validation failed', { errors: validation.errors });
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        errors: validation.errors,
        warnings: validation.warnings
      });
    }

    // Default to simulation
    const params = {
      ...validation.data,
      simulation: validation.data.simulation !== false // Default true
    };

    logger.info('RAID Route: Remove validated, executing', { simulation: params.simulation });

    // Execute
    const result = await RAIDService.removeMetadata(params);

    const statusCode = result.success ? 200 : (result.error === 'CONFIRMATION_REQUIRED' ? 400 : 500);
    return res.status(statusCode).json(result);
  } catch (err) {
    logger.error('RAID Route: Remove error', { error: err.message });
    return res.status(500).json({
      success: false,
      error: 'REMOVE_ERROR',
      message: err.message
    });
  }
});

/**
 * GET /api/raid/status/:name
 * Get status of specific RAID array
 */
router.get('/status/:name', async (req, res) => {
  try {
    const { name } = req.params;
    logger.debug('RAID Route: Status request', { name });

    const result = await RAIDService.getStatus(name);

    if (result.success) {
      return res.json(result);
    }

    return res.status(404).json(result);
  } catch (err) {
    logger.error('RAID Route: Status error', { error: err.message });
    return res.status(500).json({
      success: false,
      error: 'STATUS_ERROR',
      message: err.message
    });
  }
});

module.exports = router;
