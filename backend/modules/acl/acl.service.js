/**
 * ACL Service - Enhanced
 * 
 * Permission management using POSIX ACLs:
 * - setfacl for setting permissions
 * - getfacl for reading permissions (structured JSON output)
 * - Support user/group/other access
 * - Recursive option for directories
 * - Default (inheritable) ACL support
 * - Remove individual or all ACLs
 * 
 * Default Permissions:
 * - Owner: rwx (read, write, execute)
 * - Group: rx (read, execute)
 * - Others: none
 */

const { execute } = require('../../lib/executor');
const logger = require('../../lib/logger');
const path = require('path');
const fs = require('fs');
const { STORAGE_ROOT } = require('../../lib/constants');

class ACLError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

class ACLService {
  /**
   * Validate path is under storage root
   * SECURITY: Uses path.resolve() + realpath to prevent traversal
   */
  static validatePathSafety(targetPath) {
    try {
      // Decode URL encoding
      let decoded = targetPath;
      try {
        decoded = decodeURIComponent(targetPath);
      } catch (err) {
        logger.warn('URL decode failed', { error: err.message });
      }
      
      // Resolve path completely
      const resolved = path.resolve(decoded);
      
      // Get canonical path (follows symlinks)
      let canonical = resolved;
      if (fs.existsSync(resolved)) {
        try {
          canonical = fs.realpathSync(resolved);
        } catch (err) {
          logger.warn('Could not get realpath', { error: err.message });
        }
      }
      
      if (!canonical.startsWith(STORAGE_ROOT)) {
        logger.error('SECURITY: ACL path outside storage root', { 
          original: targetPath,
          canonical: canonical,
          root: STORAGE_ROOT 
        });
        return {
          safe: false,
          error: 'INVALID_PATH',
          message: `ACL can only be applied under ${STORAGE_ROOT}`
        };
      }

      return { safe: true };
    } catch (err) {
      logger.error('Path safety validation error', { error: err.message });
      return { safe: false, error: 'INVALID_PATH', message: 'Invalid path' };
    }
  }

  /**
   * Validate permissions format
   */
  static validatePermissions(permissions) {
    if (typeof permissions !== 'string') {
      return { valid: false, message: 'Permissions must be a string' };
    }

    // Allow empty string (--- / no permissions) and standard permission combos
    if (permissions === '') return { valid: true };

    const validChars = new Set(['r', 'w', 'x']);
    for (const char of permissions) {
      if (!validChars.has(char)) {
        return { valid: false, message: `Invalid permission character: ${char}. Use r, w, x.` };
      }
    }

    if (new Set(permissions).size !== permissions.length) {
      return { valid: false, message: 'Duplicate permission characters' };
    }

    return { valid: true };
  }

  /**
   * Validate username format
   */
  static validateUsername(user) {
    if (!user || typeof user !== 'string') {
      return { valid: false, message: 'Username must be a string' };
    }
    
    if (user.includes(':') || user.includes('/')) {
      return { valid: false, message: 'Username contains invalid characters (: or /)' };
    }
    
    if (!/^[a-zA-Z0-9_.-]{1,32}$/.test(user)) {
      return { valid: false, message: 'Username must be alphanumeric with underscore/hyphen/period only (1-32 chars)' };
    }
    
    return { valid: true };
  }
  
  /**
   * Validate group name format
   */
  static validateGroupName(group) {
    if (!group || typeof group !== 'string') {
      return { valid: false, message: 'Group name must be a string' };
    }
    
    if (group.includes(':') || group.includes('/')) {
      return { valid: false, message: 'Group name contains invalid characters (: or /)' };
    }
    
    if (!/^[a-zA-Z0-9_.-]{1,32}$/.test(group)) {
      return { valid: false, message: 'Group name must be alphanumeric with underscore/hyphen/period only (1-32 chars)' };
    }
    
    return { valid: true };
  }

  /**
   * Set ACL for user
   */
  static async setUserPermissions(params) {
    const { path: targetPath, user, permissions, recursive = false } = params;

    try {
      logger.info('ACL: Set user permissions', { path: targetPath, user, permissions, recursive });

      const pathCheck = this.validatePathSafety(targetPath);
      if (!pathCheck.safe) return { success: false, ...pathCheck };

      const userCheck = this.validateUsername(user);
      if (!userCheck.valid) return { success: false, error: 'INVALID_USER', message: userCheck.message };

      const permCheck = this.validatePermissions(permissions);
      if (!permCheck.valid) return { success: false, error: 'INVALID_PERMISSIONS', message: permCheck.message };

      const aclString = `u:${user}:${permissions}`;
      const args = recursive ? ['-R', '-m', aclString, targetPath] : ['-m', aclString, targetPath];

      try {
        await execute('setfacl', args, { timeout: 30000 });
        logger.info('User permissions set', { user, permissions, recursive });

        return { success: true, user, permissions, recursive, message: `Permissions set for user ${user}` };
      } catch (err) {
        logger.error('setfacl failed', { error: err.message });
        return { success: false, error: 'ACL_FAILED', message: err.message };
      }
    } catch (err) {
      logger.error('Set user permissions error', { error: err.message });
      return { success: false, error: 'SERVICE_ERROR', message: err.message };
    }
  }

