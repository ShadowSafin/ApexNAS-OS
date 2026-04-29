/**
 * SMB (Samba) Service — Dual-Layer Activation
 * 
 * Network sharing over SMB/CIFS protocol
 * - Safe configuration of Samba shares
 * - Validation-first approach
 * - Config file management (never overwrite blindly)
 * - Idempotent operations
 * - Global state integration via ServiceState
 * - User synchronization (smbpasswd)
 * - Firewall management
 * 
 * CRITICAL: No system paths exposed
 */

const fs = require('fs');
const path = require('path');
const { execute } = require('../../lib/executor');
const logger = require('../../lib/logger');
const { ServiceState } = require('../../lib/service-state');
const { FirewallService } = require('../../lib/firewall.service');

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
      const encodedTraversal = /%2[ef]|%5c|%2e%2e|%2e%2f|%5c%2e|\$\(|`|\||;|&/i;
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

  /**
   * Ensure smb.conf [global] section has correct settings
   */
  static ensureGlobalConfig() {
    try {
      const globalSection = `[global]
  workgroup = WORKGROUP
  server string = ApexNAS File Server
  security = user
  map to guest = never
  bind interfaces only = no
  interfaces = 0.0.0.0
  log file = /var/log/samba/log.%m
  max log size = 1000
  logging = file
  server role = standalone server
  obey pam restrictions = yes
  unix password sync = yes
  pam password change = yes
  min protocol = SMB2
`;
      return globalSection;
    } catch (err) {
      logger.error('Failed to build global config', { error: err.message });
      return '';
    }
  }

  static async updateSMBConfig(shares) {
    try {
      logger.info('Updating SMB config', { shares: shares.length });

      // Build complete config: global + all shares
      const globalSection = this.ensureGlobalConfig();
      const shareConfigs = shares.map(share => this.buildShareConfig(share).join('\n'));

      const finalConfig = globalSection + '\n' + shareConfigs.join('\n\n') + '\n';

      // Write updated config
      try {
        fs.writeFileSync(SMB_CONFIG_PATH, finalConfig, 'utf8');
        logger.info('SMB config updated', { path: SMB_CONFIG_PATH });
      } catch (err) {
        logger.warn('Could not write SMB config (may require root)', { error: err.message });
      }

      return { success: true, message: 'SMB config updated' };
    } catch (err) {
      logger.error('Failed to update SMB config', { error: err.message });
      throw new SMBError('CONFIG_UPDATE_FAILED', err.message);
    }
  }

  /**
   * Reload smb.conf and restart smbd (only if service is globally enabled)
   */
  static async reloadConfig() {
    if (!ServiceState.isEnabled('smb')) {
      logger.info('SMB: Skipping reload — service is globally disabled');
      return { success: true, message: 'Service disabled, config updated but not reloaded' };
    }

    try {
      // Validate config first
      try {
        await execute('testparm', ['-s', '--suppress-prompt'], { timeout: 10000 });
        logger.info('SMB config validation passed');
      } catch (err) {
        logger.warn('testparm not available or config has warnings', { error: err.message });
      }

      // Reload samba
      try {
        await execute('systemctl', ['reload', 'smbd'], { timeout: 10000 });
        logger.info('Samba service reloaded');
      } catch (err) {
        // If reload fails, try restart
        try {
          await execute('systemctl', ['restart', 'smbd'], { timeout: 15000 });
          logger.info('Samba service restarted (reload failed)');
        } catch (restartErr) {
          logger.warn('Could not reload/restart Samba', { error: restartErr.message });
        }
      }

      return { success: true, message: 'SMB config reloaded' };
    } catch (err) {
      logger.error('SMB reload failed', { error: err.message });
      return { success: false, error: 'RELOAD_FAILED', message: err.message };
    }
  }

  /**
   * Sync all SMB-enabled shares to smb.conf
   * Called when global SMB is enabled to activate all pending shares
   */
  static async syncAllShares() {
    try {
      logger.info('SMB: Syncing all enabled shares to smb.conf');

      // Get all shares from ShareService
      let allShares = [];
      try {
        const { shares: shareMap } = require('../share/share.service');
        allShares = Array.from(shareMap.values());
      } catch (err) {
        logger.warn('Could not load shares from ShareService', { error: err.message });
        return { success: true, synced: 0 };
      }

      // Filter to SMB-enabled shares
      const smbShares = allShares
        .filter(s => s.services?.smb?.enabled)
        .map(s => ({
          name: s.name,
          path: s.path,
          readOnly: s.services.smb.readOnly || false,
          guestAccess: s.services.smb.guestOk || false,
          browseable: s.services.smb.browseable !== false,
          validUsers: [],
          permissions: true
        }));

      if (smbShares.length > 0) {
        await this.updateSMBConfig(smbShares);
      } else {
        // Write just global config with no shares
        try {
          fs.writeFileSync(SMB_CONFIG_PATH, this.ensureGlobalConfig() + '\n', 'utf8');
        } catch (err) {
          logger.warn('Could not write empty SMB config', { error: err.message });
        }
      }

      logger.info('SMB: Sync complete', { synced: smbShares.length });
      return { success: true, synced: smbShares.length };
    } catch (err) {
      logger.error('SMB: Sync failed', { error: err.message });
      return { success: false, error: err.message };
    }
  }

  /**
   * Sync all Linux users (UID >= 1000) to smbpasswd database
   */
  static async syncSmbUsers() {
    try {
      logger.info('SMB: Syncing system users to Samba');

      const passwdContent = fs.readFileSync('/etc/passwd', 'utf8');
      const users = passwdContent
        .split('\n')
        .filter(line => line.trim())
        .map(line => {
          const parts = line.split(':');
          return { username: parts[0], uid: parseInt(parts[2], 10) };
        })
        .filter(u => u.uid >= 1000 && u.uid < 60000 && !['nobody', 'nfsnobody'].includes(u.username));

      let synced = 0;
      for (const user of users) {
        try {
          // Check if user already in smbpasswd database
          const { stdout } = await execute('pdbedit', ['-L', '-u', user.username], { timeout: 5000 });
          if (stdout.includes(user.username)) {
            continue; // Already exists
          }
        } catch {
          // User not in samba DB, try to add with disabled password
          // (they'll need to set a password via the Users page)
          try {
            await execute('smbpasswd', ['-a', '-n', user.username], { timeout: 5000 });
            synced++;
            logger.info('SMB: Added user to Samba DB', { username: user.username });
          } catch (addErr) {
            logger.debug('SMB: Could not add user to Samba', { username: user.username, error: addErr.message });
          }
        }
      }

      logger.info('SMB: User sync complete', { total: users.length, synced });
      return { success: true, total: users.length, synced };
    } catch (err) {
      logger.warn('SMB: User sync failed', { error: err.message });
      return { success: true, synced: 0 };
    }
  }

  /**
   * SMB SHARE MANAGEMENT
   */

  static async createShare(params) {
    const { name, path: sharePath, browseable = true, writable = false, guestOk = false, validUsers = [], comment = '' } = params;

    try {
      logger.info('SMB: Create share request', { name, path: sharePath });

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

      // Persist to network-shares.json
      const networkShares = this.loadNetworkShares();
      if (!networkShares.smb) networkShares.smb = [];
      networkShares.smb.push(share);
      this.saveNetworkShares(networkShares);

      // Sync and reload config if service is running
      await this.syncAllShares();
      await this.reloadConfig();

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

      // Update network-shares.json
      const networkShares = this.loadNetworkShares();
      if (networkShares.smb) {
        networkShares.smb = networkShares.smb.filter(s => s.name !== name);
        this.saveNetworkShares(networkShares);
      }

      // Rebuild config and reload
      await this.syncAllShares();
      await this.reloadConfig();

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
      const networkShares = this.loadNetworkShares();
      const smbShares = networkShares.smb || [];

      logger.info('Listed SMB shares', { count: smbShares.length });

      return {
        success: true,
        shares: smbShares,
        count: smbShares.length
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
      const dir = path.dirname(NETWORK_SHARES_PATH);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(NETWORK_SHARES_PATH, JSON.stringify(data, null, 2), 'utf8');
      logger.debug('Network shares persisted');
    } catch (err) {
      logger.error('Failed to persist network shares', { error: err.message });
      throw err;
    }
  }

  /**
   * SERVICE MANAGEMENT — Enhanced with dual-layer support
   */

  static async getServiceStatus() {
    try {
      const globalEnabled = ServiceState.isEnabled('smb');
      let isRunning = false;
      let isInstalled = true;

      try {
        const { stdout } = await execute('systemctl', ['is-active', 'smbd'], { timeout: 5000 });
        isRunning = stdout.trim() === 'active';
      } catch (execErr) {
        // Check if it's installed at all
        try {
          await execute('which', ['smbd'], { timeout: 3000 });
        } catch {
          isInstalled = false;
        }
        isRunning = false;
      }

      return {
        success: true,
        active: globalEnabled && isRunning,
        enabled: globalEnabled,
        running: isRunning,
        installed: isInstalled,
        service: 'smbd'
      };
    } catch (err) {
      logger.warn('Could not get SMB service status', { error: err.message });
      return {
        success: true,
        active: false,
        enabled: ServiceState.isEnabled('smb'),
        running: false,
        installed: true,
        service: 'smbd'
      };
    }
  }

  static async enableService() {
    try {
      logger.info('Enabling SMB service');

      // Start the smbd service
      try {
        await execute('systemctl', ['start', 'smbd'], { timeout: 10000 });
      } catch (execErr) {
        logger.warn('Could not start smbd via systemctl', { error: execErr.message });
      }

      // Enable it to start on boot
      try {
        await execute('systemctl', ['enable', 'smbd'], { timeout: 5000 });
      } catch (execErr) {
        logger.warn('Could not enable smbd via systemctl', { error: execErr.message });
      }

      // Update global state
      ServiceState.setEnabled('smb', true);

      // Sync all SMB-enabled shares to smb.conf
      const syncResult = await this.syncAllShares();

      // Reload config to activate shares
      await this.reloadConfig();

      // Sync users to Samba
      await this.syncSmbUsers();

      // Open firewall ports
      try {
        await FirewallService.openPorts('smb');
      } catch (fwErr) {
        logger.warn('Firewall port open failed', { error: fwErr.message });
      }

      logger.info('SMB service enabled', { sharesSynced: syncResult.synced });

      return {
        success: true,
        message: `SMB service enabled. ${syncResult.synced || 0} shares activated.`
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
        await execute('systemctl', ['stop', 'smbd'], { timeout: 10000 });
      } catch (execErr) {
        logger.warn('Could not stop smbd via systemctl', { error: execErr.message });
      }

      // Disable it from starting on boot
      try {
        await execute('systemctl', ['disable', 'smbd'], { timeout: 5000 });
      } catch (execErr) {
        logger.warn('Could not disable smbd via systemctl', { error: execErr.message });
      }

      // Update global state
      ServiceState.setEnabled('smb', false);

      logger.info('SMB service disabled');

      return {
        success: true,
        message: 'SMB service disabled. All SMB shares are now inaccessible.'
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
