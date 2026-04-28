import { useEffect, useState } from 'react';
import TopBar from '../../components/TopBar/TopBar';
import GlassPanel from '../../components/GlassPanel/GlassPanel';
import Toggle from '../../components/Toggle/Toggle';
import { useSystemStore } from '../../stores';
import systemService from '../../services/system.service';
import './System.css';

export default function System() {
  // ── UNIFIED METRICS: same store + same endpoint as Dashboard ──
  const {
    metrics,
    systemInfo,
    cpuUsage,
    memoryUsage,
    temperature,
    systemLoading,
    fetchMetrics
  } = useSystemStore();

  const [logs, setLogs] = useState([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [error, setError] = useState(null);
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

  // ── Load data + auto-refresh every 3s (same as Dashboard) ──
  useEffect(() => {
    const loadInitial = async () => {
      try {
        setError(null);
        await fetchMetrics();
        await loadLogs('system');
      } catch (err) {
        setError(err.message || 'Failed to load system data');
      }
    };
    loadInitial();

    const interval = setInterval(() => {
      fetchMetrics().catch(() => {});
    }, 3000);
    return () => clearInterval(interval);
  }, [fetchMetrics]);

  const loadLogs = async (service = selectedService) => {
    setLogsLoading(true);
    try {
      const logsData = await systemService.getLogs({ service, limit: 50 });
      setLogs(logsData || []);
    } catch (err) {
      console.error(`Failed to load ${service} logs:`, err);
      setLogs([]);
    } finally {
      setLogsLoading(false);
    }
  };

  const handleServiceChange = async (service) => {
    setSelectedService(service);
    await loadLogs(service);
  };

  const toggle = (key) => setSettings(prev => ({ ...prev, [key]: !prev[key] }));

  const showConfirmDialog = (type) => {
    setConfirmDialog({ visible: true, type, step: 1, isProcessing: false });
  };

  const handleConfirmStep = async () => {
    if (confirmDialog.step === 1) {
      setConfirmDialog(prev => ({ ...prev, step: 2 }));
    } else if (confirmDialog.step === 2) {
      setConfirmDialog(prev => ({ ...prev, isProcessing: true }));
      try {
        const confirmToken = confirmDialog.type === 'reboot' ? 'YES_REBOOT' : 'YES_SHUTDOWN';
        if (confirmDialog.type === 'reboot') {
          await systemService.reboot(confirmToken);
        } else {
          await systemService.shutdown(confirmToken);
        }
        alert(`System ${confirmDialog.type}ing...`);
        setConfirmDialog({ visible: false, type: null, step: 1, isProcessing: false });
      } catch (err) {
        alert(`Failed to ${confirmDialog.type}: ${err.message}`);
        setConfirmDialog(prev => ({ ...prev, isProcessing: false }));
      }
    }
  };

  const closeConfirmDialog = () => {
    if (!confirmDialog.isProcessing) {
      setConfirmDialog({ visible: false, type: null, step: 1, isProcessing: false });
    }
  };

  const handleReboot = () => showConfirmDialog('reboot');
  const handleShutdown = () => showConfirmDialog('shutdown');

  const formatBytes = (bytes) => {
    if (!bytes && bytes !== 0) return '—';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let size = bytes;
    let unitIndex = 0;
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    return `${size.toFixed(2)} ${units[unitIndex]}`;
  };

  // ── Derived data from UNIFIED metrics (same source as Dashboard) ──
  const cpu = metrics?.cpu?.usage ?? cpuUsage ?? 0;
  const mem = metrics?.memory || { total: 0, used: 0, available: 0, percent: 0 };
  const disk = metrics?.disk || { total: 0, used: 0, available: 0, percent: 0 };
  const temp = metrics?.temperature || temperature || { cpuTemp: 0, diskTemp: 0 };
  const sys = metrics?.system || systemInfo || {};
  const loadAvg = sys.loadAverage || '—';
  const uptimeFormatted = sys.uptime || '—';

  const ProgressBar = ({ value, label, subtitle, hasUsage }) => {
    const getColor = (v) => {
      if (v < 50) return '#4ade80';
      if (v < 75) return '#fbbf24';
      return '#f87171';
    };
    // Show '<1%' when value rounds to 0 but there IS actual usage
    const displayValue = (value === 0 && hasUsage) ? '<1' : `${value}`;
    const barWidth = (value === 0 && hasUsage) ? 1 : value;
    return (
      <div style={{ marginBottom: 'var(--space-3)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
          <div>
            <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{label}</span>
            {subtitle && (
              <span style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginLeft: '8px' }}>{subtitle}</span>
            )}
          </div>
          <span style={{ fontSize: '12px', fontWeight: 'bold', color: getColor(value) }}>{displayValue}%</span>
        </div>
        <div style={{ height: '8px', backgroundColor: '#333', borderRadius: '4px', overflow: 'hidden' }}>
          <div style={{
            width: `${barWidth}%`,
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

          {/* System Metrics \u2014 UNIFIED with Dashboard via useSystemStore.fetchMetrics() */}
          <div className="section animate-fade-in-up stagger-1">
            <div className="section__header">
              <h2 className="section__title">System Metrics</h2>
            </div>
            <GlassPanel variant="medium" padding="lg">
              {systemLoading && !metrics ? (
                <div style={{ textAlign: 'center', padding: 'var(--space-4)', color: '#999' }}>
                  Loading metrics...
                </div>
              ) : (
                <>
                  <ProgressBar
                    value={cpu}
                    label="CPU Usage"
                    subtitle={sys.cpuCount ? `${sys.cpuCount} cores` : ''}
                  />
                  <ProgressBar
                    value={mem.percent}
                    label="Memory Usage"
                    subtitle={mem.total > 0 ? `${formatBytes(mem.used)} / ${formatBytes(mem.total)}` : ''}
                  />
                  <ProgressBar
                    value={disk.percent}
                    label="Disk Filled Up"
                    subtitle={disk.total > 0 ? `${formatBytes(disk.used)} / ${formatBytes(disk.total)}` : ''}
                    hasUsage={disk.used > 0}
                  />
                  <div className="info-row">
                    <span className="info-row__label">System Uptime</span>
                    <span className="info-row__value">{uptimeFormatted}</span>
                  </div>
                  <div className="info-row">
                    <span className="info-row__label">Load Average (1m, 5m, 15m)</span>
                    <span className="info-row__value">{loadAvg}</span>
                  </div>
                </>
              )}
            </GlassPanel>
          </div>

          {/* Temperature \u2014 from unified metrics */}
          <div className="section animate-fade-in-up stagger-2">
            <div className="section__header">
              <h2 className="section__title">Temperature</h2>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--space-4)' }}>
              <GlassPanel variant="subtle" padding="md">
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '2rem', fontWeight: '600', color: temp.cpuTemp === 0 ? '#6b7280' : temp.cpuTemp > 80 ? '#f87171' : temp.cpuTemp > 60 ? '#fbbf24' : '#4ade80' }}>
                    {temp.cpuTemp > 0 ? <>{temp.cpuTemp}{"°"}C</> : 'N/A'}
                  </div>
                  <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginTop: 'var(--space-2)' }}>
                    CPU Temperature
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginTop: 'var(--space-1)' }}>
                    {temp.cpuTemp === 0 ? 'Sensor unavailable' : temp.cpuTemp > 80 ? 'Critical' : temp.cpuTemp > 60 ? 'Warm' : 'Normal'}
                  </div>
                </div>
              </GlassPanel>
              <GlassPanel variant="subtle" padding="md">
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '2rem', fontWeight: '600', color: temp.diskTemp === 0 ? '#6b7280' : temp.diskTemp > 60 ? '#f87171' : temp.diskTemp > 45 ? '#fbbf24' : '#4ade80' }}>
                    {temp.diskTemp > 0 ? <>{temp.diskTemp}{"°"}C</> : 'N/A'}
                  </div>
                  <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginTop: 'var(--space-2)' }}>
                    Disk Temperature
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginTop: 'var(--space-1)' }}>
                    {temp.diskTemp === 0 ? 'Sensor unavailable' : temp.diskTemp > 60 ? 'Critical' : temp.diskTemp > 45 ? 'Warm' : 'Normal'}
                  </div>
                </div>
              </GlassPanel>
            </div>
          </div>

          {/* General Info \u2014 from unified metrics */}
          <div className="section animate-fade-in-up stagger-2">
            <div className="section__header">
              <h2 className="section__title">General Information</h2>
            </div>
            <GlassPanel variant="medium" padding="lg">
              {systemLoading && !sys.hostname ? (
                <div style={{ textAlign: 'center', padding: 'var(--space-4)', color: '#999' }}>
                  Loading system information...
                </div>
              ) : sys.hostname ? (
                <>
                  <div className="info-row">
                    <span className="info-row__label">Hostname</span>
                    <span className="info-row__value">{sys.hostname}</span>
                  </div>
                  <div className="info-row">
                    <span className="info-row__label">Operating System</span>
                    <span className="info-row__value">{sys.os || '—'}</span>
                  </div>
                  <div className="info-row">
                    <span className="info-row__label">Kernel</span>
                    <span className="info-row__value">{sys.kernel || '—'}</span>
                  </div>
                  <div className="info-row">
                    <span className="info-row__label">CPU</span>
                    <span className="info-row__value">{sys.processor || '—'}</span>
                  </div>
                  <div className="info-row">
                    <span className="info-row__label">CPU Cores</span>
                    <span className="info-row__value">{sys.cpuCount || '—'}</span>
                  </div>
                  <div className="info-row">
                    <span className="info-row__label">Total Memory</span>
                    <span className="info-row__value">{mem.total > 0 ? formatBytes(mem.total) : '—'}</span>
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
                <button className="power-btn power-btn--warning" id="btn-reboot" onClick={handleReboot}>
                  ⟳ Reboot
                </button>
                <button className="power-btn power-btn--danger" id="btn-shutdown" onClick={handleShutdown}>
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
              {logsLoading ? (
                <div style={{ textAlign: 'center', padding: 'var(--space-4)', color: '#999' }}>
                  Loading logs...
                </div>
              ) : logs && logs.length > 0 ? (
                <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                  {logs.map((log, i) => (
                    <div key={i} className="log-entry">
                      <span className="log-entry__time">{log.timestamp ? new Date(log.timestamp).toLocaleTimeString() : '—'}</span>
                      <span className={`log-entry__level log-entry__level--${(log.level || 'info').toLowerCase()}`}>
                        {log.level || 'INFO'}
                      </span>
                      <span className="log-entry__msg">{log.message || '—'}</span>
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
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
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
                    <button onClick={closeConfirmDialog} disabled={confirmDialog.isProcessing}
                      style={{ flex: 1, padding: '10px', backgroundColor: '#333', border: '1px solid #555', color: '#fff', borderRadius: '4px', cursor: confirmDialog.isProcessing ? 'not-allowed' : 'pointer', opacity: confirmDialog.isProcessing ? 0.5 : 1 }}>
                      Cancel
                    </button>
                    <button onClick={handleConfirmStep} disabled={confirmDialog.isProcessing}
                      style={{ flex: 1, padding: '10px', backgroundColor: '#e91e63', border: 'none', color: '#fff', borderRadius: '4px', cursor: confirmDialog.isProcessing ? 'not-allowed' : 'pointer', opacity: confirmDialog.isProcessing ? 0.5 : 1, fontWeight: 'bold' }}>
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
                    <button onClick={closeConfirmDialog} disabled={confirmDialog.isProcessing}
                      style={{ flex: 1, padding: '10px', backgroundColor: '#333', border: '1px solid #555', color: '#fff', borderRadius: '4px', cursor: confirmDialog.isProcessing ? 'not-allowed' : 'pointer', opacity: confirmDialog.isProcessing ? 0.5 : 1 }}>
                      Cancel
                    </button>
                    <button onClick={handleConfirmStep} disabled={confirmDialog.isProcessing}
                      style={{ flex: 1, padding: '10px', backgroundColor: confirmDialog.isProcessing ? '#666' : '#e91e63', border: 'none', color: '#fff', borderRadius: '4px', cursor: confirmDialog.isProcessing ? 'not-allowed' : 'pointer', fontWeight: 'bold' }}>
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
