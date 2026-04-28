import apiClient from './api';

/**
 * Share Service — Unified Share Management API
 * 
 * This is the primary interface for the Shares page.
 * All operations go through /api/share/* endpoints.
 */
const shareService = {
  /**
   * List all shares (enriched with ACL + access endpoints)
   */
  async listShares() {
    try {
      const response = await apiClient.get('/share/list');
      return response.data;
    } catch (error) {
      throw { error: 'FETCH_SHARES_FAILED', message: error.message };
    }
  },

  /**
   * Create a new share
   */
  async createShare(params) {
    try {
      const response = await apiClient.post('/share/create', params);
      return response.data;
    } catch (error) {
      throw {
        error: 'CREATE_SHARE_FAILED',
        message: error.response?.data?.message || error.message,
      };
    }
  },

  /**
   * Get single share details (enriched)
   */
  async getShare(name) {
    try {
      const response = await apiClient.get(`/share/get/${name}`);
      return response.data;
    } catch (error) {
      throw { error: 'FETCH_SHARE_FAILED', message: error.message };
    }
  },

  /**
   * Delete a share
   */
  async deleteShare(name, removeDirectory = false) {
    try {
      const response = await apiClient.delete('/share/delete', {
        data: { name, removeDirectory }
      });
      return response.data;
    } catch (error) {
      throw { error: 'DELETE_SHARE_FAILED', message: error.message };
    }
  },

  /**
   * Update services (SMB / NFS / FTP) for a share.
   * 
   * @param {string} name - share name
   * @param {object} services - partial update object, e.g.
   *   { smb: { enabled: true, readOnly: false } }
   *   { nfs: { enabled: true, subnet: '10.0.0.0/8', mode: 'ro' } }
   */
  async updateServices(name, services) {
    try {
      const response = await apiClient.put(`/share/${name}/services`, services);
      return response.data;
    } catch (error) {
      throw {
        error: 'UPDATE_SERVICES_FAILED',
        message: error.response?.data?.message || error.message,
      };
    }
  },

  /**
   * Update ACL permissions for a share (batch).
   * 
   * @param {string} name - share name
   * @param {Array} permissions - [{ subject: "user:john", access: "write" }, ...]
   */
  async updatePermissions(name, permissions) {
    try {
      const response = await apiClient.put(`/share/${name}/permissions`, { permissions });
      return response.data;
    } catch (error) {
      throw {
        error: 'UPDATE_PERMISSIONS_FAILED',
        message: error.response?.data?.message || error.message,
      };
    }
  },

  /**
   * Get global service state (SMB / NFS / FTP enabled/disabled)
   */
  async getGlobalServiceState() {
    try {
      const response = await apiClient.get('/share/global-status');
      return response.data?.globalServiceState || { smb: false, nfs: false, ftp: false };
    } catch (error) {
      return { smb: false, nfs: false, ftp: false };
    }
  }
};

/**
 * SMB Service — kept for Services page compatibility
 */
const smbService = {
  async listShares() {
    const response = await apiClient.get('/smb/shares');
    return response.data?.shares || [];
  },
  async createShare(params) {
    const response = await apiClient.post('/smb/shares', params);
    return response.data;
  },
  async deleteShare(name) {
    const response = await apiClient.delete(`/smb/shares/${name}`);
    return response.data;
  },
  async getServiceStatus() {
    const response = await apiClient.get('/smb/status');
    return response.data;
  },
  async enableService() {
    const response = await apiClient.post('/smb/enable');
    return response.data;
  },
  async disableService() {
    const response = await apiClient.post('/smb/disable');
    return response.data;
  },
  async getAvailablePaths() {
    const response = await apiClient.get('/smb/available-paths');
    return response.data?.paths || [];
  }
};

/**
 * NFS Service — kept for Services page compatibility
 */
const nfsService = {
  async listExports() {
    const response = await apiClient.get('/nfs/exports');
    return response.data?.exports || [];
  },
  async createExport(params) {
    const response = await apiClient.post('/nfs/exports', params);
    return response.data;
  },
  async deleteExport(name) {
    const response = await apiClient.delete(`/nfs/exports/${name}`);
    return response.data;
  },
  async getServiceStatus() {
    const response = await apiClient.get('/nfs/status');
    return response.data;
  },
  async enableService() {
    const response = await apiClient.post('/nfs/enable');
    return response.data;
  },
  async disableService() {
    const response = await apiClient.post('/nfs/disable');
    return response.data;
  },
  async getAvailablePaths() {
    const response = await apiClient.get('/nfs/available-paths');
    return response.data?.paths || [];
  }
};

/**
 * FTP Service — for FTP page
 */
const ftpService = {
  async getServiceStatus() {
    const response = await apiClient.get('/ftp/status');
    return response.data?.data || response.data;
  },
  async enableService(options = {}) {
    const response = await apiClient.post('/ftp/enable', options);
    return response.data;
  },
  async disableService() {
    const response = await apiClient.post('/ftp/disable');
    return response.data;
  },
  async listUsers() {
    const response = await apiClient.get('/ftp/users');
    return response.data?.data || [];
  }
};

export { shareService, smbService, nfsService, ftpService };
