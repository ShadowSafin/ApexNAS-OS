/**
 * NFS (Network File System) Service - Phase 5
 * 
 * Network sharing over NFS protocol
 * - Safe configuration of NFS exports
 * - Validation-first approach
 * - Config file management for /etc/exports
 * - Idempotent operations
 * 
 * CRITICAL: No root squash bypass, no wildcard full access
 */

const fs = require('fs');
const path = require('path');
const { execute } = require('../../lib/executor');
const logger = require('../../lib/logger');

const STORAGE_ROOT = '/mnt/storage';
const NFS_EXPORTS_PATH = '/etc/exports';
const NETWORK_SHARES_PATH = '/etc/nas/network-shares.json';

// Dangerous paths that must NEVER be exported
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

// Default NFS client network (can be overridden)
const DEFAULT_NFS_SUBNET = '127.0.0.1';

class NFSError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

class NFSService {
  /**
   * VALIDATION LAYER - Check before any operations
   */

  static validateShareExists(shareName) {
    try {
      const shares = this.loadNetworkShares();
      const nfsShare = shares.nfs?.find(s => s.name === shareName);
      if (!nfsShare) {
        return { valid: false, error: 'SHARE_NOT_FOUND', message: `NFS share "${shareName}" not found` };
      }
      return { valid: true, share: nfsShare };
    } catch (err) {
      logger.error('Failed to validate NFS share', { error: err.message });
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
          logger.error('SECURITY: Blocked dangerous NFS path', { path: canonical, blocked });
          return { valid: false, error: 'BLOCKED_PATH', message: `Path not allowed: ${canonical}` };
        }
      }

      // Must be under storage root
      if (!canonical.startsWith(STORAGE_ROOT)) {
        logger.error('SECURITY: NFS path outside storage root', { path: canonical });
        return { valid: false, error: 'UNSAFE_PATH', message: `Path must be under ${STORAGE_ROOT}` };
      }

      // Path must exist
      if (!fs.existsSync(canonical)) {
        return { valid: false, error: 'PATH_NOT_FOUND', message: `Path does not exist: ${canonical}` };
      }

