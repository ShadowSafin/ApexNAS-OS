/**
 * Share Service — Central Orchestrator
 * 
 * The Share is the central object in the NAS system.
 * SMB, NFS, and FTP are *attached services* on a share.
 *
 * This service:
 * - Creates/deletes shared folder directories
 * - Persists share metadata to /etc/nas/shares.json
 * - Orchestrates SMB/NFS/FTP by calling their service modules
 * - Enriches shares with live ACL (getfacl) and access endpoints
 *
 * SECURITY: All paths must be under /mnt/storage
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execute } = require('../../lib/executor');
const logger = require('../../lib/logger');
const { STORAGE_ROOT } = require('../storage/filesystem.service');
const { ACLService } = require('../acl/acl.service');

// ── Error class ──────────────────────────────────────────────────────
class ShareError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

// ── In-memory store ──────────────────────────────────────────────────
const shares = new Map();
const sharePaths = new Map(); // path → share id (collision detection)

// ── Constants ────────────────────────────────────────────────────────
const SHARE_CONFIG_PATH = '/etc/nas/shares.json';
const SHARE_CONFIG_DIR = '/etc/nas';

// ── Concurrency locks ────────────────────────────────────────────────
const operationLocks = new Map();

async function acquireLock(key) {
  const existing = operationLocks.get(key) || Promise.resolve();
  let release;
  const promise = new Promise(r => { release = r; });
  operationLocks.set(key, promise);
  await existing;
  return release;
}

// ── Network helper ───────────────────────────────────────────────────
function getPrimaryIP() {
  try {
    const interfaces = os.networkInterfaces();
    const candidates = ['eth0', 'ens0', 'enp0s3', 'wlan0', 'wlan1'];
    for (const iface of candidates) {
      if (interfaces[iface]) {
        const ipv4 = interfaces[iface].find(a => a.family === 'IPv4' && !a.internal);
        if (ipv4) return ipv4.address;
      }
    }
    for (const [, addrs] of Object.entries(interfaces)) {
      const ipv4 = addrs.find(a => a.family === 'IPv4' && !a.internal);
      if (ipv4) return ipv4.address;
    }
    return '127.0.0.1';
  } catch {
    return '127.0.0.1';
  }
}

// ── Default service config factory ───────────────────────────────────
function defaultServiceConfig() {
  return {
    smb: { enabled: false, readOnly: false, guestOk: false, browseable: true },
    nfs: { enabled: false, subnet: '192.168.1.0/24', mode: 'rw' },
    ftp: { enabled: false, mode: 'rw' }
  };
}

// ══════════════════════════════════════════════════════════════════════
//  ShareService
// ══════════════════════════════════════════════════════════════════════

class ShareService {

  // ── Initialisation ─────────────────────────────────────────────────

  static async initialize() {
    try {
      if (!fs.existsSync(SHARE_CONFIG_DIR)) {
        fs.mkdirSync(SHARE_CONFIG_DIR, { recursive: true, mode: 0o755 });
        logger.info('Created share config directory', { path: SHARE_CONFIG_DIR });
      }

      if (fs.existsSync(SHARE_CONFIG_PATH)) {
        try {
          const data = JSON.parse(fs.readFileSync(SHARE_CONFIG_PATH, 'utf8'));
          if (Array.isArray(data)) {
            data.forEach(share => {
              // Migrate flat boolean services to rich config
              if (share.services && typeof share.services.smb === 'boolean') {
                share.services = {
                  smb: { enabled: share.services.smb, readOnly: false, guestOk: false, browseable: true },
                  nfs: { enabled: share.services.nfs, subnet: '192.168.1.0/24', mode: 'rw' },
                  ftp: { enabled: share.services.ftp, mode: 'rw' }
                };
              }
              if (!share.services) {
                share.services = defaultServiceConfig();
              }
              shares.set(share.name, share);
              sharePaths.set(share.path, share.id);
            });
            logger.info('Shares loaded from persistent storage', { count: data.length });
          }
        } catch (err) {
          logger.warn('Could not parse shares.json', { error: err.message });
        }
      }

      logger.info('Share service initialized', { shares: shares.size });
    } catch (err) {
      logger.error('Share service initialization failed', { error: err.message });
    }
  }

  // ── Persistence ────────────────────────────────────────────────────

  static async persistShares() {
    try {
      const data = Array.from(shares.values());
      fs.writeFileSync(SHARE_CONFIG_PATH, JSON.stringify(data, null, 2), 'utf8');
      logger.debug('Shares persisted to disk', { count: data.length });
    } catch (err) {
      logger.error('Failed to persist shares', { error: err.message });
      throw err;
    }
  }

  // ── Path validation ────────────────────────────────────────────────

  static validateSharePath(basePath, shareName) {
    try {
      let decodedBase = basePath;
      let decodedName = shareName;

      try {
        decodedBase = decodeURIComponent(basePath);
        decodedName = decodeURIComponent(shareName);
      } catch { /* not encoded */ }

      // Reject traversal in name
      if (decodedName.includes('..') || decodedName.includes('/') || decodedName.includes('\\')) {
        return { valid: false, error: 'INVALID_NAME', message: 'Share name must not contain path separators' };
      }
      if (!decodedName || decodedName.includes(' ') || !/^[a-zA-Z0-9_-]{1,32}$/.test(decodedName)) {
        return { valid: false, error: 'INVALID_NAME', message: 'Share name: 1-32 alphanumeric/underscore/hyphen characters, no spaces' };
      }

      const fullPath = path.join(decodedBase, decodedName);
      const resolved = path.resolve(fullPath);

      let canonical = resolved;
      if (fs.existsSync(resolved)) {
        try { canonical = fs.realpathSync(resolved); } catch { /* use resolved */ }
      }

      if (!canonical.startsWith(STORAGE_ROOT)) {
        logger.error('SECURITY: Share path outside storage root', { canonical, root: STORAGE_ROOT });
        return { valid: false, error: 'INVALID_PATH', message: `Share must be under ${STORAGE_ROOT}` };
      }

      // Block dangerous paths
      const blocked = ['/', '/etc', '/root', '/boot', '/dev', '/proc', '/sys', '/bin', '/sbin', '/usr', '/home', '/opt'];
      for (const b of blocked) {
        if (canonical === b || canonical.startsWith(b + '/')) {
          return { valid: false, error: 'BLOCKED_PATH', message: `Path not allowed: ${canonical}` };
        }
      }

      return { valid: true, path: canonical };
    } catch (err) {
      return { valid: false, error: 'INVALID_PATH', message: 'Invalid path' };
    }
  }

  // ── Create share ───────────────────────────────────────────────────

  static async createShare(params) {
    const { name, basePath = STORAGE_ROOT, filesystem = 'ext4' } = params;
    const release = await acquireLock(`share:create:${name}`);

    try {
      logger.info('ShareService: Create share', { name, basePath });

      if (!name) return { success: false, error: 'INVALID_INPUT', message: 'name is required' };

      const pathValidation = this.validateSharePath(basePath, name);
      if (!pathValidation.valid) return { success: false, ...pathValidation };

      const sharePath = pathValidation.path;

      if (shares.has(name)) {
        return { success: false, error: 'SHARE_EXISTS', message: `Share "${name}" already exists` };
      }
      if (sharePaths.has(sharePath)) {
        return { success: false, error: 'PATH_IN_USE', message: 'Path already used by another share' };
      }
      if (!fs.existsSync(basePath)) {
        // Auto-create base path if it's the root itself, otherwise fail
        if (basePath === STORAGE_ROOT) {
          try {
            fs.mkdirSync(basePath, { recursive: true, mode: 0o755 });
            logger.info('Auto-created storage root', { basePath });
          } catch (err) {
            return { success: false, error: 'INVALID_PATH', message: `Failed to create base path: ${err.message}` };
          }
        } else {
          return { success: false, error: 'INVALID_PATH', message: `Base path does not exist: ${basePath}` };
        }
      }

      // Create directory
      try {
        if (!fs.existsSync(sharePath)) {
          fs.mkdirSync(sharePath, { recursive: true, mode: 0o755 });
          logger.info('Share directory created', { path: sharePath });
        }
      } catch (err) {
        return { success: false, error: 'CREATE_FAILED', message: err.message };
      }

      const share = {
        id: `share_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        name,
        path: sharePath,
        basePath,
        filesystem,
        createdAt: new Date().toISOString(),
        services: defaultServiceConfig()
      };

      shares.set(name, share);
      sharePaths.set(sharePath, share.id);

      try {
        await this.persistShares();
      } catch (err) {
        shares.delete(name);
        sharePaths.delete(sharePath);
        try { fs.rmdirSync(sharePath); } catch { /* cleanup best-effort */ }
        return { success: false, error: 'PERSISTENCE_FAILED', message: 'Failed to save share configuration' };
      }

      logger.info('Share created', { id: share.id, name, path: sharePath });
      return { success: true, created: true, share };
    } catch (err) {
      return { success: false, error: 'SERVICE_ERROR', message: err.message };
    } finally {
      release();
    }
  }

  // ── Delete share ───────────────────────────────────────────────────

  static async deleteShare(params) {
    const { name, removeDirectory = false } = params;
    const release = await acquireLock(`share:delete:${name}`);

    try {
      logger.info('ShareService: Delete share', { name, removeDirectory });

      if (!name) return { success: false, error: 'INVALID_INPUT', message: 'name is required' };
      if (!shares.has(name)) return { success: false, error: 'SHARE_NOT_FOUND', message: `Share "${name}" not found` };

      const share = shares.get(name);

      // ── Clean up attached protocols ────────────────────────────────
      try {
        if (share.services?.smb?.enabled) {
          await this._detachSMB(share);
        }
        if (share.services?.nfs?.enabled) {
          await this._detachNFS(share);
        }
        // FTP: no per-share detach needed (vsftpd uses ACL)
      } catch (err) {
        logger.warn('Protocol cleanup had errors', { error: err.message });
      }

      // ── Optionally remove directory ────────────────────────────────
      if (removeDirectory && fs.existsSync(share.path)) {
        try {
          const contents = fs.readdirSync(share.path);
          if (contents.length > 0) {
            return { success: false, error: 'DIRECTORY_NOT_EMPTY', message: 'Directory contains files. Remove them first.' };
          }
          fs.rmdirSync(share.path);
        } catch (err) {
          return { success: false, error: 'DELETE_FAILED', message: err.message };
        }
      }

      shares.delete(name);
      sharePaths.delete(share.path);

      try { await this.persistShares(); } catch (err) {
        logger.warn('Failed to persist after delete', { error: err.message });
      }

      logger.info('Share deleted', { name });
      return { success: true, deleted: true, message: `Share "${name}" deleted` };
    } catch (err) {
      return { success: false, error: 'SERVICE_ERROR', message: err.message };
    } finally {
      release();
    }
  }

  // ══════════════════════════════════════════════════════════════════
  //  SERVICE ORCHESTRATION — the critical new piece
  // ══════════════════════════════════════════════════════════════════

  /**
   * Update service attachments for a share.
   * 
   * @param {string} name - share name
   * @param {object} serviceUpdates - partial updates, e.g.
   *   { smb: { enabled: true, readOnly: false } }
   *   { nfs: { enabled: true, subnet: '10.0.0.0/8', mode: 'ro' } }
   *   { ftp: { enabled: false } }
   */
  static async updateServices(name, serviceUpdates) {
    const release = await acquireLock(`share:services:${name}`);

    try {
      logger.info('ShareService: Update services', { name, serviceUpdates });

      if (!shares.has(name)) {
        return { success: false, error: 'SHARE_NOT_FOUND', message: `Share "${name}" not found` };
      }

      const share = shares.get(name);
      if (!share.services) share.services = defaultServiceConfig();

      const errors = [];

      // ── SMB orchestration ──────────────────────────────────────────
      if (serviceUpdates.smb !== undefined) {
        const smbUpdate = serviceUpdates.smb;
        const wasEnabled = share.services.smb?.enabled || false;
        const willEnable = smbUpdate.enabled !== undefined ? smbUpdate.enabled : wasEnabled;

        // Merge config
        share.services.smb = {
          ...share.services.smb,
          ...smbUpdate,
          enabled: willEnable
        };

        try {
          if (willEnable && !wasEnabled) {
            await this._attachSMB(share);
          } else if (!willEnable && wasEnabled) {
            await this._detachSMB(share);
          } else if (willEnable && wasEnabled) {
            // Config changed (e.g. readOnly toggled) — re-attach
            await this._detachSMB(share);
            await this._attachSMB(share);
          }
        } catch (err) {
          errors.push(`SMB: ${err.message}`);
          logger.error('SMB orchestration failed', { error: err.message });
        }
      }

      // ── NFS orchestration ──────────────────────────────────────────
      if (serviceUpdates.nfs !== undefined) {
        const nfsUpdate = serviceUpdates.nfs;
        const wasEnabled = share.services.nfs?.enabled || false;
        const willEnable = nfsUpdate.enabled !== undefined ? nfsUpdate.enabled : wasEnabled;

        share.services.nfs = {
          ...share.services.nfs,
          ...nfsUpdate,
          enabled: willEnable
        };

        try {
          if (willEnable && !wasEnabled) {
            await this._attachNFS(share);
          } else if (!willEnable && wasEnabled) {
            await this._detachNFS(share);
          } else if (willEnable && wasEnabled) {
            await this._detachNFS(share);
            await this._attachNFS(share);
          }
        } catch (err) {
          errors.push(`NFS: ${err.message}`);
          logger.error('NFS orchestration failed', { error: err.message });
        }
      }

      // ── FTP orchestration ──────────────────────────────────────────
      if (serviceUpdates.ftp !== undefined) {
        const ftpUpdate = serviceUpdates.ftp;
        const wasEnabled = share.services.ftp?.enabled || false;
        const willEnable = ftpUpdate.enabled !== undefined ? ftpUpdate.enabled : wasEnabled;

        share.services.ftp = {
          ...share.services.ftp,
          ...ftpUpdate,
          enabled: willEnable
        };
        // FTP uses vsftpd with chroot + Linux ACL, no per-share config file
        // The share path is accessible via FTP if the user has filesystem perms
        logger.info('FTP service toggle', { name, enabled: willEnable });
      }

      shares.set(name, share);
      await this.persistShares();

      if (errors.length > 0) {
        return { success: true, warnings: errors, share, message: 'Services updated with warnings' };
      }

      return { success: true, share, message: 'Services updated' };
    } catch (err) {
      return { success: false, error: 'SERVICE_ERROR', message: err.message };
    } finally {
      release();
    }
  }

  // ── SMB attach/detach (calls SMBService) ───────────────────────────

  static async _attachSMB(share) {
    const { SMBService } = require('../smb/smb.service');

    logger.info('Attaching SMB', { name: share.name, path: share.path });

    // Build SMB share config and write to smb.conf
    const result = await SMBService.createShare({
      name: share.name,
      path: share.path,
      browseable: share.services.smb.browseable !== false,
      writable: !share.services.smb.readOnly,
      guestOk: share.services.smb.guestOk === true,
      validUsers: [],
      comment: `NAS shared folder: ${share.name}`
    });

    if (!result.success) {
      // If it failed because service isn't enabled, try starting it
      if (result.error === 'SERVICE_NOT_ENABLED') {
        logger.info('SMB service not running, attempting to start');
        await SMBService.enableService();
        // Retry
        const retry = await SMBService.createShare({
          name: share.name,
          path: share.path,
          browseable: share.services.smb.browseable !== false,
          writable: !share.services.smb.readOnly,
          guestOk: share.services.smb.guestOk === true,
          validUsers: [],
          comment: `NAS shared folder: ${share.name}`
        });
        if (!retry.success) throw new Error(retry.message);
      } else if (result.error === 'DUPLICATE_SHARE') {
        // Already exists in smb.conf — that's fine
        logger.info('SMB share already exists in config, skipping', { name: share.name });
      } else {
        throw new Error(result.message);
      }
    }

    logger.info('SMB attached', { name: share.name });
  }

  static async _detachSMB(share) {
    const { SMBService } = require('../smb/smb.service');

    logger.info('Detaching SMB', { name: share.name });

    try {
      await SMBService.removeShare({ name: share.name });
    } catch (err) {
      logger.warn('SMB detach warning', { error: err.message });
    }
  }

  // ── NFS attach/detach (calls NFSService) ───────────────────────────

  static async _attachNFS(share) {
    const { NFSService } = require('../nfs/nfs.service');

    logger.info('Attaching NFS', { name: share.name, path: share.path });

    const subnet = share.services.nfs.subnet || '192.168.1.0/24';
    const mode = share.services.nfs.mode || 'rw';
    const opts = `${mode},sync,no_subtree_check`;

    const result = await NFSService.createShare({
      name: share.name,
      path: share.path,
      clients: [{ ip: subnet, options: opts }]
    });

    if (!result.success) {
      if (result.error === 'SERVICE_NOT_ENABLED') {
        await NFSService.enableService();
        const retry = await NFSService.createShare({
          name: share.name,
          path: share.path,
          clients: [{ ip: subnet, options: opts }]
        });
        if (!retry.success) throw new Error(retry.message);
      } else if (result.error === 'DUPLICATE_SHARE' || result.error === 'PATH_ALREADY_EXPORTED') {
        logger.info('NFS export already exists, skipping', { name: share.name });
      } else {
        throw new Error(result.message);
      }
    }

    logger.info('NFS attached', { name: share.name });
  }

  static async _detachNFS(share) {
    const { NFSService } = require('../nfs/nfs.service');

    logger.info('Detaching NFS', { name: share.name });

    try {
      await NFSService.removeShare({ name: share.name });
    } catch (err) {
      logger.warn('NFS detach warning', { error: err.message });
    }
  }

  // ══════════════════════════════════════════════════════════════════
  //  ACCESS ENDPOINTS
  // ══════════════════════════════════════════════════════════════════

  static computeAccessEndpoints(share) {
    const ip = getPrimaryIP();
    const endpoints = {};

    if (share.services?.smb?.enabled) {
      endpoints.smb = `\\\\${ip}\\${share.name}`;
    }
    if (share.services?.nfs?.enabled) {
      endpoints.nfs = `${ip}:${share.path}`;
    }
    if (share.services?.ftp?.enabled) {
      endpoints.ftp = `ftp://${ip}/${share.name}`;
    }

    return endpoints;
  }

  // ══════════════════════════════════════════════════════════════════
  //  READ OPERATIONS (with live ACL enrichment)
  // ══════════════════════════════════════════════════════════════════

  static async listShares() {
    try {
      logger.info('Listing shares');

      const shareList = Array.from(shares.values());

      const enriched = await Promise.all(shareList.map(async (share) => {
        // Live ACL from getfacl
        let permissions = [];
        try {
          const aclResult = await ACLService.getPermissions({ path: share.path });
          if (aclResult.success) {
            permissions = aclResult.entries || [];
          }
        } catch { /* non-fatal */ }

        // Access endpoints
        const access = this.computeAccessEndpoints(share);

        return {
          ...share,
          permissions,
          access
        };
      }));

      logger.info('Listed shares', { count: enriched.length });
      return { success: true, shares: enriched, count: enriched.length };
    } catch (err) {
      logger.error('List shares error', { error: err.message });
      return { success: false, error: 'LIST_FAILED', message: err.message };
    }
  }

  static async getShare(params) {
    const { name } = params;

    try {
      if (!name) return { success: false, error: 'INVALID_INPUT', message: 'name is required' };
      if (!shares.has(name)) return { success: false, error: 'SHARE_NOT_FOUND', message: `Share "${name}" not found` };

      const share = { ...shares.get(name) };

      // Live ACL
      try {
        const aclResult = await ACLService.getPermissions({ path: share.path });
        if (aclResult.success) {
          share.permissions = aclResult.entries;
          share.owner = aclResult.owner;
          share.ownerGroup = aclResult.ownerGroup;
        } else {
          share.permissions = [];
        }
      } catch {
        share.permissions = [];
      }

      share.access = this.computeAccessEndpoints(share);

      return { success: true, share };
    } catch (err) {
      return { success: false, error: 'SERVICE_ERROR', message: err.message };
    }
  }

  // ── Batch permissions update ───────────────────────────────────────

  static async updatePermissions(name, permissionEntries) {
    const release = await acquireLock(`share:permissions:${name}`);

    try {
      logger.info('ShareService: Update permissions', { name, count: permissionEntries?.length });

      if (!shares.has(name)) {
        return { success: false, error: 'SHARE_NOT_FOUND', message: `Share "${name}" not found` };
      }

      const share = shares.get(name);
      const results = [];

      for (const entry of permissionEntries) {
        const { subject, access } = entry;
        // subject format: "user:john" or "group:family"
        const [type, target] = subject.split(':');

        let perms = '';
        if (access === 'write') perms = 'rwx';
        else if (access === 'read') perms = 'rx';
        else perms = '';  // none

        let result;
        if (type === 'user') {
          result = await ACLService.setUserPermissions({
            path: share.path,
            user: target,
            permissions: perms,
            recursive: true
          });
        } else if (type === 'group') {
          result = await ACLService.setGroupPermissions({
            path: share.path,
            group: target,
            permissions: perms,
            recursive: true
          });
        } else {
          result = { success: false, message: `Unknown subject type: ${type}` };
        }

        results.push({ subject, access, ...result });
      }

      return { success: true, results, message: 'Permissions updated' };
    } catch (err) {
      return { success: false, error: 'SERVICE_ERROR', message: err.message };
    } finally {
      release();
    }
  }

  // ── Legacy compat: simple service flag update ──────────────────────
  static async updateShareServices(name, serviceName, enabled) {
    const update = {};
    update[serviceName] = { enabled };
    return this.updateServices(name, update);
  }
}

module.exports = {
  ShareError,
  ShareService,
  shares
};
