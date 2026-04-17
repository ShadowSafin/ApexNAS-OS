const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const logger = require('../../lib/logger');

/**
 * Safe file reading utility
 */
function readFileSafe(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch (err) {
    logger.warn(`Failed to read ${filePath}:`, err.message);
    return '';
  }
}

/**
 * Parse /etc/os-release for OS information
 */
function parseOsRelease() {
  const content = readFileSafe('/etc/os-release');
  const lines = content.split(/\r?\n/);
  const result = {};
  for (const line of lines) {
    const [key, value] = line.split('=');
    if (!key || value === undefined) continue;
    result[key] = value.replace(/^"|"$/g, '');
  }
  return result;
}

/**
 * Parse /proc/meminfo for memory information
 */
function parseMeminfo() {
  const content = readFileSafe('/proc/meminfo');
  const lines = content.split(/\r?\n/);
  const obj = {};
  for (const line of lines) {
    const [k, v] = line.split(':');
    if (!k || !v) continue;
    obj[k.trim()] = Number((v.trim().split(' ')[0]) || 0) * 1024;
  }
  return obj;
}

/**
 * Parse /proc/cpuinfo for CPU count
 */
function parseCpuCount() {
  const lines = readFileSafe('/proc/cpuinfo').split(/\r?\n/);
  return lines.filter((line) => /^processor\s*:/i.test(line)).length || os.cpus().length;
}

/**
 * Parse df output for disk usage
 */
async function parseDiskUsage() {
  return new Promise((resolve) => {
    execFile('df', ['-B', '1'], { timeout: 5000 }, (err, stdout, stderr) => {
      if (err) {
        logger.warn('Failed to execute df command:', err.message);
        return resolve([]);
      }

      try {
        const lines = stdout.toString().split('\n').slice(1); // Skip header
        const disks = [];

        for (const line of lines) {
          if (!line.trim()) continue;
          const parts = line.split(/\s+/);
          if (parts.length < 6) continue;

          const filesystem = parts[0];
          const total = Number(parts[1]) || 0;
          const used = Number(parts[2]) || 0;
          const available = Number(parts[3]) || 0;
          const percentUsed = Number(parts[4]?.replace('%', '')) || 0;
          const mountPoint = parts.slice(5).join(' ');

          disks.push({
            filesystem,
            total,
            used,
            available,
            percentUsed,
            mountPoint
          });
        }

        resolve(disks);
      } catch (parseErr) {
        logger.warn('Failed to parse df output:', parseErr.message);
        resolve([]);
      }
    });
  });
}

/**
 * Get system health check
 */
function health() {
  return {
    status: 'ok',
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString()
  };
}

/**
 * Get detailed system information
 */
function info() {
  const osRelease = parseOsRelease();
  const meminfo = parseMeminfo();
  const load = os.loadavg();

  return {
    hostname: os.hostname(),
    platform: os.platform(),
    kernel: os.release(),
    osRelease: osRelease.PRETTY_NAME || osRelease.NAME || '',
    uptime: Math.floor(os.uptime()),
    loadAverage: { '1m': load[0], '5m': load[1], '15m': load[2] },
    totalMemory: os.totalmem(),
    freeMemory: os.freemem(),
    cpuCount: parseCpuCount(),
    nasosVersion: getPackageVersion()
  };
}

/**
 * Get package version
 */
function getPackageVersion() {
  try {
    const pack = require(path.join(process.cwd(), 'package.json'));
    return pack.version || '1.0.0';
  } catch (err) {
    return '1.0.0';
  }
}

/**
 * Get version information
 */
function version() {
  return {
    version: getPackageVersion(),
    buildDate: new Date().toISOString(),
    codename: 'Argon'
  };
}

/**
 * Get real-time system statistics
 */
async function stats() {
  const totalMemory = os.totalmem();
  const freeMemory = os.freemem();
  const usedMemory = totalMemory - freeMemory;
  const memoryPercentage = Math.round((usedMemory / totalMemory) * 100);

  // Get CPU usage from load average
  const load = os.loadavg();
  const cpuCount = parseCpuCount();
  const cpuPercentage = Math.min(100, Math.round((load[0] / cpuCount) * 100));

  // Get disk usage
  const disks = await parseDiskUsage();
  const availableSize = disks.reduce((sum, disk) => sum + disk.available, 0);
  const usedSize = disks.reduce((sum, disk) => sum + disk.used, 0);
  const totalSize = usedSize + availableSize;

  return {
    cpu: cpuPercentage,
    memory: memoryPercentage,
    disk: disks.length > 0 ? Math.round((usedSize / totalSize) * 100) : 0,
    uptime: Math.floor(os.uptime()),
    timestamp: new Date().toISOString(),
    loadAverage: `${load[0].toFixed(2)}, ${load[1].toFixed(2)}, ${load[2].toFixed(2)}`
  };
}

