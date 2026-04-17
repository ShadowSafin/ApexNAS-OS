const { execFile } = require('child_process');
const os = require('os');
const logger = require('../../lib/logger');

/**
 * Get network interfaces
 */
async function getNetworkInterfaces() {
  const interfaces = os.networkInterfaces();
  const result = [];

  for (const [name, addrs] of Object.entries(interfaces)) {
    // Filter out loopback and link-layer addresses
    const ipv4Addrs = addrs.filter(addr => addr.family === 'IPv4' && !addr.internal);
    
    if (ipv4Addrs.length > 0) {
      result.push({
        name,
        ip: ipv4Addrs[0].address,
        mac: addrs.find(a => a.family === 'MAC')?.address || 'N/A',
        status: 'up' // Simplified for now
      });
    }
  }

  return result;
}

/**
 * Get network statistics
 */
async function getNetworkStats() {
  return new Promise((resolve) => {
    execFile('ip', ['-s', 'link'], { timeout: 5000 }, (err, stdout, stderr) => {
      if (err) {
        logger.warn('Failed to get network stats:', err.message);
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
        const stats = {
          bytesIn: 0,
          bytesOut: 0,
          packetsIn: 0,
          packetsOut: 0,
          errors: 0,
          dropped: 0
        };

        // Parse ip command output (simplified)
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
      } catch (parseErr) {
        logger.warn('Failed to parse network stats:', parseErr.message);
        resolve({
          bytesIn: 0,
          bytesOut: 0,
          packetsIn: 0,
          packetsOut: 0,
          errors: 0,
          dropped: 0
        });
      }
    });
  });
}

module.exports = {
  getNetworkInterfaces,
  getNetworkStats
};
