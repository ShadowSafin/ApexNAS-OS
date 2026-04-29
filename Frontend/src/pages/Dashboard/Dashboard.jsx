import { useEffect, useState, useCallback } from 'react';
import TopBar from '../../components/TopBar/TopBar';
import GlassPanel from '../../components/GlassPanel/GlassPanel';
import MetricCard from '../../components/MetricCard/MetricCard';
import ProgressRing from '../../components/ProgressRing/ProgressRing';
import StatusIndicator from '../../components/StatusIndicator/StatusIndicator';
import Toast, { useToast } from '../../components/Toast/Toast';
import { useSystemStore, useStorageStore, useNetworkStore, useAccessStore } from '../../stores';
import './Dashboard.css';

/**
 * Format bytes to human-readable
 */
function formatBytes(bytes, decimals = 1) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(decimals)} ${sizes[i]}`;
}

export default function Dashboard() {
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const { toasts, showToast, removeToast } = useToast();

  // System store — unified metrics
  const {
    metrics,
    systemInfo,
    cpuUsage,
    memoryUsage,
    temperature,
    services,
    systemLoading,
    fetchMetrics,
    fetchServices
  } = useSystemStore();

  // Storage store
  const { disks, diskUsage, diskUsageLoading, fetchDiskUsage, fetchDisks } = useStorageStore();

  // Network store
  const { networkInterfaces, networkLoading, fetchNetworkInterfaces } = useNetworkStore();

  // Access store
  const { accessInfo, accessLoading, fetchAccessInfo } = useAccessStore();

  /**
   * Initial load + auto-refresh
   */
  useEffect(() => {
    const loadInitial = async () => {
      try {
        setError(null);
        await Promise.all([
          fetchMetrics(),
          fetchServices(),
          fetchDiskUsage(),
          fetchDisks(),
          fetchNetworkInterfaces(),
          fetchAccessInfo()
        ]);
      } catch (err) {
        setError(err.message || 'Failed to load dashboard data');
      }
    };

    loadInitial();

    // Auto-refresh metrics every 3 seconds for real-time feel
    const metricsInterval = setInterval(() => {
      fetchMetrics().catch(() => {});
    }, 3000);

    // Refresh services/access less frequently (every 15s)
    const slowInterval = setInterval(() => {
      fetchServices().catch(() => {});
      fetchAccessInfo().catch(() => {});
    }, 15000);

    return () => {
      clearInterval(metricsInterval);
      clearInterval(slowInterval);
    };
  }, [fetchMetrics, fetchServices, fetchDiskUsage, fetchDisks, fetchNetworkInterfaces, fetchAccessInfo]);

  /**
   * Manual refresh
   */
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      setError(null);
      await Promise.all([
        fetchMetrics(),
        fetchServices(),
        fetchDiskUsage(),
        fetchDisks(),
        fetchNetworkInterfaces(),
        fetchAccessInfo()
      ]);
    } catch (err) {
      setError(err.message || 'Failed to refresh data');
    } finally {
      setRefreshing(false);
    }
  }, [fetchMetrics, fetchServices, fetchDiskUsage, fetchNetworkInterfaces, fetchAccessInfo]);

  // ── Derived data from unified metrics ──
  const mem = metrics?.memory || { total: 0, used: 0, available: 0, percent: 0 };
  const disk = metrics?.disk || { total: 0, used: 0, available: 0, percent: 0 };
  const net = metrics?.network || { rx: 0, tx: 0, rxSpeed: 0, txSpeed: 0 };
  const cpu = metrics?.cpu?.usage || 0;
  const temp = metrics?.temperature || { cpuTemp: 0, diskTemp: 0 };

  // Fallback to store-level diskUsage if metrics disk is 0 (no /mnt mounts)
  const diskUsageData = diskUsage?.[0] || { total: 0, used: 0, available: 0 };
  const effectiveDiskTotal = disk.total > 0 ? disk.total : diskUsageData.total;
  const effectiveDiskUsed = disk.total > 0 ? disk.used : diskUsageData.used;
  const effectiveDiskAvail = disk.total > 0 ? disk.available : (diskUsageData.available || 0);
  const storagePercent = effectiveDiskTotal > 0
    ? Math.round((effectiveDiskUsed / effectiveDiskTotal) * 100)
    : 0;

  // Check if we have disks with available usage data
  const hasDiskUsageData = disks && disks.length > 0 && diskUsage && diskUsage.length > 0;
  
  // Calculate combined disk sizes from all disks
  const combinedDiskTotal = disks?.reduce((sum, d) => sum + (d.size || 0), 0) || 0;
  
  // Get actual used/available from diskUsage data
  const combinedDiskUsed = diskUsage?.reduce((sum, u) => sum + (u.used || 0), 0) || 0;
  const combinedDiskAvailFromUsage = diskUsage?.reduce((sum, u) => sum + (u.available || 0), 0) || 0;
  const combinedDiskAvail = combinedDiskAvailFromUsage > 0 ? combinedDiskAvailFromUsage : (combinedDiskTotal > 0 ? combinedDiskTotal - combinedDiskUsed : 0);
  const combinedStoragePercent = combinedDiskTotal > 0 ? Math.round((combinedDiskUsed / combinedDiskTotal) * 100) : 0;

  // Use diskUsage data if available, otherwise fall back to effectiveDiskTotal
  const displayTotal = hasDiskUsageData ? combinedDiskTotal : effectiveDiskTotal;
  const displayUsed = hasDiskUsageData ? combinedDiskUsed : effectiveDiskUsed;
  const displayAvail = hasDiskUsageData ? combinedDiskAvail : effectiveDiskAvail;
  const displayPercent = hasDiskUsageData ? combinedStoragePercent : storagePercent;

  /**
   * Copy access URL to clipboard
   */
  const handleCopyUrl = (url, name) => {
    navigator.clipboard.writeText(url).then(() => {
      showToast(`Copied ${name} access URL`, 'success', 2500);
    }).catch(() => {
      showToast('Failed to copy', 'error', 2500);
    });
  };

  const getServiceIcon = (type) => {
    switch (type) {
      case 'SMB': return '⬇︎';
      case 'NFS': return '⎇';
      case 'FTP': return '↗';
      default: return '◆';
    }
  };

  const getDiskPercent = (usage) => {
    if (!usage || !usage.total || usage.total === 0) return 0;
    return Math.round((usage.used / usage.total) * 100);
  };

  return (
    <>
      <TopBar title="Dashboard" />
      <div className="app-layout__content">
        <div className="dashboard">
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

          {/* ─── System Health ─── */}
          <div className="section">
            <div className="section__header">
              <div>
                <h2 className="section__title">System Health</h2>
                <p className="section__subtitle">Overview of your ApexNAS system status</p>
              </div>
            </div>
            <GlassPanel variant="medium" padding="lg">
              {systemLoading && !systemInfo ? (
                <div style={{ textAlign: 'center', padding: 'var(--space-4)', color: '#999' }}>
                  Loading system information...
                </div>
              ) : systemInfo ? (
                <div className="dashboard__system-info">
                  <div>
                    <div className="info-row">
                      <span className="info-row__label">Hostname</span>
                      <span className="info-row__value">{systemInfo.hostname || '—'}</span>
                    </div>
                    <div className="info-row">
                      <span className="info-row__label">Operating System</span>
                      <span className="info-row__value">{systemInfo.os || '—'}</span>
                    </div>
                    <div className="info-row">
                      <span className="info-row__label">Kernel</span>
                      <span className="info-row__value">{systemInfo.kernel || '—'}</span>
                    </div>
                  </div>
                  <div>
                    <div className="info-row">
                      <span className="info-row__label">Uptime</span>
                      <span className="info-row__value">{systemInfo.uptime || '—'}</span>
                    </div>
                    <div className="info-row">
                      <span className="info-row__label">Load Average</span>
                      <span className="info-row__value">{systemInfo.loadAverage || '—'}</span>
                    </div>
                    <div className="info-row">
                      <span className="info-row__label">Processor</span>
                      <span className="info-row__value">{systemInfo.processor || '—'}</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: 'var(--space-4)', color: '#999' }}>
                  No system information available
                </div>
              )}
            </GlassPanel>
          </div>

          {/* ─── Resource Usage (Progress Rings) ─── */}
          <div className="section">
            <div className="section__header">
              <div>
                <h2 className="section__title">Resource Usage</h2>
                <p className="section__subtitle">CPU, memory, and storage utilization</p>
              </div>
            </div>
            <GlassPanel variant="medium" padding="lg">
              <div className="dashboard__usage">
                <div className="dashboard__usage-ring">
                  <ProgressRing
                    value={cpu}
                    size={120}
                    strokeWidth={8}
                    color="var(--accent-primary)"
                    label="CPU"
                  />
                  <span className="dashboard__usage-title">CPU Usage</span>
                </div>
                <div className="dashboard__usage-ring">
                  <ProgressRing
                    value={mem.percent}
                    size={120}
                    strokeWidth={8}
                    color="#8B5CF6"
                    label="RAM"
                  />
                  <span className="dashboard__usage-title">Memory Usage</span>
                </div>
                <div className="dashboard__usage-ring">
                  <ProgressRing
                    value={storagePercent}
                    size={120}
                    strokeWidth={8}
                    color="#F59E0B"
                    label="Disk"
                  />
                  <span className="dashboard__usage-title">Storage Usage</span>
                </div>
              </div>
            </GlassPanel>
          </div>

          {/* ─── Quick Metrics ─── */}
          <div className="section">
            <div className="section__header">
              <div>
                <h2 className="section__title">Overview</h2>
              </div>
            </div>
            <div className="dashboard__metrics">
              <MetricCard
                label="Total Storage"
                value={formatBytes(displayTotal, 1).split(' ')[0]}
                unit={formatBytes(displayTotal, 1).split(' ')[1]}
                subtitle={`${disks.length || 0} disks configured`}
                icon="⛁"
              />
              <MetricCard
                label="Used Space"
                value={formatBytes(displayUsed, 1).split(' ')[0]}
                unit={formatBytes(displayUsed, 1).split(' ')[1]}
                subtitle={`${displayPercent}% utilized`}
                icon="◉"
              />
              <MetricCard
                label="Network ↓"
                value={net.rxSpeed}
                unit="KB/s"
                subtitle="Download Speed"
                icon="◎"
              />
              <MetricCard
                label="Network ↑"
                value={net.txSpeed}
                unit="KB/s"
                subtitle="Upload Speed"
                icon="↗"
              />
            </div>
          </div>

          {/* ─── Temperature ─── */}
          <div className="section">
            <div className="section__header">
              <div>
                <h2 className="section__title">Temperature</h2>
                <p className="section__subtitle">System thermal status</p>
              </div>
            </div>
            <div className="dashboard__network-grid">
              <GlassPanel variant="subtle" padding="md" hoverable>
                <div className="info-row">
                  <span className="info-row__label">CPU Temperature</span>
                  <span className="info-row__value" style={{
                    color: temp.cpuTemp > 80 ? '#EF4444' : temp.cpuTemp > 60 ? '#F59E0B' : '#10B981'
                  }}>
                    {temp.cpuTemp}°C
                  </span>
                </div>
                <div className="info-row">
                  <span className="info-row__label">Status</span>
                  <StatusIndicator
                    status={temp.cpuTemp > 80 ? 'error' : temp.cpuTemp > 60 ? 'warning' : 'online'}
                    label={temp.cpuTemp > 80 ? 'Critical' : temp.cpuTemp > 60 ? 'Warm' : 'Normal'}
                  />
                </div>
              </GlassPanel>
              <GlassPanel variant="subtle" padding="md" hoverable>
                <div className="info-row">
                  <span className="info-row__label">Disk Temperature</span>
                  <span className="info-row__value" style={{
                    color: temp.diskTemp > 60 ? '#EF4444' : temp.diskTemp > 45 ? '#F59E0B' : '#10B981'
                  }}>
                    {temp.diskTemp}°C
                  </span>
                </div>
                <div className="info-row">
                  <span className="info-row__label">Status</span>
                  <StatusIndicator
                    status={temp.diskTemp > 60 ? 'error' : temp.diskTemp > 45 ? 'warning' : 'online'}
                    label={temp.diskTemp > 60 ? 'Critical' : temp.diskTemp > 45 ? 'Warm' : 'Normal'}
                  />
                </div>
              </GlassPanel>
            </div>
          </div>

          {/* ─── Storage Capacity ─── */}
          <div className="section">
            <div className="section__header">
              <div>
                <h2 className="section__title">Storage Capacity</h2>
                <p className="section__subtitle">Disk utilization</p>
              </div>
            </div>
            <GlassPanel variant="medium" padding="lg">
              {diskUsageLoading && effectiveDiskTotal === 0 ? (
                <div style={{ textAlign: 'center', padding: 'var(--space-4)', color: '#999' }}>
                  Loading storage data...
                </div>
              ) : effectiveDiskTotal > 0 || (disks && disks.length > 0) ? (
                <>
                  {/* Show all physical disks including USB, PCIe, etc. */}
                  {disks && disks.length > 0 ? (
                    <div style={{ marginBottom: 'var(--space-4)' }}>
                      {[...disks].sort((a, b) => (b.isSystem ? 1 : 0) - (a.isSystem ? 1 : 0)).map((disk) => {
                        const diskPartitions = disk.children || [];
                        const partitionUsage = diskPartitions.map(p => {
                          const mountUsage = diskUsage?.find(u => u.mountpoint === p.mountpoint);
                          return mountUsage || null;
                        }).filter(Boolean);
                        
                        const totalSize = disk.size || 0;
                        const totalUsed = partitionUsage.reduce((sum, u) => sum + (u.used || 0), 0);
                        const totalAvailFromUsage = partitionUsage.reduce((sum, u) => sum + (u.available || 0), 0);
                        const totalAvail = totalAvailFromUsage > 0 ? totalAvailFromUsage : (totalSize > 0 ? totalSize - totalUsed : 0);
                        const diskPercent = totalSize > 0 ? Math.round((totalUsed / totalSize) * 100) : 0;
                        
                        return (
                          <div key={disk.name} style={{ marginBottom: 'var(--space-3)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--space-1)' }}>
                              <span className="info-row__label" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                                <span>⛁</span>
                                /dev/{disk.name}
                                <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)', marginLeft: 'var(--space-2)' }}>
                                  ({disk.transport?.toUpperCase()})
                                </span>
                              </span>
                              <span className="info-row__value">
                                {formatBytes(totalSize)}
                              </span>
                            </div>
                            <div className="usage-bar" style={{ height: '8px' }}>
                              <div
                                className="usage-bar__fill"
                                style={{
                                  width: `${diskPercent}%`
                                }}
                              />
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)', marginTop: '2px' }}>
                              <span>{diskPercent}% used</span>
                              <span>{formatBytes(totalAvail)} available</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : diskUsage && diskUsage.length > 0 ? (
                    <div style={{ marginBottom: 'var(--space-4)' }}>
                      {diskUsage.map((usage, idx) => (
                        <div key={usage.mountpoint || idx} style={{ marginBottom: 'var(--space-3)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--space-1)' }}>
                            <span className="info-row__label" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                              <span>⛁</span>
                              {usage.mountpoint || `Disk ${idx + 1}`}
                            </span>
                            <span className="info-row__value">
                              {formatBytes(usage.total)}
                            </span>
                          </div>
                          <div className="usage-bar" style={{ height: '8px' }}>
                            <div
                              className="usage-bar__fill"
                              style={{
                                width: `${getDiskPercent(usage)}%`
                              }}
                            />
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)', marginTop: '2px' }}>
                            <span>{getDiskPercent(usage)}% used</span>
                            <span>{formatBytes(usage.available)} available</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ marginBottom: 'var(--space-4)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--space-2)' }}>
                        <span className="info-row__label">
                          {formatBytes(effectiveDiskUsed)} used of {formatBytes(effectiveDiskTotal)}
                        </span>
                        <span className="info-row__value">{storagePercent}%</span>
                      </div>
                      <div className="usage-bar">
                        <div className="usage-bar__fill" style={{ width: `${storagePercent}%` }} />
                      </div>
                    </div>
                  )}
                  <div className="dashboard__system-info" style={{ marginTop: 'var(--space-4)' }}>
                    <div className="info-row">
                      <span className="info-row__label">Total Pool</span>
                      <span className="info-row__value">
                        {formatBytes(displayTotal)}
                      </span>
                    </div>
                    <div className="info-row">
                      <span className="info-row__label">Used</span>
                      <span className="info-row__value">
                        {formatBytes(displayUsed)}
                      </span>
                    </div>
                    <div className="info-row">
                      <span className="info-row__label">Available</span>
                      <span className="info-row__value">
                        {formatBytes(displayAvail)}
                      </span>
                    </div>
                    <div className="info-row">
                      <span className="info-row__label">Memory</span>
                      <span className="info-row__value">
                        {formatBytes(mem.used)} / {formatBytes(mem.total)}
                      </span>
                    </div>
                  </div>
                </>
              ) : (
                <div style={{ textAlign: 'center', padding: 'var(--space-4)', color: '#999' }}>
                  No storage data available
                </div>
              )}
            </GlassPanel>
          </div>

          {/* ─── Network ─── */}
          <div className="section">
            <div className="section__header">
              <div>
                <h2 className="section__title">Network</h2>
                <p className="section__subtitle">Active network interfaces</p>
              </div>
            </div>
            <div className="dashboard__network-grid">
              {networkLoading ? (
                <GlassPanel variant="subtle" padding="md">
                  <div style={{ textAlign: 'center', color: '#999' }}>
                    Loading network interfaces...
                  </div>
                </GlassPanel>
              ) : networkInterfaces && networkInterfaces.length > 0 ? (
                networkInterfaces.map((iface) => (
                  <GlassPanel key={iface.name} variant="subtle" padding="md" hoverable>
                    <div className="info-row">
                      <span className="info-row__label">Interface</span>
                      <span className="info-row__value">{iface.name}</span>
                    </div>
                    <div className="info-row">
                      <span className="info-row__label">IP Address</span>
                      <span className="info-row__value">{iface.ip || '—'}</span>
                    </div>
                    <div className="info-row">
                      <span className="info-row__label">MAC Address</span>
                      <span className="info-row__value" style={{ fontSize: 'var(--font-size-xs)' }}>
                        {iface.mac || '—'}
                      </span>
                    </div>
                    <div className="info-row">
                      <span className="info-row__label">Status</span>
                      <StatusIndicator
                        status={iface.status === 'up' ? 'online' : 'offline'}
                        label={iface.status === 'up' ? 'Connected' : 'Disconnected'}
                      />
                    </div>
                  </GlassPanel>
                ))
              ) : (
                <GlassPanel variant="subtle" padding="md">
                  <div style={{ textAlign: 'center', color: '#999' }}>
                    No network interfaces available
                  </div>
                </GlassPanel>
              )}
            </div>
          </div>

          {/* ─── Services ─── */}
          <div className="section">
            <div className="section__header">
              <div>
                <h2 className="section__title">Services</h2>
                <p className="section__subtitle">Running system services</p>
              </div>
            </div>
            <GlassPanel variant="medium" padding="md">
              {systemLoading ? (
                <div style={{ textAlign: 'center', padding: 'var(--space-4)', color: '#999' }}>
                  Loading services...
                </div>
              ) : services && services.length > 0 ? (
                <div className="dashboard__services">
                  {services.map((svc) => (
                    <div key={svc.name} className="service-row">
                      <div className="service-row__left">
                        <StatusIndicator status={svc.status || 'unknown'} />
                        <span className="service-row__name">{svc.name}</span>
                        <span className="service-row__port">{svc.port ? `:${svc.port}` : ''}</span>
                      </div>
                      <span className="info-row__value" style={{ fontSize: 'var(--font-size-sm)' }}>
                        {svc.status === 'running' ? 'Running' : svc.status === 'stopped' ? 'Stopped' : 'Unknown'}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: 'var(--space-4)', color: '#999' }}>
                  No services available
                </div>
              )}
            </GlassPanel>
          </div>

          {/* ─── Access Points ─── */}
          <div className="section">
            <div className="section__header">
              <div>
                <h2 className="section__title">Access Points</h2>
                <p className="section__subtitle">Connect to your shared resources</p>
              </div>
            </div>
            {accessLoading ? (
              <GlassPanel variant="medium" padding="lg">
                <div style={{ textAlign: 'center', padding: 'var(--space-6)', color: '#999' }}>
                  <div style={{ fontSize: '1.5rem', marginBottom: 'var(--space-3)' }}>⏳</div>
                  Loading access points...
                </div>
              </GlassPanel>
            ) : accessInfo?.services && accessInfo.services.length > 0 ? (
              <div className="access-cards">
                {accessInfo.services.map((access, idx) => (
                  <div key={`${access.type}-${idx}`} className="access-card">
                    <div className="access-card__header">
                      <div className="access-card__info">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                          <span className="access-card__type">{access.type}</span>
                          <div className="access-card__status">
                            <div className="access-card__status-dot"></div>
                            <span>Active</span>
                          </div>
                        </div>
                        <div className="access-card__name">{access.name || 'Shared Resource'}</div>
                        {access.path && (
                          <div className="access-card__share">{access.path}</div>
                        )}
                      </div>
                      <div className="access-card__icon">{getServiceIcon(access.type)}</div>
                    </div>

                    <div className="access-card__url-section">
                      <label className="access-card__url-label">Access URL</label>
                      <div className="access-card__url">{access.access}</div>
                    </div>

                    <div className="access-card__actions">
                      <button
                        className="access-card__button access-card__button--copy"
                        onClick={() => handleCopyUrl(access.access, access.name || access.type)}
                        title="Copy access URL"
                      >
                        <span>✓</span>
                        <span>Copy</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <GlassPanel variant="medium" padding="lg">
                <div className="access-empty">
                  <div className="access-empty__icon">∅</div>
                  <div className="access-empty__text">No access points configured</div>
                  <div className="access-empty__hint">
                    Create shared folders and attach them to services to see access URLs here
                  </div>
                </div>
              </GlassPanel>
            )}
          </div>

        </div>

        {/* Toast notifications */}
        <div style={{ position: 'fixed', bottom: 0, right: 0, pointerEvents: 'none' }}>
          {toasts.map((toast) => (
            <div
              key={toast.id}
              style={{ pointerEvents: 'auto', marginBottom: 'var(--space-2)' }}
              onAnimationEnd={() => removeToast(toast.id)}
            >
              <Toast
                message={toast.message}
                type={toast.type}
                duration={toast.duration}
              />
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
