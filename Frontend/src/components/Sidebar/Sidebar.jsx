import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import authService from '../../services/auth.service';
import './Sidebar.css';

const NAV_ITEMS = [
  { label: 'Dashboard', path: '/', icon: '⬡' },
  { section: 'Storage' },
  { label: 'Disks', path: '/storage', icon: '⛁' },

  { label: 'Filesystems', path: '/filesystems', icon: '⬢' },
  { section: 'Services' },
  { label: 'Shares', path: '/shares', icon: '⬡' },
  { label: 'SMB / NFS', path: '/smb-nfs', icon: '⬡' },
  { label: 'FTP', path: '/ftp', icon: '⬡' },
  // { section: 'Container Management' },
  // { label: 'Containers', path: '/apps', icon: '⬡' },
  { section: 'Access Control' },
  { label: 'Users', path: '/users', icon: '⬡' },
  { label: 'Groups', path: '/groups', icon: '⬡' },
  { section: 'Administration' },
  { label: 'System', path: '/system', icon: '⚙' },
];

export default function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const currentUser = authService.getCurrentUser();

  const handleLogout = () => {
    const refreshToken = localStorage.getItem('refresh_token');
    authService.logout(refreshToken).catch(() => {
      // Ignore errors, just clear the tokens
    }).finally(() => {
      navigate('/login');
    });
  };

  return (
    <aside className="sidebar" id="sidebar-nav">
      <div className="sidebar__header">
        <div className="sidebar__logo">N</div>
        <div>
          <div className="sidebar__title">NAS-OS</div>
          <div className="sidebar__subtitle">System Manager</div>
        </div>
      </div>

      <nav className="sidebar__nav" role="navigation" aria-label="Main navigation">
        {NAV_ITEMS.map((item, i) => {
          if (item.section) {
            return (
              <div key={`section-${i}`} className="sidebar__section-label">
                {item.section}
              </div>
            );
          }

          const isActive = location.pathname === item.path;

          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={`sidebar-item ${isActive ? 'sidebar-item--active' : ''}`}
              id={`nav-${item.label.toLowerCase().replace(/[\s\/]/g, '-')}`}
            >
              <span className="sidebar-item__icon">{item.icon}</span>
              <span className="sidebar-item__label">{item.label}</span>
            </NavLink>
          );
        })}
      </nav>

      <div className="sidebar__footer">
        <div className="sidebar__user-info">
          <span className="sidebar__user-name">{currentUser?.username || 'User'}</span>
          <button className="sidebar__logout-btn" onClick={handleLogout} aria-label="Logout">
            Logout
          </button>
        </div>
        <span className="sidebar__version">NAS-OS v1.0.0</span>
      </div>
    </aside>
  );
}
