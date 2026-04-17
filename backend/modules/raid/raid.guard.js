/**
 * RAID Guard System - Safety Layer
 * 
 * CRITICAL: All destructive RAID operations go through this guard.
 * Purpose: Prevent accidental data loss through rigorous validation.
 * 
 * Safety Checks:
 * - Mounted device detection
 * - Active RAID membership
 * - System disk protection
 * - Root device protection
 * - Explicit confirmation requirement
 * - Simulation mode validation
 */

const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const logger = require('../../lib/logger');

// Strict device path pattern — only /dev/<alphanumeric> is allowed. Used as
// defense-in-depth so that even if an upstream caller skips schema validation,
// a malicious device name cannot reach child_process with shell metacharacters.
const DEVICE_PATH_PATTERN = /^\/dev\/[a-zA-Z0-9]+$/;

function isSafeDevicePath(device) {
  return typeof device === 'string' && DEVICE_PATH_PATTERN.test(device);
}

class RAIDGuard {
  /**
   * CRITICAL: Validate all operations for safety
   * 
   * Returns: { safe: boolean, errors: [], warnings: [] }
   */
  static async validateOperation(operation, params = {}) {
    const validation = {
      safe: true,
      errors: [],
      warnings: [],
      checks: {}
    };

    logger.debug('RAID Guard: Validating operation', { operation, params });

    switch (operation) {
      case 'CREATE':
        return this.validateCreate(params, validation);
      case 'STOP':
        return this.validateStop(params, validation);
      case 'REMOVE':
        return this.validateRemove(params, validation);
      default:
        validation.errors.push(`Unknown operation: ${operation}`);
        validation.safe = false;
        return validation;
    }
  }

  /**
   * CRITICAL: Pre-create validation
   * Checks: devices exist, not mounted, not in RAID, not system disk, not root
   */
  static async validateCreate(params, validation) {
    const { devices = [], level = '', simulation = false, confirm = '' } = params;

    // Check 1: Confirmation token (CRITICAL for real operations)
    if (!simulation && confirm !== 'YES_DESTROY_DATA') {
      validation.errors.push('CONFIRMATION_REQUIRED: Must provide confirm="YES_DESTROY_DATA" for real operations');
      validation.safe = false;
    }
    validation.checks.confirmationToken = { required: !simulation, provided: confirm === 'YES_DESTROY_DATA' };

    // Check 2: Simulation mode validation
    if (simulation && confirm !== 'YES_DESTROY_DATA' && confirm !== '') {
      validation.warnings.push('Simulation mode: confirmation token ignored');
    }
    validation.checks.simulationMode = { enabled: simulation };

    // Check 3: Validate each device
    for (const device of devices) {
      const deviceValidation = await this.validateDevice(device);
      
      if (!deviceValidation.valid) {
        validation.errors.push(...deviceValidation.errors);
        validation.safe = false;
      }
      
      if (deviceValidation.warnings.length > 0) {
        validation.warnings.push(...deviceValidation.warnings);
      }

      validation.checks[`device_${device}`] = deviceValidation;
    }

    // Check 4: RAID level validation
    const validLevels = ['raid0', 'raid1', 'raid5', 'raid6'];
    if (!validLevels.includes(level)) {
      validation.errors.push(`INVALID_RAID_LEVEL: ${level} not supported (must be raid0, raid1, raid5, raid6)`);
      validation.safe = false;
    }
    validation.checks.raidLevel = { valid: validLevels.includes(level), level };

    // Check 5: Device count validation (CRITICAL)
    const minDevices = {
      raid0: 2,
      raid1: 2,
      raid5: 3,
      raid6: 4
    };

    if (minDevices[level] && devices.length < minDevices[level]) {
      validation.errors.push(
        `INSUFFICIENT_DEVICES: ${level} requires minimum ${minDevices[level]} devices, got ${devices.length}`
      );
      validation.safe = false;
    }
    validation.checks.deviceCount = { 
      valid: !minDevices[level] || devices.length >= minDevices[level],
      required: minDevices[level],
      provided: devices.length
    };

    return validation;
  }

