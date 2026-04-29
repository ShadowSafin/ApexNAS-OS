import { useEffect, useState, useCallback } from 'react';
import TopBar from '../../components/TopBar/TopBar';
import GlassPanel from '../../components/GlassPanel/GlassPanel';
import StatusIndicator from '../../components/StatusIndicator/StatusIndicator';
import filesystemService from '../../services/filesystem.service';
import diskService from '../../services/disk.service';
import { shareService } from '../../services/share.service';
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

        const children = disk.children || [];

        if (children.length === 0) {
          // Whole disk with no partition table — allow formatting the raw disk
          if (!disk.mountpoint) {
            devices.push({
              device: disk.device || `/dev/${disk.name}`,
              name: disk.name,
              size: disk.sizeFormatted || formatBytes(disk.size),
              fstype: disk.fstype || null,
              label: `${disk.device || `/dev/${disk.name}`} (whole disk, ${disk.sizeFormatted || formatBytes(disk.size)})`
            });
          }
        } else {
          // Show any partition that is NOT currently mounted
          for (const part of children) {
            if (!part.mountpoint) {
              devices.push({
                device: part.device || `/dev/${part.name}`,
                name: part.name,
                size: part.sizeFormatted || formatBytes(part.size),
                fstype: part.fstype || null,
                label: `${part.device || `/dev/${part.name}`} (${part.fstype || 'unformatted'}, ${part.sizeFormatted || formatBytes(part.size)})`
              });
            }
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

  // ── Unmount with share safety check ──
  const [unmountDialog, setUnmountDialog] = useState({
    visible: false,
    mountpoint: null,
    affectedShares: [],
    loading: false
  });

  const handleUnmount = async (mountpoint) => {
    // Check for active shares on this mountpoint
    setUnmountDialog({ visible: true, mountpoint, affectedShares: [], loading: true });
    try {
      const sharesData = await shareService.listShares();
      const sharesList = sharesData?.data || sharesData?.shares || sharesData || [];
      const affected = Array.isArray(sharesList)
        ? sharesList.filter(s => s.path && s.path.startsWith(mountpoint))
        : [];
      setUnmountDialog(prev => ({ ...prev, affectedShares: affected, loading: false }));
    } catch {
      // If we can't fetch shares, still allow unmount with a generic warning
      setUnmountDialog(prev => ({ ...prev, affectedShares: [], loading: false }));
    }
  };

  const confirmUnmount = async () => {
    const { mountpoint } = unmountDialog;
    setUnmountDialog(prev => ({ ...prev, visible: false }));
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

  const cancelUnmount = () => {
    setUnmountDialog({ visible: false, mountpoint: null, affectedShares: [], loading: false });
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
                    Create a filesystem on a partition, then mount it.
                  </div>
                </div>
              </GlassPanel>
            )}

            {/* Filesystem list */}
            {filesystems.length > 0 && filesystems.map((fs, i) => {
              const pctRaw = typeof fs.usePercent === 'string' ? parseFloat(fs.usePercent) : (fs.size > 0 ? (fs.used / fs.size * 100) : 0);
              const pct = Math.min(pctRaw, 100).toFixed(1);
              const isStorageMount = (fs.mountpoint || '').startsWith('/mnt/storage');

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
                      {(isStorageMount || (fs.mountpoint || '').startsWith('/media/')) && (
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
                  No unmounted partitions or disks available. Partition a disk first from the Storage page.
                  </div>
                ) : (
                  <select className="form-input" value={createDevice} onChange={e => setCreateDevice(e.target.value)}>
                    {availableDevices.map(d => (
                      <option key={d.device} value={d.device}>{d.label || `${d.device} (${d.size})`}</option>
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

      {/* ── Unmount Confirmation Modal ── */}
      {unmountDialog.visible && (
        <div className="modal-overlay" onClick={cancelUnmount}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal__header">
              <h3 className="modal__title">Unmount Filesystem</h3>
              <button className="modal__close" onClick={cancelUnmount}>✕</button>
            </div>
            <div className="modal__body">
              {unmountDialog.loading ? (
                <div style={{ textAlign: 'center', padding: 'var(--space-4)', color: '#999' }}>
                  Checking for active shares...
                </div>
              ) : (
                <>
                  <div style={{ marginBottom: 'var(--space-3)', fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)' }}>
                    You are about to unmount <strong style={{ color: 'var(--text-primary)' }}>{unmountDialog.mountpoint}</strong>.
                    The filesystem will become inaccessible and the fstab entry will be removed.
                  </div>

                  {unmountDialog.affectedShares.length > 0 && (
                    <div style={{
                      padding: 'var(--space-3)',
                      backgroundColor: 'rgba(239,68,68,0.1)',
                      border: '1px solid rgba(239,68,68,0.3)',
                      borderRadius: 'var(--radius-sm)',
                      marginBottom: 'var(--space-3)'
                    }}>
                      <div style={{ color: '#FCA5A5', fontWeight: 600, marginBottom: 'var(--space-2)', fontSize: 'var(--font-size-sm)' }}>
                        ⚠ {unmountDialog.affectedShares.length} active share{unmountDialog.affectedShares.length > 1 ? 's' : ''} will be affected:
                      </div>
                      {unmountDialog.affectedShares.map((share, i) => (
                        <div key={i} style={{
                          display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
                          padding: '6px var(--space-2)',
                          backgroundColor: 'rgba(0,0,0,0.2)',
                          borderRadius: 'var(--radius-xs)',
                          marginBottom: '4px',
                          fontSize: 'var(--font-size-xs)'
                        }}>
                          <span style={{ color: '#EF4444' }}>●</span>
                          <span style={{ color: '#fff', fontWeight: 500 }}>{share.name}</span>
                          <span style={{ color: 'var(--text-tertiary)' }}>→ {share.path}</span>
                          {share.services && (
                            <span style={{ marginLeft: 'auto', color: '#FCA5A5', fontSize: '11px' }}>
                              {[share.services.smb?.enabled && 'SMB', share.services.nfs?.enabled && 'NFS', share.services.ftp?.enabled && 'FTP'].filter(Boolean).join(', ') || 'No protocols'}
                            </span>
                          )}
                        </div>
                      ))}
                      <div style={{ color: '#FCA5A5', fontSize: 'var(--font-size-xs)', marginTop: 'var(--space-2)' }}>
                        These shares will become inaccessible. Clients connected via SMB/NFS/FTP may experience errors.
                      </div>
                    </div>
                  )}

                  {unmountDialog.affectedShares.length === 0 && (
                    <div style={{
                      padding: 'var(--space-3)',
                      backgroundColor: 'rgba(16,185,129,0.1)',
                      border: '1px solid rgba(16,185,129,0.3)',
                      borderRadius: 'var(--radius-sm)',
                      marginBottom: 'var(--space-3)',
                      color: '#6EE7B7',
                      fontSize: 'var(--font-size-sm)'
                    }}>
                      ✓ No active shares found on this filesystem. Safe to unmount.
                    </div>
                  )}
                </>
              )}
            </div>
            <div className="modal__footer">
              <button className="btn btn--secondary" onClick={cancelUnmount}>Cancel</button>
              <button
                className={unmountDialog.affectedShares.length > 0 ? 'btn btn--danger' : 'btn btn--primary'}
                onClick={confirmUnmount}
                disabled={unmountDialog.loading}
              >
                {unmountDialog.affectedShares.length > 0 ? 'Unmount Anyway' : 'Unmount'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
