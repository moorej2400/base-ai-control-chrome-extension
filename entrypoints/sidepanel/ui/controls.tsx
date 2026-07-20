import type { ReactNode } from 'react';

/** Range slider with focused/broad end labels, matching the mock. */
export function Slider({
  min,
  max,
  step = 1,
  value,
  onChange,
  leftLabel,
  rightLabel,
}: {
  min: number;
  max: number;
  step?: number;
  value: number;
  onChange: (next: number) => void;
  leftLabel?: string;
  rightLabel?: string;
}) {
  return (
    <>
      <input
        type="range"
        className="slider"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      {(leftLabel || rightLabel) && (
        <div className="slider-scale">
          <span>{leftLabel}</span>
          <span>{rightLabel}</span>
        </div>
      )}
    </>
  );
}

export interface SegmentOption<T extends string> {
  value: T;
  label: ReactNode;
}

/** Segmented control. `bare` matches the scope row (This page / All pages). */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  bare,
}: {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  bare?: boolean;
}) {
  return (
    <div className={`segmented${bare ? ' bare' : ''}`}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          data-on={o.value === value}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Small mono pill. `variant` switches to the accent / risk treatments. */
export function Badge({
  children,
  variant,
}: {
  children: ReactNode;
  variant?: 'accent' | 'risk';
}) {
  const cls = [
    'badge',
    variant === 'accent' && 'badge-accent',
    variant === 'risk' && 'badge-risk',
  ]
    .filter(Boolean)
    .join(' ');
  return <span className={cls}>{children}</span>;
}