/**
 * Get CPU usage details
 */
function cpuUsage() {
  const load = os.loadavg();
  const cpuCount = parseCpuCount();
  const usage = Math.min(100, Math.round((load[0] / cpuCount) * 100));

  return {
    usage,
    cores: cpuCount,
    load1m: load[0],
    load5m: load[1],
    load15m: load[2]
  };
}

/**
 * Get memory usage details
 */
function memoryUsage() {
  const totalMemory = os.totalmem();
  const freeMemory = os.freemem();
  const usedMemory = totalMemory - freeMemory;

  return {
    total: totalMemory,
    used: usedMemory,
    free: freeMemory,
    percentage: Math.round((usedMemory / totalMemory) * 100)
  };
}

/**
 * Get disk usage details
 */
async function diskUsage() {
  const disks = await parseDiskUsage();
  
  if (disks.length === 0) {
    return {
      disks: [],
      totalSize: 0,
      totalUsed: 0,
      totalAvailable: 0,
      percentUsed: 0
    };
  }

  const totalSize = disks.reduce((sum, d) => sum + d.total, 0);
  const totalUsed = disks.reduce((sum, d) => sum + d.used, 0);
  const totalAvailable = disks.reduce((sum, d) => sum + d.available, 0);
  const percentUsed = totalSize > 0 ? Math.round((totalUsed / totalSize) * 100) : 0;

  return {
    disks,
    totalSize,
    totalUsed,
    totalAvailable,
    percentUsed
  };
}

/**
 * Check service status using systemctl
 */
async function checkServiceStatus(serviceName) {
  return new Promise((resolve) => {
    execFile('systemctl', ['is-active', serviceName], { timeout: 5000 }, (err, stdout) => {
      const status = stdout.trim() === 'active' ? 'running' : 'stopped';
      resolve(status);
    });
  });
}

/**
 * Get system services status
 */
async function getServices() {
  try {
    const [smbStatus, nfsStatus, ftpStatus, sshStatus] = await Promise.all([
      checkServiceStatus('smb'),
      checkServiceStatus('nfs-server'),
      checkServiceStatus('vsftpd'),
      checkServiceStatus('ssh')
    ]);

    return [
      { name: 'SMB/CIFS', status: smbStatus, port: 445 },
      { name: 'NFS Server', status: nfsStatus, port: 2049 },
      { name: 'FTP', status: ftpStatus, port: 21 },
      { name: 'SSH', status: sshStatus, port: 22 }
    ];
  } catch (error) {
    logger.warn('Failed to check service status:', error.message);
    // Return default state if check fails
    return [
      { name: 'SMB/CIFS', status: 'unknown', port: 445 },
      { name: 'NFS Server', status: 'unknown', port: 2049 },
      { name: 'FTP', status: 'unknown', port: 21 },
      { name: 'SSH', status: 'unknown', port: 22 }
    ];
  }
}

/**
 * Get system logs using journalctl
 * @param {Object} options - { service, limit, since, until }
 */
async function getLogs(options = {}) {
  const { service = 'system', limit = 100, since, until } = options;

  // Map service names to journalctl units
  const serviceMap = {
    system: null, // System logs
    smb: 'smbd',
    nfs: 'nfs-server',
    ftp: 'vsftpd'
  };

  const unit = serviceMap[service];
  const args = ['-n', String(limit), '--output=json'];

  if (unit) {
    args.push('-u', unit);
  }

  if (since) {
    args.push('--since', since);
  }

  if (until) {
    args.push('--until', until);
  }

  return new Promise((resolve) => {
    execFile('journalctl', args, { timeout: 10000 }, (err, stdout, stderr) => {
      if (err) {
        logger.warn(`Failed to fetch ${service} logs:`, err.message);
        return resolve([]);
      }

      try {
        const lines = stdout.toString().split('\n').filter(Boolean);
        const logs = [];

        for (const line of lines) {
          try {
            const entry = JSON.parse(line);
            logs.push({
              timestamp: entry.__REALTIME_TIMESTAMP
                ? new Date(Number(entry.__REALTIME_TIMESTAMP) / 1000).toISOString()
                : new Date().toISOString(),
              service: service.toUpperCase(),
              level: entry.PRIORITY ? ['EMERGENCY', 'ALERT', 'CRITICAL', 'ERROR', 'WARNING', 'NOTICE', 'INFO', 'DEBUG'][entry.PRIORITY] : 'INFO',
              message: entry.MESSAGE || '',
              unit: entry._SYSTEMD_UNIT || null
            });
          } catch (parseErr) {
            // Skip unparseable lines
            continue;
          }
        }

        resolve(logs.reverse());
      } catch (logErr) {
        logger.warn('Failed to parse journalctl output:', logErr.message);
        resolve([]);
      }
    });
  });
}

