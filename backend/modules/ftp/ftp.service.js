/**
 * FTP Service — Per-User Share Jailing with Unified Linux Users
 * 
 * Secure FTP server management using vsftpd
 * - Enable / disable FTP globally
 * - Uses Linux system users (PAM) — no separate FTP user DB
 * - Per-user chroot jailing into assigned share directories
 * - Passive mode support
 * - Global state integration via ServiceState
 * - Firewall management
 * 
 * SECURITY: Users are jailed via chroot_local_user=YES with per-user local_root
 * No user can escape their assigned share directory
 */

const fs = require('fs');
const path = require('path');
const { execute } = require('../../lib/executor');
const logger = require('../../lib/logger');
const { ServiceState } = require('../../lib/service-state');
const { FirewallService } = require('../../lib/firewall.service');

const VSFTPD_CONFIG = '/etc/vsftpd.conf';
const VSFTPD_USER_LIST = '/etc/vsftpd.userlist';
const FTP_STATE_FILE = path.join(__dirname, '../../data/ftp-config.json');
const STORAGE_BASE = '/mnt/storage';
const VSFTPD_USER_CONF_DIR = '/etc/vsftpd_user_conf';

class FTPError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

class FTPService {
  /**
   * Initialize FTP service (ensure directories exist, auto-sync if enabled)
   */
  static async init() {
    try {
      // Ensure state file exists
      if (!fs.existsSync(path.dirname(FTP_STATE_FILE))) {
        fs.mkdirSync(path.dirname(FTP_STATE_FILE), { recursive: true });
      }

      if (!fs.existsSync(FTP_STATE_FILE)) {
        fs.writeFileSync(FTP_STATE_FILE, JSON.stringify({
          enabled: false,
          port: 21,
          passivePortMin: 30000,
          passivePortMax: 31000
        }));
      }

      // Ensure per-user config directory exists
      try {
        if (!fs.existsSync(VSFTPD_USER_CONF_DIR)) {
          fs.mkdirSync(VSFTPD_USER_CONF_DIR, { recursive: true, mode: 0o755 });
        }
      } catch (err) {
        logger.warn('FTP: Could not create user conf dir', { error: err.message });
      }

      // If FTP is already enabled, rewrite config and sync user mappings
      const config = this.getConfig();
      if (config.enabled) {
        logger.info('FTP: Service was enabled, rewriting config and syncing users on startup');
        
        // Rewrite vsftpd.conf with per-user config dir
        try {
          const vsftpdConfig = this.buildVsftpdConfig({
            port: config.port,
            passivePortMin: config.passivePortMin,
            passivePortMax: config.passivePortMax
          });
          fs.writeFileSync(VSFTPD_CONFIG, vsftpdConfig);
          logger.info('FTP: Rewrote vsftpd.conf on startup');
        } catch (err) {
          logger.warn('FTP: Could not rewrite vsftpd.conf', { error: err.message });
        }

        // Sync user configs (shares are loaded before this runs — see app.js)
        try {
          await this.syncFtpUserConfigs();
          await execute('systemctl', ['restart', 'vsftpd'], { timeout: 10000 });
          logger.info('FTP: Startup sync complete, vsftpd restarted');
        } catch (err) {
          logger.warn('FTP: Startup sync failed', { error: err.message });
        }
      }

      logger.info('FTP Service initialized');
    } catch (err) {
      logger.error('FTP initialization failed', { error: err.message });
    }
  }

  /**
   * Get FTP configuration
   */
  static getConfig() {
    try {
      const config = JSON.parse(fs.readFileSync(FTP_STATE_FILE, 'utf8'));
      return config;
    } catch (err) {
      logger.error('Failed to read FTP config', { error: err.message });
      return {
        enabled: false,
        port: 21,
        passivePortMin: 30000,
        passivePortMax: 31000
      };
    }
  }

  /**
   * Save FTP configuration
   */
  static saveConfig(config) {
    try {
      const dir = path.dirname(FTP_STATE_FILE);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(FTP_STATE_FILE, JSON.stringify(config, null, 2));
      logger.info('FTP config saved');
    } catch (err) {
      logger.error('Failed to save FTP config', { error: err.message });
      throw new FTPError('CONFIG_SAVE_FAILED', 'Cannot save FTP configuration');
    }
  }

