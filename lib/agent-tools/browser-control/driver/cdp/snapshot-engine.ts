import type { DebuggerTransport } from './debugger-transport';
import { NodeReferenceRegistry, type BrowserNodeRef } from './node-references';
import { formatSnapshot, type FormattedSnapshot } from './snapshot-format';
import { mergeSnapshot, type SnapshotMergeContext } from './snapshot-merge';

export interface CdpSnapshot extends FormattedSnapshot {
  revision: string;
  nodes: BrowserNodeRef[];
}

export class SnapshotEngine {
  constructor(private readonly transport: DebuggerTransport, private readonly refs = new NodeReferenceRegistry()) {}

  async capture(tabId: number, context: SnapshotMergeContext, mode: 'interactive' | 'full' = 'interactive'): Promise<CdpSnapshot> {
    const [dom, ax] = await Promise.all([
      this.transport.send<{ documents: unknown[]; strings: string[] }>(tabId, 'DOMSnapshot.captureSnapshot', {
        computedStyles: [], includeDOMRects: true, includePaintOrder: true,
      }, context.cdpSessionId),
      this.transport.send<{ nodes: unknown[] }>(tabId, 'Accessibility.getFullAXTree', undefined, context.cdpSessionId),
    ]);
    const nodes = mergeSnapshot({
      dom: dom as Parameters<typeof mergeSnapshot>[0]['dom'],
      ax: ax as Parameters<typeof mergeSnapshot>[0]['ax'],
      context,
      references: this.refs,
      mode,
    });
    return { ...formatSnapshot({ nodes, mode }), revision: context.documentRevision, nodes };
  }

  references(): NodeReferenceRegistry {
    return this.refs;
  }
}
