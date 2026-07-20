import type { ReactNode } from 'react';
import { IconButton } from '../ui/Button';

/**
 * The per-screen header row (below the always-on app header). Shows an optional
 * back chevron, the title, and optional trailing actions.
 */
export default function ScreenHeader({
  title,
  onBack,
  right,
  tight,
}: {
  title: string;
  onBack?: () => void;
  right?: ReactNode;
  tight?: boolean;
}) {
  return (
    <div className={`screen-head${tight ? ' tight' : ''}`}>
      {onBack && (
        <IconButton name="chevron-left" size={18} variant="back" title="Back" onClick={onBack} />
      )}
      <span className="title">{title}</span>
      {right}
    </div>
  );
}
