import { useEffect, useState, useCallback } from 'react';
import TopBar from '../../components/TopBar/TopBar';
import GlassPanel from '../../components/GlassPanel/GlassPanel';
import { useShareStore } from '../../stores';
import AddShareModal from './AddShareModal';
import PermissionsEditor from './PermissionsEditor';
import './Shares.css';

// ── Copy-to-clipboard helper ─────────────────────────────────────────
function useCopyToClipboard() {
  const [copiedKey, setCopiedKey] = useState(null);
  const copy = useCallback((text, key) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    });
  }, []);
  return { copiedKey, copy };
}

// ── Toggle Switch Component ──────────────────────────────────────────
function ToggleSwitch({ on, onChange, disabled }) {
  return (
    <div
      className={`toggle-switch ${on ? 'toggle-switch--on' : ''}`}
      onClick={() => !disabled && onChange(!on)}
      style={{ opacity: disabled ? 0.5 : 1, cursor: disabled ? 'not-allowed' : 'pointer' }}
    >
      <div className="toggle-switch__knob" />
    </div>
  );
}

// ── Service Toggle Row ───────────────────────────────────────────────
function ServiceToggle({ label, protocol, enabled, config, onToggle, onConfigChange, children }) {
  return (
    <div className={`service-toggle ${enabled ? 'service-toggle--active' : ''}`}>
      <div className="service-toggle__header">
        <span className="service-toggle__label">
          {label}
          <span className="service-toggle__protocol">{protocol}</span>
        </span>
        <ToggleSwitch on={enabled} onChange={(val) => onToggle(val)} />
      </div>
      {enabled && children && (
        <div className="service-options">
          {children}
        </div>
      )}
    </div>
  );
}

