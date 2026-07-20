import { useEffect, useRef, useState } from 'react';
import Icon from '../ui/Icon';

/**
 * Collapsible reasoning pill (mock "thinking pill"). Auto-expands while the
 * agent is actively reasoning and tidies itself away once the answer begins;
 * stays user-toggleable.
 */
export default function ThinkingPill({
  text,
  active,
}: {
  text: string;
  active: boolean;
}) {
  const [open, setOpen] = useState(active);
  const prevActive = useRef(active);
  useEffect(() => {
    if (prevActive.current && !active) setOpen(false);
    else if (!prevActive.current && active) setOpen(true);
    prevActive.current = active;
  }, [active]);

  return (
    <>
      <button
        className="think-pill"
        data-open={open}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <Icon name="brain" size={13} color="var(--accent)" />
        <span className="label">{active ? 'Thinking…' : 'Thought process'}</span>
        <Icon
          name="chevron-down"
          size={13}
          color="var(--faint)"
          strokeWidth={2.2}
          style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}
        />
      </button>
      {open && text.trim() && <div className="think-body">{text}</div>}
    </>
  );
}
