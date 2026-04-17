/**
 * User Management API Service
 * 
 * Frontend API client for user, group, and ACL operations.
 */

import apiClient from './api';

/**
 * User endpoints
 */
export const userService = {
  async listUsers() {
    const res = await apiClient.get('/users');
    const data = res.data?.data || res.data;
    return data?.users || [];
  },

  async getUser(username) {
    const res = await apiClient.get(`/users/${username}`);
    const data = res.data?.data || res.data;
    return data?.user || null;
  },

  async createUser(username, password) {
    const res = await apiClient.post('/users', { username, password });
    return res.data?.data || res.data;
  },

  async deleteUser(username) {
    const res = await apiClient.delete(`/users/${username}`);
    return res.data?.data || res.data;
  },

  async setPassword(username, password) {
    const res = await apiClient.put(`/users/${username}/password`, { password });
    return res.data?.data || res.data;
  },

  async getUserGroups(username) {
    const res = await apiClient.get(`/users/${username}/groups`);
    const data = res.data?.data || res.data;
    return data?.groups || [];
  }
};

/**
 * Group endpoints
 */
export const groupService = {
  async listGroups() {
    const res = await apiClient.get('/groups');
    const data = res.data?.data || res.data;
    return data?.groups || [];
  },

  async createGroup(name) {
    const res = await apiClient.post('/groups', { name });
    return res.data?.data || res.data;
  },

  async deleteGroup(name) {
    const res = await apiClient.delete(`/groups/${name}`);
    return res.data?.data || res.data;
  },

  async addMember(groupName, username) {
    const res = await apiClient.post(`/groups/${groupName}/members`, { username });
    return res.data?.data || res.data;
  },

  async removeMember(groupName, username) {
    const res = await apiClient.delete(`/groups/${groupName}/members/${username}`);
    return res.data?.data || res.data;
  }
};

/**
 * ACL endpoints
 */
export const aclService = {
  async getPermissions(path) {
    const res = await apiClient.get('/acl/get', { params: { path } });
    return res.data;
  },

  async setUserPermissions(path, user, permissions, recursive = false) {
    const res = await apiClient.post('/acl/set-user', { path, user, permissions, recursive });
    return res.data;
  },

  async setGroupPermissions(path, group, permissions, recursive = false) {
    const res = await apiClient.post('/acl/set-group', { path, group, permissions, recursive });
    return res.data;
  },

  async removeUserPermissions(path, user, recursive = false) {
    const res = await apiClient.delete('/acl/remove-user', { data: { path, user, recursive } });
    return res.data;
  },

  async removeGroupPermissions(path, group, recursive = false) {
    const res = await apiClient.delete('/acl/remove-group', { data: { path, group, recursive } });
    return res.data;
  },

  async removeAllACLs(path, recursive = false) {
    const res = await apiClient.delete('/acl/remove-all', { data: { path, recursive } });
    return res.data;
  }
};

export default { userService, groupService, aclService };
