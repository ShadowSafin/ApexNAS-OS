/**
 * Group Service
 * 
 * Real Linux group management via execFile:
 * - groupadd / groupdel for group lifecycle
 * - usermod -aG for adding members
 * - gpasswd -d for removing members
 * - /etc/group parsing for group listing
 * 
 * SECURITY:
 * - All commands via execFile (no shell interpolation)
 * - System group blocklist enforced
 * - Group name regex validation
 */

const fs = require('fs');
const { execute } = require('../../lib/executor');
const logger = require('../../lib/logger');
const { GROUPNAME_REGEX, SYSTEM_GROUPS, SYSTEM_USERS, MIN_GID, USERNAME_REGEX } = require('../../lib/constants');

class GroupService {
  /**
   * Validate group name format and safety
   */
  static validateGroupName(name) {
    if (!name || typeof name !== 'string') {
      return { valid: false, error: 'INVALID_INPUT', message: 'Group name is required' };
    }

    if (!GROUPNAME_REGEX.test(name)) {
      return {
        valid: false,
        error: 'INVALID_GROUP_NAME',
        message: 'Group name must be 3-32 chars, start with a letter, use only lowercase letters, numbers, underscore, or hyphen'
      };
    }

    if (SYSTEM_GROUPS.has(name)) {
      return {
        valid: false,
        error: 'BLOCKED_GROUP',
        message: 'This group name is reserved and cannot be used'
      };
    }

    return { valid: true };
  }

  /**
   * List all non-system groups (GID >= 1000)
   * Parses /etc/group directly
   */
  static async listGroups() {
    try {
      logger.info('GroupService: Listing groups');

      const groupContent = fs.readFileSync('/etc/group', 'utf8');
      const groups = groupContent
        .split('\n')
        .filter(line => line.trim())
        .map(line => {
          const parts = line.split(':');
          const members = parts[3] ? parts[3].split(',').filter(Boolean) : [];
          return {
            name: parts[0],
            gid: parseInt(parts[2], 10),
            members
          };
        })
        .filter(group => group.gid >= MIN_GID && !SYSTEM_GROUPS.has(group.name));

      logger.info('GroupService: Listed groups', { count: groups.length });

      return {
        success: true,
        groups,
        count: groups.length
      };
    } catch (err) {
      logger.error('GroupService: List groups failed', { error: err.message });
      return { success: false, error: 'LIST_FAILED', message: err.message };
    }
  }

  /**
   * Create a new Linux group
   * Uses: groupadd name
   */
  static async createGroup(name) {
    try {
      logger.info('GroupService: Create group', { name });

      const check = this.validateGroupName(name);
      if (!check.valid) return { success: false, ...check };

      // Check if group already exists
      const groupContent = fs.readFileSync('/etc/group', 'utf8');
      if (groupContent.split('\n').some(l => l.startsWith(name + ':'))) {
        return { success: false, error: 'GROUP_EXISTS', message: `Group "${name}" already exists` };
      }

      try {
        await execute('groupadd', [name], { timeout: 10000 });
        logger.info('GroupService: groupadd succeeded', { name });
      } catch (err) {
        logger.error('GroupService: groupadd failed', { error: err.message });
        return { success: false, error: 'CREATE_FAILED', message: `Failed to create group: ${err.message}` };
      }

      // Read back
      const updatedContent = fs.readFileSync('/etc/group', 'utf8');
      const line = updatedContent.split('\n').find(l => l.startsWith(name + ':'));
      const gid = line ? parseInt(line.split(':')[2], 10) : null;

      return {
        success: true,
        message: `Group "${name}" created`,
        group: { name, gid, members: [] }
      };
    } catch (err) {
      logger.error('GroupService: Create group failed', { error: err.message });
      return { success: false, error: 'SERVICE_ERROR', message: err.message };
    }
  }

