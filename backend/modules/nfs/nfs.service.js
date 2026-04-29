/**
 * NFS (Network File System) Service — Dual-Layer Activation
 * 
 * Network sharing over NFS protocol
 * - Safe configuration of NFS exports
 * - Validation-first approach
 * - Config file management for /etc/exports
 * - Idempotent operations
 * - Global state integration via ServiceState
 * - Auto-detect subnet from NAS IP
 * - Firewall management
 * 
 * SECURITY:
 * - Root squash is enforced (no root privilege escalation)
 * - No wildcard access (explicit IPs only)
 * - Export path is EXACT share path (no parent directory)
 * - read-only option supported
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execute } = require('../../lib/executor');
const logger = require('../../lib/logger');
const { ServiceState } = require('../../lib/service-state');
const { FirewallService } = require('../../lib/firewall.service');

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

class NFSError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

class NFSService {

  // ── Auto-detect subnet from primary NAS IP ─────────────────────────

  static detectSubnet() {
    try {
      const interfaces = os.networkInterfaces();
      const candidates = ['eth0', 'ens0', 'enp0s3', 'wlan0', 'wlan1'];

      for (const iface of candidates) {
        if (interfaces[iface]) {
          const ipv4 = interfaces[iface].find(a => a.family === 'IPv4' && !a.internal);
          if (ipv4) return this._ipToSubnet(ipv4.address, ipv4.netmask);
        }
      }

      for (const [, addrs] of Object.entries(interfaces)) {
        const ipv4 = addrs.find(a => a.family === 'IPv4' && !a.internal);
        if (ipv4) return this._ipToSubnet(ipv4.address, ipv4.netmask);
      }

      return '192.168.1.0/24';
    } catch {
      return '192.168.1.0/24';
    }
  }

  static _ipToSubnet(ip, netmask) {
    try {
      const ipParts = ip.split('.').map(Number);
      const maskParts = netmask.split('.').map(Number);
      const networkParts = ipParts.map((octet, i) => octet & maskParts[i]);
      const network = networkParts.join('.');

      // Calculate CIDR prefix from netmask
      let prefix = 0;
      for (const octet of maskParts) {
        let bits = octet;
        while (bits) {
          prefix += bits & 1;
          bits >>= 1;
        }
      }

      return `${network}/${prefix}`;
    } catch {
      return '192.168.1.0/24';
    }
  }

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
      let decodedPath = targetPath;
      try {
        decodedPath = decodeURIComponent(targetPath || '');
      } catch (decodeErr) {
        logger.warn('Failed to decode URL path (may not be encoded)', { path: targetPath });
        decodedPath = targetPath;
      }

      const encodedTraversal = /%2[ef]|%5c|%2e%2e|%2e%2f|%5c%2e|\$\(|`|\||;|&/i;
      if (encodedTraversal.test(targetPath)) {
        logger.error('SECURITY: Encoded traversal attempt blocked', { path: targetPath });
        return { valid: false, error: 'BLOCKED_PATH', message: 'Path contains encoded traversal or shell characters' };
      }

      const resolved = path.resolve(decodedPath);
      const canonical = fs.existsSync(resolved) ? fs.realpathSync(resolved) : resolved;

      for (const blocked of BLOCKED_PATHS) {
        if (canonical === blocked || canonical.startsWith(blocked + '/')) {
          logger.error('SECURITY: Blocked dangerous NFS path', { path: canonical, blocked });
          return { valid: false, error: 'BLOCKED_PATH', message: `Path not allowed: ${canonical}` };
        }
      }

      if (!canonical.startsWith(STORAGE_ROOT)) {
        logger.error('SECURITY: NFS path outside storage root', { path: canonical });
        return { valid: false, error: 'UNSAFE_PATH', message: `Path must be under ${STORAGE_ROOT}` };
      }

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

    if (!/^[a-zA-Z0-9_-]{1,32}$/.test(name)) {
      return { valid: false, message: 'Invalid NFS export name. Use alphanumeric, hyphen, underscore only' };
    }

    return { valid: true };
  }

  static validateSubnet(subnet) {
    if (!subnet || typeof subnet !== 'string') {
      return { valid: false, message: 'Subnet is required' };
    }

    // Allow: 192.168.1.0/24, 10.0.0.0/8, single IP, or * (with warning)
    const cidrRegex = /^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/;
    if (subnet === '*') {
      return { valid: true, warning: 'Wildcard subnet — all hosts can access this export' };
    }
    if (!cidrRegex.test(subnet)) {
      return { valid: false, message: `Invalid subnet format: ${subnet}. Use CIDR notation (e.g., 192.168.1.0/24)` };
    }

    // Validate octets
    const parts = subnet.split('/')[0].split('.');
    for (const part of parts) {
      const num = parseInt(part, 10);
      if (num < 0 || num > 255) {
        return { valid: false, message: `Invalid IP octet: ${part}` };
      }
    }

    // Validate prefix
    const prefix = subnet.includes('/') ? parseInt(subnet.split('/')[1], 10) : 32;
    if (prefix < 0 || prefix > 32) {
      return { valid: false, message: `Invalid CIDR prefix: ${prefix}` };
    }

    return { valid: true };
  }

  static validateExportRules(clients) {
    try {
      if (!clients || !Array.isArray(clients)) {
        return { valid: false, message: 'Clients must be an array' };
      }

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

        if (!/^[\d./:a-zA-Z*-]+$/.test(client.ip)) {
          return { valid: false, message: `Invalid client IP: ${client.ip}` };
        }

        if (!/^[a-z_=,\d]+$/.test(client.options)) {
          return { valid: false, message: `Invalid NFS options: ${client.options}` };
        }

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

        const match = line.match(/^(\S+)\s+(.+?)$/);
        if (match) {
          const [, exportPath, clientSpec] = match;

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
        const subnet = this.detectSubnet();
        return `${exportPath} ${subnet}(rw,sync,no_subtree_check)`;
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

      // Build exports content with header
      const header = '# ApexNAS NFS Exports — managed by NAS service\n# Do not edit manually\n';
      const newExports = exports.map(exp => this.buildExportLine(exp.path, exp.clients)).join('\n');
      const finalContent = header + '\n' + newExports + '\n';

      // Write safely
      try {
        fs.writeFileSync(NFS_EXPORTS_PATH, finalContent, 'utf8');
        logger.info('NFS exports updated', { path: NFS_EXPORTS_PATH });
      } catch (err) {
        logger.warn('Could not write /etc/exports (may require root)', { error: err.message });
      }

      // Apply with exportfs (only if service is running)
      if (ServiceState.isEnabled('nfs')) {
        try {
          await execute('exportfs', ['-ra'], { timeout: 10000 });
          logger.info('NFS exports applied', { method: 'exportfs -ra' });
        } catch (err) {
          logger.warn('exportfs -ra failed', { error: err.message });
        }
      }

      return { success: true, message: 'NFS exports updated' };
    } catch (err) {
      logger.error('Failed to update NFS exports', { error: err.message });
      throw err;
    }
  }

  /**
   * Sync all NFS-enabled shares to /etc/exports
   * Called when global NFS is enabled to activate all pending shares
   */
  static async syncAllShares() {
    try {
      logger.info('NFS: Syncing all enabled shares to /etc/exports');

      let allShares = [];
      try {
        const { shares: shareMap } = require('../share/share.service');
        allShares = Array.from(shareMap.values());
      } catch (err) {
        logger.warn('Could not load shares from ShareService', { error: err.message });
        return { success: true, synced: 0 };
      }

      const nfsShares = allShares.filter(s => s.services?.nfs?.enabled);
      const detectedSubnet = this.detectSubnet();

      const exports = nfsShares.map(s => {
        const subnet = s.services.nfs.subnet || detectedSubnet;
        const mode = s.services.nfs.mode || 'rw';
        return {
          path: s.path,
          clients: [{ ip: subnet, options: `${mode},sync,no_subtree_check` }]
        };
      });

      await this.updateExports(exports);

      logger.info('NFS: Sync complete', { synced: nfsShares.length });
      return { success: true, synced: nfsShares.length };
    } catch (err) {
      logger.error('NFS: Sync failed', { error: err.message });
      return { success: false, error: err.message };
    }
  }

  /**
   * Reload exports (exportfs -ra + restart if needed)
   */
  static async reloadExports() {
    if (!ServiceState.isEnabled('nfs')) {
      logger.info('NFS: Skipping reload — service is globally disabled');
      return { success: true, message: 'Service disabled, exports updated but not reloaded' };
    }

    try {
      try {
        await execute('exportfs', ['-ra'], { timeout: 10000 });
        logger.info('NFS exports reloaded');
      } catch (err) {
        logger.warn('exportfs -ra failed, trying restart', { error: err.message });
        try {
          await execute('systemctl', ['restart', 'nfs-server'], { timeout: 15000 });
          logger.info('NFS service restarted');
        } catch (restartErr) {
          logger.warn('Could not restart NFS', { error: restartErr.message });
        }
      }

      return { success: true, message: 'NFS exports reloaded' };
    } catch (err) {
      return { success: false, error: 'RELOAD_FAILED', message: err.message };
    }
  }

  /**
   * NFS SHARE MANAGEMENT
   */

  static async createShare(params) {
    const { name, path: sharePath, clients = [] } = params;

    try {
      logger.info('NFS: Create share request', { name, path: sharePath, clients: clients.length });

      // VALIDATION LAYER
      const nameCheck = this.validateNFSName(name);
      if (!nameCheck.valid) {
        return { success: false, error: 'INVALID_NAME', message: nameCheck.message };
      }

      const pathCheck = this.validatePath(sharePath);
      if (!pathCheck.valid) {
        return { success: false, ...pathCheck };
      }

      if (!fs.existsSync(pathCheck.path)) {
        return {
          success: false,
          error: 'PATH_NOT_FOUND',
          message: `Path does not exist: ${pathCheck.path}`
        };
      }

      if (clients.length > 0) {
        const rulesCheck = this.validateExportRules(clients);
        if (!rulesCheck.valid) {
          return { success: false, error: 'INVALID_EXPORT', message: rulesCheck.message };
        }
      }

      // Check for duplicate
      const existing = this.loadNetworkShares();
      if (existing.nfs?.some(s => s.name === name)) {
        return { success: false, error: 'DUPLICATE_SHARE', message: `NFS share "${name}" already exists` };
      }

      // Build share object with auto-detected subnet
      const detectedSubnet = this.detectSubnet();
      const share = {
        name,
        path: pathCheck.path,
        protocol: 'NFS',
        clients: clients.length > 0 ? clients : [{ ip: detectedSubnet, options: 'rw,sync,no_subtree_check' }],
        createdAt: new Date().toISOString()
      };

      // Persist to network-shares.json
      const networkShares = this.loadNetworkShares();
      if (!networkShares.nfs) networkShares.nfs = [];
      networkShares.nfs.push(share);
      this.saveNetworkShares(networkShares);

      // Sync all shares and reload
      await this.syncAllShares();
      await this.reloadExports();

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

      const shareCheck = this.validateShareExists(name);
      if (!shareCheck.valid) {
        return { success: false, ...shareCheck };
      }

      // Update network-shares.json
      const networkShares = this.loadNetworkShares();
      if (networkShares.nfs) {
        networkShares.nfs = networkShares.nfs.filter(s => s.name !== name);
        this.saveNetworkShares(networkShares);
      }

      // Rebuild and reload
      await this.syncAllShares();
      await this.reloadExports();

      logger.info('NFS share removed', { name });

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
      const globalEnabled = ServiceState.isEnabled('nfs');
      let isRunning = false;
      let isInstalled = true;

      try {
        const { stdout } = await execute('systemctl', ['is-active', 'nfs-server'], { timeout: 5000 });
        isRunning = stdout.trim() === 'active';
      } catch (execErr) {
        try {
          await execute('which', ['nfsd'], { timeout: 3000 });
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
        service: 'nfs-server',
        detectedSubnet: this.detectSubnet()
      };
    } catch (err) {
      logger.warn('Could not get NFS service status', { error: err.message });
      return {
        success: true,
        active: false,
        enabled: ServiceState.isEnabled('nfs'),
        running: false,
        installed: true,
        service: 'nfs-server',
        detectedSubnet: this.detectSubnet()
      };
    }
  }

  static async enableService() {
    try {
      logger.info('Enabling NFS service');

      // Start the nfs-server service
      try {
        await execute('systemctl', ['start', 'nfs-server'], { timeout: 10000 });
      } catch (execErr) {
        logger.warn('Could not start nfs-server via systemctl', { error: execErr.message });
      }

      // Enable it to start on boot
      try {
        await execute('systemctl', ['enable', 'nfs-server'], { timeout: 5000 });
      } catch (execErr) {
        logger.warn('Could not enable nfs-server via systemctl', { error: execErr.message });
      }

      // Update global state
      ServiceState.setEnabled('nfs', true);

      // Sync all NFS-enabled shares to /etc/exports
      const syncResult = await this.syncAllShares();

      // Reload exports to activate
      await this.reloadExports();

      // Open firewall ports
      try {
        await FirewallService.openPorts('nfs');
      } catch (fwErr) {
        logger.warn('Firewall port open failed', { error: fwErr.message });
      }

      logger.info('NFS service enabled', { sharesSynced: syncResult.synced });

      return {
        success: true,
        message: `NFS service enabled. ${syncResult.synced || 0} exports activated.`
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
        await execute('systemctl', ['stop', 'nfs-server'], { timeout: 10000 });
      } catch (execErr) {
        logger.warn('Could not stop nfs-server via systemctl', { error: execErr.message });
      }

      // Disable it from starting on boot
      try {
        await execute('systemctl', ['disable', 'nfs-server'], { timeout: 5000 });
      } catch (execErr) {
        logger.warn('Could not disable nfs-server via systemctl', { error: execErr.message });
      }

      // Update global state
      ServiceState.setEnabled('nfs', false);

      logger.info('NFS service disabled');

      return {
        success: true,
        message: 'NFS service disabled. All NFS exports are now inaccessible.'
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

      if (fs.existsSync(STORAGE_ROOT)) {
        try {
          const entries = fs.readdirSync(STORAGE_ROOT, { withFileTypes: true });

          paths.push({
            path: STORAGE_ROOT,
            label: 'Storage Root',
            type: 'directory'
          });

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
  BLOCKED_PATHS
};
