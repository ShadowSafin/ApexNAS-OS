import { useState, useEffect, useCallback } from 'react';
import TopBar from '../../components/TopBar/TopBar';
import GlassPanel from '../../components/GlassPanel/GlassPanel';
import Modal from '../../components/Modal/Modal';
import Toast, { useToast } from '../../components/Toast/Toast';
import { groupService, userService } from '../../services/user-management.service';
import './Groups.css';

export default function Groups() {
  const [groups, setGroups] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [expandedGroup, setExpandedGroup] = useState(null);
  const [showAddMember, setShowAddMember] = useState(null); // holds group name
  const [selectedUser, setSelectedUser] = useState('');
  const [newGroupName, setNewGroupName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);
  const { toasts, showToast, removeToast } = useToast();

  const loadData = useCallback(async () => {
    try {
      setError(null);
      const [groupData, userData] = await Promise.all([
        groupService.listGroups(),
        userService.listUsers()
      ]);
      setGroups(groupData);
      setAllUsers(userData);
    } catch (err) {
      setError(err.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleCreateGroup = async (e) => {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);
    try {
      await groupService.createGroup(newGroupName);
      showToast(`Group "${newGroupName}" created`, 'success');
      setNewGroupName('');
      setShowCreateModal(false);
      await loadData();
    } catch (err) {
      setFormError(err.data?.message || err.message || 'Failed to create group');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteGroup = async (name) => {
    if (!window.confirm(`Delete group "${name}"?`)) return;
    setSubmitting(true);
    try {
      await groupService.deleteGroup(name);
      showToast(`Group "${name}" deleted`, 'success');
      if (expandedGroup === name) setExpandedGroup(null);
      await loadData();
    } catch (err) {
      showToast(err.data?.message || err.message || 'Failed to delete group', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddMember = async (e) => {
    e.preventDefault();
    if (!selectedUser || !showAddMember) return;
    setFormError(null);
    setSubmitting(true);
    try {
      await groupService.addMember(showAddMember, selectedUser);
      showToast(`User "${selectedUser}" added to "${showAddMember}"`, 'success');
      setSelectedUser('');
      setShowAddMember(null);
      await loadData();
    } catch (err) {
      setFormError(err.data?.message || err.message || 'Failed to add member');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRemoveMember = async (group, username) => {
    if (!window.confirm(`Remove "${username}" from group "${group}"?`)) return;
    setSubmitting(true);
    try {
      await groupService.removeMember(group, username);
      showToast(`User "${username}" removed from "${group}"`, 'success');
      await loadData();
    } catch (err) {
      showToast(err.data?.message || err.message || 'Failed to remove member', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // Users not already in a group
  const getAvailableUsers = (groupName) => {
    const group = groups.find(g => g.name === groupName);
    if (!group) return allUsers;
    return allUsers.filter(u => !(group.members || []).includes(u.username));
  };

  if (loading) {
    return (
      <>
        <TopBar title="Groups" breadcrumbs={['Access Control', 'Groups']} />
        <div className="app-layout__content">
          <div className="groups-container">
            <div className="loading-state">
              <div className="loading-spinner" />
              Loading groups...
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <TopBar title="Groups" breadcrumbs={['Access Control', 'Groups']} />
      <div className="app-layout__content">
        <div className="groups-container">
          {error && (
            <div className="error-banner">
              <span><strong>Error:</strong> {error}</span>
              <button className="error-close" onClick={() => setError(null)}>×</button>
            </div>
          )}

          {/* Groups Section */}
          <section className="section animate-fade-in-up stagger-1">
            <div className="section__header">
              <div>
                <h2 className="section__title">System Groups</h2>
                <p className="section__subtitle">
                  {groups.length} group{groups.length !== 1 ? 's' : ''} — real Linux groups
                </p>
              </div>
              <button
                className="btn btn--primary"
                onClick={() => { setFormError(null); setNewGroupName(''); setShowCreateModal(true); }}
                id="btn-create-group"
              >
                + Create Group
              </button>
            </div>

            {groups.length === 0 ? (
              <GlassPanel variant="medium" padding="lg">
                <div className="empty-state">
                  <div className="empty-state__icon">👥</div>
                  <p>No groups configured</p>
                  <p className="empty-state__hint">Click "Create Group" to add your first group</p>
                </div>
              </GlassPanel>
            ) : (
              <div className="groups-list">
                {groups.map((group, i) => {
                  const isExpanded = expandedGroup === group.name;
                  return (
                    <GlassPanel
                      key={group.name}
                      variant="medium"
                      padding="none"
                      className={`group-card animate-fade-in-up stagger-${Math.min(i + 1, 8)}`}
                    >
                      <div
                        className={`group-card__header ${isExpanded ? 'group-card__header--expanded' : ''}`}
                        onClick={() => setExpandedGroup(isExpanded ? null : group.name)}
                      >
                        <div className="group-card__info">
                          <div className="group-card__icon">
                            <span>{group.name[0].toUpperCase()}</span>
                          </div>
                          <div>
                            <div className="group-card__name">{group.name}</div>
                            <div className="group-card__meta">
                              GID {group.gid} · {(group.members || []).length} member{(group.members || []).length !== 1 ? 's' : ''}
                            </div>
                          </div>
                        </div>
                        <div className="group-card__actions" onClick={e => e.stopPropagation()}>
                          <button
                            className="btn btn--sm btn--secondary"
                            onClick={() => { setFormError(null); setSelectedUser(''); setShowAddMember(group.name); }}
                            disabled={submitting}
                          >
                            + Member
                          </button>
                          <button
                            className="btn btn--sm btn--danger"
                            onClick={() => handleDeleteGroup(group.name)}
                            disabled={submitting}
                          >
                            Delete
                          </button>
                          <span className={`group-card__chevron ${isExpanded ? 'group-card__chevron--open' : ''}`}>▾</span>
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="group-card__body">
                          {(group.members || []).length === 0 ? (
                            <div className="group-members-empty">
                              No members in this group
                            </div>
                          ) : (
                            <div className="group-members">
                              {(group.members || []).map(member => (
                                <div key={member} className="member-chip">
                                  <span className="member-chip__avatar">{member[0].toUpperCase()}</span>
                                  <span className="member-chip__name">{member}</span>
                                  <button
                                    className="member-chip__remove"
                                    onClick={() => handleRemoveMember(group.name, member)}
                                    disabled={submitting}
                                    title={`Remove ${member}`}
                                  >
                                    ×
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </GlassPanel>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        {/* Create Group Modal */}
        <Modal
          isOpen={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          title="Create Group"
          footer={
            <div className="modal-actions">
              <button className="btn btn--secondary" onClick={() => setShowCreateModal(false)}>Cancel</button>
              <button className="btn btn--primary" onClick={handleCreateGroup} disabled={submitting}>
                {submitting ? 'Creating...' : 'Create Group'}
              </button>
            </div>
          }
        >
          <form onSubmit={handleCreateGroup} className="form-card" id="create-group-form">
            {formError && <div className="form-error">{formError}</div>}
            <div className="form-group">
              <label htmlFor="group-name" className="form-label">Group Name</label>
              <input
                id="group-name"
                type="text"
                className="form-input"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                placeholder="e.g. media-users"
                required
                disabled={submitting}
                autoFocus
              />
              <span className="form-hint">1-32 chars, starts with a letter. Letters, numbers, underscore, hyphen, or period</span>
            </div>
          </form>
        </Modal>

        {/* Add Member Modal */}
        <Modal
          isOpen={!!showAddMember}
          onClose={() => setShowAddMember(null)}
          title={`Add Member to "${showAddMember}"`}
          footer={
            <div className="modal-actions">
              <button className="btn btn--secondary" onClick={() => setShowAddMember(null)}>Cancel</button>
              <button className="btn btn--primary" onClick={handleAddMember} disabled={submitting || !selectedUser}>
                {submitting ? 'Adding...' : 'Add Member'}
              </button>
            </div>
          }
        >
          <form onSubmit={handleAddMember} className="form-card" id="add-member-form">
            {formError && <div className="form-error">{formError}</div>}
            <div className="form-group">
              <label htmlFor="member-select" className="form-label">Select User</label>
              {getAvailableUsers(showAddMember).length === 0 ? (
                <div className="form-empty-hint">All users are already in this group</div>
              ) : (
                <select
                  id="member-select"
                  className="form-input form-select"
                  value={selectedUser}
                  onChange={(e) => setSelectedUser(e.target.value)}
                  disabled={submitting}
                >
                  <option value="">Choose a user...</option>
                  {getAvailableUsers(showAddMember).map(u => (
                    <option key={u.username} value={u.username}>{u.username}</option>
                  ))}
                </select>
              )}
            </div>
          </form>
        </Modal>

        {/* Toasts */}
        <div className="toast-container">
          {toasts.map(t => (
            <Toast key={t.id} message={t.message} type={t.type} duration={t.duration} />
          ))}
        </div>
      </div>
    </>
  );
}