  /**
   * Delete a Linux group
   * Uses: groupdel name
   */
  static async deleteGroup(name) {
    try {
      logger.info('GroupService: Delete group', { name });

      const check = this.validateGroupName(name);
      if (!check.valid) return { success: false, ...check };

      // Verify group exists
      const groupContent = fs.readFileSync('/etc/group', 'utf8');
      const line = groupContent.split('\n').find(l => l.startsWith(name + ':'));
      if (!line) {
        return { success: false, error: 'GROUP_NOT_FOUND', message: `Group "${name}" not found` };
      }

      const gid = parseInt(line.split(':')[2], 10);
      if (gid < MIN_GID) {
        return { success: false, error: 'SYSTEM_GROUP', message: 'Cannot delete system groups' };
      }

      try {
        await execute('groupdel', [name], { timeout: 10000 });
        logger.info('GroupService: groupdel succeeded', { name });
      } catch (err) {
        logger.error('GroupService: groupdel failed', { error: err.message });
        return { success: false, error: 'DELETE_FAILED', message: `Failed to delete group: ${err.message}` };
      }

      return {
        success: true,
        message: `Group "${name}" deleted`
      };
    } catch (err) {
      logger.error('GroupService: Delete group failed', { error: err.message });
      return { success: false, error: 'SERVICE_ERROR', message: err.message };
    }
  }

  /**
   * Add a user to a group
   * Uses: usermod -aG groupname username
   */
  static async addUserToGroup(username, groupName) {
    try {
      logger.info('GroupService: Add user to group', { username, group: groupName });

      // Validate both
      if (!USERNAME_REGEX.test(username)) {
        return { success: false, error: 'INVALID_USERNAME', message: 'Invalid username format' };
      }
      if (SYSTEM_USERS.has(username)) {
        return { success: false, error: 'BLOCKED_USERNAME', message: 'Cannot modify system users' };
      }

      const groupCheck = this.validateGroupName(groupName);
      if (!groupCheck.valid) {
        // Allow adding to system groups that exist (e.g. sambashare)
        // but still block reserved group creation
      }

      // Verify user exists
      const passwdContent = fs.readFileSync('/etc/passwd', 'utf8');
      if (!passwdContent.split('\n').some(l => l.startsWith(username + ':'))) {
        return { success: false, error: 'USER_NOT_FOUND', message: `User "${username}" not found` };
      }

      // Verify group exists
      const groupContent = fs.readFileSync('/etc/group', 'utf8');
      if (!groupContent.split('\n').some(l => l.startsWith(groupName + ':'))) {
        return { success: false, error: 'GROUP_NOT_FOUND', message: `Group "${groupName}" not found` };
      }

      try {
        await execute('usermod', ['-aG', groupName, username], { timeout: 10000 });
        logger.info('GroupService: User added to group', { username, group: groupName });
      } catch (err) {
        logger.error('GroupService: usermod failed', { error: err.message });
        return { success: false, error: 'ADD_FAILED', message: `Failed to add user to group: ${err.message}` };
      }

      return {
        success: true,
        message: `User "${username}" added to group "${groupName}"`
      };
    } catch (err) {
      logger.error('GroupService: Add user to group failed', { error: err.message });
      return { success: false, error: 'SERVICE_ERROR', message: err.message };
    }
  }

  /**
   * Remove a user from a group
   * Uses: gpasswd -d username groupname
   */
  static async removeUserFromGroup(username, groupName) {
    try {
      logger.info('GroupService: Remove user from group', { username, group: groupName });

      if (!USERNAME_REGEX.test(username)) {
        return { success: false, error: 'INVALID_USERNAME', message: 'Invalid username format' };
      }

      try {
        await execute('gpasswd', ['-d', username, groupName], { timeout: 10000 });
        logger.info('GroupService: User removed from group', { username, group: groupName });
      } catch (err) {
        logger.error('GroupService: gpasswd failed', { error: err.message });
        return { success: false, error: 'REMOVE_FAILED', message: `Failed to remove user from group: ${err.message}` };
      }

      return {
        success: true,
        message: `User "${username}" removed from group "${groupName}"`
      };
    } catch (err) {
      logger.error('GroupService: Remove user from group failed', { error: err.message });
      return { success: false, error: 'SERVICE_ERROR', message: err.message };
    }
  }

  /**
   * Get members of a specific group
   */
  static async getGroupMembers(groupName) {
    try {
      const groupContent = fs.readFileSync('/etc/group', 'utf8');
      const line = groupContent.split('\n').find(l => l.startsWith(groupName + ':'));

      if (!line) {
        return { success: false, error: 'GROUP_NOT_FOUND', message: `Group "${groupName}" not found` };
      }

      const parts = line.split(':');
      const members = parts[3] ? parts[3].split(',').filter(Boolean) : [];

      return {
        success: true,
        group: groupName,
        members
      };
    } catch (err) {
      logger.error('GroupService: Get members failed', { error: err.message });
      return { success: false, error: 'SERVICE_ERROR', message: err.message };
    }
  }
}

module.exports = { GroupService };
