import apiClient from './api';

/**
 * RAID Service
 * Handles all RAID management API calls
 */
const raidService = {
  /**
   * List all RAID arrays
   */
  async listArrays() {
    try {
      const response = await apiClient.get('/raid/list');
      const raw = response.data;
      // Backend returns {success, data: {arrays, count}} via res.ok()
      // But RAIDService returns {success, arrays, count} directly
      const data = raw?.data || raw;
      return data?.arrays || [];
    } catch (error) {
      throw { error: 'FETCH_RAID_FAILED', message: error.message };
    }
  },

  /**
   * Create a new RAID array
   */
  async createArray({ name, level, devices, confirm = '', simulation = false }) {
    try {
      const response = await apiClient.post('/raid/create', {
        name, level, devices, confirm, simulation
      });
      return response.data?.data || response.data;
    } catch (error) {
      throw {
        error: error.data?.error || 'CREATE_RAID_FAILED',
        message: error.data?.message || error.message,
      };
    }
  },

  /**
   * Stop a RAID array
   */
  async stopArray(name, simulation = false) {
    try {
      const response = await apiClient.post('/raid/stop', { name, simulation });
      return response.data?.data || response.data;
    } catch (error) {
      throw { error: 'STOP_RAID_FAILED', message: error.message };
    }
  },

  /**
   * Get array status
   */
  async getStatus(name) {
    try {
      const response = await apiClient.get(`/raid/status/${name}`);
      return response.data?.data || response.data;
    } catch (error) {
      throw { error: 'GET_STATUS_FAILED', message: error.message };
    }
  },

  /**
   * Remove RAID metadata from devices
   */
  async removeMetadata(devices, confirm = '', simulation = false) {
    try {
      const response = await apiClient.post('/raid/metadata/remove', {
        devices, confirm, simulation
      });
      return response.data?.data || response.data;
    } catch (error) {
      throw { error: 'REMOVE_METADATA_FAILED', message: error.message };
    }
  }
};

export default raidService;
