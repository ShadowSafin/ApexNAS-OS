const { execFile } = require('child_process');
const os = require('os');
const logger = require('../../lib/logger');

/**
 * Get network interfaces with dynamic name detection
 * Works with any interface name (eth*, enp*, wlp*, etc.)
 */
async function getNetworkInterfaces() {
  logger.info('NETWORK: Starting dynamic network interface detection');
  
  // Primary method: use ip -json addr for dynamic interface detection
  const result = await getInterfacesFromIpCommand();
  
  if (result.length > 0) {
    logger.info(`NETWORK: Found ${result.length} interfaces via ip command`);
    return result;
  }

  // Fallback 1: Try os.networkInterfaces()
  logger.info('NETWORK: Trying fallback via os.networkInterfaces()');
  const interfaces = os.networkInterfaces();
  const fallback = [];

  for (const [name, addrs] of Object.entries(interfaces)) {
    if (name === 'lo' || name.startsWith('docker') || name.startsWith('veth') || name.startsWith('br-')) continue;
    if (!addrs || !Array.isArray(addrs)) continue;
    
    const ipv4Addrs = addrs.filter(addr => addr.family === 'IPv4' && !addr.internal);
    if (ipv4Addrs.length === 0) continue;

    fallback.push({
      name,
      ip: ipv4Addrs[0].address,
      mac: addrs.find(a => a.family === 'MAC')?.address || 'N/A',
      status: 'up',
      speed: getDefaultSpeed(name)
    });
  }

  if (fallback.length > 0) {
    logger.info(`NETWORK: Found ${fallback.length} interfaces via os.networkInterfaces()`);
    return fallback;
  }

  // Fallback 2: Try hostname -I
  logger.info('NETWORK: Trying final fallback via hostname -I');
  const ipFromHostname = await getIpFromHostname();
  if (ipFromHostname) {
    return [{
      name: 'primary',
      ip: ipFromHostname,
      mac: 'N/A',
      status: 'up',
      speed: '1 Gbps'
    }];
  }

  logger.warn('NETWORK: No interfaces found');
  return [];
}

/**
 * Get interfaces using ip -json addr command
 * Dynamically detects all interface types (eth*, enp*, wlp*, etc.)
 */
async function getInterfacesFromIpCommand() {
  return new Promise((resolve) => {
    execFile('ip', ['-json', 'addr'], { timeout: 3000 }, (err, stdout) => {
      if (err) {
        logger.warn('NETWORK: ip command failed:', err.message);
        return resolve([]);
      }

      try {
        const data = JSON.parse(stdout);
        const interfaces = [];

        for (const iface of data) {
          const name = iface.ifname;
          
          // Filter: ignore loopback, docker, and interfaces without inet
          if (name === 'lo' || name.startsWith('docker') || name.startsWith('veth') || name.startsWith('br-')) {
            continue;
          }

          // Only include interfaces with UP state and IPv4
          if (iface.operstate !== 'UP') {
            continue;
          }

          const ipv4 = iface.addr_info?.find(a => a.family === 'inet');
          if (!ipv4 || !ipv4.local) {
            continue;
          }

          interfaces.push({
            name,
            ip: ipv4.local,
            mac: iface.address || 'N/A',
            status: 'up',
            speed: getDefaultSpeed(name)
          });
        }

        return resolve(interfaces);
      } catch (e) {
        logger.warn('NETWORK: Failed to parse ip output:', e.message);
        return resolve([]);
      }
    });
  });
}

/**
 * Get default speed based on interface name pattern
 */
function getDefaultSpeed(name) {
  if (name.startsWith('wl') || name.startsWith('wifi')) {
    return 'WiFi';
  } else if (name.startsWith('eth') || name.startsWith('en')) {
    return '1 Gbps';
  } else if (name.startsWith('em')) {
    return '1 Gbps';
  }
  return 'N/A';
}

/**
 * Fallback: Get IP from hostname -I
 */
async function getIpFromHostname() {
  return new Promise((resolve) => {
    execFile('hostname', ['-I'], { timeout: 2000 }, (err, stdout) => {
      if (err || !stdout) {
        return resolve(null);
      }
      const ip = stdout.trim().split(' ')[0];
      if (ip && !ip.includes(':')) {
        return resolve(ip);
      }
      return resolve(null);
    });
  });
}

/**
 * Get network statistics
 */
async function getNetworkStats() {
  return new Promise((resolve) => {
    execFile('ip', ['-s', 'link'], { timeout: 5000 }, (err, stdout) => {
      if (err) {
        logger.warn('NETWORK: Failed to get stats:', err.message);
        return resolve({
          bytesIn: 0,
          bytesOut: 0,
          packetsIn: 0,
          packetsOut: 0,
          errors: 0,
          dropped: 0
        });
      }

      try {
        const lines = stdout.toString().split('\n').filter(Boolean);
        const stats = { bytesIn: 0, bytesOut: 0, packetsIn: 0, packetsOut: 0, errors: 0, dropped: 0 };

        for (let i = 0; i < lines.length; i++) {
          if (lines[i].includes('RX') && lines[i + 1]) {
            const rxLine = lines[i + 1].trim().split(/\s+/);
            if (rxLine.length >= 2) {
              stats.bytesIn += Number(rxLine[0]) || 0;
              stats.packetsIn += Number(rxLine[1]) || 0;
            }
          }
          if (lines[i].includes('TX') && lines[i + 1]) {
            const txLine = lines[i + 1].trim().split(/\s+/);
            if (txLine.length >= 2) {
              stats.bytesOut += Number(txLine[0]) || 0;
              stats.packetsOut += Number(txLine[1]) || 0;
            }
          }
        }

        resolve(stats);
      } catch (e) {
        logger.warn('NETWORK: Failed to parse stats:', e.message);
        resolve({ bytesIn: 0, bytesOut: 0, packetsIn: 0, packetsOut: 0, errors: 0, dropped: 0 });
      }
    });
  });
}

module.exports = {
  getNetworkInterfaces,
  getNetworkStats
};
