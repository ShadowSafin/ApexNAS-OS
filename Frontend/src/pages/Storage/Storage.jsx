import { useEffect, useState, useCallback } from 'react';
import TopBar from '../../components/TopBar/TopBar';
import GlassPanel from '../../components/GlassPanel/GlassPanel';
import StatusIndicator from '../../components/StatusIndicator/StatusIndicator';
import { useStorageStore } from '../../stores';
import diskService from '../../services/disk.service';
import './Storage.css';

function formatBytes(bytes, decimals = 1) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(decimals)} ${sizes[i]}`;
}

export default function Storage() {
  const [error, setError] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionResult, setActionResult] = useState(null);
  const [expandedDisk, setExpandedDisk] = useState(null);
  // Format modal
  const [showFormatModal, setShowFormatModal] = useState(false);
  const [formatTarget, setFormatTarget] = useState(null);
  const [formatFstype, setFormatFstype] = useState('ext4');
  const [formatConfirm, setFormatConfirm] = useState('');

  const { disks, disksLoading, disksError, fetchDisks } = useStorageStore();

  useEffect(() => {
    fetchDisks().catch(err => setError(err.message || 'Failed to load disks'));
  }, [fetchDisks]);

  const handleRefresh = useCallback(async () => {
    setError(null);
    setActionResult(null);
    try { await fetchDisks(); } catch (err) { setError(err.message); }
  }, [fetchDisks]);

  // ── Create Partition ──
  const handleCreatePartition = async (device) => {
    if (!window.confirm(`This will create a GPT partition table on ${device}.\nALL EXISTING DATA WILL BE DESTROYED.\n\nContinue?`)) return;
    setActionLoading(true);
    setActionResult(null);
    try {
      const result = await diskService.createPartition(device, 'YES_PARTITION_DISK');
      setActionResult({ type: 'success', message: `Partition created: ${result.partition}` });
      await fetchDisks();
    } catch (err) {
      setActionResult({ type: 'error', message: err.message || 'Partition creation failed' });
    } finally {
      setActionLoading(false);
    }
  };

  // ── Format Partition (opens modal) ──
  const openFormatModal = (partition) => {
    setFormatTarget(partition);
    setFormatFstype('ext4');
    setFormatConfirm('');
    setShowFormatModal(true);
  };

  const handleFormat = async () => {
    if (formatConfirm !== 'YES_FORMAT_DEVICE') {
      setActionResult({ type: 'error', message: 'Type "YES_FORMAT_DEVICE" to confirm' });
      return;
    }
    setShowFormatModal(false);
    setActionLoading(true);
    setActionResult(null);
    try {
      await diskService.formatPartition(formatTarget, formatFstype, 'YES_FORMAT_DEVICE');
      setActionResult({ type: 'success', message: `${formatTarget} formatted as ${formatFstype}` });
      await fetchDisks();
    } catch (err) {
      setActionResult({ type: 'error', message: err.message || 'Format failed' });
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <>
      <TopBar title="Disks" breadcrumbs={['Storage', 'Physical Disks']} />
      <div className="app-layout__content">
        <div className="storage-page">
          <div className="section">
            <div className="section__header">
              <div>
                <h2 className="section__title">Physical Disks</h2>
                <p className="section__subtitle">
                  {disksLoading ? 'Scanning...' : `${disks?.length || 0} disks detected`}
                </p>
              </div>
              <button className="btn btn--secondary btn--sm" onClick={handleRefresh} disabled={disksLoading}>
                ↻ Refresh
              </button>
            </div>

            {/* Action result banner */}
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

            {disksLoading && !disks?.length && (
              <GlassPanel variant="medium" padding="lg">
                <div style={{ textAlign: 'center', padding: 'var(--space-4)', color: '#999' }}>
                  Scanning for disks...
                </div>
              </GlassPanel>
            )}

            {!disksLoading && (!disks || disks.length === 0) && (
              <GlassPanel variant="medium" padding="lg">
                <div style={{ textAlign: 'center', padding: 'var(--space-4)', color: '#999' }}>
                  No disks detected
                </div>
              </GlassPanel>
            )}

            {/* Disk list */}
            {disks && disks.length > 0 && disks.map((disk, i) => {
              const isExpanded = expandedDisk === disk.name;
              return (
                <GlassPanel key={disk.name} variant="medium" padding="md" hoverable
                  className={`animate-fade-in-up stagger-${i + 1}`}
                  style={{ marginBottom: 'var(--space-3)', cursor: 'pointer' }}
                  onClick={() => setExpandedDisk(isExpanded ? null : disk.name)}
                >
                  {/* Disk header */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                      <span style={{ fontSize: '1.5rem' }}>⛁</span>
                      <div>
                        <div style={{ fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                          /dev/{disk.name}
                          {disk.isSystem && (
                            <span style={{
                              fontSize: 'var(--font-size-xs)',
                              padding: '2px 8px',
                              borderRadius: 'var(--radius-sm)',
                              backgroundColor: 'rgba(239, 68, 68, 0.15)',
                              color: '#EF4444',
                              fontWeight: 500
                            }}>
                              SYSTEM
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)' }}>
                          {disk.model} · {disk.transport?.toUpperCase()}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                          {formatBytes(disk.size)}
                        </div>
                        <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>
                          {(disk.children || []).length} partition{(disk.children || []).length !== 1 ? 's' : ''}
                        </div>
                      </div>
                      <StatusIndicator
                        status={disk.health === 'healthy' ? 'online' : disk.health === 'failing' ? 'error' : 'warning'}
                        label={disk.health === 'healthy' ? 'Healthy' : disk.health === 'failing' ? 'Failing' : 'N/A'}
                      />
                      <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                        {isExpanded ? '▲' : '▼'}
                      </span>
                    </div>
                  </div>

                  {/* Expanded: partitions + actions */}
                  {isExpanded && (
                    <div style={{ marginTop: 'var(--space-4)', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 'var(--space-4)' }}
                      onClick={e => e.stopPropagation()}>
                      {/* Disk details */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-2)', marginBottom: 'var(--space-4)' }}>
                        <div className="info-row">
                          <span className="info-row__label">Serial</span>
                          <span className="info-row__value" style={{ fontSize: 'var(--font-size-xs)' }}>{disk.serial}</span>
                        </div>
                        <div className="info-row">
                          <span className="info-row__label">Transport</span>
                          <span className="info-row__value">{disk.transport?.toUpperCase()}</span>
                        </div>
                      </div>

                      {/* Partitions */}
                      {disk.children && disk.children.length > 0 ? (
                        <>
                          <h4 style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)', marginBottom: 'var(--space-2)' }}>
                            Partitions
                          </h4>
                          {disk.children.map(part => (
                            <div key={part.name} style={{
                              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                              padding: 'var(--space-2) var(--space-3)',
                              backgroundColor: 'rgba(255,255,255,0.03)',
                              borderRadius: 'var(--radius-sm)',
                              marginBottom: 'var(--space-2)'
                            }}>
                              <div>
                                <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>/dev/{part.name}</span>
                                <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)', marginLeft: 'var(--space-2)' }}>
                                  {formatBytes(part.size)}
                                </span>
                                {part.fstype && (
                                  <span style={{
                                    fontSize: 'var(--font-size-xs)', padding: '1px 6px',
                                    borderRadius: 'var(--radius-sm)', backgroundColor: 'rgba(139,92,246,0.15)',
                                    color: '#A78BFA', marginLeft: 'var(--space-2)'
                                  }}>
                                    {part.fstype}
                                  </span>
                                )}
                                {part.mountpoint && (
                                  <span style={{ fontSize: 'var(--font-size-xs)', color: '#10B981', marginLeft: 'var(--space-2)' }}>
                                    → {part.mountpoint}
                                  </span>
                                )}
                              </div>
                              {!disk.isSystem && !part.mountpoint && (
                                <button className="btn btn--secondary btn--xs"
                                  onClick={() => openFormatModal(`/dev/${part.name}`)}
                                  disabled={actionLoading}>
                                  Format
                                </button>
                              )}
                            </div>
                          ))}
                        </>
                      ) : (
                        <div style={{ color: 'var(--text-secondary)', fontSize: 'var(--font-size-sm)', marginBottom: 'var(--space-3)' }}>
                          No partitions found
                        </div>
                      )}

                      {/* Create Partition button */}
                      {!disk.isSystem && (
                        <button className="btn btn--primary btn--sm" style={{ marginTop: 'var(--space-3)' }}
                          onClick={() => handleCreatePartition(disk.device)}
                          disabled={actionLoading}>
                          {actionLoading ? 'Working...' : '+ Create Partition'}
                        </button>
                      )}
                      {disk.isSystem && (
                        <div style={{
                          fontSize: 'var(--font-size-xs)', color: '#EF4444', marginTop: 'var(--space-2)',
                          padding: 'var(--space-2)', backgroundColor: 'rgba(239,68,68,0.08)', borderRadius: 'var(--radius-sm)'
                        }}>
                          ⚠ System disk — partitioning and formatting are disabled to protect the OS.
                        </div>
                      )}
                    </div>
                  )}
                </GlassPanel>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Format Modal ── */}
      {showFormatModal && (
        <div className="modal-overlay" onClick={() => setShowFormatModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal__header">
              <h3 className="modal__title">Format Partition</h3>
              <button className="modal__close" onClick={() => setShowFormatModal(false)}>✕</button>
            </div>
            <div className="modal__body">
              <div style={{ marginBottom: 'var(--space-4)', padding: 'var(--space-3)', backgroundColor: 'rgba(239,68,68,0.1)', borderRadius: 'var(--radius-sm)', color: '#FCA5A5' }}>
                ⚠ WARNING: Formatting will erase ALL data on <strong>{formatTarget}</strong>.
              </div>
              <div className="form-group">
                <label className="form-label">Device</label>
                <input className="form-input" value={formatTarget || ''} disabled />
              </div>
              <div className="form-group">
                <label className="form-label">Filesystem Type</label>
                <select className="form-input" value={formatFstype} onChange={e => setFormatFstype(e.target.value)}>
                  <option value="ext4">ext4 (recommended)</option>
                  <option value="xfs">XFS</option>
                  <option value="btrfs">Btrfs</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Type <code>YES_FORMAT_DEVICE</code> to confirm</label>
                <input className="form-input" value={formatConfirm} onChange={e => setFormatConfirm(e.target.value)}
                  placeholder="YES_FORMAT_DEVICE" />
              </div>
            </div>
            <div className="modal__footer">
              <button className="btn btn--secondary" onClick={() => setShowFormatModal(false)}>Cancel</button>
              <button className="btn btn--danger" onClick={handleFormat}
                disabled={formatConfirm !== 'YES_FORMAT_DEVICE'}>
                Format
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
