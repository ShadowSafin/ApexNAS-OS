import apiClient from './api';

/**
 * Disk Service
 * Handles all disk-related API calls
 */
const diskService = {
  /**
   * List all physical disks (enriched with SMART, partitions, system disk flag)
   */
  async listDisks() {
    try {
      const response = await apiClient.get('/disk/list');
      const raw = response.data;
      return raw?.data || raw || [];
    } catch (error) {
      throw { error: 'FETCH_DISKS_FAILED', message: error.message };
    }
  },

  /**
   * Get disk usage (byte-level)
   */
  async getDiskUsage() {
    try {
      const response = await apiClient.get('/disk/usage');
      const raw = response.data;
      return raw?.data || raw || [];
    } catch (error) {
      throw { error: 'FETCH_USAGE_FAILED', message: error.message };
    }
  },

  /**
   * Create partition on a disk (full-disk GPT)
   */
  async createPartition(device, confirm) {
    try {
      const response = await apiClient.post('/disk/partition/create', { device, confirm });
      return response.data?.data || response.data;
    } catch (error) {
      throw {
        error: error.data?.error || 'PARTITION_FAILED',
        message: error.data?.message || error.message,
      };
    }
  },

  /**
   * Format a partition with a filesystem
   */
  async formatPartition(partition, fstype = 'ext4', confirm) {
    try {
      const response = await apiClient.post('/disk/partition/format', { partition, fstype, confirm });
      return response.data?.data || response.data;
    } catch (error) {
      throw {
        error: error.data?.error || 'FORMAT_FAILED',
        message: error.data?.message || error.message,
      };
    }
  },

  /**
   * Mount a partition
   */
  async mountPartition(partition, mountpoint, fstype = 'auto') {
    try {
      const response = await apiClient.post('/disk/partition/mount', { partition, mountpoint, fstype });
      return response.data?.data || response.data;
    } catch (error) {
      throw {
        error: error.data?.error || 'MOUNT_FAILED',
        message: error.data?.message || error.message,
      };
    }
  },

  /**
   * Unmount a partition
   */
  async unmountPartition(mountpoint) {
    try {
      const response = await apiClient.post('/disk/partition/unmount', { mountpoint });
      return response.data?.data || response.data;
    } catch (error) {
      throw {
        error: error.data?.error || 'UNMOUNT_FAILED',
        message: error.data?.message || error.message,
      };
    }
  }
};

export default diskService;