  /**
   * Set ACL for group
   */
  static async setGroupPermissions(params) {
    const { path: targetPath, group, permissions, recursive = false } = params;

    try {
      logger.info('ACL: Set group permissions', { path: targetPath, group, permissions, recursive });

      const pathCheck = this.validatePathSafety(targetPath);
      if (!pathCheck.safe) return { success: false, ...pathCheck };

      const groupCheck = this.validateGroupName(group);
      if (!groupCheck.valid) return { success: false, error: 'INVALID_GROUP', message: groupCheck.message };

      const permCheck = this.validatePermissions(permissions);
      if (!permCheck.valid) return { success: false, error: 'INVALID_PERMISSIONS', message: permCheck.message };

      const aclString = `g:${group}:${permissions}`;
      const args = recursive ? ['-R', '-m', aclString, targetPath] : ['-m', aclString, targetPath];

      try {
        await execute('setfacl', args, { timeout: 30000 });
        logger.info('Group permissions set', { group, permissions, recursive });
        return { success: true, group, permissions, recursive, message: `Permissions set for group ${group}` };
      } catch (err) {
        logger.error('setfacl failed', { error: err.message });
        return { success: false, error: 'ACL_FAILED', message: err.message };
      }
    } catch (err) {
      logger.error('Set group permissions error', { error: err.message });
      return { success: false, error: 'SERVICE_ERROR', message: err.message };
    }
  }

  /**
   * Set default (inheritable) ACL for a directory
   * New files/dirs created inside will inherit these permissions
   */
  static async setDefaultACL(params) {
    const { path: targetPath, type, qualifier, permissions, recursive = false } = params;

    try {
      logger.info('ACL: Set default ACL', { path: targetPath, type, qualifier, permissions });

      const pathCheck = this.validatePathSafety(targetPath);
      if (!pathCheck.safe) return { success: false, ...pathCheck };

      const permCheck = this.validatePermissions(permissions);
      if (!permCheck.valid) return { success: false, error: 'INVALID_PERMISSIONS', message: permCheck.message };

      if (!['u', 'g', 'o'].includes(type)) {
        return { success: false, error: 'INVALID_TYPE', message: 'Type must be u, g, or o' };
      }

      const aclString = qualifier ? `${type}:${qualifier}:${permissions}` : `${type}::${permissions}`;
      const args = recursive
        ? ['-R', '-d', '-m', aclString, targetPath]
        : ['-d', '-m', aclString, targetPath];

      try {
        await execute('setfacl', args, { timeout: 30000 });
        return { success: true, message: `Default ACL set: ${aclString}` };
      } catch (err) {
        return { success: false, error: 'ACL_FAILED', message: err.message };
      }
    } catch (err) {
      return { success: false, error: 'SERVICE_ERROR', message: err.message };
    }
  }

  /**
   * Set base default permissions (owner full, group r-x, others none)
   */
  static async setDefaultPermissions(params) {
    const { path: targetPath, recursive = false } = params;

    try {
      logger.info('ACL: Set default permissions', { path: targetPath, recursive });

      const pathCheck = this.validatePathSafety(targetPath);
      if (!pathCheck.safe) return { success: false, ...pathCheck };

      const acls = ['u::rwx', 'g::rx', 'o::', 'm::rwx'];

      for (const acl of acls) {
        const args = recursive ? ['-R', '-m', acl, targetPath] : ['-m', acl, targetPath];
        try {
          await execute('setfacl', args, { timeout: 30000 });
        } catch (err) {
          logger.warn('setfacl partial failure', { acl, error: err.message });
        }
      }

      return { success: true, recursive, message: 'Default permissions applied' };
    } catch (err) {
      return { success: false, error: 'SERVICE_ERROR', message: err.message };
    }
  }

