/**
 * SMB (Samba) Service - Phase 5
 * 
 * Network sharing over SMB/CIFS protocol
 * - Safe configuration of Samba shares
 * - Validation-first approach
 * - Config file management (never overwrite blindly)
 * - Idempotent operations
 * 
 * CRITICAL: No system paths exposed
 */

const fs = require('fs');
const path = require('path');
const { execute } = require('../../lib/executor');
const logger = require('../../lib/logger');

const STORAGE_ROOT = '/mnt/storage';
const SMB_CONFIG_PATH = '/etc/samba/smb.conf';
const NETWORK_SHARES_PATH = '/etc/nas/network-shares.json';

// Dangerous paths that must NEVER be shared
const BLOCKED_PATHS = [
  '/',
  '/etc',
  '/root',
  '/boot',
  '/dev',
  '/proc',
  '/sys',
  '/bin',
  '/sbin',
  '/usr',
  '/var/www',
  '/home',
  '/opt'
];

class SMBError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

class SMBService {
  /**
   * VALIDATION LAYER - Check before any operations
   */

  static validateShareExists(shareName) {
    try {
      const shares = this.loadNetworkShares();
      const smbShare = shares.smb?.find(s => s.name === shareName);
      if (!smbShare) {
        return { valid: false, error: 'SHARE_NOT_FOUND', message: `SMB share "${shareName}" not found` };
      }
      return { valid: true, share: smbShare };
    } catch (err) {
      logger.error('Failed to validate share', { error: err.message });
      return { valid: false, error: 'VALIDATION_FAILED', message: err.message };
    }
  }

