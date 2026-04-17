import { useState, useEffect } from 'react';
import GlassPanel from '../../components/GlassPanel/GlassPanel';
import { useShareStore } from '../../stores';
import { smbService } from '../../services/share.service';
import './AddShareModal.css';

export default function AddShareModal({ onClose, onSuccess }) {
  const [name, setName] = useState('');
  const [basePath, setBasePath] = useState('');
  const [filesystem, setFilesystem] = useState('ext4');
  const [availablePaths, setAvailablePaths] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const { createShare } = useShareStore();

  // Load available filesystem paths
  useEffect(() => {
    smbService.getAvailablePaths()
      .then(paths => {
        setAvailablePaths(paths);
        if (paths.length > 0) {
          setBasePath(paths[0].path);
        }
      })
      .catch(() => {
        setAvailablePaths([{ path: '/mnt/storage', label: 'Storage Root' }]);
        setBasePath('/mnt/storage');
      });
  }, []);

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

    if (!/^[a-zA-Z0-9_-]{1,32}$/.test(name)) {
      setError('Name: 1-32 alphanumeric characters, underscores, or hyphens');
      setLoading(false);
      return;
    }

    if (!basePath) {
      setError('Please select a filesystem path');
      setLoading(false);
      return;
    }

    try {
      const result = await createShare({ name: name.trim(), basePath, filesystem });
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
            {error && (
              <div className="form-error">{error}</div>
            )}

            {/* Share Name */}
            <div className="form-group">
              <label className="form-label">Share Name</label>
              <input
                className="form-input"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. media, documents, backups"
                autoFocus
                disabled={loading}
              />
              <span className="form-hint">
                Alphanumeric, underscore, hyphen only. This will be the directory and share name.
              </span>
            </div>

            {/* Filesystem Path */}
            <div className="form-group">
              <label className="form-label">Filesystem</label>
              {availablePaths.length > 0 ? (
                <select
                  className="form-input"
                  value={basePath}
                  onChange={(e) => setBasePath(e.target.value)}
                  disabled={loading}
                >
                  {availablePaths.map(p => (
                    <option key={p.path} value={p.path}>
                      {p.label || p.path}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  className="form-input"
                  type="text"
                  value={basePath}
                  onChange={(e) => setBasePath(e.target.value)}
                  placeholder="/mnt/storage"
                  disabled={loading}
                />
              )}
              <span className="form-hint">
                The share directory will be created at: <code>{basePath}/{name || '...'}</code>
              </span>
            </div>

            {/* Filesystem Type */}
            <div className="form-group">
              <label className="form-label">Filesystem Type</label>
              <select
                className="form-input"
                value={filesystem}
                onChange={(e) => setFilesystem(e.target.value)}
                disabled={loading}
              >
                <option value="ext4">ext4</option>
                <option value="btrfs">Btrfs</option>
                <option value="xfs">XFS</option>
                <option value="zfs">ZFS</option>
              </select>
            </div>

            {/* Actions */}
            <div className="modal-actions">
              <button type="button" className="btn btn--secondary" onClick={onClose} disabled={loading}>
                Cancel
              </button>
              <button type="submit" className="btn btn--primary" disabled={loading}>
                {loading ? 'Creating...' : 'Create Share'}
              </button>
            </div>
          </form>
        </GlassPanel>
      </div>
    </div>
  );
}
