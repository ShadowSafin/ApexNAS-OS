import { useEffect, useState } from 'react';
import TopBar from '../../components/TopBar/TopBar';
import GlassPanel from '../../components/GlassPanel/GlassPanel';
import Toggle from '../../components/Toggle/Toggle';
import { useSystemStore } from '../../stores';
import systemService from '../../services/system.service';
import networkService from '../../services/network.service';
import authService from '../../services/auth.service';
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
  const [networkInterfaces, setNetworkInterfaces] = useState([]);
  const [networkLoading, setNetworkLoading] = useState(false);
  const [sysServices, setSysServices] = useState([]);
  const [servicesLoading, setServicesLoading] = useState(false);
  const [accessPoints, setAccessPoints] = useState({ services: [] });
  const [accessLoading, setAccessLoading] = useState(false);
  const [togglingService, setTogglingService] = useState(null);

  const [acct, setAcct] = useState({ cur: '', newU: '', newP: '', conf: '' });
  const [acctMsg, setAcctMsg] = useState({ t: '', txt: '' });
  const [acctLoad, setAcctLoad] = useState(false);

  // ── Load data + auto-refresh every 3s (same as Dashboard) ──
  useEffect(() => {
    const loadInitial = async () => {
      try {
        setError(null);
        await fetchMetrics();
        await loadLogs('system');
        await loadNetwork();
        await loadServices();
        await loadAccessPoints();
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

  const loadNetwork = async () => {
    setNetworkLoading(true);
    try {
      const data = await networkService.getNetworkInterfaces();
      console.log('NETWORK DATA:', data);
      setNetworkInterfaces(data || []);
    } catch (err) {
      console.error('Failed to load network interfaces:', err);
    } finally {
      setNetworkLoading(false);
    }
  };

  const loadServices = async () => {
    setServicesLoading(true);
    try {
      const data = await systemService.getServices();
      console.log('SERVICES DATA:', data);
      setSysServices(data || []);
    } catch (err) {
      console.error('Failed to load services:', err);
    } finally {
      setServicesLoading(false);
    }
  };

  const loadAccessPoints = async () => {
    setAccessLoading(true);
    try {
      const data = await systemService.getAccessPoints();
      console.log('ACCESS DATA:', data);
      setAccessPoints(data || { services: [] });
    } catch (err) {
      console.error('Failed to load access points:', err);
    } finally {
      setAccessLoading(false);
    }
  };

  const handleServiceToggle = async (serviceName, currentStatus) => {
    const action = currentStatus === 'running' ? 'stop' : 'start';
    setTogglingService(serviceName);
    try {
      if (action === 'start') {
        await systemService.startService(serviceName);
      } else {
        await systemService.stopService(serviceName);
      }
      await loadServices();
      await loadAccessPoints();
    } catch (err) {
      alert(`Failed to ${action} ${serviceName}: ${err.message}`);
    } finally {
      setTogglingService(null);
    }
  };

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

  const acctUser = async () => {
    if (!acct.newU || !acct.cur) { setAcctMsg({t:'error',txt:'Fill all'}); return; }
    setAcctLoad(true);
    const r = await authService.changeUsername(acct.newU, acct.cur);
    setAcctLoad(false);
    setAcctMsg(r.success ? {t:'success',txt:r.message} : {t:'error',txt:r.error});
  };
  const acctPass = async () => {
    if (!acct.cur || !acct.newP || !acct.conf) { setAcctMsg({t:'error',txt:'Fill all'}); return; }
    if (acct.newP !== acct.conf) { setAcctMsg({t:'error',txt:'Mismatch'}); return; }
    setAcctLoad(true);
    const r = await authService.changePassword(acct.cur, acct.newP);
    setAcctLoad(false);
    setAcctMsg(r.success ? {t:'success',txt:r.message} : {t:'error',txt:r.error});
  };

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
      if (v < 50) return 'var(--color-cyan-deep)';
      if (v < 75) return 'var(--color-warning)';
      return 'var(--color-error)';
    };
    // Show '<1%' when value rounds to 0 but there IS actual usage
    const displayValue = (value === 0 && hasUsage) ? '<1' : `${value}`;
    const barWidth = (value === 0 && hasUsage) ? 1 : value;
    return (
      <div style={{ marginBottom: 'var(--sp-sm)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
          <div>
            <span style={{ fontSize: '12px', color: 'var(--color-body)' }}>{label}</span>
            {subtitle && (
              <span style={{ fontSize: '11px', color: 'var(--color-mute)', marginLeft: '8px' }}>{subtitle}</span>
            )}
          </div>
          <span style={{ fontSize: '12px', fontWeight: 'bold', color: getColor(value) }}>{displayValue}%</span>
        </div>
        <div style={{ height: '8px', backgroundColor: 'var(--color-canvas-soft-2)', borderRadius: '4px', overflow: 'hidden' }}>
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
      <div className="page-content">
        <div className="system-page">

          {error && (
            <div className="error-banner">
              <span><strong>Error:</strong> {error}</span>
              <button className="error-close" onClick={() => setError(null)}>×</button>
            </div>
          )}

          {/* System Metrics \u2014 UNIFIED with Dashboard via useSystemStore.fetchMetrics() */}
          <div className="section animate-fade-in-up stagger-1">
            <div className="section__header">
              <h2 className="section__title">System Metrics</h2>
            </div>
            <GlassPanel variant="medium" padding="lg">
              {systemLoading && !metrics ? (
                <div style={{ textAlign: 'center', padding: 'var(--sp-md)', color: 'var(--color-mute)' }}>
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
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--sp-md)' }}>
              <GlassPanel variant="subtle" padding="md">
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '2rem', fontWeight: '600', color: temp.cpuTemp === 0 ? 'var(--color-mute)' : temp.cpuTemp > 80 ? 'var(--color-error)' : temp.cpuTemp > 60 ? 'var(--color-warning)' : 'var(--color-cyan-deep)' }}>
                    {temp.cpuTemp > 0 ? <>{temp.cpuTemp}{"°"}C</> : 'N/A'}
                  </div>
                  <div style={{ fontSize: '0.875rem', color: 'var(--color-body)', marginTop: 'var(--sp-xs)' }}>
                    CPU Temperature
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--color-mute)', marginTop: 'var(--sp-xxs)' }}>
                    {temp.cpuTemp === 0 ? 'Sensor unavailable' : temp.cpuTemp > 80 ? 'Critical' : temp.cpuTemp > 60 ? 'Warm' : 'Normal'}
                  </div>
                </div>
              </GlassPanel>
              <GlassPanel variant="subtle" padding="md">
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '2rem', fontWeight: '600', color: temp.diskTemp === 0 ? 'var(--color-mute)' : temp.diskTemp > 60 ? 'var(--color-error)' : temp.diskTemp > 45 ? 'var(--color-warning)' : 'var(--color-cyan-deep)' }}>
                    {temp.diskTemp > 0 ? <>{temp.diskTemp}{"°"}C</> : 'N/A'}
                  </div>
                  <div style={{ fontSize: '0.875rem', color: 'var(--color-body)', marginTop: 'var(--sp-xs)' }}>
                    Disk Temperature
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--color-mute)', marginTop: 'var(--sp-xxs)' }}>
                    {temp.diskTemp === 0 ? 'Sensor unavailable' : temp.diskTemp > 60 ? 'Critical' : temp.diskTemp > 45 ? 'Warm' : 'Normal'}
                  </div>
                </div>
              </GlassPanel>
            </div>
          </div>

          {/* Network Interfaces */}
          <div className="section animate-fade-in-up stagger-2">
            <div className="section__header">
              <h2 className="section__title">Network Interfaces</h2>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 'var(--sp-md)' }}>
              {networkLoading ? (
                <GlassPanel variant="subtle" padding="md">
                  <div style={{ textAlign: 'center', color: 'var(--color-mute)' }}>Loading...</div>
                </GlassPanel>
              ) : networkInterfaces.length > 0 ? (
                networkInterfaces.map((iface) => (
                  <GlassPanel key={iface.name} variant="subtle" padding="md">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--sp-xs)' }}>
                      <span style={{ fontWeight: '600', color: 'var(--color-ink)' }}>{iface.name}</span>
                      <span style={{
                        fontSize: '12px',
                        padding: '2px 8px',
                        borderRadius: 'var(--r-sm)',
                        backgroundColor: iface.status === 'up' ? 'var(--color-cyan-soft)' : 'var(--color-error-soft)',
                        color: iface.status === 'up' ? 'var(--color-cyan-deep)' : 'var(--color-error)'
                      }}>
                        {iface.status?.toUpperCase()}
                      </span>
                    </div>
                    <div className="info-row">
                      <span className="info-row__label">IP Address</span>
                      <span className="info-row__value">{iface.ip}</span>
                    </div>
                    <div className="info-row">
                      <span className="info-row__label">MAC Address</span>
                      <span className="info-row__value" style={{ fontSize: '12px' }}>{iface.mac}</span>
                    </div>
                    <div className="info-row">
                      <span className="info-row__label">Speed</span>
                      <span className="info-row__value">{iface.speed || 'N/A'}</span>
                    </div>
                  </GlassPanel>
                ))
              ) : (
                <GlassPanel variant="subtle" padding="md">
                  <div style={{ textAlign: 'center', color: 'var(--color-mute)' }}>No interfaces found</div>
                </GlassPanel>
)}
            </div>
          </div>

          {/* General Info */}
          <div className="section animate-fade-in-up stagger-5">
            <div className="section__header">
              <h2 className="section__title">General Information</h2>
            </div>
            <GlassPanel variant="medium" padding="lg">
              {systemLoading && !sys.hostname ? (
                <div style={{ textAlign: 'center', padding: 'var(--sp-md)', color: 'var(--color-mute)' }}>
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
                <div style={{ textAlign: 'center', padding: 'var(--sp-md)', color: 'var(--color-mute)' }}>
                  No system information available
                </div>
              )}
            </GlassPanel>
          </div>

          {/* Account Settings */}
          <div className="section animate-fade-in-up">
            <div className="section__header">
              <h2 className="section__title">Account Settings</h2>
            </div>
            <GlassPanel variant="medium" padding="lg">
              <p className="section__subtitle" style={{ marginBottom: 'var(--sp-md)' }}>
                Change your web interface login credentials.
              </p>
              
              {acctMsg.txt && (
                <div style={{ 
                  padding: 'var(--sp-sm)', 
                  marginBottom: 'var(--sp-md)', 
                  borderRadius: 'var(--r-sm)',
                  backgroundColor: acctMsg.t === 'error' ? 'var(--color-error-soft)' : 'var(--color-cyan-soft)',
                  color: acctMsg.t === 'error' ? 'var(--color-error)' : 'var(--color-cyan-deep)'
                }}>
                  {acctMsg.txt}
                </div>
              )}

              <div style={{ marginBottom: 'var(--sp-md)' }}>
                <label className="form-label" style={{ display: 'block', marginBottom: 'var(--sp-xs)' }}>
                  Change Username
                </label>
                <div className="form-group" style={{ display: 'flex', gap: 'var(--sp-sm)', flexWrap: 'wrap' }}>
                  <input 
                    type="text" 
                    className="form-input"
                    placeholder="New Username" 
                    value={acct.newU} 
                    onChange={e => setAcct(p => ({...p, newU: e.target.value}))} 
                  />
                  <input 
                    type="password" 
                    className="form-input"
                    placeholder="Current Password" 
                    value={acct.cur} 
                    onChange={e => setAcct(p => ({...p, cur: e.target.value}))} 
                  />
                  <button onClick={acctUser} disabled={acctLoad} className="btn btn--primary">
                    Update Username
                  </button>
                </div>
              </div>

              <div>
                <label className="form-label" style={{ display: 'block', marginBottom: 'var(--sp-xs)' }}>
                  Change Password
                </label>
                <div className="form-group" style={{ display: 'flex', gap: 'var(--sp-sm)', flexWrap: 'wrap' }}>
                  <input 
                    type="password" 
                    className="form-input"
                    placeholder="New Password" 
                    value={acct.newP} 
                    onChange={e => setAcct(p => ({...p, newP: e.target.value}))} 
                  />
                  <input 
                    type="password" 
                    className="form-input"
                    placeholder="Confirm Password" 
                    value={acct.conf} 
                    onChange={e => setAcct(p => ({...p, conf: e.target.value}))} 
                  />
                  <button onClick={acctPass} disabled={acctLoad} className="btn btn--primary">
                    Change Password
                  </button>
                </div>
              </div>
            </GlassPanel>
          </div>

          {/* Power Management */}
          <div className="section animate-fade-in-up stagger-5">
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
              <p style={{ color: 'var(--color-body)', fontSize: '14px', marginBottom: 'var(--sp-sm)' }}>
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
                className="form-input form-select"
                value={selectedService}
                onChange={(e) => handleServiceChange(e.target.value)}
                style={{ width: 'auto', minWidth: '120px' }}
              >
                <option value="system">System</option>
                <option value="smb">SMB</option>
                <option value="nfs">NFS</option>
                <option value="ftp">FTP</option>
              </select>
            </div>
            <GlassPanel variant="medium" padding="md">
              {logsLoading ? (
                <div style={{ textAlign: 'center', padding: 'var(--sp-md)', color: 'var(--color-mute)' }}>
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
                <div style={{ textAlign: 'center', padding: 'var(--sp-md)', color: 'var(--color-mute)' }}>
                  No logs available
                </div>
              )}
            </GlassPanel>
          </div>

        </div>

        {/* Confirmation Dialog */}
        {confirmDialog.visible && (
          <div className="modal-overlay" onClick={closeConfirmDialog}>
            <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '420px' }}>
              <div className="modal__header">
                <h3 className="modal__title" style={{ color: 'var(--color-error)' }}>
                  ⚠️ {confirmDialog.type === 'reboot' ? 'Reboot System?' : 'Shutdown System?'}
                </h3>
                <button className="modal__close" onClick={closeConfirmDialog}>✕</button>
              </div>
              <div className="modal__body">
                {confirmDialog.step === 1 ? (
                  <p style={{ fontSize: 'var(--fs-body-sm)', color: 'var(--color-body)', lineHeight: 'var(--lh-body-sm)' }}>
                    {confirmDialog.type === 'reboot'
                      ? 'This will immediately restart the system. All active connections will be terminated. Are you sure?'
                      : 'This will immediately shut down the system. This action cannot be undone without physical access. Are you sure?'
                    }
                  </p>
                ) : (
                  <>
                    <p style={{ color: 'var(--color-error)', fontSize: 'var(--fs-body-sm)', fontWeight: 'var(--fw-display)', marginBottom: 'var(--sp-sm)' }}>
                      {confirmDialog.type === 'reboot'
                        ? 'This is your FINAL confirmation to reboot the system.'
                        : 'This is your FINAL confirmation to shut down the system.'
                      }
                    </p>
                    <p style={{ color: 'var(--color-body)', fontSize: 'var(--fs-caption)' }}>
                      Click "Confirm" again to proceed. This action will be executed immediately.
                    </p>
                  </>
                )}
              </div>
              <div className="modal__footer">
                <button className="btn btn--secondary" onClick={closeConfirmDialog} disabled={confirmDialog.isProcessing}>
                  Cancel
                </button>
                <button className="btn btn--danger" onClick={handleConfirmStep} disabled={confirmDialog.isProcessing}>
                  {confirmDialog.step === 1 ? 'Yes, Continue' : (confirmDialog.isProcessing ? 'Processing...' : 'Confirm')}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