// ── Access Endpoint Row ──────────────────────────────────────────────
function AccessEndpoint({ protocol, url, copiedKey, onCopy }) {
  const key = `${protocol}-${url}`;
  const isCopied = copiedKey === key;
  return (
    <div className="access-endpoint">
      <span className="access-endpoint__protocol">{protocol}</span>
      <span className="access-endpoint__url">{url}</span>
      <button
        className={`access-endpoint__copy ${isCopied ? 'access-endpoint__copy--copied' : ''}`}
        onClick={() => onCopy(url, key)}
      >
        {isCopied ? '✓' : 'Copy'}
      </button>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
//  SHARE CARD — the core UI for each share
// ══════════════════════════════════════════════════════════════════════

function ShareCard({ share, isExpanded, onToggleExpand, onDelete, updateServices, fetchShares }) {
  const { copiedKey, copy } = useCopyToClipboard();
  const [saving, setSaving] = useState(false);

  const smb = share.services?.smb || {};
  const nfs = share.services?.nfs || {};
  const ftp = share.services?.ftp || {};
  const access = share.access || {};

  const handleServiceToggle = async (service, enabled, extraConfig = {}) => {
    setSaving(true);
    try {
      const update = {};
      update[service] = { enabled, ...extraConfig };
      await updateServices(share.name, update);
    } catch { /* error handled by store */ }
    finally { setSaving(false); }
  };

  const handleConfigChange = async (service, configKey, value) => {
    setSaving(true);
    try {
      const update = {};
      update[service] = { [configKey]: value };
      await updateServices(share.name, update);
    } catch { /* error handled by store */ }
    finally { setSaving(false); }
  };

  const hasEndpoints = access.smb || access.nfs || access.ftp;

  return (
    <GlassPanel className="share-card" padding="md">
      {/* ── Header ─────────────────────────────────────── */}
      <div className="share-card__header" onClick={onToggleExpand}>
        <div className="share-card__identity">
          <div className="share-card__icon">📁</div>
          <div>
            <h3 className="share-card__name">{share.name}</h3>
            <div className="share-card__path">
              {share.path}
              <span className="share-card__fs-badge">{share.filesystem || 'ext4'}</span>
            </div>
          </div>
        </div>

        <div className="share-card__meta">
          <div className="service-badges">
            <span className={`service-badge ${smb.enabled ? 'service-badge--active' : 'service-badge--inactive'}`}>SMB</span>
            <span className={`service-badge ${nfs.enabled ? 'service-badge--active' : 'service-badge--inactive'}`}>NFS</span>
            <span className={`service-badge ${ftp.enabled ? 'service-badge--active' : 'service-badge--inactive'}`}>FTP</span>
          </div>
          <span className={`share-card__chevron ${isExpanded ? 'share-card__chevron--open' : ''}`}>▼</span>
        </div>
      </div>

      {/* ── Expanded Body ──────────────────────────────── */}
      {isExpanded && (
        <div className="share-card__body">
          <div className="share-card__grid">

            {/* ── LEFT COLUMN: Services + Access ───────── */}
            <div>
              <h4 className="share-section__title">Protocol Services</h4>
              <div className="service-toggles">

                {/* SMB */}
                <ServiceToggle
                  label="SMB / CIFS"
                  protocol="Port 445"
                  enabled={smb.enabled}
                  onToggle={(val) => handleServiceToggle('smb', val)}
                >
                  <div className="service-option">
                    <label>
                      <input
                        type="checkbox"
                        checked={smb.readOnly || false}
                        onChange={(e) => handleConfigChange('smb', 'readOnly', e.target.checked)}
                      />
                      Read Only
                    </label>
                  </div>
                  <div className="service-option">
                    <label>
                      <input
                        type="checkbox"
                        checked={smb.guestOk || false}
                        onChange={(e) => handleConfigChange('smb', 'guestOk', e.target.checked)}
                      />
                      Guest Access
                    </label>
                  </div>
                  <div className="service-option">
                    <label>
                      <input
                        type="checkbox"
                        checked={smb.browseable !== false}
                        onChange={(e) => handleConfigChange('smb', 'browseable', e.target.checked)}
                      />
                      Browseable
                    </label>
                  </div>
                </ServiceToggle>

                {/* NFS */}
                <ServiceToggle
                  label="NFS"
                  protocol="Port 2049"
                  enabled={nfs.enabled}
                  onToggle={(val) => handleServiceToggle('nfs', val)}
                >
                  <div className="service-option">
                    <span>Subnet:</span>
                    <input
                      className="service-option__input"
                      type="text"
                      value={nfs.subnet || '192.168.1.0/24'}
                      onChange={(e) => handleConfigChange('nfs', 'subnet', e.target.value)}
                      placeholder="192.168.1.0/24"
                    />
                  </div>
                  <div className="service-option">
                    <span>Mode:</span>
                    <select
                      className="service-option__select"
                      value={nfs.mode || 'rw'}
                      onChange={(e) => handleConfigChange('nfs', 'mode', e.target.value)}
                    >
                      <option value="rw">Read/Write</option>
                      <option value="ro">Read Only</option>
                    </select>
                  </div>
                </ServiceToggle>

                {/* FTP */}
                <ServiceToggle
                  label="FTP"
                  protocol="Port 21"
                  enabled={ftp.enabled}
                  onToggle={(val) => handleServiceToggle('ftp', val)}
                >
                  <div className="service-option">
                    <span>Mode:</span>
                    <select
                      className="service-option__select"
                      value={ftp.mode || 'rw'}
                      onChange={(e) => handleConfigChange('ftp', 'mode', e.target.value)}
                    >
                      <option value="rw">Read/Write</option>
                      <option value="ro">Read Only</option>
                    </select>
                  </div>
                </ServiceToggle>
              </div>

              {/* ── Access Endpoints ──────────────────────── */}
              <h4 className="share-section__title" style={{ marginTop: 'var(--space-5)' }}>Access Endpoints</h4>
              {hasEndpoints ? (
                <div className="access-endpoints">
                  {access.smb && <AccessEndpoint protocol="SMB" url={access.smb} copiedKey={copiedKey} onCopy={copy} />}
                  {access.nfs && <AccessEndpoint protocol="NFS" url={access.nfs} copiedKey={copiedKey} onCopy={copy} />}
                  {access.ftp && <AccessEndpoint protocol="FTP" url={access.ftp} copiedKey={copiedKey} onCopy={copy} />}
                </div>
              ) : (
                <div className="no-endpoints">Enable a protocol above to generate access endpoints</div>
              )}
            </div>

            {/* ── RIGHT COLUMN: Permissions ─────────────── */}
            <div>
              <h4 className="share-section__title">Permissions (ACL)</h4>
              <PermissionsEditor
                sharePath={share.path}
                onUpdate={fetchShares}
              />
            </div>
          </div>

          {/* ── Actions ────────────────────────────────── */}
          <div className="share-actions">
            <button className="btn btn--secondary btn--sm" onClick={fetchShares} disabled={saving}>
              Refresh
            </button>
            <button className="btn btn--danger btn--sm" onClick={() => onDelete(share.name)} disabled={saving}>
              Delete Share
            </button>
          </div>
        </div>
      )}
    </GlassPanel>
  );
}

// ══════════════════════════════════════════════════════════════════════
//  SHARES PAGE
// ══════════════════════════════════════════════════════════════════════

export default function Shares() {
  const [showAddModal, setShowAddModal] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [error, setError] = useState(null);

  const {
    shares,
    sharesLoading,
    sharesError,
    fetchShares,
    deleteShare,
    updateServices
  } = useShareStore();

  useEffect(() => {
    fetchShares().catch(err => setError(err.message));
  }, [fetchShares]);

  const handleDelete = async (name) => {
    if (!window.confirm(`Delete share "${name}"? This will detach all protocols. The directory will NOT be removed.`)) return;
    try {
      await deleteShare(name);
    } catch (err) {
      setError(err.message || 'Failed to delete share');
    }
  };

  const displayError = error || sharesError;

  return (
    <>
      <TopBar title="Shared Folders" breadcrumbs={['Storage', 'Shares']} />
      <div className="app-layout__content">
        <div className="shares-page">

          {/* ── Header ─────────────────────────────────── */}
          <div className="section__header" style={{ marginBottom: 'var(--space-5)' }}>
            <div>
              <h2 className="section__title">Shared Folders</h2>
              <p className="section__subtitle">
                {sharesLoading
                  ? 'Loading...'
                  : `${shares?.length || 0} share${(shares?.length || 0) !== 1 ? 's' : ''} configured`
                }
              </p>
            </div>
            <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
              <button className="btn btn--secondary" onClick={() => fetchShares()} disabled={sharesLoading}>
                ↻ Refresh
              </button>
              <button className="btn btn--primary" onClick={() => setShowAddModal(true)}>
                + Create Share
              </button>
            </div>
          </div>

          {/* ── Error ──────────────────────────────────── */}
          {displayError && (
            <div className="shares-error">
              <span><strong>Error:</strong> {displayError}</span>
              <button className="error-close" onClick={() => setError(null)}>×</button>
            </div>
          )}

          {/* ── Loading ────────────────────────────────── */}
          {sharesLoading && (!shares || shares.length === 0) && (
            <GlassPanel padding="lg">
              <div className="shares-loading">Loading shares...</div>
            </GlassPanel>
          )}

          {/* ── Empty ──────────────────────────────────── */}
          {!sharesLoading && (!shares || shares.length === 0) && (
            <GlassPanel padding="lg">
              <div className="shares-empty">
                <div className="shares-empty__icon">📂</div>
                <p>No shared folders configured</p>
                <p style={{ fontSize: 'var(--font-size-sm)', marginTop: 'var(--space-2)' }}>
                  Create a share to get started with file sharing
                </p>
              </div>
            </GlassPanel>
          )}

          {/* ── Share Cards ────────────────────────────── */}
          {shares?.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              {shares.map((share, i) => (
                <div key={share.id || share.name} className={`animate-fade-in-up stagger-${Math.min(i + 1, 5)}`}>
                  <ShareCard
                    share={share}
                    isExpanded={expandedId === (share.id || share.name)}
                    onToggleExpand={() => setExpandedId(
                      expandedId === (share.id || share.name) ? null : (share.id || share.name)
                    )}
                    onDelete={handleDelete}
                    updateServices={updateServices}
                    fetchShares={fetchShares}
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Add Share Modal ──────────────────────────── */}
        {showAddModal && (
          <AddShareModal
            onClose={() => setShowAddModal(false)}
            onSuccess={() => {
              setShowAddModal(false);
              fetchShares();
            }}
          />
        )}
      </div>
    </>
  );
}
