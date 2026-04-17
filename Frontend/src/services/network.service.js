import apiClient from './api';

/**
 * Network Service
 * Handles network interface and connectivity information
 */
const networkService = {
  /**
   * Get all network interfaces
   */
  async getNetworkInterfaces() {
    try {
      const response = await apiClient.get('/network/interfaces');
      return response.data || [];
    } catch (error) {
      throw {
        error: 'FETCH_NETWORK_INTERFACES_FAILED',
        message: error.response?.data?.message || error.message,
      };
    }
  },

  /**
   * Get network statistics
   */
  async getNetworkStats() {
    try {
      const response = await apiClient.get('/network/stats');
      return response.data;
    } catch (error) {
      throw {
        error: 'FETCH_NETWORK_STATS_FAILED',
        message: error.response?.data?.message || error.message,
      };
    }
  }
};

export default networkService;
