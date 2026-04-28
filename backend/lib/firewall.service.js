/**
 * Firewall Service — Port Management for NAS Services
 *
 * Manages firewall rules (ufw preferred, iptables fallback).
 * Idempotent: safe to call multiple times.
 *
 * Ports:
 *   SMB  → 445, 139
 *   NFS  → 2049, 111 (rpcbind)
 *   FTP  → 21, passive range (30000-31000)
 */

const { execute } = require('./executor');
const logger = require('./logger');

const SERVICE_PORTS = {
  smb: [
    { port: 445, proto: 'tcp', label: 'SMB' },
    { port: 139, proto: 'tcp', label: 'NetBIOS' }
  ],
  nfs: [
    { port: 2049, proto: 'tcp', label: 'NFS' },
    { port: 2049, proto: 'udp', label: 'NFS UDP' },
    { port: 111, proto: 'tcp', label: 'rpcbind' },
    { port: 111, proto: 'udp', label: 'rpcbind UDP' }
  ],
  ftp: [
    { port: 21, proto: 'tcp', label: 'FTP' },
    { port: '30000:31000', proto: 'tcp', label: 'FTP passive' }
  ]
};

class FirewallService {
  /**
   * Detect available firewall tool
   * @returns {'ufw'|'iptables'|null}
   */
  static async detectTool() {
    try {
      await execute('which', ['ufw'], { timeout: 3000 });
      return 'ufw';
    } catch {
      try {
        await execute('which', ['iptables'], { timeout: 3000 });
        return 'iptables';
      } catch {
        return null;
      }
    }
  }

  /**
   * Open all ports required by a protocol
   * @param {'smb'|'nfs'|'ftp'} protocol
   */
  static async openPorts(protocol) {
    const ports = SERVICE_PORTS[protocol];
    if (!ports) {
      logger.warn('FirewallService: Unknown protocol', { protocol });
      return { success: false, message: 'Unknown protocol' };
    }

    const tool = await this.detectTool();
    if (!tool) {
      logger.warn('FirewallService: No firewall tool available');
      return { success: true, message: 'No firewall tool found — ports are likely already open' };
    }

    const results = [];

    for (const { port, proto, label } of ports) {
      try {
        if (tool === 'ufw') {
          await execute('ufw', ['allow', `${port}/${proto}`], { timeout: 10000 });
        } else {
          // iptables fallback
          const portStr = String(port).includes(':') ? port : String(port);
          const match = String(port).includes(':') ? '--match multiport --dports' : '--dport';
          await execute('iptables', [
            '-A', 'INPUT',
            '-p', proto,
            match, portStr,
            '-j', 'ACCEPT'
          ], { timeout: 10000 });
        }
        results.push({ port, proto, label, status: 'opened' });
        logger.info('FirewallService: Port opened', { port, proto, label, tool });
      } catch (err) {
        results.push({ port, proto, label, status: 'error', error: err.message });
        logger.warn('FirewallService: Failed to open port', { port, proto, error: err.message });
      }
    }

    return { success: true, tool, results };
  }

  /**
   * Close all ports for a protocol
   * @param {'smb'|'nfs'|'ftp'} protocol
   */
  static async closePorts(protocol) {
    const ports = SERVICE_PORTS[protocol];
    if (!ports) return { success: false, message: 'Unknown protocol' };

    const tool = await this.detectTool();
    if (!tool) {
      return { success: true, message: 'No firewall tool found' };
    }

    const results = [];

    for (const { port, proto, label } of ports) {
      try {
        if (tool === 'ufw') {
          await execute('ufw', ['delete', 'allow', `${port}/${proto}`], { timeout: 10000 });
        } else {
          const portStr = String(port).includes(':') ? port : String(port);
          const match = String(port).includes(':') ? '--match multiport --dports' : '--dport';
          await execute('iptables', [
            '-D', 'INPUT',
            '-p', proto,
            match, portStr,
            '-j', 'ACCEPT'
          ], { timeout: 10000 });
        }
        results.push({ port, proto, label, status: 'closed' });
      } catch (err) {
        results.push({ port, proto, label, status: 'error', error: err.message });
        logger.warn('FirewallService: Failed to close port', { port, proto, error: err.message });
      }
    }

    return { success: true, tool, results };
  }

  /**
   * Get firewall status summary
   */
  static async getStatus() {
    const tool = await this.detectTool();
    if (!tool) {
      return { success: true, tool: null, message: 'No firewall tool available', rules: [] };
    }

    try {
      if (tool === 'ufw') {
        const { stdout } = await execute('ufw', ['status', 'numbered'], { timeout: 10000 });
        return { success: true, tool, output: stdout };
      } else {
        const { stdout } = await execute('iptables', ['-L', '-n', '--line-numbers'], { timeout: 10000 });
        return { success: true, tool, output: stdout };
      }
    } catch (err) {
      return { success: false, tool, error: err.message };
    }
  }
}

module.exports = { FirewallService, SERVICE_PORTS };
