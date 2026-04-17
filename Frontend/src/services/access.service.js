import apiClient from './api';

/**
 * Access Service
 * Handles service access point information and share attachment
 */
const accessService = {
  /**
   * Get access information for all services (SMB, NFS, FTP)
   */
  async getAccessInfo() {
    try {
      const response = await apiClient.get('/system/access');
      return response.data || { services: [] };
    } catch (error) {
      throw {
        error: 'FETCH_ACCESS_FAILED',
        message: error.response?.data?.message || error.message,
      };
    }
  },

  /**
   * Attach a folder to SMB service
   */
  async attachSmbShare(name, path) {
    try {
      const response = await apiClient.post('/smb/attach', { name, path });
      return response.data;
    } catch (error) {
      throw {
        error: 'ATTACH_SMB_FAILED',
        message: error.response?.data?.message || error.message,
      };
    }
  },

  /**
   * Detach a folder from SMB service
   */
  async detachSmbShare(name) {
    try {
      const response = await apiClient.delete(`/smb/attach/${name}`);
      return response.data;
    } catch (error) {
      throw {
        error: 'DETACH_SMB_FAILED',
        message: error.response?.data?.message || error.message,
      };
    }
  },

  /**
   * Attach a folder to NFS service
   */
  async attachNfsShare(name, path) {
    try {
      const response = await apiClient.post('/nfs/attach', { name, path });
      return response.data;
    } catch (error) {
      throw {
        error: 'ATTACH_NFS_FAILED',
        message: error.response?.data?.message || error.message,
      };
    }
  },

  /**
   * Detach a folder from NFS service
   */
  async detachNfsShare(name) {
    try {
      const response = await apiClient.delete(`/nfs/attach/${name}`);
      return response.data;
    } catch (error) {
      throw {
        error: 'DETACH_NFS_FAILED',
        message: error.response?.data?.message || error.message,
      };
    }
  },

  /**
   * Set FTP root directory
   */
  async setFtpRoot(path) {
    try {
      const response = await apiClient.post('/ftp/set-root', { path });
      return response.data;
    } catch (error) {
      throw {
        error: 'SET_FTP_ROOT_FAILED',
        message: error.response?.data?.message || error.message,
      };
    }
  }
};

export default accessService;
