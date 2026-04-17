/**
 * FTP Service - Phase 7
 * 
 * Secure FTP server management using vsftpd
 * - Enable / disable FTP
 * - User management with jailing
 * - Passive mode support
 * - Storage path restriction
 */

const fs = require('fs');
const path = require('path');
const { execute, ExecutorError } = require('../../lib/executor');
const logger = require('../../lib/logger');

const VSFTPD_CONFIG = '/etc/vsftpd/vsftpd.conf';
const VSFTPD_USER_CONFIG_DIR = '/etc/vsftpd/user_conf';
const VSFTPD_CHROOT_LIST = '/etc/vsftpd/chroot_list';
const FTP_STATE_FILE = path.join(__dirname, '../../data/ftp-config.json');
const STORAGE_BASE = '/mnt/storage';

class FTPError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

class FTPService {
  /**
   * Initialize FTP service (ensure directories exist)
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
          passivePortMin: 6000,
          passivePortMax: 6100,
          users: []
        }));
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
      throw new FTPError('CONFIG_READ_FAILED', 'Cannot read FTP configuration');
    }
  }

  /**
   * Save FTP configuration
   */
  static saveConfig(config) {
    try {
      fs.writeFileSync(FTP_STATE_FILE, JSON.stringify(config, null, 2));
      logger.info('FTP config saved', { config });
    } catch (err) {
      logger.error('Failed to save FTP config', { error: err.message });
      throw new FTPError('CONFIG_SAVE_FAILED', 'Cannot save FTP configuration');
    }
  }

  /**
   * Get FTP status
   */
  static async getStatus() {
    try {
      const config = this.getConfig();
      
      // Check if vsftpd is running
      let isRunning = false;
      try {
        const { stdout } = await execute('systemctl', ['is-active', 'vsftpd'], { 
          timeout: 5000,
          throwOnError: false 
        });
        isRunning = stdout.trim() === 'active';
      } catch (err) {
        isRunning = false;
      }

      return {
        enabled: config.enabled,
        running: isRunning,
        port: config.port,
        passivePortMin: config.passivePortMin,
        passivePortMax: config.passivePortMax,
        users: config.users || [],
        userCount: (config.users || []).length
      };
    } catch (err) {
      logger.error('Failed to get FTP status', { error: err.message });
      throw new FTPError('STATUS_CHECK_FAILED', 'Cannot check FTP status');
    }
  }

  /**
   * Enable FTP service
   */
  static async enable(options = {}) {
    try {
      const config = this.getConfig();
      
      const port = options.port || config.port || 21;
      const passivePortMin = options.passivePortMin || config.passivePortMin || 6000;
      const passivePortMax = options.passivePortMax || config.passivePortMax || 6100;
      const umask = options.umask || '077';

      // Create vsftpd config
      const vsftpdConfig = `# NAS FTP Configuration

# Network settings
listen=YES
listen_address=0.0.0.0
listen_port=${port}

# Passive mode
pasv_enable=YES
pasv_min_port=${passivePortMin}
pasv_max_port=${passivePortMax}
pasv_address=0.0.0.0

# User settings
anonymous_enable=NO
local_enable=YES
write_enable=YES
local_umask=${umask}

# Chroot jail (restrict users to their home directories)
chroot_local_user=YES
chroot_list_enable=YES
chroot_list_file=${VSFTPD_CHROOT_LIST}

# Logging
xferlog_enable=YES
xferlog_file=/var/log/vsftpd/xferlog
log_ftp_protocol=YES
syslog_enable=YES

# Security
ssl_enable=NO
dirmessage_enable=YES
connect_from_port_20=NO
data_connection_timeout=120
idle_session_timeout=300
`;

      // Try to write config files (requires sudo/root - may fail in dev environments)
      try {
        fs.writeFileSync(VSFTPD_CONFIG, vsftpdConfig);
        logger.info('Wrote vsftpd config file');
      } catch (err) {
        logger.warn('Could not write vsftpd config (may require root)', { 
          error: err.message,
          path: VSFTPD_CONFIG 
        });
      }
      
      // Try to create chroot list file if it doesn't exist
      try {
        if (!fs.existsSync(VSFTPD_CHROOT_LIST)) {
          fs.writeFileSync(VSFTPD_CHROOT_LIST, '');
        }
      } catch (err) {
        logger.warn('Could not write chroot list file (may require root)', { 
          error: err.message,
          path: VSFTPD_CHROOT_LIST 
        });
      }

      // Try to restart vsftpd
      try {
        await execute('systemctl', ['restart', 'vsftpd'], { timeout: 10000 });
        logger.info('Restarted vsftpd service');
      } catch (err) {
        logger.warn('Failed to restart vsftpd (may not be installed or accessible)', { 
          error: err.message 
        });
      }

      // Update config state (this always works)
      config.enabled = true;
      config.port = port;
      config.passivePortMin = passivePortMin;
      config.passivePortMax = passivePortMax;
      config.umask = umask;
      this.saveConfig(config);

      logger.info('FTP service enabled', { port, passivePortMin, passivePortMax });
      return { success: true, message: 'FTP service enabled' };
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

      // Update config
      const config = this.getConfig();
      config.enabled = false;
      this.saveConfig(config);

      logger.info('FTP service disabled');
      return { success: true, message: 'FTP service disabled' };
    } catch (err) {
      logger.error('Failed to disable FTP', { error: err.message });
      throw new FTPError('DISABLE_FAILED', 'Cannot disable FTP service');
    }
  }

