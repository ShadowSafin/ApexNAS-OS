import { useState, useEffect } from 'react';
import GlassPanel from '../../components/GlassPanel/GlassPanel';
import { useShareStore } from '../../stores';
import apiClient from '../../services/api';
import './AddShareModal.css';

// ── Helpers ──────────────────────────────────────────────────────────
function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 1 ? 1 : 0)} ${units[i]}`;
}

function usagePercent(used, size) {
  if (!size || size <= 0) return 0;
  return Math.round((used / size) * 100);
}

export default function AddShareModal({ onClose, onSuccess }) {
  const [name, setName] = useState('');
  const [selectedFs, setSelectedFs] = useState('');
  const [filesystems, setFilesystems] = useState([]);
  const [fsLoading, setFsLoading] = useState(true);
  const [fsError, setFsError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const { createShare } = useShareStore();

  // ── Fetch mounted storage filesystems ──────────────────────────────
  useEffect(() => {
    const fetchFilesystems = async () => {
      setFsLoading(true);
      setFsError(null);
      try {
        const response = await apiClient.get('/filesystem/list');
        const all = response.data?.data || response.data?.filesystems || [];

        // Only show filesystems mounted under /mnt/storage
        const storage = all.filter(fs => fs.isStorage || fs.mountpoint?.startsWith('/mnt/storage'));

        setFilesystems(storage);

        if (storage.length > 0) {
          setSelectedFs(storage[0].mountpoint);
        }
      } catch (err) {
        setFsError('Failed to load filesystems. Ensure storage is mounted.');
        setFilesystems([]);
      } finally {
        setFsLoading(false);
      }
    };

    fetchFilesystems();
  }, []);

  // ── Derived state ──────────────────────────────────────────────────
  const selected = filesystems.find(fs => fs.mountpoint === selectedFs);
  const previewPath = selectedFs && name.trim()
    ? `${selectedFs}/${name.trim()}`
    : null;
  const noFilesystems = !fsLoading && filesystems.length === 0;

  // ── Submit ─────────────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    // Client-side validation
    if (!name.trim()) {
      setError('Share name is required');
      setLoading(false);
      return;
    }

    if (!/^[a-zA-Z0-9_-]{1,32}$/.test(name.trim())) {
      setError('Name: 1-32 alphanumeric characters, underscores, or hyphens only');
      setLoading(false);
      return;
    }

    if (!selectedFs) {
      setError('Please select a mounted filesystem');
      setLoading(false);
      return;
    }

    // Verify filesystem is still mounted
    const fs = filesystems.find(f => f.mountpoint === selectedFs);
    if (!fs) {
      setError('Selected filesystem is no longer available. Please refresh.');
      setLoading(false);
      return;
    }

    try {
      const result = await createShare({
        name: name.trim(),
        basePath: selectedFs,
        filesystem: fs.fstype || 'ext4'
      });

      if (result.success) {
        onSuccess();
      } else {
        setError(result.message || 'Failed to create share');
      }
    } catch (err) {
      setError(err.message || 'Failed to create share');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-container" onClick={(e) => e.stopPropagation()}>
        <GlassPanel variant="strong" padding="lg">
          <div className="modal-header">
            <h2 className="modal-title">Create Shared Folder</h2>
            <button className="modal-close" onClick={onClose}>×</button>
          </div>

          <form className="form-card" onSubmit={handleSubmit}>
            {error && <div className="form-error">{error}</div>}

            {/* ── Filesystem Selector ──────────────────── */}
            <div className="form-group">
              <label className="form-label">Filesystem</label>

              {fsLoading ? (
                <div className="fs-loading">
                  <span className="fs-loading__spinner" />
                  Detecting mounted filesystems...
                </div>
              ) : noFilesystems ? (
                <div className="fs-empty">
                  <div className="fs-empty__icon">💾</div>
                  <p className="fs-empty__title">No mounted filesystems</p>
                  <p className="fs-empty__hint">
                    Go to <strong>Storage → Filesystems</strong> to format a disk and mount it under <code>/mnt/storage</code> first.
                  </p>
                </div>
              ) : (
                <>
                  <select
                    className="form-input fs-select"
                    value={selectedFs}
                    onChange={(e) => setSelectedFs(e.target.value)}
                    disabled={loading}
                  >
                    {filesystems.map(fs => (
                      <option key={fs.mountpoint} value={fs.mountpoint}>
                        {fs.mountpoint} ({fs.fstype} — {formatBytes(fs.size)})
                      </option>
                    ))}
                  </select>

                  {/* Filesystem Info Card */}
                  {selected && (
                    <div className="fs-info-card">
                      <div className="fs-info-card__row">
                        <span className="fs-info-card__label">Device</span>
                        <span className="fs-info-card__value fs-info-card__mono">{selected.device}</span>
                      </div>
                      <div className="fs-info-card__row">
                        <span className="fs-info-card__label">Type</span>
                        <span className="fs-info-card__value">
                          <span className="fs-type-badge">{selected.fstype}</span>
                        </span>
                      </div>
                      <div className="fs-info-card__row">
                        <span className="fs-info-card__label">Usage</span>
                        <span className="fs-info-card__value">
                          {formatBytes(selected.used)} / {formatBytes(selected.size)}
                          <span className="fs-usage-pct"> ({usagePercent(selected.used, selected.size)}%)</span>
                        </span>
                      </div>
                      <div className="fs-usage-bar">
                        <div
                          className="fs-usage-bar__fill"
                          style={{ width: `${usagePercent(selected.used, selected.size)}%` }}
                        />
                      </div>
                      <div className="fs-info-card__row">
                        <span className="fs-info-card__label">Available</span>
                        <span className="fs-info-card__value fs-avail">{formatBytes(selected.available)}</span>
                      </div>
                    </div>
                  )}
                </>
              )}

              {fsError && <div className="form-error" style={{ marginTop: 'var(--space-2)' }}>{fsError}</div>}
            </div>

            {/* ── Share Name ──────────────────────────── */}
            <div className="form-group">
              <label className="form-label">Share Name</label>
              <input
                className="form-input"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. media, documents, backups"
                autoFocus
                disabled={loading || noFilesystems}
              />
              <span className="form-hint">
                Alphanumeric, underscore, hyphen only. This will be the directory and share name.
              </span>
            </div>

            {/* ── Path Preview ────────────────────────── */}
            {previewPath && (
              <div className="path-preview">
                <span className="path-preview__label">Share will be created at:</span>
                <code className="path-preview__path">{previewPath}</code>
              </div>
            )}

            {/* ── Actions ─────────────────────────────── */}
            <div className="modal-actions">
              <button
                type="button"
                className="btn btn--secondary"
                onClick={onClose}
                disabled={loading}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn--primary"
                disabled={loading || noFilesystems || !name.trim()}
              >
                {loading ? 'Creating...' : 'Create Share'}
              </button>
            </div>
          </form>
        </GlassPanel>
      </div>
    </div>
  );
}
