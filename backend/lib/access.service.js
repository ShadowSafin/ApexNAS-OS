/**
 * Access Service — Utility Layer
 * 
 * Provides:
 * - getPrimaryIP()
 * - generateAccessInfo() for dashboard
 * 
 * NOTE: Protocol orchestration is now handled by ShareService.
 * This file is kept for backward compatibility with existing routes
 * (e.g. /api/smb/attach, /api/nfs/attach) but those routes are now
 * secondary to the ShareService-based flow.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFile } = require('child_process');
const logger = require('./logger');

const SERVICE_SHARES_FILE = path.join(__dirname, '../data/service-shares.json');

/**
 * Get primary network interface IP
 */
function getPrimaryIP() {
  try {
    const interfaces = os.networkInterfaces();
    const candidates = ['eth0', 'ens0', 'enp0s3', 'wlan0', 'wlan1'];
    
    for (const iface of candidates) {
      if (interfaces[iface]) {
        const ipv4 = interfaces[iface].find(addr => addr.family === 'IPv4' && !addr.internal);
        if (ipv4) return ipv4.address;
      }
    }
    
    for (const [name, addrs] of Object.entries(interfaces)) {
      const ipv4 = addrs.find(addr => addr.family === 'IPv4' && !addr.internal);
      if (ipv4) return ipv4.address;
    }
    
    return 'localhost';
  } catch (err) {
    logger.warn('Failed to determine primary IP:', err.message);
    return 'localhost';
  }
}

/**
 * Load service-shares configuration
 */
function loadServiceShares() {
  try {
    if (!fs.existsSync(SERVICE_SHARES_FILE)) {
      return { smb: [], nfs: [], ftp: { root: '/mnt/storage' } };
    }
    const data = fs.readFileSync(SERVICE_SHARES_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (err) {
    logger.warn('Failed to load service-shares:', err.message);
    return { smb: [], nfs: [], ftp: { root: '/mnt/storage' } };
  }
}

function saveServiceShares(config) {
  try {
    fs.writeFileSync(SERVICE_SHARES_FILE, JSON.stringify(config, null, 2));
    return true;
  } catch (err) {
    logger.error('Failed to save service-shares:', err.message);
    throw new Error('Failed to save service configuration');
  }
}

function validatePath(inputPath) {
  try {
    const normalized = path.resolve(inputPath);
    if (!normalized.startsWith('/mnt/storage')) {
      throw new Error('Path must be under /mnt/storage');
    }
    if (normalized.includes('..')) {
      throw new Error('Path traversal not allowed');
    }
    if (!fs.existsSync(normalized)) {
      throw new Error('Path does not exist');
    }
    const stat = fs.statSync(normalized);
    if (!stat.isDirectory()) {
      throw new Error('Path must be a directory');
    }
    return normalized;
  } catch (err) {
    throw err;
  }
}

function shareExists(config, type, name, pathToCheck) {
  if (type === 'smb') {
    return config.smb.some(s => s.name === name || s.path === pathToCheck);
  } else if (type === 'nfs') {
    return config.nfs.some(s => s.name === name || s.path === pathToCheck);
  }
  return false;
}

// ── Legacy attach/detach (kept for backward compat with existing routes) ──

async function attachSmbShare(name, sharePath) {
  try {
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      throw new Error('Invalid share name');
    }
    const validatedPath = validatePath(sharePath);
    const config = loadServiceShares();
    if (shareExists(config, 'smb', name, validatedPath)) {
      throw new Error('Share already exists');
    }
    config.smb.push({ name: name.trim(), path: validatedPath });
    saveServiceShares(config);

    // Also sync with ShareService
    try {
      const { ShareService } = require('../modules/share/share.service');
      await ShareService.updateShareServices(name.trim(), 'smb', true);
    } catch { /* non-fatal */ }

    logger.info('SMB share attached', { name, path: validatedPath });
    return { name, path: validatedPath };
  } catch (err) {
    logger.error('Failed to attach SMB share:', err.message);
    throw err;
  }
}

async function attachNfsShare(name, sharePath) {
  try {
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      throw new Error('Invalid share name');
    }
    const validatedPath = validatePath(sharePath);
    const config = loadServiceShares();
    if (shareExists(config, 'nfs', name, validatedPath)) {
      throw new Error('Share already exists');
    }
    config.nfs.push({ name: name.trim(), path: validatedPath });
    saveServiceShares(config);

    try {
      const { ShareService } = require('../modules/share/share.service');
      await ShareService.updateShareServices(name.trim(), 'nfs', true);
    } catch { /* non-fatal */ }

    logger.info('NFS export attached', { name, path: validatedPath });
    return { name, path: validatedPath };
  } catch (err) {
    logger.error('Failed to attach NFS share:', err.message);
    throw err;
  }
}

