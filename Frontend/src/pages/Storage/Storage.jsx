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

  // Partition modal
  const [showPartModal, setShowPartModal] = useState(false);
  const [partDisk, setPartDisk] = useState(null);
  const [partMode, setPartMode] = useState('full'); // full | custom | append
  const [partEntries, setPartEntries] = useState([{ sizeMB: 1024 }]); // for custom mode
  const [appendSizeMB, setAppendSizeMB] = useState(0); // 0 = fill remaining
  const [partConfirm, setPartConfirm] = useState('');

  const { disks, disksLoading, disksError, fetchDisks } = useStorageStore();

  useEffect(() => {
    fetchDisks().catch(err => setError(err.message || 'Failed to load disks'));
  }, [fetchDisks]);

  const handleRefresh = useCallback(async () => {
    setError(null);
    setActionResult(null);
    try { await fetchDisks(); } catch (err) { setError(err.message); }
  }, [fetchDisks]);

  // ── Open Partition Modal ──
  const openPartModal = (disk) => {
    setPartDisk(disk);
    setPartMode('full');
    setPartEntries([{ sizeMB: 1024 }]);
    setAppendSizeMB(0);
    setPartConfirm('');
    setShowPartModal(true);
  };

  // ── Execute Partition ──
  const executePartition = async () => {
    if (partConfirm !== 'YES_PARTITION_DISK') {
      setActionResult({ type: 'error', message: 'Type "YES_PARTITION_DISK" to confirm' });
      return;
    }
    setShowPartModal(false);
    setActionLoading(true);
    setActionResult(null);
    try {
      const opts = { mode: partMode };
      if (partMode === 'custom') {
        opts.partitions = partEntries.map(e => ({ sizeMB: e.sizeMB }));
      } else if (partMode === 'append') {
        opts.appendSizeMB = appendSizeMB;
      }
      const result = await diskService.createPartition(partDisk.name, 'YES_PARTITION_DISK', opts);
      const count = result.partitions?.length || 1;
      setActionResult({ type: 'success', message: `${count} partition(s) created on /dev/${partDisk.name}` });
      await fetchDisks();
    } catch (err) {
      setActionResult({ type: 'error', message: err.message || 'Partition creation failed' });
    } finally {
      setActionLoading(false);
    }
  };

  // ── Custom partition helpers ──
  const diskTotalMB = partDisk ? Math.floor((partDisk.size || 0) / (1024 * 1024)) : 0;
  const usedMB = partEntries.reduce((sum, e) => sum + (e.sizeMB || 0), 0);
  const remainingMB = Math.max(0, diskTotalMB - 1 - usedMB); // 1MB GPT header

  const addPartEntry = () => {
    const defaultSize = Math.min(1024, remainingMB);
    if (defaultSize <= 0) return;
    setPartEntries([...partEntries, { sizeMB: defaultSize }]);
  };

  const removePartEntry = (idx) => {
    if (partEntries.length <= 1) return;
    setPartEntries(partEntries.filter((_, i) => i !== idx));
  };

  const updatePartEntry = (idx, sizeMB) => {
    const updated = [...partEntries];
    updated[idx] = { sizeMB };
    setPartEntries(updated);
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

  // ── Unmount Partition ──
  const handleUnmount = async (partition, mountpoint) => {
    if (!window.confirm(`Unmount ${partition} from ${mountpoint}?\n\nThis will make the filesystem inaccessible until it is mounted again.`)) return;
    setActionLoading(true);
    setActionResult(null);
    try {
      await diskService.unmountPartition(mountpoint);
      setActionResult({ type: 'success', message: `Unmounted ${partition} from ${mountpoint}` });
      await fetchDisks();
    } catch (err) {
      setActionResult({ type: 'error', message: err.message || 'Unmount failed' });
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
                              {!disk.isSystem && (
                                <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                                  {part.mountpoint ? (
                                    <button className="btn btn--secondary btn--xs"
                                      onClick={() => handleUnmount(`/dev/${part.name}`, part.mountpoint)}
                                      disabled={actionLoading}>
                                      Unmount
                                    </button>
                                  ) : (
                                    <button className="btn btn--secondary btn--xs"
                                      onClick={() => openFormatModal(`/dev/${part.name}`)}
                                      disabled={actionLoading}>
                                      Format
                                    </button>
                                  )}
                                </div>
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
                          onClick={() => openPartModal(disk)}
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

      {/* ── Partition Modal ── */}
      {showPartModal && (
        <div className="modal-overlay" onClick={() => setShowPartModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '520px' }}>
            <div className="modal__header">
              <h3 className="modal__title">Create Partition</h3>
              <button className="modal__close" onClick={() => setShowPartModal(false)}>✕</button>
            </div>
            <div className="modal__body">
              <div style={{ marginBottom: 'var(--space-3)', fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)' }}>
                Target: <strong style={{ color: 'var(--text-primary)' }}>/dev/{partDisk?.name}</strong>
                {' '} — {formatBytes(partDisk?.size)} total
              </div>

              {/* Mode selection */}
              <div className="form-group">
                <label className="form-label">Operation Mode</label>
                <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                  {[
                    { value: 'full', label: '🗄 Whole Disk', desc: 'Wipe & use 100%' },
                    { value: 'custom', label: '✂ Custom', desc: 'Multiple partitions' },
                    ...(partDisk?.children?.length > 0 ? [{ value: 'append', label: '➕ Append', desc: 'Add to free space' }] : [])
                  ].map(opt => (
                    <button key={opt.value}
                      className={`partition-mode-btn ${partMode === opt.value ? 'partition-mode-btn--active' : ''}`}
                      onClick={() => setPartMode(opt.value)}
                      style={{
                        flex: 1, padding: 'var(--space-3)', borderRadius: 'var(--radius-md)',
                        border: partMode === opt.value ? '2px solid var(--primary)' : '1px solid rgba(255,255,255,0.1)',
                        backgroundColor: partMode === opt.value ? 'rgba(139,92,246,0.15)' : 'rgba(255,255,255,0.03)',
                        color: 'var(--text-primary)', cursor: 'pointer', textAlign: 'center',
                        transition: 'all 0.2s ease'
                      }}>
                      <div style={{ fontSize: '1rem', marginBottom: '2px' }}>{opt.label}</div>
                      <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>{opt.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Warning for destructive modes */}
              {(partMode === 'full' || partMode === 'custom') && (
                <div style={{ marginBottom: 'var(--space-3)', padding: 'var(--space-2) var(--space-3)', backgroundColor: 'rgba(239,68,68,0.1)', borderRadius: 'var(--radius-sm)', color: '#FCA5A5', fontSize: 'var(--font-size-sm)' }}>
                  ⚠ This will <strong>wipe the entire disk</strong> and create a fresh GPT partition table.
                </div>
              )}

              {partMode === 'append' && (
                <div style={{ marginBottom: 'var(--space-3)', padding: 'var(--space-2) var(--space-3)', backgroundColor: 'rgba(16,185,129,0.1)', borderRadius: 'var(--radius-sm)', color: '#6EE7B7', fontSize: 'var(--font-size-sm)' }}>
                  ✓ Existing partitions will NOT be modified. A new partition will be created in unallocated space.
                </div>
              )}

              {/* Full mode — nothing else needed */}
              {partMode === 'full' && (
                <div style={{ padding: 'var(--space-3)', backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-3)' }}>
                  <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)' }}>
                    A single partition will be created using the entire disk capacity.
                  </div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--primary)', marginTop: 'var(--space-2)', fontFamily: 'monospace' }}>
                    {formatBytes(partDisk?.size)} → 1 partition
                  </div>
                </div>
              )}

              {/* Custom mode — multiple partition sliders */}
              {partMode === 'custom' && (
                <div style={{ marginBottom: 'var(--space-3)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-2)' }}>
                    <label className="form-label" style={{ marginBottom: 0 }}>Partitions</label>
                    <span style={{ fontSize: 'var(--font-size-xs)', color: remainingMB > 100 ? '#10B981' : '#EF4444' }}>
                      {formatBytes(remainingMB * 1024 * 1024)} remaining
                    </span>
                  </div>

                  {partEntries.map((entry, idx) => (
                    <div key={idx} style={{
                      display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
                      padding: 'var(--space-2) var(--space-3)',
                      backgroundColor: 'rgba(255,255,255,0.03)',
                      borderRadius: 'var(--radius-sm)',
                      marginBottom: 'var(--space-2)'
                    }}>
                      <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)', minWidth: '16px' }}>
                        #{idx + 1}
                      </span>
                      <input
                        type="range"
                        min={1}
                        max={Math.max(1, entry.sizeMB + remainingMB)}
                        value={entry.sizeMB}
                        onChange={e => updatePartEntry(idx, parseInt(e.target.value))}
                        style={{ flex: 1, accentColor: 'var(--primary)', cursor: 'pointer' }}
                      />
                      <span style={{ fontWeight: 600, color: 'var(--primary)', fontFamily: 'monospace', minWidth: '70px', textAlign: 'right', fontSize: 'var(--font-size-sm)' }}>
                        {entry.sizeMB >= 1024
                          ? `${(entry.sizeMB / 1024).toFixed(1)} GB`
                          : `${entry.sizeMB} MB`}
                      </span>
                      {partEntries.length > 1 && (
                        <button onClick={() => removePartEntry(idx)}
                          style={{ background: 'none', border: 'none', color: '#EF4444', cursor: 'pointer', fontSize: '1rem', padding: '2px 6px' }}>
                          ✕
                        </button>
                      )}
                    </div>
                  ))}

                  <button onClick={addPartEntry}
                    disabled={remainingMB <= 0}
                    className="btn btn--secondary btn--xs"
                    style={{ marginTop: 'var(--space-2)' }}>
                    + Add Partition
                  </button>

                  {/* Visual bar */}
                  <div style={{ marginTop: 'var(--space-3)', height: '24px', borderRadius: 'var(--radius-sm)', overflow: 'hidden', display: 'flex', backgroundColor: 'rgba(255,255,255,0.05)' }}>
                    {partEntries.map((entry, idx) => {
                      const pct = diskTotalMB > 0 ? (entry.sizeMB / diskTotalMB) * 100 : 0;
                      const colors = ['#8B5CF6', '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#EC4899'];
                      return (
                        <div key={idx} style={{
                          width: `${pct}%`, backgroundColor: colors[idx % colors.length],
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: '10px', fontWeight: 600, color: '#fff',
                          minWidth: pct > 3 ? undefined : '2px',
                          transition: 'width 0.3s ease'
                        }}>
                          {pct > 8 ? `P${idx + 1}` : ''}
                        </div>
                      );
                    })}
                    {remainingMB > 0 && diskTotalMB > 0 && (
                      <div style={{
                        width: `${(remainingMB / diskTotalMB) * 100}%`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '10px', color: 'var(--text-tertiary)'
                      }}>
                        Free
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Append mode — size slider */}
              {partMode === 'append' && (
                <div style={{ padding: 'var(--space-3)', backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-3)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-2)' }}>
                    <label className="form-label" style={{ marginBottom: 0 }}>Size</label>
                    <span style={{ fontWeight: 600, color: 'var(--primary)', fontFamily: 'monospace' }}>
                      {appendSizeMB === 0 ? 'Use all free space' : (
                        appendSizeMB >= 1024 ? `${(appendSizeMB / 1024).toFixed(1)} GB` : `${appendSizeMB} MB`
                      )}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={diskTotalMB}
                    value={appendSizeMB}
                    onChange={e => setAppendSizeMB(parseInt(e.target.value))}
                    style={{ width: '100%', accentColor: 'var(--primary)', cursor: 'pointer' }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--font-size-xs)', color: 'var(--text-tertiary)', marginTop: '2px' }}>
                    <span>All free space</span>
                    <span>Max ({formatBytes(diskTotalMB * 1024 * 1024)})</span>
                  </div>
                </div>
              )}

              {/* Confirmation */}
              <div className="form-group">
                <label className="form-label" style={{ color: (partMode === 'full' || partMode === 'custom') ? '#EF4444' : 'var(--text-primary)' }}>
                  Type <code style={{ background: 'rgba(255,255,255,0.1)', padding: '2px 6px', borderRadius: '4px' }}>YES_PARTITION_DISK</code> to confirm
                </label>
                <input className="form-input" value={partConfirm} onChange={e => setPartConfirm(e.target.value)}
                  placeholder="YES_PARTITION_DISK"
                  style={{ borderColor: partConfirm === 'YES_PARTITION_DISK' ? '#10B981' : undefined }} />
              </div>
            </div>
            <div className="modal__footer">
              <button className="btn btn--secondary" onClick={() => setShowPartModal(false)}>Cancel</button>
              <button
                className={partMode === 'append' ? 'btn btn--primary' : 'btn btn--danger'}
                onClick={executePartition}
                disabled={partConfirm !== 'YES_PARTITION_DISK' || actionLoading}>
                {actionLoading ? 'Working...' : (
                  partMode === 'full' ? 'Wipe & Create' :
                    partMode === 'custom' ? `Create ${partEntries.length} Partition${partEntries.length > 1 ? 's' : ''}` :
                      'Append Partition'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