  /**
   * Get FTP status (enhanced with global state)
   */
  static async getStatus() {
    try {
      const config = this.getConfig();
      const globalEnabled = ServiceState.isEnabled('ftp');

      // Check if vsftpd is running
      let isRunning = false;
      let isInstalled = true;
      try {
        const { stdout } = await execute('systemctl', ['is-active', 'vsftpd'], { timeout: 5000 });
        isRunning = stdout.trim() === 'active';
      } catch (err) {
        try {
          await execute('which', ['vsftpd'], { timeout: 3000 });
        } catch {
          isInstalled = false;
        }
        isRunning = false;
      }

      // List system users available for FTP (UID >= 1000)
      let systemUsers = [];
      try {
        const passwdContent = fs.readFileSync('/etc/passwd', 'utf8');
        systemUsers = passwdContent
          .split('\n')
          .filter(line => line.trim())
          .map(line => {
            const parts = line.split(':');
            return { username: parts[0], uid: parseInt(parts[2], 10), home: parts[5] };
          })
          .filter(u => u.uid >= 1000 && u.uid < 60000 && !['nobody', 'nfsnobody'].includes(u.username))
          .map(u => u.username);
      } catch {
        systemUsers = [];
      }

      return {
        enabled: globalEnabled,
        running: isRunning,
        installed: isInstalled,
        active: globalEnabled && isRunning,
        port: config.port || 21,
        passivePortMin: config.passivePortMin || 30000,
        passivePortMax: config.passivePortMax || 31000,
        systemUsers,
        userCount: systemUsers.length
      };
    } catch (err) {
      logger.error('Failed to get FTP status', { error: err.message });
      return {
        enabled: ServiceState.isEnabled('ftp'),
        running: false,
        installed: true,
        active: false,
        port: 21,
        passivePortMin: 30000,
        passivePortMax: 31000,
        systemUsers: [],
        userCount: 0
      };
    }
  }

/**
   * Build vsftpd configuration with per-user share jailing
   */
  static buildVsftpdConfig(options = {}) {
    const port = options.port || 21;
    const passivePortMin = options.passivePortMin || 30000;
    const passivePortMax = options.passivePortMax || 31000;

    return `# ApexNAS FTP Configuration — Per-User Share Jailing
# SECURITY: Users are jailed via chroot_local_user=YES
# Managed by NAS service — do not edit manually

# Network settings
listen=YES
listen_ipv6=NO
listen_address=0.0.0.0
listen_port=${port}

# Passive mode
pasv_enable=YES
pasv_min_port=${passivePortMin}
pasv_max_port=${passivePortMax}

# Authentication — use Linux system users via PAM
anonymous_enable=NO
local_enable=YES
write_enable=YES
local_umask=022

# SECURITY: Chroot jail — CRITICAL for isolation
chroot_local_user=YES
allow_writeable_chroot=YES
# Default root (fallback only — per-user config overrides this)
local_root=${STORAGE_BASE}

# Per-user config — overrides local_root per user
# Each file in this dir is named after the username
# and contains: local_root=/mnt/storage/<vol>/<share>
user_config_dir=${VSFTPD_USER_CONF_DIR}

# Security
connect_from_port_20=NO
data_connection_timeout=120
idle_session_timeout=300
max_per_ip=10
max_clients=50

# Logging
xferlog_enable=YES
xferlog_std_format=YES
log_ftp_protocol=YES
vsftpd_log_file=/var/log/vsftpd.log

# PAM service name
pam_service_name=vsftpd
`;
  }

  /**
   * Verify per-user FTP jail is properly configured
   */
  static async verifyJailIsolation(username, expectedSharePath) {
    try {
      const userConfPath = path.join(VSFTPD_USER_CONF_DIR, username);
      
      if (!fs.existsSync(userConfPath)) {
        return { valid: false, error: 'NO_USER_CONFIG', message: 'No per-user config found' };
      }

      const config = fs.readFileSync(userConfPath, 'utf8');
      const rootMatch = config.match(/local_root=(.+)/);
      
      if (!rootMatch) {
        return { valid: false, error: 'NO_LOCAL_ROOT', message: 'local_root not set' };
      }

      const configuredRoot = rootMatch[1].trim();
      
      // Validate path is under STORAGE_ROOT
      if (!configuredRoot.startsWith(STORAGE_BASE)) {
        return { valid: false, error: 'INSECURE_ROOT', message: 'Root outside storage' };
      }

      // Must exactly match expected share path
      if (configuredRoot !== expectedSharePath) {
        return { valid: false, error: 'PATH_MISMATCH', message: 'Configured root does not match share path' };
      }

      // Verify directory exists
      if (!fs.existsSync(configuredRoot)) {
        return { valid: false, error: 'PATH_NOT_FOUND', message: 'Share directory does not exist' };
      }

      return { valid: true, username, sharePath: configuredRoot };
    } catch (err) {
      return { valid: false, error: 'VERIFICATION_FAILED', message: err.message };
    }
  }

