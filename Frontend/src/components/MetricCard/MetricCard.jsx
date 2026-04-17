import './MetricCard.css';

export default function MetricCard({
  label,
  value,
  unit,
  subtitle,
  icon,
  children,
  className = '',
}) {
  return (
    <div className={`metric-card ${className}`}>
      <div className="metric-card__header">
        <span className="metric-card__label">{label}</span>
        {icon && <span className="metric-card__icon">{icon}</span>}
      </div>
      <div className="metric-card__value">
        {value}
        {unit && <span className="metric-card__unit">{unit}</span>}
      </div>
      {subtitle && <div className="metric-card__sub">{subtitle}</div>}
      {children && <div className="metric-card__chart">{children}</div>}
    </div>
  );
}
