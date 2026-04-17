import { useEffect, useState } from 'react';
import TopBar from '../../components/TopBar/TopBar';
import GlassPanel from '../../components/GlassPanel/GlassPanel';
import Toggle from '../../components/Toggle/Toggle';
import systemService from '../../services/system.service';
import './System.css';

export default function System() {
  const [metrics, setMetrics] = useState({
    cpu: 0,
    memory: 0,
    disk: 0,
    uptime: 0,
    loadAverage: '0.00, 0.00, 0.00'
  });
  const [temperature, setTemperature] = useState({ cpuTemp: 0, diskTemp: 0 });
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [systemInfo, setSystemInfo] = useState(null);
  const [selectedService, setSelectedService] = useState('system');
  const [settings, setSettings] = useState({
    ssh: false,
    notifications: false,
    autoUpdates: false,
    monitoring: false,
    powerSave: false,
  });
  const [confirmDialog, setConfirmDialog] = useState({
    visible: false,
    type: null,
    step: 1,
    isProcessing: false
  });

  /**
   * Load system info, metrics, and logs on component mount
   */
  useEffect(() => {
    const loadSystemData = async () => {
      setLoading(true);
      try {
        setError(null);
        const info = await systemService.getSystemInfo();
        setSystemInfo(info);
        await loadMetrics();
        await loadLogs('system');
      } catch (err) {
        setError(err.message || 'Failed to load system data');
        console.error('System error:', err);
      } finally {
        setLoading(false);
      }
    };

    loadSystemData();

    // Refresh metrics every 5 seconds
    const metricsInterval = setInterval(loadMetrics, 5000);
    return () => clearInterval(metricsInterval);
  }, []);

  /**
   * Load system metrics
   */
  const loadMetrics = async () => {
    try {
      const [stats, temp] = await Promise.all([
        systemService.getSystemStats(),
        systemService.getTemperature()
      ]);
      setMetrics(stats);
      setTemperature(temp);
    } catch (err) {
      console.error('Failed to load metrics:', err);
    }
  };

  /**
   * Load logs for selected service
   */
  const loadLogs = async (service = selectedService) => {
    setLoading(true);
    try {
      const logsData = await systemService.getLogs({ service, limit: 50 });
      setLogs(logsData || []);
    } catch (err) {
      console.error(`Failed to load ${service} logs:`, err);
      setLogs([]);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Handle service filter change
   */
  const handleServiceChange = async (service) => {
    setSelectedService(service);
    await loadLogs(service);
  };

  /**
   * Toggle a setting
   */
  const toggle = (key) => {
    setSettings(prev => ({ ...prev, [key]: !prev[key] }));
  };

  /**
   * Show confirmation dialog for system actions
   */
  const showConfirmDialog = (type) => {
    setConfirmDialog({
      visible: true,
      type,
      step: 1,
      isProcessing: false
    });
  };

  /**
   * Handle confirmation dialog - step navigation
   */
  const handleConfirmStep = async () => {
    if (confirmDialog.step === 1) {
      setConfirmDialog(prev => ({ ...prev, step: 2 }));
    } else if (confirmDialog.step === 2) {
      setConfirmDialog(prev => ({ ...prev, isProcessing: true }));
      try {
        const confirmToken = confirmDialog.type === 'reboot' ? 'YES_REBOOT' : 'YES_SHUTDOWN';
        if (confirmDialog.type === 'reboot') {
          await systemService.reboot(confirmToken);
        } else if (confirmDialog.type === 'shutdown') {
          await systemService.shutdown(confirmToken);
        }
        alert(`System ${confirmDialog.type}ing...`);
        setConfirmDialog({
          visible: false,
          type: null,
          step: 1,
          isProcessing: false
        });
      } catch (err) {
        alert(`Failed to ${confirmDialog.type}: ${err.message}`);
        setConfirmDialog(prev => ({ ...prev, isProcessing: false }));
      }
    }
  };

  /**
   * Close confirmation dialog
   */
  const closeConfirmDialog = () => {
    if (!confirmDialog.isProcessing) {
      setConfirmDialog({
        visible: false,
        type: null,
        step: 1,
        isProcessing: false
      });
    }
  };

  /**
   * Handle reboot
   */
  const handleReboot = () => {
    showConfirmDialog('reboot');
  };

  /**
   * Handle shutdown
   */
  const handleShutdown = () => {
    showConfirmDialog('shutdown');
  };

  /**
   * Format bytes to readable format
   */
  const formatBytes = (bytes) => {
    if (!bytes && bytes !== 0) return 'N/A';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let size = bytes;
    let unitIndex = 0;
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    return `${size.toFixed(2)} ${units[unitIndex]}`;
  };

  /**
   * Format uptime seconds to readable format
   */
  const formatUptime = (seconds) => {
    if (!seconds && seconds !== 0) return 'N/A';
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (days > 0) return `${days}d ${hours}h ${minutes}m`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  /**
   * Progress bar component
   */
  const ProgressBar = ({ value, label }) => {
    const getColor = (v) => {
      if (v < 50) return '#4CAF50';
      if (v < 75) return '#FFC107';
      return '#F44336';
    };
    return (
      <div style={{ marginBottom: 'var(--space-3)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
          <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{label}</span>
          <span style={{ fontSize: '12px', fontWeight: 'bold', color: getColor(value) }}>{value}%</span>
        </div>
        <div style={{
          height: '8px',
          backgroundColor: '#333',
          borderRadius: '4px',
          overflow: 'hidden'
        }}>
          <div style={{
            width: `${value}%`,
            height: '100%',
            backgroundColor: getColor(value),
            transition: 'width 0.3s ease'
          }} />
        </div>
      </div>
    );
  };

  return (
    <>
      <TopBar title="System" breadcrumbs={['Administration', 'System Settings']} />
      <div className="app-layout__content">
        <div className="system-page">

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

          {/* System Metrics */}
          <div className="section animate-fade-in-up stagger-1">
            <div className="section__header">
              <h2 className="section__title">System Metrics</h2>
            </div>
            <GlassPanel variant="medium" padding="lg">
              {metricsLoading ? (
                <div style={{ textAlign: 'center', padding: 'var(--space-4)', color: '#999' }}>
                  Loading metrics...
                </div>
              ) : (
                <>
                  <ProgressBar value={metrics.cpu} label="CPU Usage" />
                  <ProgressBar value={metrics.memory} label="Memory Usage" />
                  <ProgressBar value={metrics.disk} label="Disk Usage" />
                  <div className="info-row">
                    <span className="info-row__label">System Uptime</span>
                    <span className="info-row__value">{formatUptime(metrics.uptime)}</span>
                  </div>
                  <div className="info-row">
                    <span className="info-row__label">Load Average (1m, 5m, 15m)</span>
                    <span className="info-row__value">{metrics.loadAverage}</span>
                  </div>
                </>
              )}
            </GlassPanel>
          </div>

          {/* Temperature */}
          <div className="section animate-fade-in-up stagger-2">
            <div className="section__header">
              <h2 className="section__title">Temperature</h2>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--space-4)' }}>
              <GlassPanel variant="subtle" padding="md">
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '2rem', fontWeight: '600', color: temperature?.cpuTemp > 80 ? '#f87171' : temperature?.cpuTemp > 60 ? '#fbbf24' : '#4ade80' }}>
                    {temperature?.cpuTemp || 0}°C
                  </div>
                  <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginTop: 'var(--space-2)' }}>
                    CPU Temperature
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginTop: 'var(--space-1)' }}>
                    {temperature?.cpuTemp > 80 ? 'Critical' : temperature?.cpuTemp > 60 ? 'Warm' : 'Normal'}
                  </div>
                </div>
              </GlassPanel>
              <GlassPanel variant="subtle" padding="md">
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '2rem', fontWeight: '600', color: temperature?.diskTemp > 60 ? '#f87171' : temperature?.diskTemp > 45 ? '#fbbf24' : '#4ade80' }}>
                    {temperature?.diskTemp || 0}°C
                  </div>
                  <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginTop: 'var(--space-2)' }}>
                    Disk Temperature
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginTop: 'var(--space-1)' }}>
                    {temperature?.diskTemp > 60 ? 'Critical' : temperature?.diskTemp > 45 ? 'Warm' : 'Normal'}
                  </div>
                </div>
              </GlassPanel>
            </div>
          </div>

          {/* General Info */}
          <div className="section animate-fade-in-up stagger-2">
            <div className="section__header">
              <h2 className="section__title">General Information</h2>
            </div>
            <GlassPanel variant="medium" padding="lg">
              {loading ? (
                <div style={{ textAlign: 'center', padding: 'var(--space-4)', color: '#999' }}>
                  Loading system information...
                </div>
              ) : systemInfo ? (
                <>
                  <div className="info-row">
                    <span className="info-row__label">Hostname</span>
                    <span className="info-row__value">{systemInfo.hostname || 'N/A'}</span>
                  </div>
                  <div className="info-row">
                    <span className="info-row__label">Operating System</span>
                    <span className="info-row__value">{systemInfo.osRelease || 'N/A'}</span>
                  </div>
                  <div className="info-row">
                    <span className="info-row__label">Kernel</span>
                    <span className="info-row__value">{systemInfo.kernel || 'N/A'}</span>
                  </div>
                  <div className="info-row">
                    <span className="info-row__label">CPU Cores</span>
                    <span className="info-row__value">{systemInfo.cpuCount || 'N/A'}</span>
                  </div>
                  <div className="info-row">
                    <span className="info-row__label">Total Memory</span>
                    <span className="info-row__value">{systemInfo.totalMemory ? formatBytes(systemInfo.totalMemory) : 'N/A'}</span>
                  </div>
                </>
              ) : (
                <div style={{ textAlign: 'center', padding: 'var(--space-4)', color: '#999' }}>
                  No system information available
                </div>
              )}
            </GlassPanel>
          </div>

          {/* Settings */}
          <div className="section animate-fade-in-up stagger-3">
            <div className="section__header">
              <h2 className="section__title">Settings</h2>
            </div>
            <GlassPanel variant="medium" padding="lg">
              <div className="setting-item">
                <div className="setting-item__info">
                  <span className="setting-item__label">SSH Access</span>
                  <span className="setting-item__desc">Allow remote shell access via SSH</span>
                </div>
                <Toggle active={settings.ssh} onChange={() => toggle('ssh')} id="toggle-ssh" />
              </div>
              <div className="setting-item">
                <div className="setting-item__info">
                  <span className="setting-item__label">Email Notifications</span>
                  <span className="setting-item__desc">Send alerts for critical system events</span>
                </div>
                <Toggle active={settings.notifications} onChange={() => toggle('notifications')} id="toggle-notifications" />
              </div>
              <div className="setting-item">
                <div className="setting-item__info">
                  <span className="setting-item__label">Automatic Updates</span>
                  <span className="setting-item__desc">Install security updates automatically</span>
                </div>
                <Toggle active={settings.autoUpdates} onChange={() => toggle('autoUpdates')} id="toggle-auto-updates" />
              </div>
              <div className="setting-item">
                <div className="setting-item__info">
                  <span className="setting-item__label">System Monitoring</span>
                  <span className="setting-item__desc">Collect performance metrics and disk health data</span>
                </div>
                <Toggle active={settings.monitoring} onChange={() => toggle('monitoring')} id="toggle-monitoring" />
              </div>
              <div className="setting-item">
                <div className="setting-item__info">
                  <span className="setting-item__label">Power Saving Mode</span>
                  <span className="setting-item__desc">Spin down idle disks after 30 minutes</span>
                </div>
                <Toggle active={settings.powerSave} onChange={() => toggle('powerSave')} id="toggle-power-save" />
              </div>
            </GlassPanel>
          </div>

          {/* Power Management */}
          <div className="section animate-fade-in-up stagger-4">
            <div className="section__header">
              <h2 className="section__title">Power Management</h2>
            </div>
            <GlassPanel variant="medium" padding="lg">
              <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--font-size-sm)', marginBottom: 'var(--space-3)' }}>
                Control system power state. Active connections will be terminated.
              </p>
              <div className="power-actions">
                <button 
                  className="power-btn power-btn--warning" 
                  id="btn-reboot"
                  onClick={handleReboot}
                >
                  ⟳ Reboot
                </button>
                <button 
                  className="power-btn power-btn--danger" 
                  id="btn-shutdown"
                  onClick={handleShutdown}
                >
                  ⏻ Shutdown
                </button>
              </div>
            </GlassPanel>
          </div>

          {/* Logs Viewer */}
          <div className="section animate-fade-in-up stagger-5">
            <div className="section__header">
              <div>
                <h2 className="section__title">System Logs</h2>
                <p className="section__subtitle">Real-time service logs</p>
              </div>
              <select 
                value={selectedService} 
                onChange={(e) => handleServiceChange(e.target.value)}
                style={{
                  padding: '8px 12px',
                  backgroundColor: '#222',
                  border: '1px solid #444',
                  borderRadius: '4px',
                  color: '#fff',
                  fontSize: '14px',
                  cursor: 'pointer'
                }}
              >
                <option value="system">System</option>
                <option value="smb">SMB</option>
                <option value="nfs">NFS</option>
                <option value="ftp">FTP</option>
              </select>
            </div>
            <GlassPanel variant="medium" padding="md">
              {loading ? (
                <div style={{ textAlign: 'center', padding: 'var(--space-4)', color: '#999' }}>
                  Loading logs...
                </div>
              ) : logs && logs.length > 0 ? (
                <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                  {logs.map((log, i) => (
                    <div key={i} className="log-entry">
                      <span className="log-entry__time">{log.timestamp ? new Date(log.timestamp).toLocaleTimeString() : 'N/A'}</span>
                      <span className={`log-entry__level log-entry__level--${(log.level || 'info').toLowerCase()}`}>
                        {log.level || 'INFO'}
                      </span>
                      <span className="log-entry__msg">{log.message || 'N/A'}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: 'var(--space-4)', color: '#999' }}>
                  No logs available
                </div>
              )}
            </GlassPanel>
          </div>

        </div>

        {/* Confirmation Dialog */}
        {confirmDialog.visible && (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000
          }}>
            <div style={{
              backgroundColor: '#1a1a2e',
              border: '1px solid #e91e63',
              borderRadius: '8px',
              padding: '32px',
              maxWidth: '400px',
              color: '#fff',
              boxShadow: '0 10px 40px rgba(0, 0, 0, 0.3)'
            }}>
              <h3 style={{ fontSize: '20px', marginBottom: '16px', color: '#e91e63' }}>
                ⚠️ {confirmDialog.type === 'reboot' ? 'Reboot System?' : 'Shutdown System?'}
              </h3>
              
              {confirmDialog.step === 1 ? (
                <>
                  <p style={{ marginBottom: '24px', color: '#ccc', fontSize: '14px' }}>
                    {confirmDialog.type === 'reboot' 
                      ? 'This will immediately restart the system. All active connections will be terminated. Are you sure?'
                      : 'This will immediately shut down the system. This action cannot be undone without physical access. Are you sure?'
                    }
                  </p>
                  <div style={{ display: 'flex', gap: '12px' }}>
                    <button
                      onClick={closeConfirmDialog}
                      disabled={confirmDialog.isProcessing}
                      style={{
                        flex: 1,
                        padding: '10px',
                        backgroundColor: '#333',
                        border: '1px solid #555',
                        color: '#fff',
                        borderRadius: '4px',
                        cursor: confirmDialog.isProcessing ? 'not-allowed' : 'pointer',
                        opacity: confirmDialog.isProcessing ? 0.5 : 1
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleConfirmStep}
                      disabled={confirmDialog.isProcessing}
                      style={{
                        flex: 1,
                        padding: '10px',
                        backgroundColor: '#e91e63',
                        border: 'none',
                        color: '#fff',
                        borderRadius: '4px',
                        cursor: confirmDialog.isProcessing ? 'not-allowed' : 'pointer',
                        opacity: confirmDialog.isProcessing ? 0.5 : 1,
                        fontWeight: 'bold'
                      }}
                    >
                      Yes, Continue
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p style={{ marginBottom: '8px', color: '#ff9999', fontSize: '14px', fontWeight: 'bold' }}>
                    {confirmDialog.type === 'reboot' 
                      ? 'This is your FINAL confirmation to reboot the system.'
                      : 'This is your FINAL confirmation to shut down the system.'
                    }
                  </p>
                  <p style={{ marginBottom: '24px', color: '#ccc', fontSize: '12px' }}>
                    Click "Confirm" again to proceed. This action will be executed immediately.
                  </p>
                  <div style={{ display: 'flex', gap: '12px' }}>
                    <button
                      onClick={closeConfirmDialog}
                      disabled={confirmDialog.isProcessing}
                      style={{
                        flex: 1,
                        padding: '10px',
                        backgroundColor: '#333',
                        border: '1px solid #555',
                        color: '#fff',
                        borderRadius: '4px',
                        cursor: confirmDialog.isProcessing ? 'not-allowed' : 'pointer',
                        opacity: confirmDialog.isProcessing ? 0.5 : 1
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleConfirmStep}
                      disabled={confirmDialog.isProcessing}
                      style={{
                        flex: 1,
                        padding: '10px',
                        backgroundColor: confirmDialog.isProcessing ? '#666' : '#e91e63',
                        border: 'none',
                        color: '#fff',
                        borderRadius: '4px',
                        cursor: confirmDialog.isProcessing ? 'not-allowed' : 'pointer',
                        fontWeight: 'bold'
                      }}
                    >
                      {confirmDialog.isProcessing ? 'Processing...' : 'Confirm'}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