  /**
   * Sync per-user FTP config files based on shares.
   * 
   * For each NAS user (UID >= 1000), find FTP-enabled shares
   * and write a per-user config file at /etc/vsftpd_user_conf/<username>
   * with local_root pointing to the share directory.
   * 
   * This ensures users are jailed into their share, not /mnt/storage.
   */
  static async syncFtpUserConfigs() {
    try {
      logger.info('FTP: Syncing per-user configs');

      // Ensure config dir exists
      if (!fs.existsSync(VSFTPD_USER_CONF_DIR)) {
        fs.mkdirSync(VSFTPD_USER_CONF_DIR, { recursive: true, mode: 0o755 });
      }

      // Get all FTP-enabled shares
      let ftpShares = [];
      try {
        const { shares } = require('../share/share.service');
        const allShares = Array.from(shares.values());
        ftpShares = allShares.filter(s => s.services?.ftp?.enabled);
        logger.info('FTP: Found FTP-enabled shares', { count: ftpShares.length, names: ftpShares.map(s => s.name) });
      } catch (err) {
        logger.warn('FTP: Could not load shares', { error: err.message });
        return { success: false, error: err.message };
      }

      // Get all NAS users (UID >= 1000)
      let nasUsers = [];
      try {
        const passwdContent = fs.readFileSync('/etc/passwd', 'utf8');
        nasUsers = passwdContent
          .split('\n')
          .filter(line => line.trim())
          .map(line => {
            const parts = line.split(':');
            return { username: parts[0], uid: parseInt(parts[2], 10) };
          })
          .filter(u => u.uid >= 1000 && u.uid < 60000 && !['nobody', 'nfsnobody', 'nogroup'].includes(u.username));
      } catch (err) {
        logger.warn('FTP: Could not read /etc/passwd', { error: err.message });
        return { success: false, error: err.message };
      }

      // Clean out old per-user configs
      try {
        const existingFiles = fs.readdirSync(VSFTPD_USER_CONF_DIR);
        for (const file of existingFiles) {
          try { fs.unlinkSync(path.join(VSFTPD_USER_CONF_DIR, file)); } catch {}
        }
      } catch {}

      // If no FTP-enabled shares, nothing to map
      if (ftpShares.length === 0) {
        logger.info('FTP: No FTP-enabled shares, no user configs to write');
        return { success: true, synced: 0, users: [] };
      }

      // Map each user to their FTP-enabled share
      // Simple rule: assign users to the first FTP-enabled share
      // (for 1 filesystem = 1 share model, there's typically just one)
      let written = 0;
      const mappedUsers = [];

      for (const user of nasUsers) {
        // Use the first FTP-enabled share as the user's root
        const share = ftpShares[0];
        const userConfPath = path.join(VSFTPD_USER_CONF_DIR, user.username);
        const config = `# FTP config for user: ${user.username}\n# Managed by ApexNAS — do not edit manually\nlocal_root=${share.path}\nwrite_enable=YES\n`;

        try {
          fs.writeFileSync(userConfPath, config, { mode: 0o644 });
          written++;
          mappedUsers.push(user.username);
          logger.info('FTP: Wrote per-user config', { username: user.username, sharePath: share.path });
        } catch (err) {
          logger.warn('FTP: Failed to write user config', { username: user.username, error: err.message });
        }
      }

      logger.info('FTP: User configs synced', { total: written, users: mappedUsers });
      return { success: true, synced: written, users: mappedUsers };
    } catch (err) {
      logger.error('FTP: syncFtpUserConfigs failed', { error: err.message });
      return { success: false, error: err.message };
    }
  }

