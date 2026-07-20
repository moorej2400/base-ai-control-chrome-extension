import { useMemo, type ReactNode } from 'react';
import type { ToolUIPart } from 'ai';
import Icon from '../ui/Icon';

const FRIENDLY: Record<string, string> = {
  read_page_content: 'read_page_content',
  get_page_info: 'get_page_info',
  get_selected_text: 'get_selected_text',
  jira_ticket_review: 'jira_ticket_review',
  get_current_jira_issue: 'get_current_jira_issue',
};

export function toolLabel(name: string): string {
  return FRIENDLY[name] ?? name;
}

/**
 * Presentational tool-call card (mock "tool call" block): a status square +
 * mono tool name + collapsible mono body with input / output / error. Shared by
 * top-level tool calls and the nested calls inside a sub-agent trace. Pass
 * `open`/`onToggleOpen` to control expansion; omit for click-to-expand.
 */
export default function ToolChipView({
  name,
  state,
  input,
  output,
  errorText,
  meta,
  accent = false,
  open,
  onToggleOpen,
  children,
}: {
  name: string;
  state: ToolUIPart['state'];
  input?: unknown;
  output?: unknown;
  errorText?: string;
  meta?: string;
  accent?: boolean;
  open?: boolean;
  onToggleOpen?: (open: boolean) => void;
  children?: ReactNode;
}) {
  const failed = state === 'output-error' || state === 'output-denied';
  const running = !failed && state !== 'output-available';

  const hasInput =
    input != null &&
    (typeof input !== 'object' || Object.keys(input as object).length > 0);
  const inputText = useMemo(
    () => (hasInput ? truncate(safeStringify(input)) : ''),
    [hasInput, input],
  );
  // A screenshot tool returns { image: base64, mediaType }; render it as a
  // thumbnail instead of dumping the (huge) base64 as text.
  const screenshot = useMemo(() => asScreenshot(output), [output]);
  const outputText = useMemo(
    () =>
      output !== undefined && !screenshot ? truncate(safeStringify(output)) : '',
    [output, screenshot],
  );

  return (
    <details
      className={`tool-chip${accent ? ' has-subagent' : ''}`}
      {...(open !== undefined ? { open } : {})}
      onToggle={
        onToggleOpen
          ? (e) => onToggleOpen((e.currentTarget as HTMLDetailsElement).open)
          : undefined
      }
    >
      <summary className="tool-chip-head">
        <span className={`tool-stat${failed ? ' failed' : running ? ' running' : ''}`}>
          {failed ? (
            <Icon name="x" size={10} color="var(--err-btn)" strokeWidth={2.5} />
          ) : running ? (
            <Icon name="refresh" size={10} color="var(--accent-text)" />
          ) : (
            <Icon name="check" size={10} color="var(--ok)" />
          )}
        </span>
        <span className="tool-name">{name}</span>
        {meta && <span className="tool-meta">{meta}</span>}
        <span className="tool-spacer" />
        <Icon name="chevron-down" size={13} className="tool-chev" color="var(--faint)" strokeWidth={2.2} />
      </summary>
      <div className="tool-chip-body">
        {children}
        {hasInput && (
          <>
            <div className="k">input</div>
            <div className="v">{inputText}</div>
          </>
        )}
        {screenshot && (
          <>
            <div className="k">screenshot</div>
            <a
              className="tool-shot"
              href={screenshot}
              target="_blank"
              rel="noreferrer"
              title="Open full screenshot"
            >
              <img src={screenshot} alt="Page screenshot" loading="lazy" />
            </a>
          </>
        )}
        {output !== undefined && !screenshot && (
          <>
            <div className="k">output</div>
            <div className="v">{outputText}</div>
          </>
        )}
        {errorText && (
          <>
            <div className="k">error</div>
            <div className="v" style={{ color: 'var(--err-text)' }}>
              {errorText}
            </div>
          </>
        )}
      </div>
    </details>
  );
}

/** Detects a screenshot tool output and returns a renderable data URL, else null. */
function asScreenshot(output: unknown): string | null {
  if (!output || typeof output !== 'object') return null;
  const o = output as Record<string, unknown>;
  if (typeof o.image === 'string' && o.image.length > 0) {
    const mediaType =
      typeof o.mediaType === 'string' ? o.mediaType : 'image/jpeg';
    return `data:${mediaType};base64,${o.image}`;
  }
  return null;
}

function safeStringify(value: unknown): string {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return `[Unserializable value: ${detail}]`;
  }
}

function truncate(text: string, max = 2000): string {
  return text.length > max ? `${text.slice(0, max)}\n… (truncated)` : text;
}
