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
    // Fetch all dependencies
    const networkService = require('../network/network.service');
    const network = await networkService.getNetworkInterfaces();
    const services = await systemService.getServices();
    
    // Fetch shares from share service
    const { ShareService } = require('../share/share.service');
    const sharesResult = await ShareService.listShares();
    const shares = sharesResult?.shares || [];
    
    // Get primary IP
    const ip = network[0]?.ip;
    console.log("ACCESS - IP:", ip);
    console.log("ACCESS - Services:", services);
    console.log("ACCESS - Shares:", shares);
    
    // If no IP, return empty
    if (!ip) {
      return res.ok({ services: [] });
    }
    
    // Check service status
    const smbRunning = services.some(s => 
      (s.name === 'SMB/CIFS' || s.name?.toLowerCase().includes('smb')) && s.status === 'running'
    );
    const nfsRunning = services.some(s => 
      (s.name === 'NFS Server' || s.name?.toLowerCase().includes('nfs')) && s.status === 'running'
    );
    const ftpRunning = services.some(s => 
      s.name === 'FTP' && s.status === 'running'
    );
    
    console.log("ACCESS - SMB running:", smbRunning, "NFS running:", nfsRunning, "FTP running:", ftpRunning);
    
    const accessPoints = { services: [] };
    
    // SMB access points
    if (smbRunning && shares.length > 0) {
      for (const share of shares) {
        if (share.path && share.path.startsWith('/mnt/storage')) {
          accessPoints.services.push({
            type: 'SMB',
            name: share.name,
            path: share.path,
            access: `\\\\${ip}\\${share.name}`
          });
        }
      }
    }
    
    // FTP access point (doesn't require shares)
    if (ftpRunning) {
      accessPoints.services.push({
        type: 'FTP',
        name: 'FTP Server',
        path: '/mnt/storage',
        access: `ftp://${ip}`
      });
    }
    
    // NFS access points
    if (nfsRunning && shares.length > 0) {
      for (const share of shares) {
        if (share.path && share.path.startsWith('/mnt/storage')) {
          accessPoints.services.push({
            type: 'NFS',
            name: share.name,
            path: share.path,
            access: `${ip}:${share.path}`
          });
        }
      }
    }
    
    // If no access points yet, create based on running services even without shares
    if (accessPoints.services.length === 0) {
      if (smbRunning) {
        accessPoints.services.push({
          type: 'SMB',
          name: 'storage',
          path: '/mnt/storage',
          access: `\\\\${ip}\\storage`
        });
      }
      if (ftpRunning) {
        accessPoints.services.push({
          type: 'FTP',
          name: 'FTP Server',
          path: '/mnt/storage',
          access: `ftp://${ip}`
        });
      }
      if (nfsRunning) {
        accessPoints.services.push({
          type: 'NFS',
          name: 'storage',
          path: '/mnt/storage',
          access: `${ip}:/mnt/storage`
        });
      }
    }
    
    console.log("ACCESS - Generated:", accessPoints);
    res.ok(accessPoints);
  } catch (err) {
    console.error("ACCESS - Error:", err);
    next(err);
  }
});

router.post('/service/:name/start', requireAuth, requireRole('admin'), async (req, res, next) => {
  try {
    const { name } = req.params;
    const result = await systemService.controlService(name, 'start');
    res.ok(result);
  } catch (err) {
    next(err);
  }
});

router.post('/service/:name/stop', requireAuth, requireRole('admin'), async (req, res, next) => {
  try {
    const { name } = req.params;
    const result = await systemService.controlService(name, 'stop');
    res.ok(result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
