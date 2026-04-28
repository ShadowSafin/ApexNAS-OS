import { useState, useEffect } from 'react';
import TopBar from '../../components/TopBar/TopBar';
import GlassPanel from '../../components/GlassPanel/GlassPanel';
import StatusIndicator from '../../components/StatusIndicator/StatusIndicator';
import Toggle from '../../components/Toggle/Toggle';
import { useShareStore } from '../../stores';
import './FTP.css';

export default function FTP() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const {
    shares,
    ftpStatus,
    fetchFtpStatus,
    fetchShares,
    enableFtpService,
    disableFtpService
  } = useShareStore();

  // Load FTP data on mount
  useEffect(() => {
    const loadData = async () => {
      try {
        setError(null);
        await Promise.all([
          fetchFtpStatus(),
          fetchShares()
        ]);
      } catch (err) {
        setError(err.response?.data?.message || err.message);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [fetchFtpStatus, fetchShares]);

  const handleToggleFTP = async () => {
    setSubmitting(true);
    try {
      setError(null);
      const ftpShareCount = shares?.filter(s => s.services?.ftp?.enabled).length || 0;

      if (ftpStatus?.enabled) {
        if (ftpShareCount > 0 && !window.confirm(
          `Disabling FTP will make ${ftpShareCount} share${ftpShareCount !== 1 ? 's' : ''} inaccessible via FTP. Continue?`
        )) {
          setSubmitting(false);
          return;
        }
        await disableFtpService();
      } else {
        await enableFtpService({
          port: 21,
          passivePortMin: 30000,
          passivePortMax: 31000
        });
      }
    } catch (err) {
      setError(err.response?.data?.message || err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const ftpShareCount = shares?.filter(s => s.services?.ftp?.enabled).length || 0;
  const systemUsers = ftpStatus?.systemUsers || [];

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
                  {ftpStatus?.passivePortMin || 30000}-{ftpStatus?.passivePortMax || 31000}
                </span>
              </div>
              <div className="info-row">
                <span className="info-row__label">FTP Shares</span>
                <span className="info-row__value">
                  <span className={ftpShareCount > 0 && ftpStatus?.enabled ? 'share-count share-count--active' : 'share-count'}>
                    {ftpShareCount} share{ftpShareCount !== 1 ? 's' : ''}
                  </span>
                  {ftpShareCount > 0 && !ftpStatus?.enabled && (
                    <span className="share-count-hint"> (will activate when enabled)</span>
                  )}
                </span>
              </div>
              <div className="info-row">
                <span className="info-row__label">Authentication</span>
                <span className="info-row__value">Linux System Users (PAM)</span>
              </div>
              <div className="info-row">
                <span className="info-row__label">Chroot</span>
                <span className="info-row__value" style={{ fontFamily: "'SF Mono', 'Fira Code', monospace" }}>
                  /mnt/storage
                </span>
              </div>
            </GlassPanel>
          </section>

          {/* FTP Users Section — Unified Linux Users */}
          <section className="section animate-fade-in-up stagger-2">
            <div className="section__header">
              <div>
                <h2 className="section__title">FTP Users</h2>
                <p className="section__subtitle">
                  {systemUsers.length} system user{systemUsers.length !== 1 ? 's' : ''} with FTP access
                </p>
              </div>
            </div>

            <GlassPanel variant="medium" padding="lg">
              {/* Unified users notice */}
              <div className="unified-users-notice">
                <div className="unified-users-notice__icon">👤</div>
                <div>
                  <strong>Unified Authentication</strong>
                  <p>FTP uses Linux system users. All users created on the <strong>Users</strong> page can connect via FTP with their system credentials.</p>
                </div>
              </div>

              {systemUsers.length === 0 ? (
                <div className="empty-state">
                  <p>No system users configured</p>
                  <p className="empty-state__hint">
                    Create users on the <strong>Access → Users</strong> page to enable FTP access.
                  </p>
                </div>
              ) : (
                <div className="table-container">
                  <table className="users-table">
                    <thead>
                      <tr>
                        <th>Username</th>
                        <th>FTP Root</th>
                        <th>Source</th>
                      </tr>
                    </thead>
                    <tbody>
                      {systemUsers.map((username) => (
                        <tr key={username}>
                          <td>
                            <span className="user-badge">
                              <span className="user-badge__dot" />
                              {username}
                            </span>
                          </td>
                          <td style={{ fontFamily: "'SF Mono', 'Fira Code', monospace", fontSize: 'var(--font-size-xs)' }}>
                            /mnt/storage
                          </td>
                          <td>
                            <span className="source-badge">System User</span>
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
      </div>
    </>
  );
}
