import { useEffect, useState } from 'react';
import TopBar from '../../components/TopBar/TopBar';
import GlassPanel from '../../components/GlassPanel/GlassPanel';
import StatusIndicator from '../../components/StatusIndicator/StatusIndicator';
import Toggle from '../../components/Toggle/Toggle';
import { useShareStore } from '../../stores';
import './SMBNFS.css';

export default function SMBNFS() {
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [smbSettings, setSmbSettings] = useState({
    guestAccess: false,
    recycleBin: false,
    auditLogs: false,
    largeRW: false,
  });
  const [nfsSettings, setNfsSettings] = useState({
    v4: false,
    kerberos: false,
    asyncWrites: false,
  });

  const {
    smbStatus,
    nfsStatus,
    fetchSmbStatus,
    fetchNfsStatus,
    enableSmbService,
    disableSmbService,
    enableNfsService,
    disableNfsService
  } = useShareStore();

  /**
   * Load service statuses on component mount
   */
  useEffect(() => {
    const loadServices = async () => {
      try {
        setError(null);
        await Promise.all([
          fetchSmbStatus(),
          fetchNfsStatus()
        ]);
      } catch (err) {
        setError(err.message || 'Failed to load service status');
        console.error('SMBNFS error:', err);
      }
    };

    loadServices();
  }, [fetchSmbStatus, fetchNfsStatus]);

  const toggleSmb = (key) => setSmbSettings(p => ({ ...p, [key]: !p[key] }));
  const toggleNfs = (key) => setNfsSettings(p => ({ ...p, [key]: !p[key] }));

  /**
   * Handle SMB service toggle
   */
  const handleSmbToggle = async () => {
    try {
      setError(null);
      setLoading(true);
      
      if (smbStatus?.active) {
        await disableSmbService();
      } else {
        await enableSmbService();
      }
    } catch (err) {
      setError(err.message || 'Failed to toggle SMB service');
    } finally {
      setLoading(false);
    }
  };

  /**
   * Handle NFS service toggle
   */
  const handleNfsToggle = async () => {
    try {
      setError(null);
      setLoading(true);
      
      if (nfsStatus?.active) {
        await disableNfsService();
      } else {
        await enableNfsService();
      }
    } catch (err) {
      setError(err.message || 'Failed to toggle NFS service');
    } finally {
      setLoading(false);
    }
  };

  const smbEnabled = smbStatus?.active ?? false;
  const nfsEnabled = nfsStatus?.active ?? false;

  return (
    <>
      <TopBar title="SMB / NFS" breadcrumbs={['Services', 'Protocol Configuration']} />
      <div className="app-layout__content">
        <div className="smbnfs-page">

          {/* Error message */}
          {error && (
            <div style={{
              padding: 'var(--space-3)',
              marginBottom: 'var(--space-4)',
              backgroundColor: '#fee2e2',
              border: '1px solid #fecaca',
              borderRadius: 'var(--radius-md)',
              color: '#991b1b',
              fontSize: 'var(--font-size-sm)'
            }}>
              <strong>Error:</strong> {error}
            </div>
          )}

          {/* ─── SMB ─── */}
          <div className="section animate-fade-in-up stagger-1">
            <div className="section__header">
              <div className="protocol-header">
                <div className="protocol-header__left">
                  <h2 className="section__title">SMB / CIFS</h2>
                  <span className="protocol-badge protocol-badge--smb">Port 445</span>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                <StatusIndicator 
                  status={smbEnabled ? 'online' : 'offline'} 
                  label={smbEnabled ? 'Running' : 'Stopped'} 
                />
                <Toggle active={smbEnabled} onChange={handleSmbToggle} id="toggle-smb" disabled={loading} />
              </div>
            </div>
            <GlassPanel variant="medium" padding="lg">
              <div className="info-row">
                <span className="info-row__label">Workgroup</span>
                <span className="info-row__value">{smbStatus?.workgroup || 'WORKGROUP'}</span>
              </div>
              <div className="info-row">
                <span className="info-row__label">Server String</span>
                <span className="info-row__value">{smbStatus?.serverString || 'NAS-OS File Server'}</span>
              </div>

              <div className="settings-group">
                <div className="setting-item">
                  <div className="setting-item__info">
                    <span className="setting-item__label">Allow Guest Access</span>
                    <span className="setting-item__desc">Allow connections without authentication</span>
                  </div>
                  <Toggle active={smbSettings.guestAccess} onChange={() => toggleSmb('guestAccess')} id="toggle-smb-guest" />
                </div>
                <div className="setting-item">
                  <div className="setting-item__info">
                    <span className="setting-item__label">Recycle Bin</span>
                    <span className="setting-item__desc">Move deleted files to recycle bin instead of permanent deletion</span>
                  </div>
                  <Toggle active={smbSettings.recycleBin} onChange={() => toggleSmb('recycleBin')} id="toggle-smb-recycle" />
                </div>
                <div className="setting-item">
                  <div className="setting-item__info">
                    <span className="setting-item__label">Audit Logging</span>
                    <span className="setting-item__desc">Log file access events for security monitoring</span>
                  </div>
                  <Toggle active={smbSettings.auditLogs} onChange={() => toggleSmb('auditLogs')} id="toggle-smb-audit" />
                </div>
                <div className="setting-item">
                  <div className="setting-item__info">
                    <span className="setting-item__label">Large Read/Write</span>
                    <span className="setting-item__desc">Enable large MTU for improved transfer speeds</span>
                  </div>
                  <Toggle active={smbSettings.largeRW} onChange={() => toggleSmb('largeRW')} id="toggle-smb-largerw" />
                </div>
              </div>
            </GlassPanel>
          </div>

          {/* ─── NFS ─── */}
          <div className="section animate-fade-in-up stagger-3">
            <div className="section__header">
              <div className="protocol-header">
                <div className="protocol-header__left">
                  <h2 className="section__title">NFS</h2>
                  <span className="protocol-badge protocol-badge--nfs">Port 2049</span>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                <StatusIndicator 
                  status={nfsEnabled ? 'online' : 'offline'} 
                  label={nfsEnabled ? 'Running' : 'Stopped'} 
                />
                <Toggle active={nfsEnabled} onChange={handleNfsToggle} id="toggle-nfs" disabled={loading} />
              </div>
            </div>
            <GlassPanel variant="medium" padding="lg">
              <div className="info-row">
                <span className="info-row__label">Number of Servers</span>
                <span className="info-row__value">{nfsStatus?.numServers || '8'}</span>
              </div>

              <div className="settings-group">
                <div className="setting-item">
                  <div className="setting-item__info">
                    <span className="setting-item__label">NFSv4 Support</span>
                    <span className="setting-item__desc">Enable NFS version 4 protocol</span>
                  </div>
                  <Toggle active={nfsSettings.v4} onChange={() => toggleNfs('v4')} id="toggle-nfs-v4" />
                </div>
                <div className="setting-item">
                  <div className="setting-item__info">
                    <span className="setting-item__label">Kerberos Authentication</span>
                    <span className="setting-item__desc">Require Kerberos for NFS connections</span>
                  </div>
                  <Toggle active={nfsSettings.kerberos} onChange={() => toggleNfs('kerberos')} id="toggle-nfs-kerberos" />
                </div>
                <div className="setting-item">
                  <div className="setting-item__info">
                    <span className="setting-item__label">Async Writes</span>
                    <span className="setting-item__desc">Allow asynchronous write operations for better performance</span>
                  </div>
                  <Toggle active={nfsSettings.asyncWrites} onChange={() => toggleNfs('asyncWrites')} id="toggle-nfs-async" />
                </div>
              </div>
            </GlassPanel>
          </div>

        </div>
      </div>
    </>
  );
}
