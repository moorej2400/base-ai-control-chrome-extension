import { useState } from 'react';
import Icon from '../ui/Icon';

/**
 * The row of actions under an assistant answer: copy, regenerate,
 * insert-at-cursor, and overflow. Copy and regenerate are wired; insert and the
 * overflow menu are deferred (they need the page-writing edit tool).
 */
export default function MessageActions({
  answer,
  onRegenerate,
}: {
  answer: string;
  onRegenerate?: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    if (!answer.trim()) return;
    await navigator.clipboard.writeText(answer);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="msg-actions">
      <button className="icon-btn sm dim" title={copied ? 'Copied!' : 'Copy'} onClick={() => void copy()}>
        <Icon name={copied ? 'check' : 'copy'} size={14} color={copied ? 'var(--ok)' : undefined} />
      </button>
      <button
        className="icon-btn sm dim"
        title="Regenerate"
        onClick={onRegenerate}
        disabled={!onRegenerate}
      >
        <Icon name="refresh" size={14} />
      </button>
      {/* TODO: insert the answer at the caret in the active page. */}
      <button
        className="icon-btn sm dim"
        title="Insert at cursor"
        style={{ width: 'auto', padding: '0 9px', gap: 5, fontSize: 11 }}
      >
        <Icon name="plus" size={13} />
        Insert
      </button>
      <span className="spacer" />
      {/* TODO: overflow menu (edit, share, delete…). */}
      <button className="icon-btn sm dim" title="More">
        <Icon name="dots" size={15} />
      </button>
    </div>
  );
}
