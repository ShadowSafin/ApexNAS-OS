import { create } from 'zustand';
import diskService from '../services/disk.service';

import { shareService, smbService, nfsService, ftpService } from '../services/share.service';
import systemService from '../services/system.service';
import networkService from '../services/network.service';
import accessService from '../services/access.service';

/**
 * Storage Store
 * Manages disk, RAID, and filesystem state
 */
export const useStorageStore = create((set, get) => ({
  // Disks
  disks: [],
  disksLoading: false,
  disksError: null,



  // Disk usage
  diskUsage: [],
  diskUsageLoading: false,

  /**
   * Fetch all disks
   */
  fetchDisks: async () => {
    set({ disksLoading: true, disksError: null });
    try {
      const disks = await diskService.listDisks();
      set({ disks, disksLoading: false });
      return disks;
    } catch (error) {
      set({
        disksError: error.message || 'Failed to fetch disks',
        disksLoading: false
      });
      throw error;
    }
  },

  /**
   * Fetch disk usage information
   */
  fetchDiskUsage: async () => {
    set({ diskUsageLoading: true });
    try {
      const diskUsage = await diskService.getDiskUsage();
      set({ diskUsage, diskUsageLoading: false });
      return diskUsage;
    } catch (error) {
      set({ diskUsageLoading: false });
      throw error;
    }
  },

  /**
   * Mount a partition
   */
  mountPartition: async (device, mountpoint) => {
    try {
      const result = await diskService.mountPartition(device, mountpoint);
      // Refetch disks after mount
      await get().fetchDisks();
      return result;
    } catch (error) {
      throw error;
    }
  }
}));

/**
 * Share Store
 * Central state for shared folders, services, permissions, and access endpoints.
 * Includes global service state (dual-layer) and FTP status.
 */
