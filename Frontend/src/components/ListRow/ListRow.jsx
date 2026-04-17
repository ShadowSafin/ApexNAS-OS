import { useState } from 'react';
import './ListRow.css';

export default function ListRow({
  icon,
  title,
  subtitle,
  meta = [],
  expandable = false,
  details,
  onClick,
  className = '',
}) {
  const [expanded, setExpanded] = useState(false);

  const handleClick = () => {
    if (expandable) setExpanded(!expanded);
    if (onClick) onClick();
  };

  return (
    <div className={className}>
      <div
        className={`list-row ${expanded ? 'list-row--expanded' : ''}`}
        onClick={handleClick}
        role={expandable ? 'button' : undefined}
        tabIndex={expandable ? 0 : undefined}
      >
        {icon && <div className="list-row__icon">{icon}</div>}
        <div className="list-row__content">
          <div className="list-row__title">{title}</div>
          {subtitle && <div className="list-row__subtitle">{subtitle}</div>}
        </div>
        {meta.length > 0 && (
          <div className="list-row__meta">
            {meta.map((m, i) => (
              <div key={i} className="list-row__meta-item">
                <div className="list-row__meta-value">{m.value}</div>
                <div className="list-row__meta-label">{m.label}</div>
              </div>
            ))}
          </div>
        )}
        {expandable && <span className="list-row__chevron">▸</span>}
      </div>
      {expanded && details && (
        <div className="list-row__details">{details}</div>
      )}
    </div>
  );
}
