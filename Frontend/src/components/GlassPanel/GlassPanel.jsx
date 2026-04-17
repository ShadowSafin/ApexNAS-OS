import './GlassPanel.css';

export default function GlassPanel({
  children,
  variant = 'medium',
  padding = 'md',
  hoverable = false,
  className = '',
  style,
  onClick,
  ...props
}) {
  const classes = [
    'glass-panel',
    `glass-panel--${variant}`,
    `glass-panel--pad-${padding}`,
    hoverable && 'glass-panel--hoverable',
    className,
  ].filter(Boolean).join(' ');

  return (
    <div className={classes} style={style} onClick={onClick} {...props}>
      {children}
    </div>
  );
}
