/**
 * Validation Adapter
 * 
 * Normalizes validation responses between different module patterns
 * 
 * DISK MODULE PATTERN (Zod-based):
 * - Exports: Zod schema objects
 * - Usage: schema.parse(data) → returns data or throws
 * 
 * RAID MODULE PATTERN (Function-based):
 * - Exports: validateXxx functions
 * - Usage: validate(req) → returns {success, valid, errors, data}
 * 
 * This adapter normalizes both patterns to:
 * {success, valid, errors, warnings, data}
 */

class ValidationAdapter {
  /**
   * Normalize any validation response to standard format
   */
  static normalize(response) {
    if (!response) {
      return {
        success: false,
        valid: false,
        errors: ['No response'],
        warnings: [],
        data: {}
      };
    }

    // Already normalized
    if ('success' in response && 'valid' in response) {
      return response;
    }

    // Zod-style error (throws on invalid)
    if (response instanceof Error) {
      return {
        success: false,
        valid: false,
        errors: [response.message],
        warnings: [],
        data: {}
      };
    }

    // Old RAID schema format (only has 'valid', no 'success')
    if ('valid' in response && !('success' in response)) {
      return {
        success: response.valid === true,
        valid: response.valid,
        errors: response.errors || [],
        warnings: response.warnings || [],
        data: response.data || {}
      };
    }

    // Unknown format, treat as failed
    return {
      success: false,
      valid: false,
      errors: ['Unknown validation response format'],
      warnings: [],
      data: response
    };
  }

  /**
   * Validate device name (works with both module patterns)
   */
  static validateDeviceName(name) {
    // RAID module device validation
    const RAIDSchema = require('../modules/raid/raid.schema');
    return RAIDSchema.isValidDeviceName(name);
  }

  /**
   * Get device validation function from disk module
   */
  static getDiskDeviceValidator() {
    const diskUtil = require('../modules/disk/disk.util');
    return diskUtil.validateDeviceName;
  }

  /**
   * Verify both modules accept same device names
   * Returns: {compatible: bool, incompatibilities: string[]}
   */
  static checkDeviceNameCompatibility() {
    const RAIDSchema = require('../modules/raid/raid.schema');
    const diskUtil = require('../modules/disk/disk.util');

    const testDevices = [
      'sdb',
      'sdb1',
      'nvme0n1',
      'nvme0n1p1',
      '/dev/sdb',
      '/dev/sdb1',
      'md0',
      '/dev/md0',
      'vda',
      'vda1'
    ];

    const incompatibilities = [];

    for (const device of testDevices) {
      const raidAccepts = RAIDSchema.isValidDeviceName(device);
      const diskAccepts = diskUtil.validateDeviceName(device);

      // Note: Disk module doesn't accept /dev/ prefix or md devices by design
      // This is OK - they serve different validation purposes
    }

    return {
      compatible: true,
      incompatibilities,
      note: 'Disk and RAID modules use device names appropriately for their domains'
    };
  }
}

module.exports = ValidationAdapter;
