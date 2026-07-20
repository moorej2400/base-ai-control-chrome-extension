import type { CSSProperties } from 'react';
import Icon from '../ui/Icon';

/**
 * Positions a fixed popover under an anchor rect, flipping above it when there
 * isn't room below. Shared by the composer's model popup and the MODE/STYLE/
 * PRESET quick menus so they line up identically.
 */
export function anchoredMenuStyle(
  anchor: DOMRect | null,
  opts: { minWidth?: number; maxH?: number } = {},
): CSSProperties {
  if (!anchor) return { display: 'none' };
  const width = Math.max(anchor.width, opts.minWidth ?? 190);
  const maxH = opts.maxH ?? 300;
  const spaceBelow = window.innerHeight - anchor.bottom;
  if (spaceBelow < 240) {
    return {
      left: anchor.left,
      bottom: window.innerHeight - anchor.top + 6,
      width,
      maxHeight: Math.max(160, anchor.top - 12),
    };
  }
  return {
    left: anchor.left,
    top: anchor.bottom + 6,
    width,
    maxHeight: Math.min(maxH, spaceBelow - 12),
  };
}

export interface QuickMenuItem {
  key: string;
  label: string;
  sub?: string;
  hue?: number;
  selected?: boolean;
}

/**
 * A lightweight anchored dropdown reusing the model-menu styling. Used for the
 * short MODE/STYLE/PRESET lists; the model picker keeps its own animated menu.
 */
export default function QuickMenu({
  anchor,
  items,
  onPick,
  onClose,
  empty = 'Nothing to choose.',
}: {
  anchor: DOMRect | null;
  items: QuickMenuItem[];
  onPick: (key: string) => void;
  onClose: () => void;
  empty?: string;
}) {
  if (!anchor) return null;
  return (
    <>
      <div className="model-menu-backdrop" onClick={onClose} />
      <div
        className="model-menu jc-scroll"
        data-phase="open"
        style={anchoredMenuStyle(anchor)}
      >
        {items.length === 0 ? (
          <div style={{ padding: '10px 8px', fontSize: 11.5, color: 'var(--faint)' }}>
            {empty}
          </div>
        ) : (
          items.map((it) => (
            <button
              key={it.key}
              className="model-menu-item"
              data-selected={it.selected}
              onClick={() => onPick(it.key)}
            >
              {it.hue != null && (
                <span className="dot" style={{ background: `oklch(0.70 0.13 ${it.hue})` }} />
              )}
              <span className="grow">
                <span className="label">{it.label}</span>
                {it.sub && <span className="sub">{it.sub}</span>}
              </span>
              {it.selected && (
                <Icon name="check" size={13} color="var(--accent-text)" strokeWidth={2.6} />
              )}
            </button>
          ))
        )}
      </div>
    </>
  );
}
