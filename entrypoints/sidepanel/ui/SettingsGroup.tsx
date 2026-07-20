import type { ReactNode } from 'react';
import Icon, { type IconName } from './Icon';

/** Mono uppercase section header. Optional trailing nodes (e.g. a BETA badge). */
export function SectionLabel({
  children,
  flush,
}: {
  children: ReactNode;
  flush?: boolean;
}) {
  return (
    <div className={`section-label${flush ? ' flush' : ''}`}>{children}</div>
  );
}

/** Bordered, rounded container that hosts a stack of <Row>s. */
export function Group({ children }: { children: ReactNode }) {
  return <div className="group">{children}</div>;
}

/**
 * A single settings/list row. Pass either a glyph char (`iconGlyph` like "◆")
 * or an `icon` name with `iconTint`; provide `value`/`right` for the trailing
 * content and `onClick` to make it navigable (adds a chevron unless `right` is
 * given).
 */
export function Row({
  icon,
  iconGlyph,
  iconTint,
  iconColor,
  title,
  sub,
  value,
  valueMono,
  right,
  chevron,
  onClick,
}: {
  icon?: IconName;
  iconGlyph?: string;
  iconTint?: string;
  iconColor?: string;
  title: ReactNode;
  sub?: ReactNode;
  value?: ReactNode;
  valueMono?: boolean;
  right?: ReactNode;
  chevron?: boolean;
  onClick?: () => void;
}) {
  const hasIcon = icon || iconGlyph;
  return (
    <div
      className={`row${onClick ? ' clickable' : ''}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
    >
      {hasIcon && (
        <span
          className="row-icon"
          style={{ background: iconTint, color: iconColor }}
        >
          {icon ? <Icon name={icon} size={14} /> : iconGlyph}
        </span>
      )}
      <div className="row-grow">
        <div className="row-title">{title}</div>
        {sub && <div className="row-sub">{sub}</div>}
      </div>
      {value != null && (
        <span className={`row-value${valueMono ? ' mono' : ''}`}>{value}</span>
      )}
      {right}
      {chevron && <Icon name="chevron-right" size={13} color="var(--dim)" strokeWidth={2.2} />}
    </div>
  );
}
