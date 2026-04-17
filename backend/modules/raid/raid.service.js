/**
 * RAID Service
 * 
 * Core RAID management operations with safety-first approach:
 * - All destructive operations require explicit confirmation
 * - Simulation mode for dry-run testing
 * - Comprehensive validation and error handling
 */

const { execute } = require('../../lib/executor');
const logger = require('../../lib/logger');
const RAIDGuard = require('./raid.guard');
const RAIDParser = require('./raid.parser');
const RAIDSchema = require('./raid.schema');

class RAIDService {
  /**
   * List all RAID arrays
   * Returns: array of arrays with status and health
   */
  static async listArrays() {
    try {
      logger.debug('RAID Service: Listing arrays');

      // Read from /proc/mdstat
      let arrays = [];
      try {
        arrays = await RAIDParser.readProcMdstat();
      } catch (err) {
        logger.warn('Could not read /proc/mdstat', { error: err.message });
      }

      // Enhance with mdadm details
      for (const array of arrays) {
        try {
          const details = await RAIDParser.getMdadmDetail(array.name);
          if (details && details.uuid) {
            array.uuid = details.uuid;
            array.creationTime = details.creationTime;
            array.eventCount = details.eventCount;
          }
        } catch (err) {
          logger.warn(`Could not get mdadm details for ${array.name}`, { error: err.message });
        }
      }

      logger.info('Listed RAID arrays', { count: arrays.length });
      return {
        success: true,
        arrays: arrays,
        count: arrays.length
      };
    } catch (err) {
      logger.error('Failed to list RAID arrays', { error: err.message });
      return {
        success: false,
        error: 'FAILED_TO_LIST_ARRAYS',
        message: err.message
      };
    }
  }

  /**
   * Create RAID array (WITH SAFETY: simulation + confirmation)
   * 
   * CRITICAL: All destructive operations go through guard system
   */
  static async createArray(params) {
    const { name, level, devices, simulation = false, confirm = '' } = params;

    try {
      logger.info('RAID Service: Create array request', { name, level, simulation, deviceCount: devices.length });

      // Step 1: Validate request format
      if (!Array.isArray(devices) || devices.length === 0) {
        return {
          success: false,
          error: 'INVALID_INPUT',
          message: 'devices must be non-empty array'
        };
      }

      // Step 2: CRITICAL - Run through safety guard
      const validation = await RAIDGuard.validateOperation('CREATE', {
        devices,
        level,
        simulation,
        confirm
      });

      RAIDGuard.logValidation('CREATE', validation);

      // In simulation mode, non-existent devices are OK (just preview mode)
      // But in real mode, all validations must pass
      const hasRealErrors = validation.errors.filter(e => !e.includes('DEVICE_NOT_FOUND'));
      
      if (!simulation && hasRealErrors.length > 0) {
        return {
          success: false,
          error: 'UNSAFE_OPERATION',
          message: 'Operation blocked by safety guard',
          errors: hasRealErrors,
          checks: validation.checks
        };
      }

      if (!simulation && !validation.safe && validation.errors.length > 0) {
        return {
          success: false,
          error: 'UNSAFE_OPERATION',
          message: 'Operation blocked by safety guard',
          errors: validation.errors,
          checks: validation.checks
        };
      }

      // Step 3: Build mdadm command
      const deviceList = devices.join(' ');
      const minorNumber = this.extractMinorNumber(name);
      const raidDevices = devices.length;

      const command = `mdadm --create /dev/${name} --level=${level} --raid-devices=${raidDevices} ${deviceList}`;

      logger.info('RAID Service: Command ready', { command, simulation });

      // Step 4: SIMULATION MODE (default for real operations with confirmation)
      if (simulation || (confirm && confirm !== 'YES_DESTROY_DATA')) {
        logger.info('RAID Service: Simulation mode - not executing', { command });
        return {
          success: true,
          simulation: true,
          command: command,
          validated: true,
          warnings: validation.warnings,
          checks: validation.checks,
          message: 'Simulation successful - no arrays created'
        };
      }

      // Step 5: REAL EXECUTION (only if confirm token is present)
      if (confirm !== 'YES_DESTROY_DATA') {
        return {
          success: false,
          error: 'CONFIRMATION_REQUIRED',
          message: 'Confirmation token required for real operations'
        };
      }

      logger.warn('RAID Service: EXECUTING DESTRUCTIVE OPERATION', { name, command });

      try {
        const arrayDev = `/dev/${name}`;
        await execute('mdadm', [
          '--create', arrayDev,
          `--level=${level}`,
          `--raid-devices=${raidDevices}`,
          '--run',
          ...devices
        ], { timeout: 60000 });

        logger.info('RAID Service: Array created successfully', { name });
        return {
          success: true,
          created: true,
          name: arrayDev,
          level: level,
          devices: devices,
          message: `RAID ${level} array ${name} created`
        };
      } catch (execErr) {
        logger.error('RAID Service: Create array failed', { error: execErr.message });
        return {
          success: false,
          error: 'CREATE_FAILED',
          message: execErr.message
        };
      }
    } catch (err) {
      logger.error('RAID Service: Create array error', { error: err.message });
      return {
        success: false,
        error: 'CREATE_ERROR',
        message: err.message
      };
    }
  }

