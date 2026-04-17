import axios from 'axios';

// Configure base URL - matches backend server
// Use import.meta.env for Vite, fallback to direct URL
const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080/api';

/**
 * API Client Instance
 * Handles all HTTP communication with the backend
 */
const apiClient = axios.create({
  baseURL: BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Flag to prevent recursive refresh attempts
let isRefreshing = false;
let refreshSubscribers = [];

const subscribeTokenRefresh = (callback) => {
  refreshSubscribers.push(callback);
};

const notifyTokenRefresh = (token) => {
  refreshSubscribers.forEach((callback) => callback(token));
  refreshSubscribers = [];
};

/**
 * Request interceptor
 * Add auth token if available
 */
apiClient.interceptors.request.use(
  (config) => {
    // Add Bearer token if stored
    const token = localStorage.getItem('auth_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

/**
 * Response interceptor
 * Handle errors uniformly and refresh tokens on expiration
 */
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // Handle token expiration (401)
    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        // Queue this request to be retried after refresh
        return new Promise((resolve) => {
          subscribeTokenRefresh((token) => {
            originalRequest.headers.Authorization = `Bearer ${token}`;
            resolve(apiClient(originalRequest));
          });
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const refreshToken = localStorage.getItem('refresh_token');
        if (!refreshToken) {
          throw new Error('No refresh token available');
        }

        // Refresh the access token
        const response = await axios.post(`${BASE_URL}/auth/refresh`, {
          refreshToken
        });

        const { accessToken } = response.data.data || response.data;
        
        // Store new access token
        localStorage.setItem('auth_token', accessToken);
        
        // Update the original request header
        originalRequest.headers.Authorization = `Bearer ${accessToken}`;
        
        // Notify subscribers and retry original request
        isRefreshing = false;
        notifyTokenRefresh(accessToken);
        return apiClient(originalRequest);
      } catch (refreshError) {
        // Refresh failed - clear tokens and redirect to login
        localStorage.removeItem('auth_token');
        localStorage.removeItem('refresh_token');
        isRefreshing = false;
        
        // Only redirect if we're in a browser environment
        if (typeof window !== 'undefined') {
          window.location.href = '/login';
        }
        
        return Promise.reject({
          status: 401,
          message: 'Session expired. Please login again.',
          data: null
        });
      }
    }

    // Handle other errors
    if (error.response?.status === 403) {
      // Forbidden
      console.error('Access denied:', error.response.data);
    } else if (error.response?.status === 500) {
      // Server error
      console.error('Server error:', error.response.data);
    }
    
    return Promise.reject({
      status: error.response?.status || 'NETWORK_ERROR',
      message: error.response?.data?.message || error.message,
      data: error.response?.data
    });
  }
);

export default apiClient;
