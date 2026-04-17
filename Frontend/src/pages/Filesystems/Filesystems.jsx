import { useEffect, useState, useCallback } from 'react';
import TopBar from '../../components/TopBar/TopBar';
import GlassPanel from '../../components/GlassPanel/GlassPanel';
import StatusIndicator from '../../components/StatusIndicator/StatusIndicator';
import filesystemService from '../../services/filesystem.service';
import diskService from '../../services/disk.service';
import './Filesystems.css';

function formatBytes(bytes, decimals = 1) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(decimals)} ${sizes[i]}`;
}

export default function Filesystems() {
  const [filesystems, setFilesystems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [actionResult, setActionResult] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Create filesystem modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [availableDevices, setAvailableDevices] = useState([]);
  const [createDevice, setCreateDevice] = useState('');
  const [createFstype, setCreateFstype] = useState('ext4');
  const [createConfirm, setCreateConfirm] = useState('');

  // Mount modal
  const [showMountModal, setShowMountModal] = useState(false);
  const [mountDevice, setMountDevice] = useState('');
  const [mountLabel, setMountLabel] = useState('');
  const [unmountableDevices, setUnmountableDevices] = useState([]);

  const loadFilesystems = useCallback(async () => {
    setLoading(true);
    try {
      setError(null);
      const data = await filesystemService.listFilesystems();
      setFilesystems(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message || 'Failed to load filesystems');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFilesystems();
  }, [loadFilesystems]);

  // ── Create Filesystem ──
  const openCreateModal = async () => {
    setActionResult(null);
    try {
      const disks = await diskService.listDisks();
      const devices = [];
      for (const disk of disks) {
        if (disk.isSystem) continue;
        for (const part of (disk.children || [])) {
          // Allow formatting any unmounted partition (even if it already has an fstype)
          if (!part.mountpoint) {
            devices.push({ device: part.device || `/dev/${part.name}`, name: part.name, size: part.sizeFormatted || formatBytes(part.size) });
          }
        }
      }
      setAvailableDevices(devices);
      setCreateDevice(devices[0]?.device || '');
      setCreateFstype('ext4');
      setCreateConfirm('');
      setShowCreateModal(true);
    } catch (err) {
      setActionResult({ type: 'error', message: 'Failed to load devices' });
    }
  };

  const handleCreateFilesystem = async () => {
    if (createConfirm !== 'YES_FORMAT_DEVICE') return;
    setShowCreateModal(false);
    setActionLoading(true);
    setActionResult(null);
    try {
      await filesystemService.createFilesystem({
        device: createDevice,
        type: createFstype,
        confirm: 'YES_FORMAT_DEVICE'
      });
      setActionResult({ type: 'success', message: `${createFstype} filesystem created on ${createDevice}` });
      await loadFilesystems();
    } catch (err) {
      setActionResult({ type: 'error', message: err.message || 'Creation failed' });
    } finally {
      setActionLoading(false);
    }
  };

  // ── Mount ──
  const openMountModal = async () => {
    setActionResult(null);
    try {
      const disks = await diskService.listDisks();
      const devices = [];
      for (const disk of disks) {
        if (disk.isSystem) continue;
        for (const part of (disk.children || [])) {
          if (!part.mountpoint && part.fstype) {
            devices.push({ device: part.device || `/dev/${part.name}`, name: part.name, fstype: part.fstype, size: part.sizeFormatted || formatBytes(part.size) });
          }
        }
      }
      setUnmountableDevices(devices);
      setMountDevice(devices[0]?.device || '');
      setMountLabel('');
      setShowMountModal(true);
    } catch (err) {
      setActionResult({ type: 'error', message: 'Failed to load devices' });
    }
  };

  const handleMount = async () => {
    if (!mountDevice) return;
    setShowMountModal(false);
    setActionLoading(true);
    setActionResult(null);
    try {
      const result = await filesystemService.mountFilesystem(mountDevice, mountLabel || undefined);
      setActionResult({ type: 'success', message: `Mounted ${mountDevice} at ${result.mountpoint || '/mnt/storage/...'}` });
      await loadFilesystems();
    } catch (err) {
      setActionResult({ type: 'error', message: err.message || 'Mount failed' });
    } finally {
      setActionLoading(false);
    }
  };

  // ── Unmount ──
  const handleUnmount = async (mountpoint) => {
    if (!window.confirm(`Unmount ${mountpoint}?\nThe filesystem will become inaccessible and the fstab entry will be removed.`)) return;
    setActionLoading(true);
    setActionResult(null);
    try {
      await filesystemService.unmountFilesystem(mountpoint);
      setActionResult({ type: 'success', message: `Unmounted ${mountpoint}` });
      await loadFilesystems();
    } catch (err) {
      setActionResult({ type: 'error', message: err.message || 'Unmount failed' });
    } finally {
      setActionLoading(false);
    }
  };

  const getUsageColor = (percent) => {
    const pct = parseFloat(percent) || 0;
    if (pct >= 90) return '#EF4444';
    if (pct >= 70) return '#F59E0B';
    return '#10B981';
  };

  return (
    <>
      <TopBar title="Filesystems" breadcrumbs={['Storage', 'Filesystems']} />
      <div className="app-layout__content">
        <div className="filesystems-page">
          <div className="section">
            <div className="section__header">
              <div>
                <h2 className="section__title">Mounted Filesystems</h2>
                <p className="section__subtitle">
                  {loading ? 'Loading...' : `${filesystems.length} filesystems`}
                </p>
              </div>
              <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                <button className="btn btn--secondary btn--sm" onClick={loadFilesystems} disabled={loading}>
                  ↻ Refresh
                </button>
                <button className="btn btn--secondary btn--sm" onClick={openMountModal} disabled={actionLoading}>
                  📁 Mount
                </button>
                <button className="btn btn--primary btn--sm" onClick={openCreateModal} disabled={actionLoading}>
                  + Create FS
                </button>
              </div>
            </div>

            {actionResult && (
              <div className={`alert alert--${actionResult.type}`} style={{ marginBottom: 'var(--space-4)' }}>
                {actionResult.type === 'success' ? '✓' : '✕'} {actionResult.message}
              </div>
            )}

            {error && (
              <div className="alert alert--error" style={{ marginBottom: 'var(--space-4)' }}>
                <strong>Error:</strong> {error}
              </div>
            )}

            {loading && filesystems.length === 0 && (
              <GlassPanel variant="medium" padding="lg">
                <div style={{ textAlign: 'center', padding: 'var(--space-4)', color: '#999' }}>
                  Loading filesystems...
                </div>
              </GlassPanel>
            )}

            {!loading && filesystems.length === 0 && (
              <GlassPanel variant="medium" padding="lg">
                <div style={{ textAlign: 'center', padding: 'var(--space-6)', color: '#999' }}>
                  <div style={{ fontSize: '2rem', marginBottom: 'var(--space-3)' }}>💾</div>
                  <div style={{ fontWeight: 500, marginBottom: 'var(--space-2)', color: 'var(--text-primary)' }}>No Filesystems</div>
                  <div style={{ fontSize: 'var(--font-size-sm)' }}>
                    Create a filesystem on a partition or RAID array, then mount it.
                  </div>
                </div>
              </GlassPanel>
            )}

            {filesystems.length > 0 && filesystems.map((fs, i) => {
              const pctRaw = typeof fs.usePercent === 'string' ? parseFloat(fs.usePercent) : (fs.size > 0 ? (fs.used / fs.size * 100) : 0);
              const pct = Math.min(pctRaw, 100).toFixed(1);
              // Allow unmounting anything except core OS paths
              const canUnmount = !['/', '/boot/efi'].includes(fs.mountpoint);

              return (
                <GlassPanel key={fs.mountpoint || fs.device} variant="medium" padding="md"
                  className={`animate-fade-in-up stagger-${i + 1}`}
                  style={{ marginBottom: 'var(--space-3)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-3)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                      <span style={{ fontSize: '1.3rem' }}>⬢</span>
                      <div>
                        <div style={{ fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                          {fs.mountpoint}
                          <span style={{
                            fontSize: 'var(--font-size-xs)', padding: '1px 6px',
                            borderRadius: 'var(--radius-sm)', backgroundColor: 'rgba(139,92,246,0.15)',
                            color: '#A78BFA'
                          }}>
                            {fs.fstype}
                          </span>
                        </div>
                        <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)' }}>
                          {fs.device}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                      <StatusIndicator status="online" label="Mounted" />
                      {canUnmount && (
                        <button className="btn btn--secondary btn--xs" onClick={() => handleUnmount(fs.mountpoint)}
                          disabled={actionLoading}>
                          Unmount
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Usage bar */}
                  <div style={{ marginBottom: 'var(--space-2)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                      <span>{formatBytes(fs.used)} used of {formatBytes(fs.size)}</span>
                      <span style={{ color: getUsageColor(pct), fontWeight: 500 }}>{pct}%</span>
                    </div>
                    <div className="usage-bar">
                      <div className="usage-bar__fill" style={{
                        width: `${pct}%`,
                        backgroundColor: getUsageColor(pct),
                        transition: 'width 0.5s ease'
                      }} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)', marginTop: '4px' }}>
                      {formatBytes(fs.available)} available
                    </div>
                  </div>
                </GlassPanel>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Create Filesystem Modal ── */}
      {showCreateModal && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal__header">
              <h3 className="modal__title">Create Filesystem</h3>
              <button className="modal__close" onClick={() => setShowCreateModal(false)}>✕</button>
            </div>
            <div className="modal__body">
              <div style={{ marginBottom: 'var(--space-4)', padding: 'var(--space-3)', backgroundColor: 'rgba(239,68,68,0.1)', borderRadius: 'var(--radius-sm)', color: '#FCA5A5' }}>
                ⚠ This will format the selected device and erase all data.
              </div>
              <div className="form-group">
                <label className="form-label">Device</label>
                {availableDevices.length === 0 ? (
                  <div style={{ padding: 'var(--space-3)', color: '#F59E0B', fontSize: 'var(--font-size-sm)', backgroundColor: 'rgba(245,158,11,0.1)', borderRadius: 'var(--radius-sm)' }}>
                    No unformatted partitions available. Create a partition first.
                  </div>
                ) : (
                  <select className="form-input" value={createDevice} onChange={e => setCreateDevice(e.target.value)}>
                    {availableDevices.map(d => (
                      <option key={d.device} value={d.device}>{d.device} ({d.size})</option>
                    ))}
                  </select>
                )}
              </div>
              <div className="form-group">
                <label className="form-label">Filesystem Type</label>
                <select className="form-input" value={createFstype} onChange={e => setCreateFstype(e.target.value)}>
                  <option value="ext4">ext4 (recommended)</option>
                  <option value="xfs">XFS</option>
                  <option value="btrfs">Btrfs</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Type <code>YES_FORMAT_DEVICE</code> to confirm</label>
                <input className="form-input" value={createConfirm} onChange={e => setCreateConfirm(e.target.value)}
                  placeholder="YES_FORMAT_DEVICE" />
              </div>
            </div>
            <div className="modal__footer">
              <button className="btn btn--secondary" onClick={() => setShowCreateModal(false)}>Cancel</button>
              <button className="btn btn--danger" onClick={handleCreateFilesystem}
                disabled={createConfirm !== 'YES_FORMAT_DEVICE' || !createDevice}>
                Create Filesystem
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Mount Modal ── */}
      {showMountModal && (
        <div className="modal-overlay" onClick={() => setShowMountModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal__header">
              <h3 className="modal__title">Mount Filesystem</h3>
              <button className="modal__close" onClick={() => setShowMountModal(false)}>✕</button>
            </div>
            <div className="modal__body">
              <div className="form-group">
                <label className="form-label">Device</label>
                {unmountableDevices.length === 0 ? (
                  <div style={{ padding: 'var(--space-3)', color: '#F59E0B', fontSize: 'var(--font-size-sm)', backgroundColor: 'rgba(245,158,11,0.1)', borderRadius: 'var(--radius-sm)' }}>
                    No unmounted filesystems available. Create a filesystem first.
                  </div>
                ) : (
                  <select className="form-input" value={mountDevice} onChange={e => setMountDevice(e.target.value)}>
                    {unmountableDevices.map(d => (
                      <option key={d.device} value={d.device}>{d.device} ({d.fstype}, {d.size})</option>
                    ))}
                  </select>
                )}
              </div>
              <div className="form-group">
                <label className="form-label">Label (optional)</label>
                <input className="form-input" value={mountLabel} onChange={e => setMountLabel(e.target.value)}
                  placeholder="e.g. data, backups, media" />
                <small style={{ color: 'var(--text-secondary)', fontSize: 'var(--font-size-xs)' }}>
                  Mounts to /mnt/storage/{'<label>'}. Leave empty for auto-generated name.
                </small>
              </div>
            </div>
            <div className="modal__footer">
              <button className="btn btn--secondary" onClick={() => setShowMountModal(false)}>Cancel</button>
              <button className="btn btn--primary" onClick={handleMount} disabled={!mountDevice}>
                Mount
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
