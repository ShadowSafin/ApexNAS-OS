import apiClient from './api';

/**
 * Filesystem Service
 * Handles filesystem creation, listing, mount/unmount
 */
const filesystemService = {
  /**
   * List all mounted filesystems with usage data
   */
  async listFilesystems() {
    try {
      const response = await apiClient.get('/filesystem/list');
      const raw = response.data;
      const data = raw?.data || raw;
      return data?.filesystems || data || [];
    } catch (error) {
      throw { error: 'FETCH_FILESYSTEMS_FAILED', message: error.message };
    }
  },

  /**
   * Create a filesystem on a device
   */
  async createFilesystem({ device, type = 'ext4', confirm = '', simulation = false }) {
    try {
      const response = await apiClient.post('/filesystem/create', {
        device, type, confirm, simulation
      });
      return response.data?.data || response.data;
    } catch (error) {
      throw {
        error: error.data?.error || 'CREATE_FILESYSTEM_FAILED',
        message: error.data?.message || error.message,
      };
    }
  },

  /**
   * Detect filesystem type on a device
   */
  async detectFilesystem(device) {
    try {
      const response = await apiClient.post('/filesystem/detect', { device });
      return response.data?.data || response.data;
    } catch (error) {
      throw { error: 'DETECT_FAILED', message: error.message };
    }
  },

  /**
   * Mount a filesystem
   */
  async mountFilesystem(device, label) {
    try {
      const response = await apiClient.post('/filesystem/mount', { device, label });
      return response.data?.data || response.data;
    } catch (error) {
      throw {
        error: error.data?.error || 'MOUNT_FAILED',
        message: error.data?.message || error.message,
      };
    }
  },

  /**
   * Unmount a filesystem
   */
  async unmountFilesystem(mountpoint) {
    try {
      const response = await apiClient.post('/filesystem/unmount', { mountpoint });
      return response.data?.data || response.data;
    } catch (error) {
      throw {
        error: error.data?.error || 'UNMOUNT_FAILED',
        message: error.data?.message || error.message,
      };
    }
  }
};

export default filesystemService;
