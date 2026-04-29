import apiClient from './api';

/**
 * System Service
 * Handles system status, metrics, and control operations
 */
const systemService = {
  /**
   * Get system information (hostname, OS, kernel, etc.)
   */
  async getSystemInfo() {
    try {
      const response = await apiClient.get('/system/info');
      return response.data;
    } catch (error) {
      throw {
        error: 'FETCH_SYSTEM_INFO_FAILED',
        message: error.response?.data?.message || error.message,
      };
    }
  },

  /**
   * Get system statistics (CPU, memory, uptime, etc.)
   */
  async getSystemStats() {
    try {
      const response = await apiClient.get('/system/stats');
      return response.data;
    } catch (error) {
      throw {
        error: 'FETCH_SYSTEM_STATS_FAILED',
        message: error.response?.data?.message || error.message,
      };
    }
  },

  /**
   * Get current CPU usage
   */
  async getCpuUsage() {
    try {
      const response = await apiClient.get('/system/cpu');
      return response.data;
    } catch (error) {
      throw {
        error: 'FETCH_CPU_USAGE_FAILED',
        message: error.response?.data?.message || error.message,
      };
    }
  },

  /**
   * Get current memory usage
   */
  async getMemoryUsage() {
    try {
      const response = await apiClient.get('/system/memory');
      return response.data;
    } catch (error) {
      throw {
        error: 'FETCH_MEMORY_USAGE_FAILED',
        message: error.response?.data?.message || error.message,
      };
    }
  },

  /**
   * Get disk usage information
   */
  async getDiskUsage() {
    try {
      const response = await apiClient.get('/system/disk');
      return response.data;
    } catch (error) {
      throw {
        error: 'FETCH_DISK_USAGE_FAILED',
        message: error.response?.data?.message || error.message,
      };
    }
  },

  /**
   * Get system services status
   */
  async getServices() {
    try {
      const response = await apiClient.get('/system/services');
      // Backend wraps in { success, data }
      return response.data?.data || response.data || [];
    } catch (error) {
      console.error('Get services error:', error);
      throw {
        error: 'FETCH_SERVICES_FAILED',
        message: error.response?.data?.message || error.message,
      };
    }
  },

  /**
   * Get system logs by service
   * @param {Object} options - { service, limit, since, until }
   */
  async getLogs(options = {}) {
    try {
      const { service = 'system', limit = 100, since, until } = options;
      const params = new URLSearchParams();
      params.append('service', service);
      params.append('limit', limit);
      if (since) params.append('since', since);
      if (until) params.append('until', until);

      const response = await apiClient.get(`/system/logs?${params.toString()}`);
      return response.data || [];
    } catch (error) {
      throw {
        error: 'FETCH_LOGS_FAILED',
        message: error.response?.data?.message || error.message,
      };
    }
  },

  /**
   * Reboot the system (requires admin and confirmation token)
   */
  async reboot(confirmToken = 'YES_REBOOT') {
    try {
      const response = await apiClient.post('/system/reboot', {
        confirm: confirmToken
      });
      return response.data;
    } catch (error) {
      throw {
        error: 'REBOOT_FAILED',
        message: error.response?.data?.message || error.message,
      };
    }
  },

  /**
   * Shutdown the system (requires admin and confirmation token)
   */
  async shutdown(confirmToken = 'YES_SHUTDOWN') {
    try {
      const response = await apiClient.post('/system/shutdown', {
        confirm: confirmToken
      });
      return response.data;
    } catch (error) {
      throw {
        error: 'SHUTDOWN_FAILED',
        message: error.response?.data?.message || error.message,
      };
    }
  },

  /**
   * Get system temperature readings (CPU and disk)
   */
  async getTemperature() {
    try {
      const response = await apiClient.get('/system/temperature');
      return response.data || { cpuTemp: 0, diskTemp: 0 };
    } catch (error) {
      throw {
        error: 'FETCH_TEMPERATURE_FAILED',
        message: error.response?.data?.message || error.message,
      };
    }
  },

  /**
   * Get unified real-time system metrics
   * Returns: { cpu, memory, disk, network, temperature, system }
   */
  async getMetrics() {
    try {
      const response = await apiClient.get('/system/metrics');
      return response.data;
    } catch (error) {
      throw {
        error: 'FETCH_METRICS_FAILED',
        message: error.response?.data?.message || error.message,
      };
    }
  },

  /**
   * Start a system service
   * @param {string} name - Service name (smb, nfs, ftp, ssh)
   */
  async startService(name) {
    try {
      const response = await apiClient.post(`/system/service/${name}/start`);
      return response.data;
    } catch (error) {
      throw {
        error: 'START_SERVICE_FAILED',
        message: error.response?.data?.message || error.message,
      };
    }
  },

  /**
   * Stop a system service
   * @param {string} name - Service name (smb, nfs, ftp, ssh)
   */
  async stopService(name) {
    try {
      const response = await apiClient.post(`/system/service/${name}/stop`);
      return response.data;
    } catch (error) {
      throw {
        error: 'STOP_SERVICE_FAILED',
        message: error.response?.data?.message || error.message,
      };
    }
  },

  /**
   * Get access points for shares and services
   */
  async getAccessPoints() {
    try {
      const response = await apiClient.get('/system/access');
      // Backend wraps in { success, data }
      return response.data?.data || response.data || { services: [] };
    } catch (error) {
      console.error('Get access points error:', error);
      throw {
        error: 'FETCH_ACCESS_POINTS_FAILED',
        message: error.response?.data?.message || error.message,
      };
    }
  }
};

export default systemService;
