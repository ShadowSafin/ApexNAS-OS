/**
 * Filesystem Service
 * 
 * Core filesystem management:
 * - Create filesystems on devices/RAID arrays
 * - Detect existing filesystems  
 * - Mount filesystems safely
 * - List mounted filesystems with usage data
 * 
 * Safety:
 * - No formatting mounted devices
 * - No system disk operations
 * - Confirmation tokens required
 */

const fs = require('fs');
const path = require('path');
const { execute } = require('../../lib/executor');
const logger = require('../../lib/logger');
const diskService = require('../disk/disk.service');

const STORAGE_ROOT = '/mnt/storage';

class FilesystemError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

class FilesystemService {
  /**
   * Validate device is safe for formatting
   */
  static async validateDeviceSafety(device) {
    const errors = [];
    const checks = {};
    const fullDevice = device.startsWith('/dev/') ? device : `/dev/${device}`;

    // Check 1: Device exists
    checks.deviceExists = fs.existsSync(fullDevice);
    if (!checks.deviceExists) {
      errors.push(`DEVICE_NOT_FOUND: ${fullDevice} does not exist`);
    }

    // Check 2: Device NOT mounted
    try {
      const { stdout } = await execute('lsblk', ['-n', '-o', 'MOUNTPOINT', fullDevice], { timeout: 5000 });
      const mountpoints = stdout.trim().split('\n').filter(m => m.trim());
      checks.notMounted = mountpoints.length === 0;
      if (!checks.notMounted) {
        errors.push(`DEVICE_MOUNTED: Cannot format — mounted at ${mountpoints[0]}`);
      }
    } catch {
      checks.notMounted = true; // assume unmounted if lsblk fails
    }

    // Check 3: Not on system disk
    try {
      const systemDisk = await diskService.getSystemDisk();
      const bareName = device.replace(/^\/dev\//, '');
      const parentDisk = bareName.replace(/p?\d+$/, '');
      checks.notSystemDisk = !(systemDisk && parentDisk === systemDisk);
      if (!checks.notSystemDisk) {
        errors.push('SYSTEM_DISK: Cannot format partition on system disk');
      }
    } catch {
      checks.notSystemDisk = true;
    }

    // Check 4: Already formatted?
    try {
      const { stdout } = await execute('blkid', [fullDevice], { timeout: 5000 });
      checks.alreadyFormatted = stdout.includes('TYPE=');
    } catch {
      checks.alreadyFormatted = false;
    }

    return { safe: errors.length === 0, errors, checks };
  }

  /**
   * Create filesystem on device
   */
  static async createFilesystem(params) {
    const { device, type = 'ext4', confirm = '', simulation = false } = params;

    if (!device) {
      return { success: false, error: 'INVALID_INPUT', message: 'device is required' };
    }

    if (!['ext4', 'xfs', 'btrfs', 'jfs'].includes(type)) {
      return { success: false, error: 'INVALID_FILESYSTEM', message: `Unsupported: ${type}` };
    }

    const safety = await this.validateDeviceSafety(device);

    if (!safety.safe && !simulation) {
      return {
        success: false,
        error: 'UNSAFE_OPERATION',
        message: 'Device not safe for formatting',
        errors: safety.errors,
        checks: safety.checks
      };
    }

    const fullDevice = device.startsWith('/dev/') ? device : `/dev/${device}`;
    const cmd = `mkfs.${type}`;
    const args = type === 'xfs' ? ['-f', fullDevice] : ['-F', fullDevice];

    if (simulation) {
      return {
        success: true,
        simulation: true,
        command: `${cmd} ${args.join(' ')}`,
        validated: true,
        device: fullDevice,
        type,
        checks: safety.checks
      };
    }

    if (confirm !== 'YES_FORMAT_DEVICE') {
      return {
        success: false,
        error: 'CONFIRMATION_REQUIRED',
        message: 'Send confirm: "YES_FORMAT_DEVICE"'
      };
    }

    logger.warn('FILESYSTEM: EXECUTING FORMAT', { device: fullDevice, type });

    try {
      await execute(cmd, args, { timeout: 120000 });
      logger.info('Filesystem created', { device: fullDevice, type });
      return {
        success: true,
        created: true,
        device: fullDevice,
        type,
        message: `Filesystem ${type} created on ${fullDevice}`
      };
    } catch (err) {
      logger.error('Filesystem creation failed', { error: err.message });
      return { success: false, error: 'FORMAT_FAILED', message: err.message };
    }
  }

  /**
   * Detect filesystem type on device
   */
  static async detectFilesystem(device) {
    const fullDevice = device.startsWith('/dev/') ? device : `/dev/${device}`;

    try {
      const { stdout } = await execute('blkid', ['-s', 'TYPE', '-o', 'value', fullDevice], { timeout: 5000 });
      const fstype = stdout.trim();
      return { success: true, device: fullDevice, type: fstype || 'unknown', detected: !!fstype };
    } catch {
      return { success: true, device: fullDevice, type: 'unknown', detected: false };
    }
  }

  /**
   * Mount filesystem under /mnt/storage/<label-or-uuid>
   */
  static async mountFilesystem(params) {
    const { device, label } = params;

    if (!device) {
      return { success: false, error: 'INVALID_INPUT', message: 'device is required' };
    }

    // Generate mount name
    const mountName = label || `vol-${Date.now().toString(36)}`;
    const mountpoint = path.join(STORAGE_ROOT, mountName);

    // Security check
    const normalized = path.normalize(mountpoint);
    if (!normalized.startsWith(STORAGE_ROOT)) {
      return { success: false, error: 'INVALID_PATH', message: 'Must be under ' + STORAGE_ROOT };
    }

    try {
      const result = await diskService.mountPartition(device, mountpoint, 'auto');
      return { success: true, device, mountpoint, ...result };
    } catch (err) {
      return { success: false, error: err.code || 'MOUNT_FAILED', message: err.message };
    }
  }

  /**
   * Unmount filesystem
   */
  static async unmountFilesystem(params) {
    const { mountpoint } = params;

    if (!mountpoint) {
      return { success: false, error: 'INVALID_INPUT', message: 'mountpoint is required' };
    }

    const normalized = path.normalize(mountpoint);
    // Don't unmount core OS paths manually to prevent system breakage
    if (['/', '/boot', '/etc', '/var', '/usr', '/sys', '/proc', '/dev'].includes(normalized)) {
      return { success: false, error: 'INVALID_PATH', message: 'Cannot unmount core OS paths' };
    }

    try {
      const result = await diskService.unmountPartition(mountpoint);
      return { success: true, mountpoint, ...result };
    } catch (err) {
      return { success: false, error: err.code || 'UNMOUNT_FAILED', message: err.message };
    }
  }

  /**
   * List mounted filesystems with usage data.
   * Uses df -T for type column + byte-level output.
   */
  static async listFilesystems() {
    try {
      // df -T -B1: Filesystem Type 1B-blocks Used Available Use% Mounted-on
      const { stdout } = await execute('df', ['-T', '-B1'], { timeout: 10000 });

      const lines = stdout.trim().split('\n').slice(1); // skip header
      const filesystems = [];
      const seen = new Set();

      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        if (parts.length < 7) continue;

        const source = parts[0];
        const fstype = parts[1];
        const target = parts.slice(6).join(' ');

        // Skip non-physical devices
        if (!source.startsWith('/dev/') || source.includes('loop')) continue;
        // Deduplicate
        const key = `${source}:${target}`;
        if (seen.has(key)) continue;
        seen.add(key);

        filesystems.push({
          device: source,
          mountpoint: target,
          fstype,
          size: parseInt(parts[2], 10) || 0,
          used: parseInt(parts[3], 10) || 0,
          available: parseInt(parts[4], 10) || 0,
          usePercent: parts[5] || '0%',
          isStorage: target.startsWith(STORAGE_ROOT)
        });
      }

      return { success: true, filesystems, count: filesystems.length };
    } catch (err) {
      logger.error('List filesystems error', { error: err.message });
      return { success: false, error: 'LIST_FAILED', message: err.message };
    }
  }
}

module.exports = {
  FilesystemError,
  FilesystemService,
  STORAGE_ROOT
};
