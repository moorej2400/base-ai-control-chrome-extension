import Icon from '../ui/Icon';
import { Button } from '../ui/Button';

export interface DiffLine {
  type: 'add' | 'del';
  text: string;
}

export interface EditProposal {
  target: string;
  added: number;
  removed: number;
  lines: DiffLine[];
}

/**
 * The "apply to note" tracked-diff card (mock "apply-to-note diff card").
 *
 * TODO(extension-side): there is no edit/apply tool yet, so nothing produces an
 * EditProposal. This component is ready to render one when a `propose_edit`-style
 * tool lands; MessageItem already looks for such a tool result. Apply / Reject
 * are not wired.
 */
export default function ApplyEditCard({ proposal }: { proposal: EditProposal }) {
  return (
    <div className="diff-card">
      <div className="diff-head">
        <Icon name="pencil" size={13} color="var(--accent-deep)" />
        <span className="title">Proposed edit · {proposal.target}</span>
        <span className="stat">
          +{proposal.added} −{proposal.removed}
        </span>
      </div>
      <div className="diff-body">
        {proposal.lines.map((line, i) => (
          <div key={i} className={`diff-line ${line.type}`}>
            <span className="mark">{line.type === 'add' ? '+' : '−'}</span>
            <span className="txt">{line.text}</span>
          </div>
        ))}
      </div>
      <div className="diff-actions">
        {/* TODO: wire Apply to write the diff into the active page. */}
        <Button variant="primary" icon="check" style={{ flex: 1, height: 30 }}>
          Apply
        </Button>
        {/* TODO: wire Reject to discard the proposal. */}
        <button
          className="btn btn-sm"
          style={{ height: 30 }}
        >
          Reject
        </button>
      </div>
    </div>
  );
}
