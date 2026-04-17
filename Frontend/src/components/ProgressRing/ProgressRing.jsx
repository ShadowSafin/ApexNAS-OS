import { useEffect, useState } from 'react';
import './ProgressRing.css';

export default function ProgressRing({
  value = 0,
  size = 100,
  strokeWidth = 6,
  color = 'var(--accent-primary)',
  label,
  showValue = true,
}) {
  const [offset, setOffset] = useState(0);
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  useEffect(() => {
    const timer = setTimeout(() => {
      const progress = Math.min(Math.max(value, 0), 100);
      setOffset(circumference - (progress / 100) * circumference);
    }, 100);
    return () => clearTimeout(timer);
  }, [value, circumference]);

  return (
    <div className="progress-ring" style={{ width: size, height: size }}>
      <svg className="progress-ring__svg" width={size} height={size}>
        <circle
          className="progress-ring__bg"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={strokeWidth}
        />
        <circle
          className="progress-ring__fill"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={strokeWidth}
          stroke={color}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="progress-ring__center">
        {showValue && <span className="progress-ring__value">{Math.round(value)}%</span>}
        {label && <span className="progress-ring__label">{label}</span>}
      </div>
    </div>
  );
}