export const useShareStore = create((set, get) => ({
  shares: [],
  sharesLoading: false,
  sharesError: null,

  // Global service state (dual-layer)
  globalServiceState: { smb: false, nfs: false, ftp: false },

  // Per-service status
  smbStatus: null,
  nfsStatus: null,
  ftpStatus: null,

  /**
   * Fetch all shares (enriched with ACL + access endpoints + global state)
   */
  fetchShares: async () => {
    set({ sharesLoading: true, sharesError: null });
    try {
      const response = await shareService.listShares();
      const shareList = response?.shares || [];
      const globalState = response?.globalServiceState || get().globalServiceState;
      set({
        shares: shareList,
        globalServiceState: globalState,
        sharesLoading: false
      });
      return shareList;
    } catch (error) {
      set({ sharesError: error.message || 'Failed to fetch shares', sharesLoading: false });
      throw error;
    }
  },

  /**
   * Fetch global service state explicitly
   */
  fetchGlobalServiceState: async () => {
    try {
      const state = await shareService.getGlobalServiceState();
      set({ globalServiceState: state });
      return state;
    } catch (error) {
      throw error;
    }
  },

  /**
   * Create a new share
   */
  createShare: async (params) => {
    set({ sharesLoading: true, sharesError: null });
    try {
      const result = await shareService.createShare(params);
      // Re-fetch to get enriched data
      const response = await shareService.listShares();
      set({
        shares: response?.shares || [],
        globalServiceState: response?.globalServiceState || get().globalServiceState,
        sharesLoading: false
      });
      return result;
    } catch (error) {
      set({ sharesError: error.message || 'Failed to create share', sharesLoading: false });
      throw error;
    }
  },

  /**
   * Delete a share (cleans up all protocol configs)
   */
  deleteShare: async (name, removeDirectory = false) => {
    set({ sharesLoading: true, sharesError: null });
    try {
      const result = await shareService.deleteShare(name, removeDirectory);
      const response = await shareService.listShares();
      set({
        shares: response?.shares || [],
        globalServiceState: response?.globalServiceState || get().globalServiceState,
        sharesLoading: false
      });
      return result;
    } catch (error) {
      set({ sharesError: error.message || 'Failed to delete share', sharesLoading: false });
      throw error;
    }
  },

  /**
   * Update services (SMB/NFS/FTP) for a share.
   * Returns warnings from the dual-layer check.
   */
  updateServices: async (name, services) => {
    set({ sharesLoading: true, sharesError: null });
    try {
      const result = await shareService.updateServices(name, services);
      const response = await shareService.listShares();
      set({
        shares: response?.shares || [],
        globalServiceState: response?.globalServiceState || get().globalServiceState,
        sharesLoading: false
      });
      return result;
    } catch (error) {
      set({ sharesError: error.message || 'Failed to update services', sharesLoading: false });
      throw error;
    }
  },

  /**
   * Update ACL permissions for a share.
   */
  updatePermissions: async (name, permissions) => {
    set({ sharesLoading: true, sharesError: null });
    try {
      await shareService.updatePermissions(name, permissions);
      const response = await shareService.listShares();
      set({
        shares: response?.shares || [],
        globalServiceState: response?.globalServiceState || get().globalServiceState,
        sharesLoading: false
      });
    } catch (error) {
      set({ sharesError: error.message || 'Failed to update permissions', sharesLoading: false });
      throw error;
    }
  },

  // ═══════════════════════════════════════════════════════════════════
  //  SMB / NFS / FTP Service Management
  //  (Used by SMBNFS and FTP pages for global service toggle)
  // ═══════════════════════════════════════════════════════════════════

  fetchSmbStatus: async () => {
    try {
      const status = await smbService.getServiceStatus();
      set({ smbStatus: status });
      return status;
    } catch (error) {
      throw error;
    }
  },

  fetchNfsStatus: async () => {
    try {
      const status = await nfsService.getServiceStatus();
      set({ nfsStatus: status });
      return status;
    } catch (error) {
      throw error;
    }
  },

  fetchFtpStatus: async () => {
    try {
      const status = await ftpService.getServiceStatus();
      set({ ftpStatus: status });
      return status;
    } catch (error) {
      throw error;
    }
  },

  /**
   * Enable SMB — also refreshes shares so endpoints update
   */
  enableSmbService: async () => {
    try {
      const result = await smbService.enableService();
      const status = await smbService.getServiceStatus();
      set({ smbStatus: status, globalServiceState: { ...get().globalServiceState, smb: true } });
      // Cross-refresh: shares need updated endpoints
      try { await get().fetchShares(); } catch { /* non-fatal */ }
      return result;
    } catch (error) {
      throw error;
    }
  },

  disableSmbService: async () => {
    try {
      const result = await smbService.disableService();
      const status = await smbService.getServiceStatus();
      set({ smbStatus: status, globalServiceState: { ...get().globalServiceState, smb: false } });
      try { await get().fetchShares(); } catch { /* non-fatal */ }
      return result;
    } catch (error) {
      throw error;
    }
  },

  enableNfsService: async () => {
    try {
      const result = await nfsService.enableService();
      const status = await nfsService.getServiceStatus();
      set({ nfsStatus: status, globalServiceState: { ...get().globalServiceState, nfs: true } });
      try { await get().fetchShares(); } catch { /* non-fatal */ }
      return result;
    } catch (error) {
      throw error;
    }
  },

  disableNfsService: async () => {
    try {
      const result = await nfsService.disableService();
      const status = await nfsService.getServiceStatus();
      set({ nfsStatus: status, globalServiceState: { ...get().globalServiceState, nfs: false } });
      try { await get().fetchShares(); } catch { /* non-fatal */ }
      return result;
    } catch (error) {
      throw error;
    }
  },

  enableFtpService: async (options = {}) => {
    try {
      const result = await ftpService.enableService(options);
      const status = await ftpService.getServiceStatus();
      set({ ftpStatus: status, globalServiceState: { ...get().globalServiceState, ftp: true } });
      try { await get().fetchShares(); } catch { /* non-fatal */ }
      return result;
    } catch (error) {
      throw error;
    }
  },

  disableFtpService: async () => {
    try {
      const result = await ftpService.disableService();
      const status = await ftpService.getServiceStatus();
      set({ ftpStatus: status, globalServiceState: { ...get().globalServiceState, ftp: false } });
      try { await get().fetchShares(); } catch { /* non-fatal */ }
      return result;
    } catch (error) {
      throw error;
    }
  }
}));

/**
 * System Store
 * Manages system status and metrics
 */
