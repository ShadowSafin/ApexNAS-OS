/**
 * RAID Parser
 * 
 * Parses RAID information from:
 * - /proc/mdstat
 * - mdadm --detail output
 */

const fs = require('fs');
const { exec, execFile } = require('child_process');
const logger = require('../../lib/logger');

// Matches valid mdadm array paths: /dev/md0, /dev/md127 etc. Used to prevent
// shell/argument injection when an array name is interpolated into a command.
const ARRAY_NAME_PATTERN = /^\/dev\/md\d+$/;

class RAIDParser {
  /**
   * Parse /proc/mdstat
   * Returns array of RAID arrays with status
   */
  static parseMdstat(content) {
    const arrays = [];
    const lines = content.split('\n');

    let currentArray = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Skip header and empty lines
      if (line.includes('Personalities') || line === '' || line.includes('unused devices')) {
        continue;
      }

      // Detect array line: "md0 : active (auto-read-only) raid1 sdb1[0] sdc1[1]"
      const arrayMatch = line.match(/^(md\d+)\s+:\s+(\w+)(?:\s+\(.*?\))?\s+raid(\d)\s+(.*)$/);
      if (arrayMatch) {
        if (currentArray) {
          arrays.push(currentArray);
        }

        const [, name, status, level, deviceString] = arrayMatch;
        const devices = this.parseDeviceString(deviceString);

        currentArray = {
          name: `/dev/${name}`,
          status: status,
          level: `raid${level}`,
          devices: devices,
          health: status === 'active' ? 'healthy' : 'degraded',
          rebuildProgress: null,
          degraded: false,
          activeDevices: devices.length
        };
      }

      // Parse rebuild progress line
      if (currentArray && line.includes('[') && line.includes(']')) {
        const rebuildMatch = line.match(/(\d+)%[\s\[]+=+[\]>]/);
        if (rebuildMatch) {
          currentArray.rebuildProgress = parseInt(rebuildMatch[1], 10);
          currentArray.status = 'recovering';
          currentArray.health = 'rebuilding';
        }

        // Parse degraded status
        if (line.includes('degraded')) {
          const degradedMatch = line.match(/(\d+) degraded/);
          if (degradedMatch) {
            currentArray.degraded = parseInt(degradedMatch[1], 10);
            currentArray.health = 'degraded';
            currentArray.activeDevices = currentArray.devices.length - currentArray.degraded;
          }
        }
      }
    }

    // Add last array
    if (currentArray) {
      arrays.push(currentArray);
    }

    return arrays;
  }

  /**
   * Parse device string from mdstat
   * Input: "sdb1[0] sdc1[1]" or "sdb1[0](F) sdc1[1]"
   * Returns: [{ name, index, status }]
   */
  static parseDeviceString(deviceString) {
    const devices = [];
    const matches = deviceString.match(/(\w+)\[(\d+)\](\(F\))?/g) || [];

    for (const match of matches) {
      const parsed = match.match(/(\w+)\[(\d+)\](\(F\))?/);
      if (parsed) {
        devices.push({
          name: `/dev/${parsed[1]}`,
          index: parseInt(parsed[2], 10),
          status: parsed[3] ? 'failed' : 'active'
        });
      }
    }

    return devices;
  }

  /**
   * Parse mdadm --detail output
   * Extracts detailed RAID information
   */
  static parseMdadmDetail(content) {
    const detail = {
      name: null,
      status: null,
      level: null,
      devices: [],
      totalDevices: 0,
      activeDevices: 0,
      workingDevices: 0,
      failtingDevices: 0,
      sparingDevices: 0,
      uuid: null,
      creationTime: null,
      eventCount: null,
      consistency: null
    };

    const lines = content.split('\n');

    for (const line of lines) {
      const match = line.match(/^\s*(.+?):\s+(.+)$/);
      if (!match) continue;

      const [, key, value] = match;
      const k = key.toLowerCase().trim();
      const v = value.trim();

      // Parse key/value pairs
      if (k === 'version') detail.version = v;
      if (k === '/dev/md' || k === 'name') detail.name = /\/dev\/md\d+/ ? v : detail.name;
      if (k === 'uuid') detail.uuid = v;
      if (k === 'events') detail.eventCount = parseInt(v, 10);
      if (k === 'raid level') detail.level = v;
      if (k === 'disk-o-matic status') detail.status = v;

      // Device counts
      if (k === 'total devices') detail.totalDevices = parseInt(v, 10);
      if (k === 'active devices') detail.activeDevices = parseInt(v, 10);
      if (k === 'working devices') detail.workingDevices = parseInt(v, 10);
      if (k === 'failing devices') detail.failtingDevices = parseInt(v, 10);
      if (k === 'sparing devices') detail.sparingDevices = parseInt(v, 10);

      // Creation time
      if (k === 'creation time') detail.creationTime = v;

      // Consistency
      if (k === 'array state') detail.consistency = v;
    }

    return detail;
  }

  /**
   * Parse mdadm --detail --scan output
   * Returns array configurations
   */
  static parseMdadmScan(content) {
    const configs = [];
    const lines = content.split('\n');

    for (const line of lines) {
      if (!line.trim() || line.startsWith('#')) continue;

      // Format: ARRAY /dev/md0 metadata=1.2 name=md0 UUID=...
      const match = line.match(/^ARRAY\s+(\/dev\/md\d+)/);
      if (match) {
        configs.push({
          name: match[1],
          config: line
        });
      }
    }

    return configs;
  }

  /**
   * Get RAID arrays from /proc/mdstat
   */
  static readProcMdstat() {
    return new Promise((resolve, reject) => {
      fs.readFile('/proc/mdstat', 'utf-8', (err, content) => {
        if (err) {
          return reject(err);
        }
        resolve(this.parseMdstat(content));
      });
    });
  }

  /**
   * Get RAID details via mdadm
   *
   * SECURITY: arrayName is passed as an argument to execFile (not as part of a
   * shell command string) AND is validated against a strict regex so that
   * callers cannot inject shell metacharacters or extra arguments even if a
   * shell were reintroduced later.
   */
  static getMdadmDetail(arrayName = null) {
    return new Promise((resolve) => {
      if (arrayName !== null && arrayName !== undefined) {
        if (typeof arrayName !== 'string' || !ARRAY_NAME_PATTERN.test(arrayName)) {
          logger.warn('mdadm --detail rejected: invalid array name', { arrayName });
          return resolve(arrayName ? {} : []);
        }

        execFile('mdadm', ['--detail', arrayName], { timeout: 5000 }, (err, stdout) => {
          if (err) {
            logger.warn('mdadm --detail command failed', { error: err.message });
            return resolve({});
          }
          resolve(this.parseMdadmDetail(stdout));
        });
        return;
      }

      execFile('mdadm', ['--detail', '--scan'], { timeout: 5000 }, (err, stdout) => {
        if (err) {
          logger.warn('mdadm --detail --scan command failed', { error: err.message });
          return resolve([]);
        }
        resolve(this.parseMdadmScan(stdout));
      });
    });
  }

  /**
   * Get MDadm version
   */
  static getMdadmVersion() {
    return new Promise((resolve) => {
      execFile('mdadm', ['--version'], { timeout: 2000 }, (err, stdout, stderr) => {
        if (err) {
          resolve(null);
          return;
        }
        // mdadm prints version info to stderr on some distros
        const output = `${stdout || ''}${stderr || ''}`;
        const match = output.match(/version ([\d.]+)/);
        resolve(match ? match[1] : null);
      });
    });
  }
}

module.exports = RAIDParser;