  /**
   * Stop RAID array
   * Default: simulation mode
   */
  static async stopArray(params) {
    const { name, simulation = true } = params;

    try {
      logger.info('RAID Service: Stop array request', { name, simulation });

      // Normalize name
      const arrayName = name.startsWith('/dev/') ? name : `/dev/${name}`;

      // Validate
      const validation = await RAIDGuard.validateOperation('STOP', {
        name: arrayName,
        simulation
      });

      if (!validation.safe) {
        return {
          success: false,
          error: 'UNSAFE_OPERATION',
          message: 'Operation blocked by safety guard',
          errors: validation.errors
        };
      }

      const command = `mdadm --stop ${arrayName}`;

      // Simulation mode
      if (simulation) {
        logger.info('RAID Service: Stop simulation', { command });
        return {
          success: true,
          simulation: true,
          command: command,
          message: `Array ${arrayName} would be stopped`
        };
      }

      // Real execution
      logger.warn('RAID Service: STOPPING ARRAY', { arrayName });

      try {
        await execute('mdadm', ['--stop', arrayName], { timeout: 10000 });
        logger.info('RAID Service: Array stopped', { arrayName });
        return {
          success: true,
          stopped: true,
          name: arrayName,
          message: `Array ${arrayName} stopped`
        };
      } catch (execErr) {
        logger.error('RAID Service: Stop failed', { error: execErr.message });
        return {
          success: false,
          error: 'STOP_FAILED',
          message: execErr.message
        };
      }
    } catch (err) {
      logger.error('RAID Service: Stop array error', { error: err.message });
      return {
        success: false,
        error: 'STOP_ERROR',
        message: err.message
      };
    }
  }

  /**
   * Remove RAID metadata (VERY DESTRUCTIVE - requires confirmation)
   */
  static async removeMetadata(params) {
    const { devices = [], simulation = false, confirm = '' } = params;

    try {
      logger.info('RAID Service: Remove metadata request', { simulation, deviceCount: devices.length });

      // Validate
      const validation = await RAIDGuard.validateOperation('REMOVE', {
        devices,
        simulation,
        confirm
      });

      RAIDGuard.logValidation('REMOVE', validation);

      if (!validation.safe) {
        return {
          success: false,
          error: 'UNSAFE_OPERATION',
          message: 'Operation blocked by safety guard',
          errors: validation.errors
        };
      }

      // Simulation mode
      if (simulation) {
        const commands = devices.map(d => {
          const device = d.startsWith('/dev/') ? d : `/dev/${d}`;
          return `mdadm --zero-superblock ${device}`;
        });

        logger.info('RAID Service: Remove metadata simulation', { commandCount: commands.length });
        return {
          success: true,
          simulation: true,
          commands: commands,
          message: `Metadata would be removed from ${devices.length} device(s)`
        };
      }

      // Real execution (requires confirmation)
      if (confirm !== 'YES_DESTROY_DATA') {
        return {
          success: false,
          error: 'CONFIRMATION_REQUIRED',
          message: 'Confirmation token required for metadata removal'
        };
      }

      logger.warn('RAID Service: REMOVING METADATA - DESTRUCTIVE OPERATION', { devices });

      // Execute removal for each device
      const results = [];

      for (const device of devices) {
        const cleanDevice = device.startsWith('/dev/') ? device : `/dev/${device}`;
        const command = `mdadm --zero-superblock ${cleanDevice}`;

        try {
          await execute('mdadm', ['--zero-superblock', cleanDevice], { timeout: 5000 });
          logger.info('RAID Service: Metadata removed', { device: cleanDevice });
          results.push({ device: cleanDevice, success: true });
        } catch (execErr) {
          logger.error('RAID Service: Metadata removal failed', { device: cleanDevice, error: execErr.message });
          results.push({ device: cleanDevice, success: false, error: execErr.message });
        }
      }

      return {
        success: results.every(r => r.success),
        removed: true,
        results: results,
        message: `Metadata removed from ${devices.length} device(s)`
      };
    } catch (err) {
      logger.error('RAID Service: Remove metadata error', { error: err.message });
      return {
        success: false,
        error: 'REMOVE_ERROR',
        message: err.message
      };
    }
  }

  /**
   * Get array status
   */
  static async getStatus(name) {
    try {
      logger.debug('RAID Service: Get status', { name });

      const arrayName = name.startsWith('/dev/') ? name : `/dev/${name}`;

      // Get from mdstat
      const arrays = await RAIDParser.readProcMdstat();
      const array = arrays.find(a => a.name === arrayName);

      if (!array) {
        return {
          success: false,
          error: 'ARRAY_NOT_FOUND',
          message: `Array ${arrayName} not found`
        };
      }

      // Get detailed info
      const details = await RAIDParser.getMdadmDetail(arrayName);

      return {
        success: true,
        array: { ...array, ...details }
      };
    } catch (err) {
      logger.error('RAID Service: Get status error', { error: err.message });
      return {
        success: false,
        error: 'STATUS_ERROR',
        message: err.message
      };
    }
  }

  /**
   * Helper: Extract minor number from name
   */
  static extractMinorNumber(name) {
    const match = name.match(/\d+$/);
    return match ? parseInt(match[0], 10) : null;
  }
}

module.exports = RAIDService;
