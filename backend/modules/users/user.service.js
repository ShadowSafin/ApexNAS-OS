/**
 * User Service
 * 
 * Real Linux user management via execFile:
 * - useradd / userdel for account lifecycle
 * - chpasswd for password management
 * - /etc/passwd parsing for user listing
 * - smbpasswd integration for SMB authentication
 * 
 * SECURITY:
 * - All commands via execFile (no shell interpolation)
 * - System account blocklist enforced
 * - Username regex validation
 * - Never operates on root or system users
 */

const fs = require('fs');
const { execute } = require('../../lib/executor');
const logger = require('../../lib/logger');
const { USERNAME_REGEX, SYSTEM_USERS, MIN_UID } = require('../../lib/constants');

class UserService {
  /**
   * Validate username format and safety
   */
  static validateUsername(username) {
    if (!username || typeof username !== 'string') {
      return { valid: false, error: 'INVALID_INPUT', message: 'Username is required' };
    }

    if (!USERNAME_REGEX.test(username)) {
      return {
        valid: false,
        error: 'INVALID_USERNAME',
        message: 'Username must be 1-32 chars, start with a letter, and contain only letters, numbers, underscore, hyphen, or period'
      };
    }

    if (SYSTEM_USERS.has(username)) {
      return {
        valid: false,
        error: 'BLOCKED_USERNAME',
        message: 'This username is reserved and cannot be used'
      };
    }

    return { valid: true };
  }

