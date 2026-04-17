import { useEffect, useState, useCallback } from 'react';
import TopBar from '../../components/TopBar/TopBar';
import GlassPanel from '../../components/GlassPanel/GlassPanel';
import StatusIndicator from '../../components/StatusIndicator/StatusIndicator';
import { useStorageStore } from '../../stores';
import diskService from '../../services/disk.service';
import './RAID.css';

export default function RAID() {
  const [error, setError] = useState(null);
  const [actionResult, setActionResult] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  // Create modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [availableDisks, setAvailableDisks] = useState([]);
  const [raidName, setRaidName] = useState('md0');
  const [raidLevel, setRaidLevel] = useState('1');
  const [selectedDevices, setSelectedDevices] = useState([]);
  const [createConfirm, setCreateConfirm] = useState('');

  const { raidArrays, raidLoading, raidError, fetchRaidArrays, createRaidArray, stopRaidArray } = useStorageStore();

  useEffect(() => {
    fetchRaidArrays().catch(err => setError(err.message || 'Failed to load RAID data'));
  }, [fetchRaidArrays]);

  const handleRefresh = useCallback(async () => {
    setError(null);
    setActionResult(null);
    try { await fetchRaidArrays(); } catch (err) { setError(err.message); }
  }, [fetchRaidArrays]);

  // Load available disks for RAID creation
  const openCreateModal = async () => {
    setActionResult(null);
    try {
      const disks = await diskService.listDisks();
      // Only show non-system disks with partitions that aren't mounted
      const available = [];
      for (const disk of disks) {
        if (disk.isSystem) continue;
        for (const part of (disk.children || [])) {
          if (!part.mountpoint) {
            available.push({
              device: part.device || `/dev/${part.name}`,
              name: part.name,
              size: part.sizeFormatted || `${part.size}`,
              fstype: part.fstype,
              parentDisk: disk.name
            });
          }
        }
      }
      setAvailableDisks(available);
      setSelectedDevices([]);
      setRaidName('md0');
      setRaidLevel('1');
      setCreateConfirm('');
      setShowCreateModal(true);
    } catch (err) {
      setActionResult({ type: 'error', message: 'Failed to load disk list' });
    }
  };

  const toggleDevice = (device) => {
    setSelectedDevices(prev =>
      prev.includes(device) ? prev.filter(d => d !== device) : [...prev, device]
    );
  };

  const getMinDevices = (level) => {
    switch (String(level)) {
      case '0': return 2;
      case '1': return 2;
      case '5': return 3;
      case '6': return 4;
      default: return 2;
    }
  };

  const handleCreateRaid = async () => {
    if (createConfirm !== 'YES_DESTROY_DATA') return;
    const minDevs = getMinDevices(raidLevel);
    if (selectedDevices.length < minDevs) {
      setActionResult({ type: 'error', message: `RAID ${raidLevel} requires at least ${minDevs} devices` });
      return;
    }
    setShowCreateModal(false);
    setActionLoading(true);
    setActionResult(null);
    try {
      await createRaidArray({
        name: raidName,
        level: parseInt(raidLevel),
        devices: selectedDevices,
        confirm: 'YES_DESTROY_DATA'
      });
      setActionResult({ type: 'success', message: `RAID ${raidLevel} array /dev/${raidName} created` });
    } catch (err) {
      setActionResult({ type: 'error', message: err.message || 'RAID creation failed' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleStopArray = async (name) => {
    if (!window.confirm(`Stop RAID array ${name}? This will make its data inaccessible.`)) return;
    setActionLoading(true);
    try {
      await stopRaidArray(name);
      setActionResult({ type: 'success', message: `${name} stopped` });
    } catch (err) {
      setActionResult({ type: 'error', message: err.message });
    } finally {
      setActionLoading(false);
    }
  };

  const getHealthColor = (status) => {
    if (status === 'active' || status === 'online' || status === 'clean') return '#10B981';
    if (status === 'degraded') return '#F59E0B';
    if (status === 'inactive' || status === 'failed') return '#EF4444';
    return '#6B7280';
  };

  return (
    <>
      <TopBar title="RAID" breadcrumbs={['Storage', 'RAID Arrays']} />
      <div className="app-layout__content">
        <div className="raid-page">
          <div className="section">
            <div className="section__header">
              <div>
                <h2 className="section__title">RAID Arrays</h2>
                <p className="section__subtitle">
                  {raidLoading ? 'Scanning...' : `${raidArrays?.length || 0} arrays detected`}
                </p>
              </div>
              <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                <button className="btn btn--secondary btn--sm" onClick={handleRefresh} disabled={raidLoading}>
                  ↻ Refresh
                </button>
                <button className="btn btn--primary btn--sm" onClick={openCreateModal} disabled={actionLoading}>
                  + Create Array
                </button>
              </div>
            </div>

            {/* Action result */}
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

            {raidLoading && !raidArrays?.length && (
              <GlassPanel variant="medium" padding="lg">
                <div style={{ textAlign: 'center', padding: 'var(--space-4)', color: '#999' }}>
                  Scanning for RAID arrays...
                </div>
              </GlassPanel>
            )}

            {!raidLoading && (!raidArrays || raidArrays.length === 0) && (
              <GlassPanel variant="medium" padding="lg">
                <div style={{ textAlign: 'center', padding: 'var(--space-6)', color: '#999' }}>
                  <div style={{ fontSize: '2rem', marginBottom: 'var(--space-3)' }}>🛡️</div>
                  <div style={{ fontWeight: 500, marginBottom: 'var(--space-2)', color: 'var(--text-primary)' }}>No RAID Arrays</div>
                  <div style={{ fontSize: 'var(--font-size-sm)' }}>
                    Create a RAID array to combine disks for redundancy or performance.
                  </div>
                </div>
              </GlassPanel>
            )}

            {/* RAID array cards */}
            {raidArrays && raidArrays.length > 0 && raidArrays.map((arr, i) => (
              <GlassPanel key={arr.name} variant="medium" padding="lg"
                className={`animate-fade-in-up stagger-${i + 1}`}
                style={{ marginBottom: 'var(--space-3)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-3)' }}>
                  <div>
                    <h3 style={{ fontWeight: 600, color: 'var(--text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                      {arr.name}
                      <span style={{
                        fontSize: 'var(--font-size-xs)', padding: '2px 8px',
                        borderRadius: 'var(--radius-sm)', backgroundColor: 'rgba(99,102,241,0.15)',
                        color: '#818CF8'
                      }}>
                        {arr.level || arr.raidLevel || 'Unknown'}
                      </span>
                    </h3>
                    <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)' }}>
                      {arr.total || arr.size || 'Unknown size'}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                    <span style={{
                      padding: '4px 10px', borderRadius: 'var(--radius-sm)',
                      fontSize: 'var(--font-size-xs)', fontWeight: 500,
                      backgroundColor: `${getHealthColor(arr.status)}20`,
                      color: getHealthColor(arr.status)
                    }}>
                      {(arr.status || 'unknown').toUpperCase()}
                    </span>
                    <button className="btn btn--secondary btn--xs" onClick={() => handleStopArray(arr.name)}
                      disabled={actionLoading}>
                      Stop
                    </button>
                  </div>
                </div>

                {/* Sync progress if rebuilding */}
                {arr.syncProgress && arr.syncProgress < 100 && (
                  <div style={{ marginBottom: 'var(--space-3)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                      <span>Syncing...</span>
                      <span>{arr.syncProgress}%</span>
                    </div>
                    <div className="usage-bar">
                      <div className="usage-bar__fill usage-bar__fill--info" style={{ width: `${arr.syncProgress}%` }} />
                    </div>
                  </div>
                )}

                {/* Member disks */}
                {arr.devices && arr.devices.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
                    {arr.devices.map(d => {
                      const devName = typeof d === 'string' ? d : d.name;
                      const devStatus = typeof d === 'object' ? d.status : 'active';
                      return (
                        <div key={devName} style={{
                          display: 'flex', alignItems: 'center', gap: '6px',
                          padding: '4px 10px', borderRadius: 'var(--radius-sm)',
                          backgroundColor: 'rgba(255,255,255,0.04)',
                          fontSize: 'var(--font-size-xs)'
                        }}>
                          <StatusIndicator status={devStatus === 'active' ? 'online' : 'error'} />
                          <span style={{ color: 'var(--text-primary)' }}>{devName}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </GlassPanel>
            ))}
          </div>
        </div>
      </div>

      {/* ── Create RAID Modal ── */}
      {showCreateModal && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="modal modal--lg" onClick={e => e.stopPropagation()}>
            <div className="modal__header">
              <h3 className="modal__title">Create RAID Array</h3>
              <button className="modal__close" onClick={() => setShowCreateModal(false)}>✕</button>
            </div>
            <div className="modal__body">
              <div style={{ marginBottom: 'var(--space-4)', padding: 'var(--space-3)', backgroundColor: 'rgba(239,68,68,0.1)', borderRadius: 'var(--radius-sm)', color: '#FCA5A5' }}>
                ⚠ Creating a RAID array will DESTROY all data on the selected partitions.
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
                <div className="form-group">
                  <label className="form-label">Array Name</label>
                  <input className="form-input" value={raidName} onChange={e => setRaidName(e.target.value)}
                    placeholder="md0" />
                </div>
                <div className="form-group">
                  <label className="form-label">RAID Level</label>
                  <select className="form-input" value={raidLevel} onChange={e => setRaidLevel(e.target.value)}>
                    <option value="0">RAID 0 (Striping – min 2 disks)</option>
                    <option value="1">RAID 1 (Mirroring – min 2 disks)</option>
                    <option value="5">RAID 5 (Parity – min 3 disks)</option>
                    <option value="6">RAID 6 (Double Parity – min 4 disks)</option>
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">
                  Select Partitions ({selectedDevices.length} selected, min {getMinDevices(raidLevel)} required)
                </label>
                {availableDisks.length === 0 ? (
                  <div style={{ padding: 'var(--space-3)', color: '#F59E0B', fontSize: 'var(--font-size-sm)', backgroundColor: 'rgba(245,158,11,0.1)', borderRadius: 'var(--radius-sm)' }}>
                    No available partitions. Create partitions on non-system disks first.
                  </div>
                ) : (
                  <div style={{ maxHeight: '200px', overflowY: 'auto', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 'var(--radius-sm)' }}>
                    {availableDisks.map(d => (
                      <label key={d.device} style={{
                        display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
                        padding: 'var(--space-2) var(--space-3)',
                        cursor: 'pointer',
                        backgroundColor: selectedDevices.includes(d.device) ? 'rgba(99,102,241,0.1)' : 'transparent',
                        borderBottom: '1px solid rgba(255,255,255,0.04)'
                      }}>
                        <input type="checkbox" checked={selectedDevices.includes(d.device)}
                          onChange={() => toggleDevice(d.device)} />
                        <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{d.device}</span>
                        <span style={{ color: 'var(--text-secondary)', fontSize: 'var(--font-size-xs)' }}>
                          {d.size} {d.fstype ? `(${d.fstype})` : ''} on {d.parentDisk}
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </div>

              <div className="form-group">
                <label className="form-label">Type <code>YES_DESTROY_DATA</code> to confirm</label>
                <input className="form-input" value={createConfirm} onChange={e => setCreateConfirm(e.target.value)}
                  placeholder="YES_DESTROY_DATA" />
              </div>
            </div>
            <div className="modal__footer">
              <button className="btn btn--secondary" onClick={() => setShowCreateModal(false)}>Cancel</button>
              <button className="btn btn--danger" onClick={handleCreateRaid}
                disabled={createConfirm !== 'YES_DESTROY_DATA' || selectedDevices.length < getMinDevices(raidLevel)}>
                Create RAID {raidLevel}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