/**
 * Reboot system with confirmation token
 * @param {string} confirmToken - Must be "YES_REBOOT"
 */
async function reboot(confirmToken) {
  if (confirmToken !== 'YES_REBOOT') {
    throw new Error('Invalid confirmation token for reboot');
  }

  logger.warn('SYSTEM REBOOT INITIATED by admin user', {
    timestamp: new Date().toISOString(),
    action: 'reboot'
  });

  return new Promise((resolve, reject) => {
    execFile('shutdown', ['-r', 'now'], { timeout: 5000 }, (err, stdout, stderr) => {
      if (err && err.code !== 0) {
        logger.error('Reboot command failed:', err.message);
        return reject(new Error('Failed to execute reboot command'));
      }

      logger.info('Reboot command executed successfully');
      resolve({
        success: true,
        message: 'System reboot initiated',
        timestamp: new Date().toISOString()
      });
    });
  });
}

/**
 * Get system temperature readings
 */
async function getTemperature() {
  return new Promise((resolve) => {
    // Try to read CPU temperature from thermal zones or hwmon
    const getCpuTemp = () => {
      return new Promise((res) => {
        // Try reading from /sys/class/thermal/thermal_zone0/temp (common on Linux)
        fs.readFile('/sys/class/thermal/thermal_zone0/temp', 'utf-8', (err, data) => {
          if (!err && data) {
            try {
              const tempMC = parseInt(data.trim()); // millidegrees Celsius
              return res(Math.round(tempMC / 1000));
            } catch (e) {
              return res(null);
            }
          }
          
          // Fallback: try hwmon interface
          execFile('cat', ['/sys/class/hwmon/hwmon0/temp1_input'], { timeout: 2000 }, (err2, data2) => {
            if (!err2 && data2) {
              try {
                const tempMC = parseInt(data2.trim());
                return res(Math.round(tempMC / 1000));
              } catch (e) {
                return res(null);
              }
            }
            return res(null);
          });
        });
      });
    };

    // Try to read disk temperature using smartctl
    const getDiskTemp = () => {
      return new Promise((res) => {
        execFile('smartctl', ['-a', '/dev/sda'], { timeout: 5000 }, (err, stdout) => {
          if (err || !stdout) return res(null);
          
          try {
            const match = stdout.match(/Temperature_Celsius.*?(\d+)/);
            if (match && match[1]) {
              return res(parseInt(match[1]));
            }
          } catch (e) {
            // ignore
          }
          return res(null);
        });
      });
    };

    // Run both in parallel
    Promise.all([getCpuTemp(), getDiskTemp()]).then(([cpuTemp, diskTemp]) => {
      resolve({
        cpuTemp: cpuTemp || 0,
        diskTemp: diskTemp || 0,
        timestamp: new Date().toISOString()
      });
    }).catch(() => {
      resolve({
        cpuTemp: 0,
        diskTemp: 0,
        timestamp: new Date().toISOString()
      });
    });
  });
}

/**
 * Shutdown system with confirmation token
 * @param {string} confirmToken - Must be "YES_SHUTDOWN"
 */
async function shutdown(confirmToken) {
  if (confirmToken !== 'YES_SHUTDOWN') {
    throw new Error('Invalid confirmation token for shutdown');
  }

  logger.warn('SYSTEM SHUTDOWN INITIATED by admin user', {
    timestamp: new Date().toISOString(),
    action: 'shutdown'
  });

  return new Promise((resolve, reject) => {
    execFile('shutdown', ['now'], { timeout: 5000 }, (err, stdout, stderr) => {
      if (err && err.code !== 0) {
        logger.error('Shutdown command failed:', err.message);
        return reject(new Error('Failed to execute shutdown command'));
      }

      logger.info('Shutdown command executed successfully');
      resolve({
        success: true,
        message: 'System shutdown initiated',
        timestamp: new Date().toISOString()
      });
    });
  });
}

module.exports = {
  health,
  info,
  version,
  stats,
  cpuUsage,
  memoryUsage,
  diskUsage,
  getServices,
  getLogs,
  getTemperature,
  reboot,
  shutdown
};