async function setFtpRoot(ftpPath) {
  try {
    const validatedPath = validatePath(ftpPath);
    const config = loadServiceShares();
    config.ftp.root = validatedPath;
    saveServiceShares(config);
    logger.info('FTP root set', { path: validatedPath });
    return { root: validatedPath };
  } catch (err) {
    logger.error('Failed to set FTP root:', err.message);
    throw err;
  }
}

async function detachSmbShare(name) {
  try {
    const config = loadServiceShares();
    config.smb = config.smb.filter(s => s.name !== name);
    saveServiceShares(config);

    try {
      const { ShareService } = require('../modules/share/share.service');
      await ShareService.updateShareServices(name, 'smb', false);
    } catch { /* non-fatal */ }

    logger.info('SMB share detached', { name });
    return { success: true };
  } catch (err) {
    logger.error('Failed to detach SMB share:', err.message);
    throw err;
  }
}

async function detachNfsShare(name) {
  try {
    const config = loadServiceShares();
    config.nfs = config.nfs.filter(s => s.name !== name);
    saveServiceShares(config);

    try {
      const { ShareService } = require('../modules/share/share.service');
      await ShareService.updateShareServices(name, 'nfs', false);
    } catch { /* non-fatal */ }

    logger.info('NFS export detached', { name });
    return { success: true };
  } catch (err) {
    logger.error('Failed to detach NFS export:', err.message);
    throw err;
  }
}

async function generateAccessInfo() {
  try {
    const config = loadServiceShares();
    const ip = getPrimaryIP();
    logger.info('ACCESS: Using IP:', ip);
    logger.info('ACCESS: Config:', JSON.stringify(config));
    
    const accessInfo = { services: [] };

    // Add SMB shares
    for (const share of config.smb) {
      accessInfo.services.push({
        type: 'SMB', name: share.name, path: share.path,
        access: `\\\\${ip}\\${share.name}`
      });
    }
    
    // Add NFS shares
    for (const share of config.nfs) {
      accessInfo.services.push({
        type: 'NFS', name: share.name, path: share.path,
        access: `${ip}:${share.path}`
      });
    }
    
    // Add FTP if root is configured
    if (config.ftp && config.ftp.root) {
      accessInfo.services.push({
        type: 'FTP', path: config.ftp.root,
        access: `ftp://${ip}`
      });
    }
    
    // If no access points yet, create default ones to show the server is online
    if (accessInfo.services.length === 0) {
      logger.info('ACCESS: No shares configured, creating demo access points');
      
      // Try to detect running services and create access points for them
      const smbRunning = await isServiceRunning('smbd');
      const nfsRunning = await isServiceRunning('nfs-server') || await isServiceRunning('nfsd');
      const ftpRunning = await isServiceRunning('vsftpd');
      
      if (smbRunning) {
        accessInfo.services.push({
          type: 'SMB', name: 'storage', path: '/mnt/storage',
          access: `\\\\${ip}\\storage`
        });
      }
      
      if (nfsRunning) {
        accessInfo.services.push({
          type: 'NFS', name: 'storage', path: '/mnt/storage',
          access: `${ip}:/mnt/storage`
        });
      }
      
      if (ftpRunning) {
        accessInfo.services.push({
          type: 'FTP', name: 'root', path: '/mnt/storage',
          access: `ftp://${ip}`
        });
      }
    }
    
    logger.info('ACCESS: Generated access points:', JSON.stringify(accessInfo));
    return accessInfo;
  } catch (err) {
    logger.error('Failed to generate access info:', err.message);
    throw err;
  }
}

/**
 * Quick check if a service is running
 */
async function isServiceRunning(serviceName) {
  return new Promise((resolve) => {
    execFile('systemctl', ['is-active', serviceName], { timeout: 3000 }, (err, stdout) => {
      if (!err && stdout.trim() === 'active') {
        return resolve(true);
      }
      
      // Fallback to process check
      execFile('pgrep', ['-f', serviceName], { timeout: 3000 }, (err2, stdout2) => {
        resolve(!err2 && stdout2.trim().length > 0);
      });
    });
  });
}

function getServiceShares() {
  return loadServiceShares();
}

module.exports = {
  loadServiceShares,
  saveServiceShares,
  validatePath,
  shareExists,
  getPrimaryIP,
  attachSmbShare,
  attachNfsShare,
  setFtpRoot,
  detachSmbShare,
  detachNfsShare,
  generateAccessInfo,
  getServiceShares
};