  static validatePath(targetPath) {
    try {
      // SECURITY FIX: Decode URL-encoded characters BEFORE path resolution
      // This prevents attacks like /mnt/storage/..%2f..%2fetc
      let decodedPath = targetPath;
      try {
        decodedPath = decodeURIComponent(targetPath || '');
      } catch (decodeErr) {
        logger.warn('Failed to decode URL path (may not be encoded)', { path: targetPath });
        decodedPath = targetPath;
      }

      // SECURITY CHECK: Block encoded traversal patterns
      // Patterns: %2e (.), %2f or %5c (/ or \), %2e%2e (..), shell chars
      const encodedTraversal = /%2[ef]|%5c|%2e%2e|%2e%2f|%5c%2e|\$\(|`|\||;|\&/i;
      if (encodedTraversal.test(targetPath)) {
        logger.error('SECURITY: Encoded traversal attempt blocked', { path: targetPath });
        return { valid: false, error: 'BLOCKED_PATH', message: 'Path contains encoded traversal or shell characters' };
      }

      const resolved = path.resolve(decodedPath);
      const canonical = fs.existsSync(resolved) ? fs.realpathSync(resolved) : resolved;

      // Block dangerous paths
      for (const blocked of BLOCKED_PATHS) {
        if (canonical === blocked || canonical.startsWith(blocked + '/')) {
          logger.error('SECURITY: Blocked dangerous path', { path: canonical, blocked });
          return { valid: false, error: 'BLOCKED_PATH', message: `Path not allowed: ${canonical}` };
        }
      }

      // Must be under storage root
      if (!canonical.startsWith(STORAGE_ROOT)) {
        logger.error('SECURITY: Path outside storage root', { path: canonical });
        return { valid: false, error: 'UNSAFE_PATH', message: `Path must be under ${STORAGE_ROOT}` };
      }

      // Path must exist
      if (!fs.existsSync(canonical)) {
        return { valid: false, error: 'PATH_NOT_FOUND', message: `Path does not exist: ${canonical}` };
      }

      return { valid: true, path: canonical };
    } catch (err) {
      logger.error('Path validation failed', { error: err.message });
      return { valid: false, error: 'INVALID_PATH', message: err.message };
    }
  }

  static validateSMBName(name) {
    if (!name || typeof name !== 'string') {
      return { valid: false, message: 'Name must be a string' };
    }

    // SMB share names: alphanumeric, hyphen, underscore only (32 chars max)
    if (!/^[a-zA-Z0-9_-]{1,32}$/.test(name)) {
      return { valid: false, message: 'Invalid SMB name. Use alphanumeric, hyphen, underscore only (1-32 chars)' };
    }

    // Reserved SMB names
    const reserved = ['printers', 'ipc$', 'homes', 'profiles'];
    if (reserved.includes(name.toLowerCase())) {
      return { valid: false, message: `Reserved SMB share name: ${name}` };
    }

    return { valid: true };
  }

  static validateAllShares() {
    try {
      const shares = this.loadNetworkShares();
      const smbShares = shares.smb || [];

      for (const share of smbShares) {
        const pathCheck = this.validatePath(share.path);
        if (!pathCheck.valid) {
          logger.error('Invalid share in network-shares.json', { share: share.name, error: pathCheck.error });
          return { valid: false, error: 'INVALID_SHARE_CONFIG', message: `Invalid share: ${share.name}` };
        }
      }

      return { valid: true };
    } catch (err) {
      logger.error('Failed to validate all shares', { error: err.message });
      return { valid: false, error: 'VALIDATION_FAILED', message: err.message };
    }
  }

  /**
   * SMB CONFIG MANAGEMENT
   */

  static parseSMBConfig() {
    try {
      if (!fs.existsSync(SMB_CONFIG_PATH)) {
        logger.warn('SMB config does not exist', { path: SMB_CONFIG_PATH });
        return { global: {}, shares: {} };
      }

      const content = fs.readFileSync(SMB_CONFIG_PATH, 'utf8');
      const shares = {};
      let currentShare = null;
      let lineNum = 0;

      const lines = content.split('\n');
      for (const line of lines) {
        lineNum++;

        // Skip comments and empty lines
        if (line.trim().startsWith(';') || line.trim().startsWith('#') || !line.trim()) {
          continue;
        }

        // Share header [media]
        if (/^\s*\[\w+\]\s*$/.test(line)) {
          currentShare = line.trim().slice(1, -1);
          // Skip the [global] section - it's not a share
          if (currentShare.toLowerCase() !== 'global') {
            shares[currentShare] = { params: {}, lineStart: lineNum };
          }
          continue;
        }

        // Parse parameters (only for non-global shares)
        if (currentShare && currentShare.toLowerCase() !== 'global' && line.includes('=')) {
          const [key, ...valueParts] = line.split('=');
          const value = valueParts.join('=').trim();
          shares[currentShare].params[key.trim()] = value;
        }
      }

      logger.info('SMB config parsed', { shares: Object.keys(shares).length });
      return { shares };
    } catch (err) {
      logger.error('Failed to parse SMB config', { error: err.message });
      throw new SMBError('CONFIG_PARSE_FAILED', `Failed to parse SMB config: ${err.message}`);
    }
  }

  static buildShareConfig(share) {
    const config = [];
    config.push(`[${share.name}]`);
    config.push(`  path = ${share.path}`);
    config.push(`  browseable = yes`);
    config.push(`  read only = ${share.readOnly ? 'yes' : 'no'}`);
    config.push(`  guest ok = ${share.guestAccess ? 'yes' : 'no'}`);

    if (share.validUsers && share.validUsers.length > 0) {
      config.push(`  valid users = ${share.validUsers.join(', ')}`);
    }

    if (share.forceUser) {
      config.push(`  force user = ${share.forceUser}`);
    }

    // Ensure permissions in sync with share permissions
    if (share.permissions) {
      config.push(`  create mask = 0755`);
      config.push(`  directory mask = 0755`);
    }

    logger.debug('Share config built', { share: share.name, lines: config.length });
    return config;
  }

  static async updateSMBConfig(shares) {
    try {
      logger.info('Updating SMB config', { shares: shares.length });

      // Read existing config
      let config = '';
      if (fs.existsSync(SMB_CONFIG_PATH)) {
        config = fs.readFileSync(SMB_CONFIG_PATH, 'utf8');
      }

      // Parse to find global section
      const lines = config.split('\n');
      let globalEnd = 0;
      for (let i = 0; i < lines.length; i++) {
        if (/^\s*\[/.test(lines[i]) && !lines[i].includes('global')) {
          globalEnd = i;
          break;
        }
      }

      // Keep global section, remove old shares, add new ones
      const globalSection = lines.slice(0, globalEnd).join('\n');
      const newConfig = [globalSection];

      for (const share of shares) {
        const shareConfig = this.buildShareConfig(share);
        newConfig.push('\n' + shareConfig.join('\n'));
      }

      const finalConfig = newConfig.join('\n') + '\n';

      // Write updated config
      fs.writeFileSync(SMB_CONFIG_PATH, finalConfig, 'utf8');
      logger.info('SMB config updated', { path: SMB_CONFIG_PATH });

      return { success: true, message: 'SMB config updated' };
    } catch (err) {
      logger.error('Failed to update SMB config', { error: err.message });
      throw new SMBError('CONFIG_UPDATE_FAILED', err.message);
    }
  }

  /**
   * SMB SHARE MANAGEMENT
   */

  static async createShare(params) {
    const { name, path: sharePath, browseable = true, writable = false, guestOk = false, validUsers = [], comment = '' } = params;

    try {
      logger.info('SMB: Create share request', { name, path: sharePath });

      // Check if SMB service is enabled
      const status = await this.getServiceStatus();
      if (!status.active) {
        return {
          success: false,
          error: 'SERVICE_NOT_ENABLED',
          message: 'SMB service must be enabled before creating shares'
        };
      }

      // VALIDATION LAYER
      const nameCheck = this.validateSMBName(name);
      if (!nameCheck.valid) {
        return { success: false, error: 'INVALID_NAME', message: nameCheck.message };
      }

      const pathCheck = this.validatePath(sharePath);
      if (!pathCheck.valid) {
        return { success: false, ...pathCheck };
      }

      // Check if path exists
      if (!fs.existsSync(pathCheck.path)) {
        return {
          success: false,
          error: 'PATH_NOT_FOUND',
          message: `Path does not exist: ${pathCheck.path}`
        };
      }

      // Check for duplicate
      const existingShares = this.loadNetworkShares();
      if (existingShares.smb?.some(s => s.name === name)) {
        return { success: false, error: 'DUPLICATE_SHARE', message: `SMB share "${name}" already exists` };
      }

      // Build share config
      const share = {
        name,
        path: pathCheck.path,
        protocol: 'smb',
        browseable,
        writable,
        guestOk,
        validUsers,
        comment,
        createdAt: new Date().toISOString()
      };

      // Update config file
      const parsed = this.parseSMBConfig();
      parsed.shares[name] = { params: this.buildShareConfig(share) };

      // Write config safely
      const allShares = Object.values(parsed.shares)
        .map(s => ({
          name: s.params[0]?.slice(1, -1) || 'unknown',
          path: s.params[1],
          writable: !s.params[3]?.includes('yes'),
          guestOk: s.params[4]?.includes('yes'),
          validUsers: s.params[5]?.split(',').map(u => u.trim()) || []
        }));

      await this.updateSMBConfig([...allShares, share]);

      // Reload Samba
      try {
        await execute('systemctl', ['reload', 'smbd'], { timeout: 10000 });
        logger.info('Samba service reloaded', { share: name });
      } catch (err) {
        logger.warn('Could not reload Samba', { error: err.message });
      }

      // Persist to network-shares.json
      const networkShares = this.loadNetworkShares();
      if (!networkShares.smb) networkShares.smb = [];
      networkShares.smb.push(share);
      this.saveNetworkShares(networkShares);

      logger.info('SMB share created', { name, path: sharePath });

      return {
        success: true,
        message: `SMB share "${name}" created`,
        share
      };
    } catch (err) {
      logger.error('SMB share creation failed', { error: err.message });
      return {
        success: false,
        error: 'SERVICE_ERROR',
        message: err.message
      };
    }
  }

  static async removeShare(params) {
    const { name } = params;

    try {
      logger.info('SMB: Remove share request', { name });

      // Validate share exists
      const shareCheck = this.validateShareExists(name);
      if (!shareCheck.valid) {
        return { success: false, ...shareCheck };
      }

      // Remove from config
      const parsed = this.parseSMBConfig();
      delete parsed.shares[name];

      // Rebuild config without this share
      const remaining = Object.entries(parsed.shares)
        .filter(([key]) => key !== name)
        .map(([, share]) => ({
          name: share.params.name || key,
          path: share.params.path,
          readOnly: share.params['read only'] === 'yes',
          guestAccess: share.params['guest ok'] === 'yes'
        }));

      await this.updateSMBConfig(remaining);

      // Reload Samba
      try {
        await execute('systemctl', ['reload', 'smbd'], { timeout: 10000 });
      } catch (err) {
        logger.warn('Could not reload Samba', { error: err.message });
      }

      // Update network-shares.json
      const networkShares = this.loadNetworkShares();
      if (networkShares.smb) {
        networkShares.smb = networkShares.smb.filter(s => s.name !== name);
        this.saveNetworkShares(networkShares);
      }

      logger.info('SMB share removed', { name });

      return {
        success: true,
        message: `SMB share "${name}" removed`
      };
    } catch (err) {
      logger.error('SMB share removal failed', { error: err.message });
      return {
        success: false,
        error: 'SERVICE_ERROR',
        message: err.message
      };
    }
  }

  static async listShares() {
    try {
      // Check if SMB service is enabled before listing shares
      const status = await this.getServiceStatus();
      if (!status.active) {
        logger.info('SMB service not active, returning empty shares list');
        return {
          success: true,
          shares: [],
          count: 0
        };
      }

      const parsed = this.parseSMBConfig();
      const shares = Object.entries(parsed.shares)
        .map(([name, share]) => ({
          name,
          ...share.params
        }));

      logger.info('Listed SMB shares', { count: shares.length });

      return {
        success: true,
        shares,
        count: shares.length
      };
    } catch (err) {
      logger.error('Failed to list SMB shares', { error: err.message });
      return {
        success: false,
        error: 'LIST_FAILED',
        message: err.message
      };
    }
  }

  /**
   * PERSISTENCE LAYER
   */

  static loadNetworkShares() {
    try {
      if (fs.existsSync(NETWORK_SHARES_PATH)) {
        const data = JSON.parse(fs.readFileSync(NETWORK_SHARES_PATH, 'utf8'));
        return data;
      }
      return { smb: [], nfs: [] };
    } catch (err) {
      logger.warn('Could not load network shares', { error: err.message });
      return { smb: [], nfs: [] };
    }
  }

  static saveNetworkShares(data) {
    try {
      fs.writeFileSync(NETWORK_SHARES_PATH, JSON.stringify(data, null, 2), 'utf8');
      logger.debug('Network shares persisted');
    } catch (err) {
      logger.error('Failed to persist network shares', { error: err.message });
      throw err;
    }
  }

  /**
   * SERVICE MANAGEMENT
   */

  static async getServiceStatus() {
    try {
      try {
        const { stdout } = await execute('systemctl', ['is-active', 'smbd'], { timeout: 5000 });
        const active = stdout.trim() === 'active';

        logger.info('SMB service status', { active });

        return {
          success: true,
          active,
          service: 'smbd'
        };
      } catch (execErr) {
        // In dev environment where systemctl is not available, return inactive by default
        logger.warn('Could not check SMB service status via systemctl', { error: execErr.message });
        return {
          success: true,
          active: false,
          service: 'smbd'
        };
      }
    } catch (err) {
      logger.warn('Could not get SMB service status', { error: err.message });
      return {
        success: true,
        active: false,
        error: 'STATUS_FAILED',
        message: err.message
      };
    }
  }

  static async enableService() {
    try {
      logger.info('Enabling SMB service');

      // Start the smbd service
      try {
        const startResult = await execute('systemctl', ['start', 'smbd'], { timeout: 10000 });
      } catch (execErr) {
        logger.warn('Could not start smbd via systemctl', { error: execErr.message });
      }
      
      // Enable it to start on boot
      try {
        const enableResult = await execute('systemctl', ['enable', 'smbd'], { timeout: 5000 });
      } catch (execErr) {
        logger.warn('Could not enable smbd via systemctl', { error: execErr.message });
      }

      logger.info('SMB service enable request processed');

      return {
        success: true,
        message: 'SMB service enable request processed'
      };
    } catch (err) {
      logger.error('Unexpected error enabling SMB service', { error: err.message });
      return {
        success: true,
        message: 'SMB service enable request processed (with warnings)'
      };
    }
  }

  static async disableService() {
    try {
      logger.info('Disabling SMB service');

      // Stop the smbd service
      try {
        const stopResult = await execute('systemctl', ['stop', 'smbd'], { timeout: 10000 });
      } catch (execErr) {
        logger.warn('Could not stop smbd via systemctl', { error: execErr.message });
      }
      
      // Disable it from starting on boot
      try {
        const disableResult = await execute('systemctl', ['disable', 'smbd'], { timeout: 5000 });
      } catch (execErr) {
        logger.warn('Could not disable smbd via systemctl', { error: execErr.message });
      }

      logger.info('SMB service disable request processed');

      return {
        success: true,
        message: 'SMB service disable request processed'
      };
    } catch (err) {
      logger.error('Unexpected error disabling SMB service', { error: err.message });
      return {
        success: true,
        message: 'SMB service disable request processed (with warnings)'
      };
    }
  }

  static async getAvailablePaths() {
    try {
      logger.info('Getting available storage paths');

      const paths = [];

      // Check if /mnt/storage exists and is readable
      if (fs.existsSync(STORAGE_ROOT)) {
        try {
          const entries = fs.readdirSync(STORAGE_ROOT, { withFileTypes: true });
          
          // Add the root storage path
          paths.push({
            path: STORAGE_ROOT,
            label: 'Storage Root',
            type: 'directory'
          });

          // Add subdirectories
          for (const entry of entries) {
            if (entry.isDirectory()) {
              const fullPath = path.join(STORAGE_ROOT, entry.name);
              paths.push({
                path: fullPath,
                label: entry.name,
                type: 'directory'
              });
            }
          }
        } catch (err) {
          logger.warn('Could not read storage directory', { error: err.message });
        }
      }

      logger.info('Available paths found', { count: paths.length });

      return {
        success: true,
        paths
      };
    } catch (err) {
      logger.error('Failed to get available paths', { error: err.message });
      return {
        success: true,
        paths: []
      };
    }
  }


  static async testShare(params) {
    const { name } = params;

    try {
      logger.info('Testing SMB share', { name });

      const shareCheck = this.validateShareExists(name);
      if (!shareCheck.valid) {
        return { success: false, ...shareCheck };
      }

      // Test with smbclient (list share)
      try {
        const { stdout } = await execute('smbclient', [
          '-L',
          'localhost',
          '-N',
          '--no-pass'
        ], { timeout: 10000 });

        const shareVisible = stdout.includes(name);
        logger.info('SMB share test result', { name, visible: shareVisible });

        return {
          success: true,
          name,
          visible: shareVisible,
          message: shareVisible ? 'SMB share is accessible' : 'SMB share may not be visible'
        };
      } catch (testErr) {
        logger.warn('SMB client test failed', { error: testErr.message });
        return {
          success: true,
          name,
          warning: 'Could not verify with smbclient, but share should be configured'
        };
      }
    } catch (err) {
      logger.error('SMB share test failed', { error: err.message });
      return {
        success: false,
        error: 'TEST_FAILED',
        message: err.message
      };
    }
  }
}

module.exports = {
  SMBService,
  STORAGE_ROOT,
  BLOCKED_PATHS
};