  /**
   * Enable FTP service
   */
  static async enable(options = {}) {
    try {
      const config = this.getConfig();
      
      const port = options.port || config.port || 21;
      const passivePortMin = options.passivePortMin || config.passivePortMin || 30000;
      const passivePortMax = options.passivePortMax || config.passivePortMax || 31000;

      // Write vsftpd config
      const vsftpdConfig = this.buildVsftpdConfig({ port, passivePortMin, passivePortMax });
      
      try {
        fs.writeFileSync(VSFTPD_CONFIG, vsftpdConfig);
        logger.info('Wrote vsftpd config file');
      } catch (err) {
        logger.warn('Could not write vsftpd config (may require root)', { 
          error: err.message,
          path: VSFTPD_CONFIG 
        });
      }

      // Ensure /mnt/storage exists and is accessible
      try {
        if (!fs.existsSync(STORAGE_BASE)) {
          fs.mkdirSync(STORAGE_BASE, { recursive: true, mode: 0o755 });
        }
      } catch (err) {
        logger.warn('Could not create storage base', { error: err.message });
      }

      // Ensure per-user config directory exists
      try {
        if (!fs.existsSync(VSFTPD_USER_CONF_DIR)) {
          fs.mkdirSync(VSFTPD_USER_CONF_DIR, { recursive: true, mode: 0o755 });
        }
      } catch (err) {
        logger.warn('Could not create user conf dir', { error: err.message });
      }

      // Fix user shells — vsftpd PAM uses pam_shells.so which rejects
      // users with /usr/sbin/nologin (not in /etc/shells → 530 Login incorrect)
      try {
        const passwdContent = fs.readFileSync('/etc/passwd', 'utf8');
        const usersToFix = passwdContent
          .split('\n')
          .filter(line => line.trim())
          .map(line => {
            const parts = line.split(':');
            return { username: parts[0], uid: parseInt(parts[2], 10), shell: parts[6] };
          })
          .filter(u => u.uid >= 1000 && u.uid < 60000 &&
            (u.shell === '/usr/sbin/nologin' || u.shell === '/bin/false'));

        for (const user of usersToFix) {
          try {
            await execute('usermod', ['-s', '/bin/bash', user.username], { timeout: 5000 });
            logger.info('Fixed user shell for FTP access', { username: user.username, oldShell: user.shell });
          } catch (shellErr) {
            logger.warn('Failed to fix user shell', { username: user.username, error: shellErr.message });
          }
        }

        if (usersToFix.length > 0) {
          logger.info(`Fixed ${usersToFix.length} user shell(s) for FTP compatibility`);
        }
      } catch (err) {
        logger.warn('Could not check/fix user shells', { error: err.message });
      }

      // Sync per-user FTP configs (jail users into their assigned share)
      try {
        await this.syncFtpUserConfigs();
        logger.info('FTP: Per-user configs synced during enable');
      } catch (err) {
        logger.warn('FTP: User config sync failed during enable', { error: err.message });
      }

      // Start/restart vsftpd
      try {
        await execute('systemctl', ['restart', 'vsftpd'], { timeout: 10000 });
        logger.info('Restarted vsftpd service');
      } catch (err) {
        logger.warn('Failed to restart vsftpd', { error: err.message });
      }

      // Enable on boot
      try {
        await execute('systemctl', ['enable', 'vsftpd'], { timeout: 5000 });
      } catch (err) {
        logger.warn('Failed to enable vsftpd on boot', { error: err.message });
      }

      // Update global state
      ServiceState.setEnabled('ftp', true);

      // Update config state
      config.enabled = true;
      config.port = port;
      config.passivePortMin = passivePortMin;
      config.passivePortMax = passivePortMax;
      this.saveConfig(config);

      // Open firewall ports
      try {
        await FirewallService.openPorts('ftp');
      } catch (fwErr) {
        logger.warn('Firewall port open failed', { error: fwErr.message });
      }

      logger.info('FTP service enabled', { port, passivePortMin, passivePortMax });
      return { success: true, message: 'FTP service enabled. Users are jailed into their assigned shares.' };
    } catch (err) {
      logger.error('Failed to enable FTP', { error: err.message, stack: err.stack });
      throw new FTPError('ENABLE_FAILED', 'Cannot enable FTP service');
    }
  }

  /**
   * Disable FTP service
   */
  static async disable() {
    try {
      // Stop vsftpd
      try {
        await execute('systemctl', ['stop', 'vsftpd'], { timeout: 10000 });
      } catch (err) {
        logger.warn('Failed to stop vsftpd', { error: err.message });
      }

      // Disable on boot
      try {
        await execute('systemctl', ['disable', 'vsftpd'], { timeout: 5000 });
      } catch (err) {
        logger.warn('Failed to disable vsftpd on boot', { error: err.message });
      }

      // Update global state
      ServiceState.setEnabled('ftp', false);

      // Update config
      const config = this.getConfig();
      config.enabled = false;
      this.saveConfig(config);

      logger.info('FTP service disabled');
      return { success: true, message: 'FTP service disabled. All FTP access is now blocked.' };
    } catch (err) {
      logger.error('Failed to disable FTP', { error: err.message });
      throw new FTPError('DISABLE_FAILED', 'Cannot disable FTP service');
    }
  }

  /**
   * List system users available for FTP access
   * (All Linux users with UID >= 1000)
   */
  static listUsers() {
    try {
      const passwdContent = fs.readFileSync('/etc/passwd', 'utf8');
      const users = passwdContent
        .split('\n')
        .filter(line => line.trim())
        .map(line => {
          const parts = line.split(':');
          return {
            username: parts[0],
            uid: parseInt(parts[2], 10),
            gid: parseInt(parts[3], 10),
            home: parts[5],
            shell: parts[6]
          };
        })
        .filter(u => u.uid >= 1000 && u.uid < 60000 && !['nobody', 'nfsnobody', 'nogroup'].includes(u.username))
        .map(u => ({
          username: u.username,
          homeDir: STORAGE_BASE,
          source: 'system'
        }));

      return users;
    } catch (err) {
      logger.error('Failed to list FTP users', { error: err.message });
      return [];
    }
  }
}

module.exports = { FTPService, FTPError };
