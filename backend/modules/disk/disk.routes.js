const express = require('express');
const { requireAuth, requireRole } = require('../../middleware/auth');
const { broadcast } = require('../../lib/websocket');
const diskService = require('./disk.service');

const router = express.Router();

// ── List disks (enriched) ──
router.get('/list', requireAuth, async (req, res, next) => {
  try {
    const disks = await diskService.listDisks();
    res.ok(disks);
  } catch (err) {
    next(err);
  }
});

// Alias
router.get('/disks', requireAuth, async (req, res, next) => {
  try {
    const disks = await diskService.listDisks();
    res.ok(disks);
  } catch (err) {
    next(err);
  }
});

// ── Disk usage (byte-level) ──
router.get('/usage', requireAuth, async (req, res, next) => {
  try {
    const usage = await diskService.getDiskUsage();
    res.ok(usage);
  } catch (err) {
    next(err);
  }
});

// ── Create partition (GPT: full / custom / append) ──
router.post('/partition/create', requireAuth, requireRole('admin'), async (req, res, next) => {
  try {
    const { device, confirm, mode, partitions, appendSizeMB } = req.body;
    if (!device) return res.status(400).json({ success: false, error: 'INVALID_INPUT', message: 'device is required' });
    const result = await diskService.createPartition(device, confirm, { mode, partitions, appendSizeMB });
    broadcast('disk:partition_created', result);
    res.ok(result);
  } catch (err) {
    if (['CONFIRMATION_REQUIRED', 'SYSTEM_DISK', 'DISK_MOUNTED', 'NO_FREE_SPACE', 'INVALID_MODE', 'PARTITION_TOO_LARGE', 'INVALID_PARTITION_SIZE', 'PARTITION_FAILED'].includes(err.code)) {
      return res.status(400).json({ success: false, error: err.code, message: err.message });
    }
    next(err);
  }
});

// ── Format partition ──
router.post('/partition/format', requireAuth, requireRole('admin'), async (req, res, next) => {
  try {
    const { partition, fstype = 'ext4', confirm } = req.body;
    if (!partition) return res.status(400).json({ success: false, error: 'INVALID_INPUT', message: 'partition is required' });
    const result = await diskService.formatPartition(partition, fstype, confirm);
    broadcast('disk:formatted', result);
    res.ok(result);
  } catch (err) {
    if (['CONFIRMATION_REQUIRED', 'SYSTEM_DISK', 'PARTITION_MOUNTED', 'INVALID_PARTITION', 'INVALID_FILESYSTEM'].includes(err.code)) {
      return res.status(400).json({ success: false, error: err.code, message: err.message });
    }
    next(err);
  }
});

// ── Mount partition ──
router.post('/partition/mount', requireAuth, requireRole('admin'), async (req, res, next) => {
  try {
    const { partition, mountpoint, fstype = 'auto' } = req.body;
    if (!partition || !mountpoint) {
      return res.status(400).json({ success: false, error: 'INVALID_INPUT', message: 'partition and mountpoint are required' });
    }
    const result = await diskService.mountPartition(partition, mountpoint, fstype);
    broadcast('disk:mounted', result);
    res.ok(result);
  } catch (err) {
    if (err.code) return res.status(400).json({ success: false, error: err.code, message: err.message });
    next(err);
  }
});

// Alias: /mount
router.post('/mount', requireAuth, requireRole('admin'), async (req, res, next) => {
  try {
    const { device, partition, mountpoint, fstype = 'auto' } = req.body;
    const part = partition || device;
    if (!part || !mountpoint) {
      return res.status(400).json({ success: false, error: 'INVALID_INPUT', message: 'device/partition and mountpoint are required' });
    }
    const result = await diskService.mountPartition(part, mountpoint, fstype);
    broadcast('disk:mounted', result);
    res.ok(result);
  } catch (err) {
    if (err.code) return res.status(400).json({ success: false, error: err.code, message: err.message });
    next(err);
  }
});

// ── Unmount partition ──
router.post('/partition/unmount', requireAuth, requireRole('admin'), async (req, res, next) => {
  try {
    const { mountpoint } = req.body;
    if (!mountpoint) return res.status(400).json({ success: false, error: 'INVALID_INPUT', message: 'mountpoint is required' });
    const result = await diskService.unmountPartition(mountpoint);
    broadcast('disk:unmounted', result);
    res.ok(result);
  } catch (err) {
    if (err.code) return res.status(400).json({ success: false, error: err.code, message: err.message });
    next(err);
  }
});

// Alias: /unmount
router.post('/unmount', requireAuth, requireRole('admin'), async (req, res, next) => {
  try {
    const { mountpoint, device } = req.body;
    const mp = mountpoint || device;
    if (!mp) return res.status(400).json({ success: false, error: 'INVALID_INPUT', message: 'mountpoint is required' });
    const result = await diskService.unmountPartition(mp);
    broadcast('disk:unmounted', result);
    res.ok(result);
  } catch (err) {
    if (err.code) return res.status(400).json({ success: false, error: err.code, message: err.message });
    next(err);
  }
});

// ── SMART health ──
router.get('/smart/:device', requireAuth, async (req, res, next) => {
  try {
    const result = await diskService.getSmartStatus(req.params.device);
    res.ok(result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