  /**
   * Add FTP user with chroot jail
   */
  static async addUser(username, password, homeDir) {
    try {
      // Validate home directory is under /mnt/storage
      const normalizedPath = path.normalize(homeDir);
      if (!normalizedPath.startsWith(STORAGE_BASE)) {
        throw new FTPError('INVALID_PATH', 'Home directory must be under /mnt/storage');
      }

      // Create home directory if it doesn't exist
      try {
        if (!fs.existsSync(homeDir)) {
          fs.mkdirSync(homeDir, { recursive: true });
        }
      } catch (err) {
        logger.warn('Could not create FTP home directory (may require root)', { 
          homeDir, 
          error: err.message 
        });
      }

      // Add system user for FTP (non-shell)
      try {
        await execute('useradd', [
          '-d', homeDir,
          '-s', '/usr/sbin/nologin',
          '-M', // Don't create home directory (we already did)
          username
        ], { timeout: 5000 });
        logger.info('Created system user for FTP', { username });
      } catch (err) {
        if (err.message.includes('already exists')) {
          logger.warn('FTP user already exists, updating', { username });
        } else {
          logger.warn('Could not create system user (may require root privileges)', { 
            username, 
            error: err.message 
          });
        }
      }

      // Set password
      //
      // SECURITY: The previous implementation ran `bash -c "echo '<user>:<pwd>' | chpasswd"`
      // which interpolated user-supplied values into a shell string. A password
      // containing a single-quote (or any shell metacharacter) could break out
      // and execute arbitrary commands as root. We now invoke chpasswd directly
      // via execFile and supply the `user:password` pair on stdin — no shell,
      // no interpolation.
      try {
        await execute('chpasswd', [], {
          timeout: 5000,
          input: `${username}:${password}\n`
        });
        logger.info('Set FTP user password', { username });
      } catch (err) {
        logger.warn('Could not set FTP user password (may require root privileges)', {
          username,
          error: err.message
        });
      }

      // Try to add to chroot list (may fail without root)
      try {
        if (fs.existsSync(VSFTPD_CHROOT_LIST)) {
          const chroots = fs.readFileSync(VSFTPD_CHROOT_LIST, 'utf8').split('\n').filter(l => l);
          if (!chroots.includes(username)) {
            chroots.push(username);
            fs.writeFileSync(VSFTPD_CHROOT_LIST, chroots.join('\n') + '\n');
          }
        }
      } catch (err) {
        logger.warn('Could not update chroot list (may require root)', { 
          error: err.message 
        });
      }

      // Update state (this always works)
      const config = this.getConfig();
      const existingUserIndex = config.users.findIndex(u => u.username === username);
      
      // If user already exists, return success without modifying
      if (existingUserIndex >= 0) {
        logger.warn('FTP user already exists, skipping', { username });
        return { success: true, message: `FTP user ${username} already exists`, userData: config.users[existingUserIndex] };
      }
      
      const userData = { username, homeDir, createdAt: new Date().toISOString() };
      config.users.push(userData);
      this.saveConfig(config);

      logger.info('FTP user added', { username, homeDir });
      return { success: true, message: `FTP user ${username} added`, userData };
    } catch (err) {
      logger.error('Failed to add FTP user', { username, error: err.message });
      if (err instanceof FTPError) throw err;
      throw new FTPError('ADD_USER_FAILED', 'Cannot add FTP user');
    }
  }

  /**
   * Remove FTP user
   */
  static async removeUser(username) {
    try {
      // Remove system user (may fail without root)
      try {
        await execute('userdel', ['-r', username], { timeout: 5000 });
        logger.info('Removed system user', { username });
      } catch (err) {
        logger.warn('Could not remove system user (may require root)', { username, error: err.message });
      }

      // Try to remove from chroot list (may fail without root)
      try {
        if (fs.existsSync(VSFTPD_CHROOT_LIST)) {
          const chroots = fs.readFileSync(VSFTPD_CHROOT_LIST, 'utf8')
            .split('\n')
            .filter(line => line && !line.includes(username));
          fs.writeFileSync(VSFTPD_CHROOT_LIST, chroots.join('\n') + '\n');
        }
      } catch (err) {
        logger.warn('Could not update chroot list (may require root)', { error: err.message });
      }

      // Update state (this always works)
      const config = this.getConfig();
      config.users = (config.users || []).filter(u => u.username !== username);
      this.saveConfig(config);

      logger.info('FTP user removed', { username });
      return { success: true, message: `FTP user ${username} removed` };
    } catch (err) {
      logger.error('Failed to remove FTP user', { username, error: err.message });
      throw new FTPError('REMOVE_USER_FAILED', 'Cannot remove FTP user');
    }
  }

  /**
   * List FTP users
   */
  static listUsers() {
    try {
      const config = this.getConfig();
      return config.users || [];
    } catch (err) {
      logger.error('Failed to list FTP users', { error: err.message });
      throw new FTPError('LIST_USERS_FAILED', 'Cannot list FTP users');
    }
  }
}

module.exports = { FTPService, FTPError };