  /**
   * Get ACL for path — returns structured JSON
   */
  static async getPermissions(params) {
    const { path: targetPath } = params;

    try {
      logger.info('ACL: Get permissions', { path: targetPath });

      const pathCheck = this.validatePathSafety(targetPath);
      if (!pathCheck.safe) return { success: false, ...pathCheck };

      try {
        const { stdout } = await execute('getfacl', ['--absolute-names', targetPath], { timeout: 10000 });

        // Parse getfacl output into structured entries
        const entries = [];
        const defaults = [];
        const lines = stdout.split('\n');
        let owner = '';
        let ownerGroup = '';

        for (const line of lines) {
          const trimmed = line.trim();

          if (trimmed.startsWith('# owner:')) {
            owner = trimmed.replace('# owner:', '').trim();
            continue;
          }
          if (trimmed.startsWith('# group:')) {
            ownerGroup = trimmed.replace('# group:', '').trim();
            continue;
          }
          if (trimmed.startsWith('#') || !trimmed) continue;

          // Parse ACL entry: type:qualifier:permissions
          const isDefault = trimmed.startsWith('default:');
          const entryStr = isDefault ? trimmed.replace('default:', '') : trimmed;
          const parts = entryStr.split(':');

          if (parts.length >= 2) {
            const entry = {
              type: parts[0],               // user, group, mask, other
              qualifier: parts[1] || '',     // username/groupname or empty for owner
              permissions: parts[2] || '',   // rwx, r-x, --- etc
              effective: null
            };

            // Check for effective permissions comment
            const effectiveMatch = line.match(/#effective:([\w-]+)/);
            if (effectiveMatch) {
              entry.effective = effectiveMatch[1];
            }

            if (isDefault) {
              defaults.push(entry);
            } else {
              entries.push(entry);
            }
          }
        }

        return {
          success: true,
          path: targetPath,
          owner,
          ownerGroup,
          entries,
          defaults,
          raw: stdout,
          message: 'Permissions retrieved'
        };
      } catch (err) {
        logger.warn('getfacl failed', { error: err.message });
        return { success: false, error: 'GET_FAILED', message: err.message };
      }
    } catch (err) {
      return { success: false, error: 'SERVICE_ERROR', message: err.message };
    }
  }

  /**
   * Remove ACL for user
   */
  static async removeUserPermissions(params) {
    const { path: targetPath, user, recursive = false } = params;

    try {
      logger.info('ACL: Remove user permissions', { path: targetPath, user, recursive });

      const pathCheck = this.validatePathSafety(targetPath);
      if (!pathCheck.safe) return { success: false, ...pathCheck };

      const userCheck = this.validateUsername(user);
      if (!userCheck.valid) return { success: false, error: 'INVALID_USER', message: userCheck.message };

      const aclString = `u:${user}`;
      const args = recursive ? ['-R', '-x', aclString, targetPath] : ['-x', aclString, targetPath];

      try {
        await execute('setfacl', args, { timeout: 30000 });
        return { success: true, user, message: `Permissions removed for user ${user}` };
      } catch (err) {
        return { success: false, error: 'ACL_FAILED', message: err.message };
      }
    } catch (err) {
      return { success: false, error: 'SERVICE_ERROR', message: err.message };
    }
  }

  /**
   * Remove ACL for group
   */
  static async removeGroupPermissions(params) {
    const { path: targetPath, group, recursive = false } = params;

    try {
      logger.info('ACL: Remove group permissions', { path: targetPath, group, recursive });

      const pathCheck = this.validatePathSafety(targetPath);
      if (!pathCheck.safe) return { success: false, ...pathCheck };

      const groupCheck = this.validateGroupName(group);
      if (!groupCheck.valid) return { success: false, error: 'INVALID_GROUP', message: groupCheck.message };

      const aclString = `g:${group}`;
      const args = recursive ? ['-R', '-x', aclString, targetPath] : ['-x', aclString, targetPath];

      try {
        await execute('setfacl', args, { timeout: 30000 });
        return { success: true, group, message: `Permissions removed for group ${group}` };
      } catch (err) {
        return { success: false, error: 'ACL_FAILED', message: err.message };
      }
    } catch (err) {
      return { success: false, error: 'SERVICE_ERROR', message: err.message };
    }
  }

  /**
   * Remove ALL extended ACLs from a path
   * Uses: setfacl -b
   */
  static async removeAllACLs(params) {
    const { path: targetPath, recursive = false } = params;

    try {
      logger.info('ACL: Remove all ACLs', { path: targetPath, recursive });

      const pathCheck = this.validatePathSafety(targetPath);
      if (!pathCheck.safe) return { success: false, ...pathCheck };

      const args = recursive ? ['-R', '-b', targetPath] : ['-b', targetPath];

      try {
        await execute('setfacl', args, { timeout: 30000 });
        return { success: true, message: 'All extended ACLs removed' };
      } catch (err) {
        return { success: false, error: 'ACL_FAILED', message: err.message };
      }
    } catch (err) {
      return { success: false, error: 'SERVICE_ERROR', message: err.message };
    }
  }
}

module.exports = {
  ACLError,
  ACLService
};
