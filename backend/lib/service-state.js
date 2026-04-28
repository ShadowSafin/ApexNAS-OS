/**
 * Service State Manager — Global Service Toggle Source of Truth
 *
 * Tracks whether SMB, NFS, and FTP are globally enabled.
 * Persists state to /etc/nas/service-state.json.
 * On init, syncs with actual systemctl state.
 *
 * The dual-layer access rule:
 *   share accessible = ServiceState.isEnabled(protocol) AND share.services[protocol].enabled
 */

const fs = require('fs');
const path = require('path');
const { execute } = require('./executor');
const logger = require('./logger');

const STATE_DIR = '/etc/nas';
const STATE_FILE = path.join(STATE_DIR, 'service-state.json');

// Fallback state file in data dir (for dev environments without /etc/nas access)
const FALLBACK_STATE_FILE = path.join(__dirname, '../data/service-state.json');

const SERVICE_MAP = {
  smb: 'smbd',
  nfs: 'nfs-server',
  ftp: 'vsftpd'
};

// In-memory state (fast lookups)
let globalState = {
  smb: false,
  nfs: false,
  ftp: false
};

let initialized = false;

class ServiceState {
  /**
   * Initialize: load persisted state, then sync with systemctl reality
   */
  static async initialize() {
    try {
      // Load persisted state
      this._loadState();

      // Sync with actual service state
      await this._syncWithSystem();

      initialized = true;
      logger.info('ServiceState initialized', { state: { ...globalState } });
    } catch (err) {
      logger.error('ServiceState initialization failed', { error: err.message });
      initialized = true; // Still mark as initialized to avoid blocking
    }
  }

  /**
   * Check if a protocol is globally enabled
   * @param {'smb'|'nfs'|'ftp'} protocol
   * @returns {boolean}
   */
  static isEnabled(protocol) {
    if (!SERVICE_MAP[protocol]) {
      logger.warn('ServiceState: Unknown protocol', { protocol });
      return false;
    }
    return globalState[protocol] === true;
  }

  /**
   * Get the full global state
   * @returns {{ smb: boolean, nfs: boolean, ftp: boolean }}
   */
  static getState() {
    return { ...globalState };
  }

  /**
   * Set a service as enabled/disabled and persist
   * @param {'smb'|'nfs'|'ftp'} protocol
   * @param {boolean} enabled
   */
  static setEnabled(protocol, enabled) {
    if (!SERVICE_MAP[protocol]) {
      logger.warn('ServiceState: Unknown protocol', { protocol });
      return;
    }

    const wasEnabled = globalState[protocol];
    globalState[protocol] = !!enabled;

    if (wasEnabled !== globalState[protocol]) {
      logger.info('ServiceState: Protocol toggled', {
        protocol,
        from: wasEnabled,
        to: globalState[protocol]
      });
    }

    this._persistState();
  }

  /**
   * Get the systemd unit name for a protocol
   */
  static getServiceUnit(protocol) {
    return SERVICE_MAP[protocol] || null;
  }

  // ── Private helpers ────────────────────────────────────────────────

  static _getStateFilePath() {
    // Prefer /etc/nas if writable, otherwise use data dir
    try {
      if (fs.existsSync(STATE_DIR)) {
        // Test writability
        const testFile = path.join(STATE_DIR, '.write-test');
        try {
          fs.writeFileSync(testFile, 'test');
          fs.unlinkSync(testFile);
          return STATE_FILE;
        } catch {
          // Not writable, fall back
        }
      }
    } catch { /* ignore */ }

    return FALLBACK_STATE_FILE;
  }

  static _loadState() {
    const filePath = this._getStateFilePath();

    try {
      if (fs.existsSync(filePath)) {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        if (typeof data.smb === 'boolean') globalState.smb = data.smb;
        if (typeof data.nfs === 'boolean') globalState.nfs = data.nfs;
        if (typeof data.ftp === 'boolean') globalState.ftp = data.ftp;
        logger.info('ServiceState: Loaded persisted state', { path: filePath, state: { ...globalState } });
      } else {
        logger.info('ServiceState: No persisted state found, using defaults');
      }
    } catch (err) {
      logger.warn('ServiceState: Failed to load persisted state', { error: err.message });
    }
  }

  static _persistState() {
    const filePath = this._getStateFilePath();

    try {
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(filePath, JSON.stringify({
        smb: globalState.smb,
        nfs: globalState.nfs,
        ftp: globalState.ftp,
        updatedAt: new Date().toISOString()
      }, null, 2), 'utf8');

      logger.debug('ServiceState: Persisted', { path: filePath });
    } catch (err) {
      logger.warn('ServiceState: Failed to persist state', { error: err.message });
    }
  }

  /**
   * Sync in-memory state with actual systemctl status
   * If a service is running but our state says disabled, trust systemctl.
   */
  static async _syncWithSystem() {
    for (const [protocol, unit] of Object.entries(SERVICE_MAP)) {
      try {
        const { stdout } = await execute('systemctl', ['is-active', unit], { timeout: 5000 });
        const isActive = stdout.trim() === 'active';

        if (isActive && !globalState[protocol]) {
          logger.info('ServiceState: Syncing — service is running but state was disabled', { protocol, unit });
          globalState[protocol] = true;
        } else if (!isActive && globalState[protocol]) {
          logger.info('ServiceState: Syncing — service is stopped but state was enabled', { protocol, unit });
          globalState[protocol] = false;
        }
      } catch {
        // systemctl not available (dev environment) — keep persisted state
        logger.debug('ServiceState: Cannot check systemctl for', { protocol, unit });
      }
    }

    this._persistState();
  }
}

module.exports = { ServiceState };
