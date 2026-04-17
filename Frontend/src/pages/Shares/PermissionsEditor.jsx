import { useState, useEffect } from 'react';
import GlassPanel from '../../components/GlassPanel/GlassPanel';
import { aclService, userService, groupService } from '../../services/user-management.service';
import './PermissionsEditor.css';

/**
 * PermissionsEditor
 * 
 * Embeddable ACL permission editor for a given share/path.
 * Shows current ACLs, allows adding/removing user/group entries.
 */
export default function PermissionsEditor({ sharePath, onUpdate }) {
  const [entries, setEntries] = useState([]);
  const [defaults, setDefaults] = useState([]);
  const [owner, setOwner] = useState('');
  const [ownerGroup, setOwnerGroup] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  // Add entry form
  const [showAddForm, setShowAddForm] = useState(false);
  const [addType, setAddType] = useState('user'); // 'user' or 'group'
  const [addTarget, setAddTarget] = useState('');
  const [addLevel, setAddLevel] = useState('rx');

  // Dropdown data
  const [allUsers, setAllUsers] = useState([]);
  const [allGroups, setAllGroups] = useState([]);

  const loadACL = async () => {
    if (!sharePath) return;
    try {
      setError(null);
      setLoading(true);
      const result = await aclService.getPermissions(sharePath);
      if (result.success) {
        setEntries(result.entries || []);
        setDefaults(result.defaults || []);
        setOwner(result.owner || '');
        setOwnerGroup(result.ownerGroup || '');
      } else {
        setError(result.message || 'Failed to load ACL');
      }
    } catch (err) {
      setError(err.message || 'Failed to load permissions');
    } finally {
      setLoading(false);
    }
  };

  const loadDropdownData = async () => {
    try {
      const [users, groups] = await Promise.all([
        userService.listUsers(),
        groupService.listGroups()
      ]);
      setAllUsers(users);
      setAllGroups(groups);
    } catch {
      // Non-fatal — dropdown just won't be populated
    }
  };

  useEffect(() => {
    loadACL();
    loadDropdownData();
  }, [sharePath]);

  const handleAddEntry = async (e) => {
    e.preventDefault();
    if (!addTarget) return;
    setSaving(true);
    setError(null);
    try {
      let result;
      if (addType === 'user') {
        result = await aclService.setUserPermissions(sharePath, addTarget, addLevel, true);
      } else {
        result = await aclService.setGroupPermissions(sharePath, addTarget, addLevel, true);
      }
      if (result.success) {
        await loadACL();
        setShowAddForm(false);
        setAddTarget('');
        setAddLevel('rx');
        onUpdate?.();
      } else {
        setError(result.message);
      }
    } catch (err) {
      setError(err.message || 'Failed to set permission');
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveEntry = async (entry) => {
    setSaving(true);
    setError(null);
    try {
      let result;
      if (entry.type === 'user') {
        result = await aclService.removeUserPermissions(sharePath, entry.qualifier, true);
      } else if (entry.type === 'group') {
        result = await aclService.removeGroupPermissions(sharePath, entry.qualifier, true);
      }
      if (result?.success) {
        await loadACL();
        onUpdate?.();
      } else {
        setError(result?.message || 'Failed to remove');
      }
    } catch (err) {
      setError(err.message || 'Failed to remove permission');
    } finally {
      setSaving(false);
    }
  };

  const permLabel = (perms) => {
    if (!perms || perms === '---') return 'None';
    const r = perms.includes('r');
    const w = perms.includes('w');
    const x = perms.includes('x');
    if (r && w && x) return 'Full (rwx)';
    if (r && w) return 'Read/Write (rw-)';
    if (r && x) return 'Read (r-x)';
    if (r) return 'Read Only (r--)';
    return perms;
  };

  const permClass = (perms) => {
    if (!perms || perms === '---') return 'perm-none';
    if (perms.includes('w')) return 'perm-write';
    if (perms.includes('r')) return 'perm-read';
    return 'perm-none';
  };

  if (!sharePath) {
    return null;
  }

  if (loading) {
    return (
      <GlassPanel variant="subtle" padding="md">
        <div className="perm-loading">Loading permissions...</div>
      </GlassPanel>
    );
  }

  // Filter to only named user/group entries (skip owner/mask/other)
  const namedEntries = entries.filter(e =>
    (e.type === 'user' || e.type === 'group') && e.qualifier
  );

  return (
    <div className="perm-editor">
      {error && (
        <div className="perm-error">
          {error}
          <button className="perm-error__close" onClick={() => setError(null)}>×</button>
        </div>
      )}

      {/* Owner info */}
      <div className="perm-owner-row">
        <span className="perm-owner-label">Owner:</span>
        <span className="perm-owner-value">{owner}</span>
        <span className="perm-owner-sep">·</span>
        <span className="perm-owner-label">Group:</span>
        <span className="perm-owner-value">{ownerGroup}</span>
      </div>

      {/* ACL entries table */}
      {namedEntries.length > 0 ? (
        <div className="perm-table-wrap">
          <table className="perm-table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Name</th>
                <th>Access</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {namedEntries.map((entry, i) => (
                <tr key={`${entry.type}-${entry.qualifier}-${i}`}>
                  <td>
                    <span className={`perm-type-badge perm-type-badge--${entry.type}`}>
                      {entry.type === 'user' ? '👤' : '👥'} {entry.type}
                    </span>
                  </td>
                  <td className="perm-name">{entry.qualifier}</td>
                  <td>
                    <span className={`perm-level ${permClass(entry.permissions)}`}>
                      {permLabel(entry.permissions)}
                    </span>
                  </td>
                  <td>
                    <button
                      className="perm-remove-btn"
                      onClick={() => handleRemoveEntry(entry)}
                      disabled={saving}
                      title="Remove ACL"
                    >
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="perm-empty">No user/group ACL entries</div>
      )}

      {/* Add entry */}
      {showAddForm ? (
        <form className="perm-add-form" onSubmit={handleAddEntry}>
          <div className="perm-add-row">
            <select
              className="perm-select"
              value={addType}
              onChange={(e) => { setAddType(e.target.value); setAddTarget(''); }}
            >
              <option value="user">User</option>
              <option value="group">Group</option>
            </select>

            <select
              className="perm-select perm-select--wide"
              value={addTarget}
              onChange={(e) => setAddTarget(e.target.value)}
            >
              <option value="">Select {addType}...</option>
              {addType === 'user'
                ? allUsers.map(u => <option key={u.username} value={u.username}>{u.username}</option>)
                : allGroups.map(g => <option key={g.name} value={g.name}>{g.name}</option>)
              }
            </select>

            <select
              className="perm-select"
              value={addLevel}
              onChange={(e) => setAddLevel(e.target.value)}
            >
              <option value="rx">Read (r-x)</option>
              <option value="rwx">Full (rwx)</option>
              <option value="r">Read Only (r--)</option>
              <option value="">None (---)</option>
            </select>
          </div>
          <div className="perm-add-actions">
            <button type="button" className="btn btn--sm btn--secondary" onClick={() => setShowAddForm(false)}>
              Cancel
            </button>
            <button type="submit" className="btn btn--sm btn--primary" disabled={saving || !addTarget}>
              {saving ? 'Saving...' : 'Apply'}
            </button>
          </div>
        </form>
      ) : (
        <button
          className="perm-add-btn"
          onClick={() => setShowAddForm(true)}
        >
          + Add Permission Entry
        </button>
      )}
    </div>
  );
}
