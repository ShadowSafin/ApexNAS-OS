import './Toggle.css';

export default function Toggle({ active, onChange, label, id }) {
  return (
    <div
      className={`toggle ${active ? 'toggle--active' : ''}`}
      onClick={() => onChange && onChange(!active)}
      role="switch"
      aria-checked={active}
      id={id}
      tabIndex={0}
    >
      <div className="toggle__track">
        <div className="toggle__knob" />
      </div>
      {label && <span className="toggle__label">{label}</span>}
    </div>
  );
}
