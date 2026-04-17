const logger = require('../../lib/logger');

function validateDeviceName(name) {
  if (!name || typeof name !== 'string') return false;
  // Strip /dev/ prefix for validation
  const bare = name.replace(/^\/dev\//, '');
  // Allow: sda, sda1, nvme0n1, nvme0n1p1, md0, md127, vda, xvda, mapper/...
  return /^(sd|hd|nvme|vd|xvd|md|dm-)[a-z0-9p/]*$/.test(bare);
}

function validateMountpoint(path) {
  if (!path || typeof path !== 'string') return false;
  if (path.includes('..') || path.includes('./')) return false;
  return true;
}

function validateFilesystem(fs) {
  const allowed = ['ext4', 'xfs', 'btrfs', 'jfs'];
  return allowed.includes(fs);
}

function parseBlockDeviceJson(json) {
  try {
    const parsed = JSON.parse(json);
    if (!parsed.blockdevices || !Array.isArray(parsed.blockdevices)) {
      return [];
    }
    return parsed.blockdevices;
  } catch (err) {
    logger.error('Failed to parse lsblk JSON', { error: err.message });
    return [];
  }
}

function parseDfOutput(stdout) {
  const lines = stdout.split(/\r?\n/);
  if (lines.length < 2) return [];

  const header = lines[0].split(/\s+/);
  const filesystemIndex = header.findIndex((h) => /^Filesystem/.test(h));
  const sizeIndex = header.findIndex((h) => /^1K-blocks|Size/.test(h));
  const usedIndex = header.findIndex((h) => /^Used/.test(h));
  const availIndex = header.findIndex((h) => /^Avail|Available/.test(h));
  const useIndex = header.findIndex((h) => /^Use%/.test(h));
  const targetIndex = header.findIndex((h) => /^Mounted/.test(h));

  // FIX 7: DF parser hardening - handle variable spacing, gracefully skip malformed lines
  const result = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    // Skip empty lines and lines that look like errors
    if (!line || line.startsWith('df:') || line.startsWith('cannot')) continue;

    const parts = line.split(/\s+/);
    // Require minimum fields to avoid parsing errors
    if (parts.length < 5) {
      logger.debug('Skipping malformed df line', { line });
      continue;
    }

    try {
      // Use fallback indices for better robustness
      const filesystem = parts[filesystemIndex >= 0 ? filesystemIndex : 0];
      const size = parts[sizeIndex >= 0 ? sizeIndex : 1];
      const used = parts[usedIndex >= 0 ? usedIndex : 2];
      const available = parts[availIndex >= 0 ? availIndex : 3];
      const usePercent = parts[useIndex >= 0 ? useIndex : 4];
      
      // Mountpoint is everything after the percentage (handles spaces in mountpoint names)
      let mountpoint = '/';
      if (targetIndex >= 0 && parts[targetIndex]) {
        mountpoint = parts.slice(targetIndex).join('/');
      } else if (parts.length > 5) {
        mountpoint = parts.slice(5).join('/');
      }

      // Validate numeric fields before adding
      if (!/^\d+/.test(size) || !/^\d+/.test(used) || !/^\d+/.test(available)) {
        logger.warn('Skipping df line with non-numeric values', { line });
        continue;
      }

      result.push({
        filesystem: filesystem || 'unknown',
        total: parseInt(size) || 0,
        used: parseInt(used) || 0,
        available: parseInt(available) || 0,
        usePercent: usePercent || '0%',
        mountpoint
      });
    } catch (parseErr) {
      logger.warn('Failed to parse df line', { line, error: parseErr.message });
      continue;
    }
  }

  return result;
}

function parseFstabEntry(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) return null;

  const parts = trimmed.split(/\s+/);
  if (parts.length < 4) return null;

  return {
    device: parts[0],
    mountpoint: parts[1],
    fstype: parts[2],
    options: parts[3],
    dump: parts[4] || '0',
    passno: parts[5] || '0'
  };
}

function formatFstabEntry(device, mountpoint, fstype, options = 'defaults', dump = '0', passno = '0') {
  return `${device}\t${mountpoint}\t${fstype}\t${options}\t${dump}\t${passno}`;
}

module.exports = {
  validateDeviceName,
  validateMountpoint,
  validateFilesystem,
  parseBlockDeviceJson,
  parseDfOutput,
  parseFstabEntry,
  formatFstabEntry
};
