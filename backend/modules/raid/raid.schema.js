/**
 * RAID Schema Validation
 * 
 * Validates RAID operation requests
 */

const logger = require('../../lib/logger');

class RAIDSchema {
  /**
   * Validate RAID create request
   */
  static validateCreateRequest(req) {
    const { name, level, devices, simulation = false, confirm = '' } = req.body || {};
    const errors = [];
    const warnings = [];

    // Validate name
    if (!name) {
      errors.push('INVALID_INPUT: name is required');
    } else if (!/^md\d+$/.test(name)) {
      errors.push('INVALID_FORMAT: name must be in format mdN (e.g., md0, md1)');
    }

    // Validate RAID level
    if (!level) {
      errors.push('INVALID_INPUT: level is required');
    } else if (!['raid0', 'raid1', 'raid5', 'raid6'].includes(level)) {
      errors.push(`INVALID_RAID_LEVEL: level must be raid0, raid1, raid5, or raid6 (got ${level})`);
    }

    // Validate devices
    if (!devices) {
      errors.push('INVALID_INPUT: devices array is required');
    } else if (!Array.isArray(devices)) {
      errors.push('INVALID_FORMAT: devices must be an array');
    } else if (devices.length === 0) {
      errors.push('INVALID_INPUT: devices array cannot be empty');
    } else {
      for (const device of devices) {
        if (!this.isValidDeviceName(device)) {
          errors.push(`INVALID_DEVICE: ${device} is not a valid device name`);
        }
      }

      // Check duplicates
      const unique = new Set(devices);
      if (unique.size !== devices.length) {
        errors.push('INVALID_INPUT: devices array contains duplicates');
      }
    }

    // Validate simulation flag
    if (typeof simulation !== 'boolean') {
      errors.push('INVALID_FORMAT: simulation must be boolean');
    }

    // Validate confirm token (only required for real operations)
    if (!simulation && !confirm) {
      errors.push('CONFIRMATION_REQUIRED: confirm token required for real operations');
    } else if (confirm && confirm !== 'YES_DESTROY_DATA') {
      warnings.push(`Unexpected confirm value: ${confirm} (expected "YES_DESTROY_DATA")`);
    }

    const isValid = errors.length === 0;
    return {
      success: isValid,
      valid: isValid,
      errors,
      warnings,
      data: { name, level, devices, simulation, confirm }
    };
  }

  /**
   * Validate RAID stop request
   */
  static validateStopRequest(req) {
    const { name, simulation = false } = req.body || {};
    const errors = [];

    if (!name) {
      errors.push('INVALID_INPUT: name is required');
    } else if (!/^\/dev\/md\d+$/.test(name) && !/^md\d+$/.test(name)) {
      errors.push(`INVALID_FORMAT: name must be /dev/mdN format (got ${name})`);
    }

    if (typeof simulation !== 'boolean') {
      errors.push('INVALID_FORMAT: simulation must be boolean');
    }

    const isValid = errors.length === 0;
    return {
      success: isValid,
      valid: isValid,
      errors,
      data: { name, simulation }
    };
  }

  /**
   * Validate RAID remove request
   */
  static validateRemoveRequest(req) {
    const { devices = [], simulation = false, confirm = '' } = req.body || {};
    const errors = [];
    const warnings = [];

    if (!Array.isArray(devices) || devices.length === 0) {
      errors.push('INVALID_INPUT: devices array is required and non-empty');
    } else {
      for (const device of devices) {
        if (!this.isValidDeviceName(device)) {
          errors.push(`INVALID_DEVICE: ${device} is not a valid device name`);
        }
      }

      // Check duplicates
      const unique = new Set(devices);
      if (unique.size !== devices.length) {
        errors.push('INVALID_INPUT: devices array contains duplicates');
      }
    }

    if (typeof simulation !== 'boolean') {
      errors.push('INVALID_FORMAT: simulation must be boolean');
    }

    // Validate confirm token (only required for real operations)
    if (!simulation && !confirm) {
      errors.push('CONFIRMATION_REQUIRED: confirm token required for real operations');
    } else if (confirm && confirm !== 'YES_DESTROY_DATA') {
      warnings.push(`Unexpected confirm value: ${confirm} (expected "YES_DESTROY_DATA")`);
    }

    const isValid = errors.length === 0;
    return {
      success: isValid,
      valid: isValid,
      errors,
      warnings,
      data: { devices, simulation, confirm }
    };
  }

  /**
   * Check if device name is valid
   * Valid formats: sdb, sdb1, nvme0n1, nvme0n1p1, /dev/sdb, /dev/sdb1, md0, /dev/md0
   */
  static isValidDeviceName(name) {
    if (!name || typeof name !== 'string') return false;
    
    // Check for obviously invalid characters (spaces, multiple consecutive slashes, double dots)
    if (name.match(/\s/) || name.match(/\/\//) || name.match(/\.\./)) {
      return false;
    }
    
    // Remove /dev/ prefix if present (only at the very start)
    let clean = name;
    if (name.startsWith('/dev/')) {
      clean = name.substring(5); // Remove '/dev/' (5 chars)
    } else if (name.startsWith('/')) {
      // Paths starting with / but not /dev/ are invalid
      return false;
    }
    
    // Must not be empty
    if (clean.trim().length === 0) return false;
    
    // Check format patterns:
    // All valid device names should be alphanumeric (letters and digits)
    // Valid: sdb, sdb1, nvme0n1, nvme0n1p1, md0, vda, vda1
    // Invalid: sdbXY (uppercase), sdb/1 (slash), etc.
    
    const patterns = [
      /^[a-z]+\d*$/, // sdb, sdb1, md0, vda, vda1
      /^nvme\d+n\d+p?\d*$/, // nvme0n1, nvme0n1p1
    ];
    
    return patterns.some(p => p.test(clean));
  }

  /**
   * Minimal validation for list request (should be GET endpoint)
   */
  static validateListRequest(req) {
    // List is read-only, minimal validation needed
    return {
      success: true,
      valid: true,
      errors: [],
      data: {}
    };
  }
}

module.exports = RAIDSchema;
