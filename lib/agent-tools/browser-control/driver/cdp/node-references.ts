export interface BrowserNodeRef {
  ref: string;
  browserSessionId: string;
  tabId: number;
  documentRevision: string;
  frameId: string;
  cdpSessionId?: string;
  backendNodeId: number;
  role: string;
  name: string;
  value?: string;
  states: string[];
  bounds?: { x: number; y: number; width: number; height: number };
}

export interface ReferenceBinding {
  browserSessionId: string;
  tabId: number;
  documentRevision: string;
}

/**
 * Node identifiers are intentionally opaque. A raw backend node id is only
 * unique inside a CDP session and must never be accepted across tab/revision
 * boundaries.
 */
export class NodeReferenceRegistry {
  private readonly refs = new Map<string, BrowserNodeRef>();
  private nextId = 0;

  constructor(private readonly createRef: (index: number) => string = () => crypto.randomUUID()) {}

  issue(node: Omit<BrowserNodeRef, 'ref'>): BrowserNodeRef {
    const ref = this.createRef(this.nextId++);
    const issued = { ...node, ref };
    this.refs.set(ref, issued);
    return issued;
  }

  resolve(ref: string, binding: ReferenceBinding): BrowserNodeRef | undefined {
    const node = this.refs.get(ref);
    if (!node) return undefined;
    if (
      node.browserSessionId !== binding.browserSessionId ||
      node.tabId !== binding.tabId ||
      node.documentRevision !== binding.documentRevision
    ) return undefined;
    return node;
  }

  clearDocument(binding: Omit<ReferenceBinding, 'documentRevision'>): void {
    for (const [ref, node] of this.refs) {
      if (node.browserSessionId === binding.browserSessionId && node.tabId === binding.tabId) this.refs.delete(ref);
    }
  }
}