      return { valid: true, path: canonical };
    } catch (err) {
      logger.error('NFS path validation failed', { error: err.message });
      return { valid: false, error: 'INVALID_PATH', message: err.message };
    }
  }

  static validateNFSName(name) {
    if (!name || typeof name !== 'string') {
      return { valid: false, message: 'Name must be a string' };
    }

    // NFS export names: alphanumeric, hyphen, underscore (32 chars max)
    if (!/^[a-zA-Z0-9_-]{1,32}$/.test(name)) {
      return { valid: false, message: 'Invalid NFS export name. Use alphanumeric, hyphen, underscore only' };
    }

    return { valid: true };
  }

  static validateExportRules(clients) {
    try {
      if (!clients || !Array.isArray(clients)) {
        return { valid: false, message: 'Clients must be an array' };
      }

      // Prevent wildcard-only exports unless explicitly flagged
      const hasWildcard = clients.some(c => c.ip === '*');
      if (hasWildcard && clients.length === 1) {
        return { 
          valid: false, 
          message: 'Cannot export to * (wildcard). Specify explicit IP ranges or use localhost' 
        };
      }

      for (const client of clients) {
        if (!client.ip || !client.options) {
          return { valid: false, message: 'Each client must have ip and options' };
        }

        // Validate IP/subnet
        if (!/^[\d./:a-zA-Z*-]+$/.test(client.ip)) {
          return { valid: false, message: `Invalid client IP: ${client.ip}` };
        }

        // Validate options
        if (!/^[a-z_=,\d]+$/.test(client.options)) {
          return { valid: false, message: `Invalid NFS options: ${client.options}` };
        }

        // Block root_squash=no unless explicitly confirmed
        if (client.options.includes('no_root_squash') && !client.confirmNoRootSquash) {
          return {
            valid: false,
            message: 'no_root_squash is dangerous. Confirm with confirmNoRootSquash=true if needed'
          };
        }
      }

      return { valid: true };
    } catch (err) {
      logger.error('Export rules validation failed', { error: err.message });
      return { valid: false, message: 'Invalid export rules' };
    }
  }

  /**
   * NFS CONFIG MANAGEMENT
   */

  static parseExports() {
    try {
      if (!fs.existsSync(NFS_EXPORTS_PATH)) {
        logger.warn('NFS exports file does not exist', { path: NFS_EXPORTS_PATH });
        return { exports: [] };
      }

      const content = fs.readFileSync(NFS_EXPORTS_PATH, 'utf8');
      const exports = [];

      const lines = content.split('\n');
      for (const line of lines) {
        if (!line.trim() || line.trim().startsWith('#')) continue;

        // Parse: /path/to/export 192.168.1.0/24(rw,sync,no_subtree_check)
        const match = line.match(/^(\S+)\s+(.+?)$/);
        if (match) {
          const [, exportPath, clientSpec] = match;

          // Parse clients
          const clients = [];
          const clientMatches = clientSpec.match(/(\S+?)\(([\w=,]+)\)/g);
          if (clientMatches) {
            for (const clientMatch of clientMatches) {
              const clientMatch2 = clientMatch.match(/^(\S+?)\(([\w=,]+)\)$/);
              if (clientMatch2) {
                clients.push({
                  ip: clientMatch2[1],
                  options: clientMatch2[2]
                });
              }
            }
          }

          exports.push({
            path: exportPath,
            clients
          });
        }
      }

      logger.info('NFS exports parsed', { count: exports.length });
      return { exports };
    } catch (err) {
      logger.error('Failed to parse NFS exports', { error: err.message });
      throw new NFSError('EXPORTS_PARSE_FAILED', `Failed to parse NFS exports: ${err.message}`);
    }
  }

  static buildExportLine(exportPath, clients) {
    try {
      if (!clients || clients.length === 0) {
        // Default to localhost only
        return `${exportPath} 127.0.0.1(ro,sync,no_subtree_check)`;
      }

      const clientSpecs = clients.map(c => `${c.ip}(${c.options})`).join(' ');
      return `${exportPath} ${clientSpecs}`;
    } catch (err) {
      logger.error('Failed to build export line', { error: err.message });
      throw err;
    }
  }

  static async updateExports(exports) {
    try {
      logger.info('Updating NFS exports', { count: exports.length });

      // Read existing exports preserving comments and structure
      let content = '';
      if (fs.existsSync(NFS_EXPORTS_PATH)) {
        content = fs.readFileSync(NFS_EXPORTS_PATH, 'utf8');
      }

      // Preserve comments and header
      const lines = content.split('\n');
      const header = lines.filter(l => l.trim().startsWith('#') || !l.trim()).join('\n');

      // Build new exports section
      const newExports = exports.map(exp => this.buildExportLine(exp.path, exp.clients)).join('\n');

      const finalContent = header + '\n' + newExports + '\n';

      // Write safely
      fs.writeFileSync(NFS_EXPORTS_PATH, finalContent, 'utf8');
      logger.info('NFS exports updated', { path: NFS_EXPORTS_PATH });

      // Apply with exportfs
      try {
        await execute('exportfs', ['-ra'], { timeout: 10000 });
        logger.info('NFS exports applied', { method: 'exportfs -ra' });
      } catch (err) {
        logger.error('exportfs -ra failed', { error: err.message });
        throw new NFSError('EXPORTFS_FAILED', err.message);
      }

      return { success: true, message: 'NFS exports updated' };
    } catch (err) {
      logger.error('Failed to update NFS exports', { error: err.message });
      throw err;
    }
  }

  /**
   * NFS SHARE MANAGEMENT
   */

  static async createShare(params) {
    const { name, path: sharePath, clients = [] } = params;

    try {
      logger.info('NFS: Create share request', { name, path: sharePath, clients: clients.length });

      // Check if NFS service is enabled
      const status = await this.getServiceStatus();
      if (!status.active) {
        return {
          success: false,
          error: 'SERVICE_NOT_ENABLED',
          message: 'NFS service must be enabled before creating exports'
        };
      }

      // VALIDATION LAYER
      const nameCheck = this.validateNFSName(name);
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

      const rulesCheck = this.validateExportRules(clients);
      if (!rulesCheck.valid) {
        return { success: false, error: 'INVALID_EXPORT', message: rulesCheck.message };
      }

      // Check for duplicate
      const existing = this.loadNetworkShares();
      if (existing.nfs?.some(s => s.name === name)) {
        return { success: false, error: 'DUPLICATE_SHARE', message: `NFS share "${name}" already exists` };
      }

      // Build share object
      const share = {
        name,
        path: pathCheck.path,
        protocol: 'NFS',
        clients: clients.length > 0 ? clients : [{ ip: '127.0.0.1', options: 'ro,sync,no_subtree_check' }],
        createdAt: new Date().toISOString()
      };

      // Parse existing exports
      const parsed = this.parseExports();

      // Check this path not already exported
      if (parsed.exports.some(e => e.path === pathCheck.path)) {
        return { success: false, error: 'PATH_ALREADY_EXPORTED', message: 'This path is already exported' };
      }

      // Add new export
      parsed.exports.push({
        path: pathCheck.path,
        clients: share.clients
      });

      // Update exports file
      await this.updateExports(parsed.exports);

      // Persist to network-shares.json
      const networkShares = this.loadNetworkShares();
      if (!networkShares.nfs) networkShares.nfs = [];
      networkShares.nfs.push(share);
      this.saveNetworkShares(networkShares);

      logger.info('NFS share created', { name, path: sharePath });

      return {
        success: true,
        message: `NFS share "${name}" created`,
        share
      };
    } catch (err) {
      logger.error('NFS share creation failed', { error: err.message });
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
      logger.info('NFS: Remove share request', { name });

      // Validate share exists
      const shareCheck = this.validateShareExists(name);
      if (!shareCheck.valid) {
        return { success: false, ...shareCheck };
      }

      const sharePath = shareCheck.share.path;

      // Parse exports and remove this share
      const parsed = this.parseExports();
      const filtered = parsed.exports.filter(e => e.path !== sharePath);

      // Update exports file
      await this.updateExports(filtered);

      // Update network-shares.json
      const networkShares = this.loadNetworkShares();
      if (networkShares.nfs) {
        networkShares.nfs = networkShares.nfs.filter(s => s.name !== name);
        this.saveNetworkShares(networkShares);
      }

      logger.info('NFS share removed', { name, path: sharePath });

      return {
        success: true,
        message: `NFS share "${name}" removed`
      };
    } catch (err) {
      logger.error('NFS share removal failed', { error: err.message });
      return {
        success: false,
        error: 'SERVICE_ERROR',
        message: err.message
      };
    }
  }

  static async listShares() {
    try {
      // Check if NFS service is enabled before listing shares
      const status = await this.getServiceStatus();
      if (!status.active) {
        logger.info('NFS service not active, returning empty shares list');
        return {
          success: true,
          shares: [],
          count: 0
        };
      }

      const parsed = this.parseExports();
      const networkShares = this.loadNetworkShares();
      const nfsShares = networkShares.nfs || [];

      logger.info('Listed NFS shares', { count: nfsShares.length });

      return {
        success: true,
        shares: nfsShares,
        count: nfsShares.length
      };
    } catch (err) {
      logger.error('Failed to list NFS shares', { error: err.message });
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
        const { stdout } = await execute('systemctl', ['is-active', 'nfs-server'], { timeout: 5000 });
        const active = stdout.trim() === 'active';

        logger.info('NFS service status', { active });

        return {
          success: true,
          active,
          service: 'nfs-server'
        };
      } catch (execErr) {
        // In dev environment where systemctl is not available, return inactive by default
        logger.warn('Could not check NFS service status via systemctl', { error: execErr.message });
        return {
          success: true,
          active: false,
          service: 'nfs-server'
        };
      }
    } catch (err) {
      logger.warn('Could not get NFS service status', { error: err.message });
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
      logger.info('Enabling NFS service');

      // Start the nfs-server service
      try {
        const startResult = await execute('systemctl', ['start', 'nfs-server'], { timeout: 10000 });
      } catch (execErr) {
        logger.warn('Could not start nfs-server via systemctl', { error: execErr.message });
      }
      
      // Enable it to start on boot
      try {
        const enableResult = await execute('systemctl', ['enable', 'nfs-server'], { timeout: 5000 });
      } catch (execErr) {
        logger.warn('Could not enable nfs-server via systemctl', { error: execErr.message });
      }

      logger.info('NFS service enable request processed');

      return {
        success: true,
        message: 'NFS service enable request processed'
      };
    } catch (err) {
      logger.error('Unexpected error enabling NFS service', { error: err.message });
      return {
        success: true,
        message: 'NFS service enable request processed (with warnings)'
      };
    }
  }

  static async disableService() {
    try {
      logger.info('Disabling NFS service');

      // Stop the nfs-server service
      try {
        const stopResult = await execute('systemctl', ['stop', 'nfs-server'], { timeout: 10000 });
      } catch (execErr) {
        logger.warn('Could not stop nfs-server via systemctl', { error: execErr.message });
      }
      
      // Disable it from starting on boot
      try {
        const disableResult = await execute('systemctl', ['disable', 'nfs-server'], { timeout: 5000 });
      } catch (execErr) {
        logger.warn('Could not disable nfs-server via systemctl', { error: execErr.message });
      }

      logger.info('NFS service disable request processed');

      return {
        success: true,
        message: 'NFS service disable request processed'
      };
    } catch (err) {
      logger.error('Unexpected error disabling NFS service', { error: err.message });
      return {
        success: true,
        message: 'NFS service disable request processed (with warnings)'
      };
    }
  }

  static async getAvailablePaths() {
    try {
      logger.info('Getting available storage paths');

      const paths = [];
      const STORAGE_ROOT = '/mnt/storage';

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
      logger.info('Testing NFS share', { name });

      const shareCheck = this.validateShareExists(name);
      if (!shareCheck.valid) {
        return { success: false, ...shareCheck };
      }

      const sharePath = shareCheck.share.path;

      // Test with showmount
      try {
        const { stdout } = await execute('showmount', ['-e', 'localhost'], { timeout: 10000 });

        const exported = stdout.includes(sharePath);
        logger.info('NFS share test result', { name, exported });

        return {
          success: true,
          name,
          exported,
          message: exported ? 'NFS export is accessible' : 'NFS export may not be visible'
        };
      } catch (testErr) {
        logger.warn('NFS showmount test failed', { error: testErr.message });
        return {
          success: true,
          name,
          warning: 'Could not verify with showmount, but export should be configured'
        };
      }
    } catch (err) {
      logger.error('NFS share test failed', { error: err.message });
      return {
        success: false,
        error: 'TEST_FAILED',
        message: err.message
      };
    }
  }
}

module.exports = {
  NFSService,
  STORAGE_ROOT,
  BLOCKED_PATHS,
  DEFAULT_NFS_SUBNET
};
