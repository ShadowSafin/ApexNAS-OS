import './TopBar.css';

export default function TopBar({ title, breadcrumbs = [] }) {
  return (
    <header className="topbar" id="topbar">
      <div className="topbar__left">
        <h1 className="topbar__title">{title}</h1>
        {breadcrumbs.length > 0 && (
          <div className="topbar__breadcrumb">
            {breadcrumbs.map((crumb, i) => (
              <span key={i}>
                {i > 0 && <span className="topbar__breadcrumb-sep">›</span>}
                <span>{crumb}</span>
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="topbar__right">
        <div className="topbar__status">
          <span className="topbar__status-dot" />
          <span>All Systems Online</span>
        </div>
      </div>
    </header>
  );
}
