import { useState, useEffect } from 'react';
import TopBar from '../../components/TopBar/TopBar';
import GlassPanel from '../../components/GlassPanel/GlassPanel';
import StatusIndicator from '../../components/StatusIndicator/StatusIndicator';
import Toggle from '../../components/Toggle/Toggle';
import apiClient from '../../services/api';
import './FTP.css';

export default function FTP() {
  const [ftpStatus, setFtpStatus] = useState(null);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showAddUser, setShowAddUser] = useState(false);
  const [newUser, setNewUser] = useState({
    username: '',
    password: '',
    homeDir: '/mnt/storage/ftp'
  });
  const [submitting, setSubmitting] = useState(false);

  // Load FTP data on mount
  useEffect(() => {
    const loadData = async () => {
      try {
        setError(null);
        const [statusRes, usersRes] = await Promise.all([
          apiClient.get('/ftp/status'),
          apiClient.get('/ftp/users')
        ]);
        
        setFtpStatus(statusRes.data?.data || statusRes.data);
        setUsers(Array.isArray(usersRes.data?.data) ? usersRes.data.data : []);
      } catch (err) {
        setError(err.response?.data?.message || err.message);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  const handleToggleFTP = async () => {
    setSubmitting(true);
    try {
      setError(null);
      if (ftpStatus?.enabled) {
        await apiClient.post('/ftp/disable');
      } else {
        await apiClient.post('/ftp/enable', {
          port: 21,
          passivePortMin: 6000,
          passivePortMax: 6100
        });
      }
      // Refresh status
      const statusRes = await apiClient.get('/ftp/status');
      setFtpStatus(statusRes.data?.data || statusRes.data);
    } catch (err) {
      setError(err.response?.data?.message || err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddUser = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      setError(null);
      await apiClient.post('/ftp/users', {
        username: newUser.username,
        password: newUser.password,
        homeDir: newUser.homeDir
      });
      setNewUser({ username: '', password: '', homeDir: '/mnt/storage/ftp' });
      setShowAddUser(false);
      // Refresh users list
      const usersRes = await apiClient.get('/ftp/users');
      setUsers(Array.isArray(usersRes.data?.data) ? usersRes.data.data : []);
    } catch (err) {
      setError(err.response?.data?.message || err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleRemoveUser = async (username) => {
    if (!window.confirm(`Remove FTP user "${username}"?`)) return;

    setSubmitting(true);
    try {
      setError(null);
      await apiClient.delete(`/ftp/users/${username}`);
      // Refresh users list
      const usersRes = await apiClient.get('/ftp/users');
      setUsers(Array.isArray(usersRes.data?.data) ? usersRes.data.data : []);
    } catch (err) {
      setError(err.response?.data?.message || err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <>
        <TopBar title="FTP Service" breadcrumbs={['Services', 'FTP']} />
        <div className="app-layout__content">
          <div className="ftp-container">
            <div className="loading-state">Loading FTP configuration...</div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <TopBar title="FTP Service" breadcrumbs={['Services', 'FTP']} />
      <div className="app-layout__content">
        <div className="ftp-container">
          {error && (
            <div className="error-banner">
              <strong>Error:</strong> {error}
              <button className="error-close" onClick={() => setError(null)}>×</button>
            </div>
          )}

          {/* FTP Service Status Section */}
          <section className="section animate-fade-in-up stagger-1">
            <div className="section__header">
              <div className="protocol-header">
                <div className="protocol-header__left">
                  <h2 className="section__title">FTP Service</h2>
                  <span className="protocol-badge protocol-badge--ftp">Port 21</span>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                <StatusIndicator 
                  status={ftpStatus?.enabled ? 'online' : 'offline'} 
                  label={ftpStatus?.enabled ? 'Running' : 'Stopped'}
                />
                <Toggle 
                  active={ftpStatus?.enabled} 
                  onChange={handleToggleFTP} 
                  id="toggle-ftp"
                  disabled={submitting}
                />
              </div>
            </div>

            <GlassPanel variant="medium" padding="lg">
              <div className="info-row">
                <span className="info-row__label">Status</span>
                <span className="info-row__value">
                  {ftpStatus?.enabled ? '✓ Active' : '✗ Inactive'}
                </span>
              </div>
              <div className="info-row">
                <span className="info-row__label">Port</span>
                <span className="info-row__value">{ftpStatus?.port || 21}</span>
              </div>
              <div className="info-row">
                <span className="info-row__label">Passive Port Range</span>
                <span className="info-row__value">
                  {ftpStatus?.passivePortMin || 6000}-{ftpStatus?.passivePortMax || 6100}
                </span>
              </div>
            </GlassPanel>
          </section>

          {/* FTP Users Section */}
          <section className="section animate-fade-in-up stagger-2">
            <div className="section__header">
              <div>
                <h2 className="section__title">FTP Users</h2>
                <p className="section__subtitle">{users.length} user{users.length !== 1 ? 's' : ''}</p>
              </div>
              {ftpStatus?.enabled && (
                <button 
                  className="btn btn--primary"
                  onClick={() => setShowAddUser(!showAddUser)}
                >
                  {showAddUser ? '✕ Cancel' : '+ Add User'}
                </button>
              )}
            </div>

            {showAddUser && ftpStatus?.enabled && (
              <GlassPanel variant="medium" padding="lg">
                <form onSubmit={handleAddUser} className="form-card">
                  <div className="form-group">
                    <label htmlFor="username" className="form-label">Username</label>
                    <input
                      id="username"
                      type="text"
                      className="form-input"
                      value={newUser.username}
                      onChange={(e) => setNewUser({ ...newUser, username: e.target.value })}
                      required
                      disabled={submitting}
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="password" className="form-label">Password</label>
                    <input
                      id="password"
                      type="password"
                      className="form-input"
                      value={newUser.password}
                      onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                      required
                      disabled={submitting}
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="homeDir" className="form-label">Home Directory</label>
                    <input
                      id="homeDir"
                      type="text"
                      className="form-input"
                      value={newUser.homeDir}
                      onChange={(e) => setNewUser({ ...newUser, homeDir: e.target.value })}
                      disabled={submitting}
                    />
                  </div>

                  <button 
                    type="submit" 
                    className="btn btn--primary"
                    disabled={submitting}
                  >
                    {submitting ? 'Adding User...' : 'Add User'}
                  </button>
                </form>
              </GlassPanel>
            )}

            {users.length === 0 ? (
              <GlassPanel variant="medium" padding="lg">
                <div className="empty-state">
                  <p>No FTP users configured</p>
                  {ftpStatus?.enabled && (
                    <p className="empty-state__hint">Click "Add User" to create one</p>
                  )}
                </div>
              </GlassPanel>
            ) : (
              <GlassPanel variant="medium" padding="lg">
                <div className="table-container">
                  <table className="users-table">
                    <thead>
                      <tr>
                        <th>Username</th>
                        <th>Home Directory</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.map((user) => (
                        <tr key={user.username}>
                          <td>{user.username}</td>
                          <td>{user.homeDir}</td>
                          <td>
                            <button
                              className="btn btn--sm btn--danger"
                              onClick={() => handleRemoveUser(user.username)}
                              disabled={submitting}
                            >
                              Remove
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </GlassPanel>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
