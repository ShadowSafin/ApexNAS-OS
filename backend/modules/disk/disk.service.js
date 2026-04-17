const fs = require('fs');
const path = require('path');
const os = require('os');
const { execute, ExecutorError } = require('../../lib/executor');
const logger = require('../../lib/logger');
const {
  validateDeviceName,
  validateMountpoint,
  validateFilesystem,
  parseBlockDeviceJson,
} = require('./disk.util');
const fstab = require('./fstab');

class DiskError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

/**
 * Detect the system disk (where / is mounted).
 * Returns the parent disk name (e.g., "nvme0n1" or "sda").
 */
async function getSystemDisk() {
  try {
    const { stdout } = await execute('lsblk', ['-n', '-o', 'PKNAME', '-J', '/'], { timeout: 5000 });
    const parsed = JSON.parse(stdout);
    if (parsed.blockdevices && parsed.blockdevices[0]) {
      return parsed.blockdevices[0].pkname || null;
    }
    return null;
  } catch {
    // Fallback: find which disk has / mounted
    try {
      const { stdout } = await execute('df', ['--output=source', '/'], { timeout: 5000 });
      const lines = stdout.trim().split('\n');
      if (lines.length >= 2) {
        // e.g. /dev/nvme0n1p4 → nvme0n1
        const devName = lines[1].trim().replace('/dev/', '');
        // Strip partition suffix: sda1→sda, nvme0n1p4→nvme0n1
        return devName.replace(/p?\d+$/, '');
      }
    } catch { /* give up */ }
    return null;
  }
}

/**
 * List all physical disks with enriched data.
 * Uses byte-level output for consistent parsing.
 */
async function listDisks() {
  try {
    const { stdout } = await execute('lsblk', [
      '-J', '-b',
      '-o', 'NAME,SIZE,TYPE,FSTYPE,MOUNTPOINT,UUID,MODEL,SERIAL,TRAN,RO,RM'
    ], { timeout: 10000 });

    const parsed = JSON.parse(stdout);
    if (!parsed.blockdevices) return [];

    // Detect system disk
    const systemDisk = await getSystemDisk();

    // Filter to real block devices: disk + part + raid, exclude loop/rom
    const disks = parsed.blockdevices.filter(d =>
      d.type === 'disk' && !d.name.startsWith('loop')
    );

    // Enrich all disks in parallel (SMART checks run concurrently)
    const enriched = await Promise.all(disks.map(async (disk) => {
      const isSystem = systemDisk && disk.name === systemDisk;

      // SMART health — 2s timeout, non-blocking
      let health = 'unknown';
      try {
        const { stdout: smartOut } = await execute('smartctl', ['-H', `/dev/${disk.name}`], { timeout: 2000 });
        if (smartOut.includes('PASSED')) health = 'healthy';
        else if (smartOut.includes('FAILED')) health = 'failing';
      } catch {
        health = 'unavailable';
      }

      return {
        name: disk.name,
        device: `/dev/${disk.name}`,
        size: disk.size || 0,
        sizeFormatted: formatBytes(disk.size || 0),
        type: disk.type,
        model: (disk.model || '').trim() || 'Unknown',
        serial: (disk.serial || '').trim() || 'N/A',
        transport: disk.tran || 'N/A',
        readonly: !!disk.ro,
        removable: !!disk.rm,
        isSystem,
        health,
        children: (disk.children || []).map(part => ({
          name: part.name,
          device: `/dev/${part.name}`,
          size: part.size || 0,
          sizeFormatted: formatBytes(part.size || 0),
          type: part.type,
          fstype: part.fstype || null,
          mountpoint: part.mountpoint || null,
          uuid: part.uuid || null,
        }))
      };
    }));

    logger.info('Listed disks', { count: enriched.length, systemDisk });
    return enriched;
  } catch (err) {
    logger.error('Failed to list disks', { error: err.message });
    throw new DiskError('DISK_LIST_FAILED', 'Cannot list disks');
  }
}

/**
 * Get disk usage with byte-level output for accurate parsing.
 */
async function getDiskUsage() {
  try {
    const { stdout } = await execute('df', ['-B1', '--output=source,size,used,avail,pcent,target'], { timeout: 10000 });
    const lines = stdout.trim().split('\n').slice(1); // skip header
    const usage = [];

    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      if (parts.length < 6) continue;

      const source = parts[0];
      // Skip non-physical: tmpfs, devtmpfs, udev, etc.
      if (!source.startsWith('/dev/') || source.includes('loop')) continue;

      usage.push({
        filesystem: source,
        total: parseInt(parts[1], 10) || 0,
        used: parseInt(parts[2], 10) || 0,
        available: parseInt(parts[3], 10) || 0,
        usePercent: parts[4] || '0%',
        mountpoint: parts.slice(5).join(' ')
      });
    }

    logger.info('Retrieved disk usage', { count: usage.length });
    return usage;
  } catch (err) {
    logger.error('Failed to get disk usage', { error: err.message });
    throw new DiskError('USAGE_FAILED', 'Cannot retrieve disk usage');
  }
}

