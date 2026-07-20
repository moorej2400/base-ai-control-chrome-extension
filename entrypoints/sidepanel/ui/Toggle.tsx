// iOS-style switch. Controlled: pass `on` + `onChange`. Track/knob styling and
// the slide animation live in style.css (`.toggle`).

export default function Toggle({
  on,
  onChange,
  title,
  ariaLabel,
}: {
  on: boolean;
  onChange: (next: boolean) => void;
  title?: string;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      className="toggle"
      data-on={on}
      role="switch"
      aria-checked={on}
      aria-label={ariaLabel ?? title}
      title={title}
      onClick={() => onChange(!on)}
    >
      <span className="knob" />
    </button>
  );
}