  /**
   * Validate single device for RAID creation
   * CRITICAL: Check mounted, in RAID, system disk, root device
   */
  static async validateDevice(device) {
    const validation = {
      valid: true,
      errors: [],
      warnings: [],
      checks: {}
    };

    // Parse device name
    const cleanDevice = device.replace(/^\/dev\//, '');
    const fullPath = `/dev/${cleanDevice}`;

    // Check 1: Device exists
    try {
      if (!fs.existsSync(fullPath)) {
        validation.errors.push(`DEVICE_NOT_FOUND: ${fullPath} does not exist`);
        validation.valid = false;
      }
      validation.checks.deviceExists = fs.existsSync(fullPath);
    } catch (err) {
      validation.errors.push(`Error checking device ${fullPath}: ${err.message}`);
      validation.valid = false;
    }

    // Check 2: Device NOT mounted (CRITICAL)
    try {
      const mounted = await this.isDeviceMounted(fullPath);
      if (mounted) {
        validation.errors.push(`DEVICE_MOUNTED: ${fullPath} is currently mounted at ${mounted}`);
        validation.valid = false;
      }
      validation.checks.notMounted = !mounted;
    } catch (err) {
      validation.warnings.push(`Could not verify mount status of ${fullPath}: ${err.message}`);
    }

    // Check 3: Device NOT in another RAID (CRITICAL)
    try {
      const inRAID = await this.isInRAID(fullPath);
      if (inRAID) {
        validation.errors.push(`DEVICE_IN_USE: ${fullPath} is already part of RAID array ${inRAID}`);
        validation.valid = false;
      }
      validation.checks.notInRAID = !inRAID;
    } catch (err) {
      validation.warnings.push(`Could not verify RAID membership of ${fullPath}: ${err.message}`);
    }

    // Check 4: NOT system disk (CRITICAL)
    try {
      const isSystemDisk = await this.isSystemDisk(fullPath);
      if (isSystemDisk) {
        validation.errors.push(`UNSAFE_OPERATION: ${fullPath} is the system disk - cannot use in RAID`);
        validation.valid = false;
      }
      validation.checks.notSystemDisk = !isSystemDisk;
    } catch (err) {
      validation.warnings.push(`Could not verify if ${fullPath} is system disk: ${err.message}`);
    }

    // Check 5: NOT root device (CRITICAL)
    try {
      const isRoot = await this.isRootDevice(fullPath);
      if (isRoot) {
        validation.errors.push(`UNSAFE_OPERATION: ${fullPath} contains root filesystem - cannot use in RAID`);
        validation.valid = false;
      }
      validation.checks.notRootDevice = !isRoot;
    } catch (err) {
      validation.warnings.push(`Could not verify if ${fullPath} is root device: ${err.message}`);
    }

    return validation;
  }

  /**
   * CRITICAL: Check if device is mounted
   * Returns: mount point or false
   */
  static async isDeviceMounted(device) {
    return new Promise((resolve) => {
      if (!isSafeDevicePath(device)) {
        logger.warn('isDeviceMounted: rejecting unsafe device path', { device });
        return resolve(false);
      }
      execFile('lsblk', ['-n', '-o', 'MOUNTPOINT', device], { timeout: 5000 }, (err, stdout) => {
        if (err) {
          return resolve(false);
        }
        const mountpoints = stdout.split('\n').map((l) => l.trim()).filter(Boolean);
        resolve(mountpoints.length > 0 ? mountpoints[0] : false);
      });
    });
  }

  /**
   * CRITICAL: Check if device is in another RAID
   * Returns: RAID name or false
   */
  static async isInRAID(device) {
    return new Promise((resolve) => {
      if (!isSafeDevicePath(device)) {
        logger.warn('isInRAID: rejecting unsafe device path', { device });
        return resolve(false);
      }
      execFile('mdadm', ['--examine', device], { timeout: 5000 }, (err, stdout) => {
        if (err || !stdout) {
          return resolve(false);
        }
        const match = stdout.match(/array\s+(\/dev\/md\d+)/i);
        resolve(match ? match[1] : false);
      });
    });
  }

  /**
   * CRITICAL: Check if device is system disk
   * Returns: boolean
   */
  static async isSystemDisk(device) {
    return new Promise((resolve) => {
      if (!isSafeDevicePath(device)) {
        logger.warn('isSystemDisk: rejecting unsafe device path', { device });
        return resolve(false);
      }
      // Get system disk from / — use df without a shell pipeline so user input
      // can never reach a shell interpreter.
      execFile('df', ['--output=source', '/'], { timeout: 5000 }, (err, stdout) => {
        if (err || !stdout) {
          return resolve(false);
        }
        const lines = stdout.split('\n').map((l) => l.trim()).filter(Boolean);
        // Skip header "Filesystem"
        const source = lines.length > 1 ? lines[1] : '';
        if (!source) {
          return resolve(false);
        }
        const systemDevice = source.replace(/\d+$/, '');
        const checkDevice = device.replace(/\d+$/, '');
        resolve(systemDevice === checkDevice);
      });
    });
  }

  /**
   * CRITICAL: Check if device contains root
   * Returns: boolean
   */
  static async isRootDevice(device) {
    return new Promise((resolve) => {
      if (!isSafeDevicePath(device)) {
        logger.warn('isRootDevice: rejecting unsafe device path', { device });
        return resolve(false);
      }
      execFile('lsblk', ['-n', '-o', 'MOUNTPOINT', device], { timeout: 5000 }, (err, stdout) => {
        if (err || !stdout) {
          return resolve(false);
        }
        const mountpoints = stdout.split('\n').map((l) => l.trim()).filter(Boolean);
        resolve(mountpoints.includes('/'));
      });
    });
  }

  /**
   * Validate STOP operation
   */
  static async validateStop(params, validation) {
    const { name = '', simulation = false } = params;

    if (!name) {
      validation.errors.push('Array name required for stop operation');
      validation.safe = false;
    }

    validation.checks.simulationMode = { enabled: simulation };
    validation.checks.arrayName = { provided: !!name, value: name };

    return validation;
  }

  /**
   * Validate REMOVE metadata operation
   */
  static async validateRemove(params, validation) {
    const { devices = [], simulation = false, confirm = '' } = params;

    // Check confirmation token (CRITICAL for real operations)
    if (!simulation && confirm !== 'YES_DESTROY_DATA') {
      validation.errors.push('CONFIRMATION_REQUIRED: Must provide confirm="YES_DESTROY_DATA" for real operations');
      validation.safe = false;
    }

    validation.checks.confirmationToken = { required: !simulation, provided: confirm === 'YES_DESTROY_DATA' };
    validation.checks.simulationMode = { enabled: simulation };

    // Validate each device
    for (const device of devices) {
      const deviceValidation = await this.validateDevice(device);
      validation.checks[`device_${device}`] = deviceValidation;
    }

    return validation;
  }

  /**
   * Log safety check results
   */
  static logValidation(operation, validation) {
    if (validation.safe) {
      logger.info(`RAID Guard: Operation ${operation} is SAFE`, { checks: validation.checks });
    } else {
      logger.warn(`RAID Guard: Operation ${operation} BLOCKED`, { 
        errors: validation.errors,
        checks: validation.checks
      });
    }
  }
}

module.exports = RAIDGuard;
