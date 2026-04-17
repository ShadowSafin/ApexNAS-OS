import apiClient from './api';

/**
 * Authentication Service
 * Handles login, token refresh, and logout operations
 */

const authService = {
  /**
   * Login with username and password
   * @param {string} username
   * @param {string} password
   * @returns {Promise<{accessToken, refreshToken, user}>}
   */
  async login(username, password) {
    try {
      const response = await apiClient.post('/auth/login', {
        username,
        password
      });
      
      const { accessToken, refreshToken } = response.data.data;
      
      // Decode JWT to get user info
      const user = authService.decodeToken(accessToken);
      
      // Store tokens
      localStorage.setItem('auth_token', accessToken);
      localStorage.setItem('refresh_token', refreshToken);
      localStorage.setItem('user', JSON.stringify(user));
      
      return { success: true, accessToken, refreshToken, user };
    } catch (error) {
      return { 
        success: false, 
        error: error.response?.data?.message || error.message || 'Login failed'
      };
    }
  },

  /**
   * Refresh access token
   * @param {string} refreshToken
   * @returns {Promise<string>} new access token
   */
  async refresh(refreshToken) {
    try {
      const response = await apiClient.post('/auth/refresh', {
        refreshToken
      });
      
      const { accessToken } = response.data.data;
      localStorage.setItem('auth_token', accessToken);
      
      return accessToken;
    } catch (error) {
      throw error;
    }
  },

  /**
   * Logout by revoking refresh token
   * @param {string} refreshToken
   * @returns {Promise<void>}
   */
  async logout(refreshToken) {
    try {
      await apiClient.post('/auth/logout', {
        refreshToken
      });
      
      localStorage.removeItem('auth_token');
      localStorage.removeItem('refresh_token');
      localStorage.removeItem('user');
    } catch (error) {
      // Clear tokens even if logout fails
      localStorage.removeItem('auth_token');
      localStorage.removeItem('refresh_token');
      localStorage.removeItem('user');
      throw error;
    }
  },

  /**
   * Get current user from storage
   * @returns {object|null}
   */
  getCurrentUser() {
    const user = localStorage.getItem('user');
    return user ? JSON.parse(user) : null;
  },

  /**
   * Check if user is authenticated
   * @returns {boolean}
   */
  isAuthenticated() {
    return !!localStorage.getItem('auth_token');
  },

  /**
   * Get access token
   * @returns {string|null}
   */
  getAccessToken() {
    return localStorage.getItem('auth_token');
  },

  /**
   * Get refresh token
   * @returns {string|null}
   */
  getRefreshToken() {
    return localStorage.getItem('refresh_token');
  },

  /**
   * Decode JWT token to extract user info
   * @param {string} token
   * @returns {object} decoded token payload
   */
  decodeToken(token) {
    try {
      const base64Url = token.split('.')[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = decodeURIComponent(
        atob(base64)
          .split('')
          .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
          .join('')
      );
      return JSON.parse(jsonPayload);
    } catch (err) {
      return null;
    }
  }
};

export default authService;