/**
 * Create partition on disk (full-disk GPT partition).
 * Requires disk to not be mounted and not be the system disk.
 */
async function createPartition(device, confirm = '') {
  const fullDevice = device.startsWith('/dev/') ? device : `/dev/${device}`;
  const bareName = device.replace(/^\/dev\//, '');

  if (!validateDeviceName(bareName)) {
    throw new DiskError('INVALID_DEVICE', `Invalid device name: ${device}`);
  }

  // Safety: Check system disk
  const systemDisk = await getSystemDisk();
  if (systemDisk && bareName === systemDisk) {
    throw new DiskError('SYSTEM_DISK', 'Cannot partition the system disk');
  }

  // Safety: Check if any partition on this disk is mounted
  try {
    const { stdout } = await execute('lsblk', ['-n', '-o', 'MOUNTPOINT', fullDevice], { timeout: 5000 });
    const mounts = stdout.trim().split('\n').filter(m => m.trim() && m.trim() !== '');
    if (mounts.length > 0) {
      throw new DiskError('DISK_MOUNTED', `Cannot partition: disk has mounted partitions`);
    }
  } catch (err) {
    if (err.code === 'DISK_MOUNTED' || err.code === 'SYSTEM_DISK') throw err;
    // lsblk error is non-fatal for unmounted disks
  }

  // Confirmation required
  if (confirm !== 'YES_PARTITION_DISK') {
    throw new DiskError('CONFIRMATION_REQUIRED', 'Send confirm: "YES_PARTITION_DISK"');
  }

  try {
    // Create GPT label
    await execute('parted', [fullDevice, '--script', 'mklabel', 'gpt'], { timeout: 15000 });
    // Create single partition spanning full disk
    await execute('parted', [fullDevice, '--script', 'mkpart', 'primary', '0%', '100%'], { timeout: 15000 });

    logger.info('Partition created on full disk', { device: fullDevice });

    // Determine partition name
    const partName = bareName.match(/\d$/) ? `${fullDevice}p1` : `${fullDevice}1`;

    return {
      device: fullDevice,
      partition: partName,
      status: 'created',
      message: `GPT partition created on ${fullDevice}`
    };
  } catch (err) {
    logger.error('Failed to create partition', { device: fullDevice, error: err.message });
    throw new DiskError('PARTITION_FAILED', `Cannot create partition: ${err.message}`);
  }
}

/**
 * Format a partition with a filesystem.
 */
async function formatPartition(partition, fstype = 'ext4', confirm = '') {
  const fullPartition = partition.startsWith('/dev/') ? partition : `/dev/${partition}`;
  const bareName = partition.replace(/^\/dev\//, '');

  if (!validateDeviceName(bareName)) {
    throw new DiskError('INVALID_PARTITION', `Invalid partition name: ${partition}`);
  }

  if (!validateFilesystem(fstype)) {
    throw new DiskError('INVALID_FILESYSTEM', `Unsupported filesystem: ${fstype}`);
  }

  // Safety: System disk check
  const systemDisk = await getSystemDisk();
  const parentDisk = bareName.replace(/p?\d+$/, '');
  if (systemDisk && parentDisk === systemDisk) {
    throw new DiskError('SYSTEM_DISK', 'Cannot format a partition on the system disk');
  }

  // Safety: Must not be mounted
  try {
    const { stdout } = await execute('lsblk', ['-n', '-o', 'MOUNTPOINT', fullPartition], { timeout: 5000 });
    const mountpoint = stdout.trim();
    if (mountpoint && mountpoint !== '') {
      throw new DiskError('PARTITION_MOUNTED', `Cannot format: mounted at ${mountpoint}`);
    }
  } catch (err) {
    if (err.code === 'PARTITION_MOUNTED' || err.code === 'SYSTEM_DISK') throw err;
  }

  // Confirmation required
  if (confirm !== 'YES_FORMAT_DEVICE') {
    throw new DiskError('CONFIRMATION_REQUIRED', 'Send confirm: "YES_FORMAT_DEVICE"');
  }

  const cmd = `mkfs.${fstype}`;
  const args = fstype === 'xfs' ? ['-f', fullPartition] : ['-F', fullPartition];

  try {
    await execute(cmd, args, { timeout: 120000 });
    logger.info('Partition formatted', { partition: fullPartition, fstype });
    return { partition: fullPartition, fstype, status: 'formatted' };
  } catch (err) {
    logger.error('Failed to format', { partition: fullPartition, error: err.message });
    throw new DiskError('FORMAT_FAILED', `Cannot format: ${err.message}`);
  }
}

/**
 * Mount partition under /mnt/storage.
 */
async function mountPartition(partition, mountpoint, fstype = 'auto') {
  const fullPartition = partition.startsWith('/dev/') ? partition : `/dev/${partition}`;
  const bareName = partition.replace(/^\/dev\//, '');

  if (!validateDeviceName(bareName)) {
    throw new DiskError('INVALID_PARTITION', 'Invalid partition name');
  }

  if (!validateMountpoint(mountpoint)) {
    throw new DiskError('INVALID_MOUNTPOINT', 'Mountpoint must start with /mnt/');
  }

  // Check if already mounted
  try {
    const { stdout } = await execute('lsblk', ['-n', '-o', 'MOUNTPOINT', fullPartition], { timeout: 5000 });
    const existing = stdout.trim();
    if (existing && existing !== '') {
      throw new DiskError('PARTITION_ALREADY_MOUNTED', `Already mounted at ${existing}`);
    }
  } catch (err) {
    if (err.code === 'PARTITION_ALREADY_MOUNTED') throw err;
  }

  // Check if mountpoint already in use
  try {
    const { stdout } = await execute('findmnt', ['-n', '-o', 'SOURCE', mountpoint], { timeout: 5000 });
    if (stdout.trim()) {
      throw new DiskError('MOUNTPOINT_IN_USE', `Mountpoint in use by ${stdout.trim()}`);
    }
  } catch (err) {
    if (err.code === 'MOUNTPOINT_IN_USE') throw err;
    // findmnt returns error if not mounted — that's what we want
  }

  try {
    await fs.promises.mkdir(mountpoint, { recursive: true });
    await execute('mount', ['-t', fstype, fullPartition, mountpoint], { timeout: 10000 });
    logger.info('Partition mounted', { partition: fullPartition, mountpoint });

    // Get UUID for persistent mount
    let uuid = '';
    try {
      const { stdout } = await execute('blkid', ['-s', 'UUID', '-o', 'value', fullPartition], { timeout: 5000 });
      uuid = stdout.trim();
    } catch { /* uuid optional */ }

    // Add to fstab for boot persistence
    if (uuid) {
      try {
        fstab.addEntry(
          `UUID=${uuid}`, mountpoint, fstype,
          'defaults,nofail,x-systemd.device-timeout=5', '0', '0'
        );
        logger.info('fstab entry added', { uuid, mountpoint });
      } catch (fstabErr) {
        // Rollback mount if fstab fails
        logger.error('fstab write failed, rolling back mount', { error: fstabErr.message });
        try { await execute('umount', [mountpoint], { timeout: 10000 }); } catch { /* best effort */ }
        throw new DiskError('MOUNT_FSTAB_FAILED', 'Mount succeeded but fstab write failed — rolled back');
      }
    }

    return { partition: fullPartition, mountpoint, fstype, uuid, status: 'mounted' };
  } catch (err) {
    if (err.code) throw err; // re-throw DiskErrors
    logger.error('Mount failed', { partition: fullPartition, error: err.message });
    throw new DiskError('MOUNT_FAILED', `Cannot mount: ${err.message}`);
  }
}

/**
 * Unmount partition and clean fstab.
 */
async function unmountPartition(mountpoint) {
  if (!validateMountpoint(mountpoint)) {
    throw new DiskError('INVALID_MOUNTPOINT', 'Mountpoint must start with /mnt/');
  }

  try {
    await execute('umount', [mountpoint], { timeout: 10000 });
    logger.info('Partition unmounted', { mountpoint });

    try {
      fstab.removeByMountpoint(mountpoint);
    } catch (fstabErr) {
      logger.warn('Failed to remove fstab entry', { error: fstabErr.message });
    }

    return { mountpoint, status: 'unmounted' };
  } catch (err) {
    logger.error('Unmount failed', { mountpoint, error: err.message });
    throw new DiskError('DEVICE_BUSY', `Cannot unmount: device busy`);
  }
}

/**
 * Get SMART health status for a device.
 */
async function getSmartStatus(device) {
  const bare = device.replace(/^\/dev\//, '');
  if (!validateDeviceName(bare)) {
    throw new DiskError('INVALID_DEVICE', 'Invalid device name');
  }

  const devPath = device.startsWith('/dev/') ? device : `/dev/${device}`;
  try {
    const { stdout } = await execute('smartctl', ['-H', devPath], { timeout: 15000 });
    const isHealthy = stdout.includes('PASSED');
    return { device: devPath, healthy: isHealthy, output: stdout };
  } catch {
    return { device: devPath, healthy: null, error: 'SMART not available' };
  }
}

// ── Helpers ──────────────────────────────────────────────────────────

function formatBytes(bytes, decimals = 1) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(decimals)} ${sizes[i]}`;
}

module.exports = {
  DiskError,
  listDisks,
  getDiskUsage,
  createPartition,
  formatPartition,
  mountPartition,
  unmountPartition,
  getSmartStatus,
  getSystemDisk
};