  /**
   * List all non-system users (UID >= 1000)
   * Parses /etc/passwd directly
   */
  static async listUsers() {
    try {
      logger.info('UserService: Listing users');

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
            comment: parts[4] || '',
            home: parts[5],
            shell: parts[6]
          };
        })
        .filter(user => user.uid >= MIN_UID && !SYSTEM_USERS.has(user.username));

      // Enrich with group info
      const enriched = [];
      for (const user of users) {
        try {
          const { stdout } = await execute('id', ['-Gn', user.username], { timeout: 5000 });
          user.groups = stdout.trim().split(/\s+/).filter(Boolean);
        } catch {
          user.groups = [];
        }
        enriched.push(user);
      }

      logger.info('UserService: Listed users', { count: enriched.length });

      return {
        success: true,
        users: enriched,
        count: enriched.length
      };
    } catch (err) {
      logger.error('UserService: List users failed', { error: err.message });
      return {
        success: false,
        error: 'LIST_FAILED',
        message: err.message
      };
    }
  }

  /**
   * Get a single user by username
   */
  static async getUser(username) {
    try {
      logger.info('UserService: Get user', { username });

      const check = this.validateUsername(username);
      if (!check.valid) return { success: false, ...check };

      const passwdContent = fs.readFileSync('/etc/passwd', 'utf8');
      const line = passwdContent
        .split('\n')
        .find(l => l.startsWith(username + ':'));

      if (!line) {
        return { success: false, error: 'USER_NOT_FOUND', message: `User "${username}" not found` };
      }

      const parts = line.split(':');
      const user = {
        username: parts[0],
        uid: parseInt(parts[2], 10),
        gid: parseInt(parts[3], 10),
        comment: parts[4] || '',
        home: parts[5],
        shell: parts[6]
      };

      // Block access to system users
      if (user.uid < MIN_UID) {
        return { success: false, error: 'SYSTEM_USER', message: 'Cannot access system user accounts' };
      }

      // Get groups
      try {
        const { stdout } = await execute('id', ['-Gn', username], { timeout: 5000 });
        user.groups = stdout.trim().split(/\s+/).filter(Boolean);
      } catch {
        user.groups = [];
      }

      return { success: true, user };
    } catch (err) {
      logger.error('UserService: Get user failed', { error: err.message });
      return { success: false, error: 'SERVICE_ERROR', message: err.message };
    }
  }

  /**
   * Create a new Linux user
   * Uses: useradd -m -s /bin/bash username
   * Then: chpasswd for password setting
   * Then: smbpasswd -a for SMB authentication
   * NOTE: /bin/bash is required — vsftpd PAM uses pam_shells.so which
   * rejects users with /usr/sbin/nologin (causes 530 Login incorrect)
   */
  static async createUser(username, password) {
    try {
      logger.info('UserService: Create user', { username });

      // Validate
      const check = this.validateUsername(username);
      if (!check.valid) return { success: false, ...check };

      if (!password || typeof password !== 'string' || password.length < 6) {
        return { success: false, error: 'INVALID_PASSWORD', message: 'Password must be at least 6 characters' };
      }

      // Check if user already exists
      const passwdContent = fs.readFileSync('/etc/passwd', 'utf8');
      if (passwdContent.split('\n').some(l => l.startsWith(username + ':'))) {
        return { success: false, error: 'USER_EXISTS', message: `User "${username}" already exists` };
      }

      // Create user with home directory and valid login shell
      // Shell MUST be in /etc/shells for FTP (pam_shells.so) to work
      try {
        await execute('useradd', ['-m', '-s', '/bin/bash', username], { timeout: 10000 });
        logger.info('UserService: useradd succeeded', { username });
      } catch (err) {
        logger.error('UserService: useradd failed', { error: err.message });
        return { success: false, error: 'CREATE_FAILED', message: `Failed to create user: ${err.message}` };
      }

      // Set password via chpasswd (pipe-safe, no shell interpolation)
      try {
        await execute('chpasswd', [], {
          timeout: 10000,
          input: `${username}:${password}\n`
        });
        logger.info('UserService: Password set', { username });
      } catch (err) {
        logger.warn('UserService: chpasswd failed, cleaning up', { error: err.message });
        // Rollback: delete the user we just created
        try { await execute('userdel', ['-r', username], { timeout: 10000 }); } catch {}
        return { success: false, error: 'PASSWORD_FAILED', message: `Failed to set password: ${err.message}` };
      }

      // Add SMB password for Samba access
      try {
        await execute('smbpasswd', ['-a', '-s', username], {
          timeout: 10000,
          input: `${password}\n${password}\n`
        });
        logger.info('UserService: SMB password set', { username });
      } catch (err) {
        // Non-fatal: SMB may not be installed
        logger.warn('UserService: smbpasswd failed (SMB may not be installed)', { error: err.message });
      }

      // Read back the created user
      const result = await this.getUser(username);

      logger.info('UserService: User created', { username });

      return {
        success: true,
        message: `User "${username}" created`,
        user: result.success ? result.user : { username }
      };
    } catch (err) {
      logger.error('UserService: Create user failed', { error: err.message });
      return { success: false, error: 'SERVICE_ERROR', message: err.message };
    }
  }

  /**
   * Delete a Linux user
   * Uses: userdel -r username
   */
  static async deleteUser(username) {
    try {
      logger.info('UserService: Delete user', { username });

      // Validate
      const check = this.validateUsername(username);
      if (!check.valid) return { success: false, ...check };

      // Verify user exists and is non-system
      const passwdContent = fs.readFileSync('/etc/passwd', 'utf8');
      const line = passwdContent.split('\n').find(l => l.startsWith(username + ':'));

      if (!line) {
        return { success: false, error: 'USER_NOT_FOUND', message: `User "${username}" not found` };
      }

      const uid = parseInt(line.split(':')[2], 10);
      if (uid < MIN_UID) {
        return { success: false, error: 'SYSTEM_USER', message: 'Cannot delete system user accounts' };
      }

      // Remove SMB password first (non-fatal)
      try {
        await execute('smbpasswd', ['-x', username], { timeout: 10000 });
        logger.info('UserService: SMB password removed', { username });
      } catch {
        logger.debug('UserService: smbpasswd -x skipped (user may not be in SMB db)');
      }

      // Delete user and home directory
      try {
        await execute('userdel', ['-r', username], { timeout: 10000 });
        logger.info('UserService: userdel succeeded', { username });
      } catch (err) {
        logger.error('UserService: userdel failed', { error: err.message });
        return { success: false, error: 'DELETE_FAILED', message: `Failed to delete user: ${err.message}` };
      }

      return {
        success: true,
        message: `User "${username}" deleted`
      };
    } catch (err) {
      logger.error('UserService: Delete user failed', { error: err.message });
      return { success: false, error: 'SERVICE_ERROR', message: err.message };
    }
  }

  /**
   * Change user password
   * Uses: chpasswd + smbpasswd
   */
  static async setPassword(username, password) {
    try {
      logger.info('UserService: Set password', { username });

      const check = this.validateUsername(username);
      if (!check.valid) return { success: false, ...check };

      if (!password || typeof password !== 'string' || password.length < 6) {
        return { success: false, error: 'INVALID_PASSWORD', message: 'Password must be at least 6 characters' };
      }

      // Verify user exists
      const passwdContent = fs.readFileSync('/etc/passwd', 'utf8');
      const line = passwdContent.split('\n').find(l => l.startsWith(username + ':'));
      if (!line) {
        return { success: false, error: 'USER_NOT_FOUND', message: `User "${username}" not found` };
      }

      const uid = parseInt(line.split(':')[2], 10);
      if (uid < MIN_UID) {
        return { success: false, error: 'SYSTEM_USER', message: 'Cannot modify system user accounts' };
      }

      // Set Linux password
      try {
        await execute('chpasswd', [], {
          timeout: 10000,
          input: `${username}:${password}\n`
        });
      } catch (err) {
        return { success: false, error: 'PASSWORD_FAILED', message: `Failed to set password: ${err.message}` };
      }

      // Update SMB password
      try {
        await execute('smbpasswd', ['-s', username], {
          timeout: 10000,
          input: `${password}\n${password}\n`
        });
      } catch {
        logger.warn('UserService: smbpasswd update failed (SMB may not be installed)');
      }

      return {
        success: true,
        message: `Password updated for "${username}"`
      };
    } catch (err) {
      logger.error('UserService: Set password failed', { error: err.message });
      return { success: false, error: 'SERVICE_ERROR', message: err.message };
    }
  }

  /**
   * Get groups for a specific user
   */
  static async getUserGroups(username) {
    try {
      const check = this.validateUsername(username);
      if (!check.valid) return { success: false, ...check };

      const { stdout } = await execute('id', ['-Gn', username], { timeout: 5000 });
      const groups = stdout.trim().split(/\s+/).filter(Boolean);

      return {
        success: true,
        username,
        groups
      };
    } catch (err) {
      logger.error('UserService: Get user groups failed', { error: err.message });
      return { success: false, error: 'SERVICE_ERROR', message: err.message };
    }
  }
}

module.exports = { UserService };
