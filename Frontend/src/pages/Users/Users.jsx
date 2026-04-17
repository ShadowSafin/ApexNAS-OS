import { useState, useEffect, useCallback } from 'react';
import TopBar from '../../components/TopBar/TopBar';
import GlassPanel from '../../components/GlassPanel/GlassPanel';
import Modal from '../../components/Modal/Modal';
import Toast, { useToast } from '../../components/Toast/Toast';
import { userService } from '../../services/user-management.service';
import './Users.css';

export default function Users() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(null); // holds username
  const [submitting, setSubmitting] = useState(false);
  const [newUser, setNewUser] = useState({ username: '', password: '' });
  const [newPassword, setNewPassword] = useState('');
  const [formError, setFormError] = useState(null);
  const { toasts, showToast, removeToast } = useToast();

  const loadUsers = useCallback(async () => {
    try {
      setError(null);
      const data = await userService.listUsers();
      setUsers(data);
    } catch (err) {
      setError(err.message || 'Failed to load users');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const handleCreate = async (e) => {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);
    try {
      await userService.createUser(newUser.username, newUser.password);
      showToast(`User "${newUser.username}" created`, 'success');
      setNewUser({ username: '', password: '' });
      setShowCreateModal(false);
      await loadUsers();
    } catch (err) {
      setFormError(err.data?.message || err.message || 'Failed to create user');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (username) => {
    if (!window.confirm(`Delete user "${username}"? This will remove their home directory and all associated data.`)) return;
    setSubmitting(true);
    try {
      await userService.deleteUser(username);
      showToast(`User "${username}" deleted`, 'success');
      await loadUsers();
    } catch (err) {
      showToast(err.data?.message || err.message || 'Failed to delete user', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSetPassword = async (e) => {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);
    try {
      await userService.setPassword(showPasswordModal, newPassword);
      showToast(`Password updated for "${showPasswordModal}"`, 'success');
      setNewPassword('');
      setShowPasswordModal(null);
    } catch (err) {
      setFormError(err.data?.message || err.message || 'Failed to change password');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <>
        <TopBar title="Users" breadcrumbs={['Access Control', 'Users']} />
        <div className="app-layout__content">
          <div className="users-container">
            <div className="loading-state">
              <div className="loading-spinner" />
              Loading users...
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <TopBar title="Users" breadcrumbs={['Access Control', 'Users']} />
      <div className="app-layout__content">
        <div className="users-container">
          {error && (
            <div className="error-banner">
              <span><strong>Error:</strong> {error}</span>
              <button className="error-close" onClick={() => setError(null)}>×</button>
            </div>
          )}

          {/* Users Section */}
          <section className="section animate-fade-in-up stagger-1">
            <div className="section__header">
              <div>
                <h2 className="section__title">System Users</h2>
                <p className="section__subtitle">
                  {users.length} user{users.length !== 1 ? 's' : ''} — real Linux accounts
                </p>
              </div>
              <button
                className="btn btn--primary"
                onClick={() => { setFormError(null); setShowCreateModal(true); }}
                id="btn-create-user"
              >
                + Create User
              </button>
            </div>

            <GlassPanel variant="medium" padding="lg">
              {users.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-state__icon">👤</div>
                  <p>No users configured</p>
                  <p className="empty-state__hint">Click "Create User" to add your first user</p>
                </div>
              ) : (
                <div className="table-container">
                  <table className="users-table" id="users-table">
                    <thead>
                      <tr>
                        <th>Username</th>
                        <th>UID</th>
                        <th>Groups</th>
                        <th>Home</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.map((user, i) => (
                        <tr key={user.username} className={`animate-fade-in-up stagger-${Math.min(i + 1, 8)}`}>
                          <td>
                            <div className="user-identity">
                              <span className="user-avatar">{user.username[0].toUpperCase()}</span>
                              <span className="user-name">{user.username}</span>
                            </div>
                          </td>
                          <td><span className="uid-badge">{user.uid}</span></td>
                          <td>
                            <div className="group-tags">
                              {(user.groups || []).map(g => (
                                <span key={g} className="group-tag">{g}</span>
                              ))}
                              {(!user.groups || user.groups.length === 0) && (
                                <span className="group-tag group-tag--empty">none</span>
                              )}
                            </div>
                          </td>
                          <td><code className="home-path">{user.home}</code></td>
                          <td>
                            <div className="action-group">
                              <button
                                className="btn btn--sm btn--secondary"
                                onClick={() => { setFormError(null); setNewPassword(''); setShowPasswordModal(user.username); }}
                                disabled={submitting}
                                title="Change password"
                              >
                                🔑 Password
                              </button>
                              <button
                                className="btn btn--sm btn--danger"
                                onClick={() => handleDelete(user.username)}
                                disabled={submitting}
                                title="Delete user"
                              >
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </GlassPanel>
          </section>
        </div>

        {/* Create User Modal */}
        <Modal
          isOpen={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          title="Create User"
          footer={
            <div className="modal-actions">
              <button className="btn btn--secondary" onClick={() => setShowCreateModal(false)}>Cancel</button>
              <button className="btn btn--primary" onClick={handleCreate} disabled={submitting}>
                {submitting ? 'Creating...' : 'Create User'}
              </button>
            </div>
          }
        >
          <form onSubmit={handleCreate} className="form-card" id="create-user-form">
            {formError && <div className="form-error">{formError}</div>}
            <div className="form-group">
              <label htmlFor="create-username" className="form-label">Username</label>
              <input
                id="create-username"
                type="text"
                className="form-input"
                value={newUser.username}
                onChange={(e) => setNewUser({ ...newUser, username: e.target.value })}
                placeholder="e.g. john"
                required
                disabled={submitting}
                autoFocus
              />
              <span className="form-hint">1-32 chars, starts with a letter. Letters, numbers, underscore, hyphen, or period</span>
            </div>
            <div className="form-group">
              <label htmlFor="create-password" className="form-label">Password</label>
              <input
                id="create-password"
                type="password"
                className="form-input"
                value={newUser.password}
                onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                placeholder="Minimum 6 characters"
                required
                disabled={submitting}
              />
              <span className="form-hint">Password is set for Linux and Samba (SMB) authentication</span>
            </div>
          </form>
        </Modal>

        {/* Change Password Modal */}
        <Modal
          isOpen={!!showPasswordModal}
          onClose={() => setShowPasswordModal(null)}
          title={`Change Password — ${showPasswordModal}`}
          footer={
            <div className="modal-actions">
              <button className="btn btn--secondary" onClick={() => setShowPasswordModal(null)}>Cancel</button>
              <button className="btn btn--primary" onClick={handleSetPassword} disabled={submitting}>
                {submitting ? 'Updating...' : 'Update Password'}
              </button>
            </div>
          }
        >
          <form onSubmit={handleSetPassword} className="form-card" id="change-password-form">
            {formError && <div className="form-error">{formError}</div>}
            <div className="form-group">
              <label htmlFor="new-password" className="form-label">New Password</label>
              <input
                id="new-password"
                type="password"
                className="form-input"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Minimum 6 characters"
                required
                disabled={submitting}
                autoFocus
              />
            </div>
          </form>
        </Modal>

        {/* Toast notifications */}
        <div className="toast-container">
          {toasts.map(t => (
            <Toast key={t.id} message={t.message} type={t.type} duration={t.duration} />
          ))}
        </div>
      </div>
    </>
  );
}