export const useSystemStore = create((set) => ({
  // Unified metrics object (from /api/system/metrics)
  metrics: null,
  // Backward-compatible individual fields
  systemInfo: null,
  systemStats: null,
  cpuUsage: 0,
  memoryUsage: 0,
  temperature: { cpuTemp: 0, diskTemp: 0 },
  services: [],
  systemLoading: false,
  systemError: null,

  /**
   * Fetch unified real-time metrics — the primary data source for the dashboard.
   * Populates individual fields for backward compatibility.
   */
  fetchMetrics: async () => {
    try {
      const raw = await systemService.getMetrics();
      // Backend wraps in {success, data}, unwrap it
      const metrics = raw?.data || raw;
      set({
        metrics,
        systemInfo: {
          hostname: metrics.system?.hostname,
          os: metrics.system?.os,
          kernel: metrics.system?.kernel,
          uptime: metrics.system?.uptime,
          loadAverage: metrics.system?.loadAverage,
          processor: metrics.system?.processor
        },
        cpuUsage: metrics.cpu?.usage || 0,
        memoryUsage: metrics.memory?.percent || 0,
        temperature: metrics.temperature || { cpuTemp: 0, diskTemp: 0 },
        systemError: null
      });
      return metrics;
    } catch (error) {
      set({ systemError: error.message || 'Failed to fetch metrics' });
      throw error;
    }
  },

  /**
   * Fetch system information (legacy, still works)
   */
  fetchSystemInfo: async () => {
    set({ systemLoading: true, systemError: null });
    try {
      const systemInfo = await systemService.getSystemInfo();
      set({ systemInfo, systemLoading: false });
      return systemInfo;
    } catch (error) {
      set({
        systemError: error.message || 'Failed to fetch system info',
        systemLoading: false
      });
      throw error;
    }
  },

  /**
   * Fetch system statistics (legacy)
   */
  fetchSystemStats: async () => {
    try {
      const data = await systemService.getSystemStats();
      set({
        systemStats: data,
        cpuUsage: data.cpu || 0,
        memoryUsage: data.memory || 0
      });
      return data;
    } catch (error) {
      throw error;
    }
  },

  /**
   * Fetch system temperature (legacy)
   */
  fetchTemperature: async () => {
    try {
      const temperature = await systemService.getTemperature();
      set({ temperature });
      return temperature;
    } catch (error) {
      throw error;
    }
  },

  /**
   * Fetch all services status
   */
  fetchServices: async () => {
    try {
      const services = await systemService.getServices();
      set({ services });
      return services;
    } catch (error) {
      throw error;
    }
  }
}));

/**
 * Network Store
 * Manages network interfaces and connectivity
 */
export const useNetworkStore = create((set) => ({
  networkInterfaces: [],
  networkLoading: false,
  networkError: null,

  /**
   * Fetch network interfaces
   */
  fetchNetworkInterfaces: async () => {
    set({ networkLoading: true, networkError: null });
    try {
      const interfaces = await networkService.getNetworkInterfaces();
      set({ networkInterfaces: interfaces, networkLoading: false });
      return interfaces;
    } catch (error) {
      set({
        networkError: error.message || 'Failed to fetch network interfaces',
        networkLoading: false
      });
      throw error;
    }
  }
}));

/**
 * Access Store
 * Manages service access points and share attachments
 */
export const useAccessStore = create((set) => ({
  accessInfo: { services: [] },
  accessLoading: false,
  accessError: null,

  /**
   * Fetch access information for all services
   */
  fetchAccessInfo: async () => {
    set({ accessLoading: true, accessError: null });
    try {
      const accessInfo = await accessService.getAccessInfo();
      set({ accessInfo, accessLoading: false });
      return accessInfo;
    } catch (error) {
      set({
        accessError: error.message || 'Failed to fetch access info',
        accessLoading: false
      });
      throw error;
    }
  },

  /**
   * Attach SMB share and refresh access info
   */
  attachSmbShare: async (name, path) => {
    try {
      await accessService.attachSmbShare(name, path);
      // Refresh access info after attachment
      const accessInfo = await accessService.getAccessInfo();
      set({ accessInfo });
      return accessInfo;
    } catch (error) {
      throw error;
    }
  },

  /**
   * Detach SMB share and refresh access info
   */
  detachSmbShare: async (name) => {
    try {
      await accessService.detachSmbShare(name);
      // Refresh access info after detachment
      const accessInfo = await accessService.getAccessInfo();
      set({ accessInfo });
      return accessInfo;
    } catch (error) {
      throw error;
    }
  },

  /**
   * Attach NFS share and refresh access info
   */
  attachNfsShare: async (name, path) => {
    try {
      await accessService.attachNfsShare(name, path);
      // Refresh access info after attachment
      const accessInfo = await accessService.getAccessInfo();
      set({ accessInfo });
      return accessInfo;
    } catch (error) {
      throw error;
    }
  },

  /**
   * Detach NFS share and refresh access info
   */
  detachNfsShare: async (name) => {
    try {
      await accessService.detachNfsShare(name);
      // Refresh access info after detachment
      const accessInfo = await accessService.getAccessInfo();
      set({ accessInfo });
      return accessInfo;
    } catch (error) {
      throw error;
    }
  },

  /**
   * Set FTP root and refresh access info
   */
  setFtpRoot: async (path) => {
    try {
      await accessService.setFtpRoot(path);
      // Refresh access info after setting root
      const accessInfo = await accessService.getAccessInfo();
      set({ accessInfo });
      return accessInfo;
    } catch (error) {
      throw error;
    }
  }
}));
