import './StatusIndicator.css';

export default function StatusIndicator({ status = 'online', label }) {
  return (
    <span className="status-indicator">
      <span className={`status-indicator__dot status-indicator__dot--${status}`} />
      {label && <span className="status-indicator__label">{label}</span>}
    </span>
  );
}
