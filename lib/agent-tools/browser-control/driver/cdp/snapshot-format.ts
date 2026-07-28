import type { BrowserNodeRef } from './node-references';
import { utf8ByteLength } from './byte-size';

export interface FormattedSnapshot {
  tree: string;
  headings: string;
  nodeCount: number;
  truncated: boolean;
}

type SnapshotFormatNode = Pick<BrowserNodeRef, 'ref' | 'role' | 'name' | 'states'>;

export function formatSnapshot({ nodes, mode, maxBytes = 256 * 1024 }: { nodes: SnapshotFormatNode[]; mode: 'interactive' | 'full'; maxBytes?: number }): FormattedSnapshot {
  const lines: string[] = [];
  let truncated = false;
  for (const node of nodes) {
    const state = node.states.length ? ` [${node.states.join(', ')}]` : '';
    const line = `${node.ref} ${node.role} \"${node.name}\"${state}`;
    const next = [...lines, line].join('\n');
    if (utf8ByteLength(next) > maxBytes) {
      truncated = true;
      break;
    }
    lines.push(line);
  }
  if (truncated) {
    const note = '[truncated: narrow the task or request a fresh snapshot after scrolling]';
    while (lines.length && utf8ByteLength([...lines, note].join('\n')) > maxBytes) lines.pop();
    lines.push(note);
  }
  const headings = mode === 'full'
    ? nodes.filter((node) => /^heading$/i.test(node.role)).map((node) => node.name).join('\n')
    : '';
  return { tree: lines.join('\n'), headings, nodeCount: nodes.length, truncated };
}
