import type { BrowserNodeRef, NodeReferenceRegistry } from './node-references';

interface DomDocument {
  frameId?: string;
  nodes: {
    backendNodeId: number[];
    nodeName: number[];
    nodeValue: number[];
    isClickable?: { index: number[] };
  };
  layout?: { nodeIndex: number[]; bounds: number[][] };
}

interface DomSnapshot {
  documents: DomDocument[];
  // CDP interns every DOM document's names and values in this capture-level table.
  strings: string[];
}

interface AxNode {
  backendDOMNodeId?: number;
  role?: { value?: string };
  name?: { value?: string };
  value?: { value?: string };
  properties?: Array<{ name?: string; value?: { value?: unknown } }>;
}

export interface SnapshotMergeContext {
  browserSessionId: string;
  tabId: number;
  documentRevision: string;
  frameId: string;
  cdpSessionId?: string;
}

export interface MergeSnapshotOptions {
  dom: DomSnapshot;
  ax: { nodes: AxNode[] };
  context: SnapshotMergeContext;
  references: NodeReferenceRegistry;
  mode: 'interactive' | 'full';
  frameContexts?: Array<Pick<SnapshotMergeContext, 'frameId' | 'cdpSessionId'>>;
}

function stateNames(node: AxNode | undefined): string[] {
  if (!node?.properties) return [];
  return node.properties
    .filter((property) => property.value?.value === true)
    .map((property) => property.name)
    .filter((name): name is string => Boolean(name));
}

function layoutFor(document: DomDocument, nodeIndex: number) {
  const position = document.layout?.nodeIndex.indexOf(nodeIndex) ?? -1;
  if (position < 0) return undefined;
  const bounds = document.layout?.bounds[position];
  if (!bounds || bounds.length < 4) return undefined;
  return { x: bounds[0], y: bounds[1], width: bounds[2], height: bounds[3] };
}

function isClickable(document: DomDocument, index: number): boolean {
  // CDP represents rare boolean data by listing only the true node indexes.
  return document.nodes.isClickable?.index.includes(index) ?? false;
}

function meaningfulRole(role: string): boolean {
  return role !== 'none' && role !== 'generic' && role !== 'RootWebArea';
}

/** Merge DOMSnapshot and AX output into the compact, model-facing node list. */
export function mergeSnapshot(options: MergeSnapshotOptions): BrowserNodeRef[] {
  const axByBackendId = new Map(options.ax.nodes
    .filter((node) => node.backendDOMNodeId != null)
    .map((node) => [node.backendDOMNodeId!, node]));
  const nodes: BrowserNodeRef[] = [];

  for (const [documentIndex, document] of options.dom.documents.entries()) {
    const frameContext = options.frameContexts?.[documentIndex] ?? {
      frameId: document.frameId ?? options.context.frameId,
      cdpSessionId: options.context.cdpSessionId,
    };
    for (let index = 0; index < document.nodes.backendNodeId.length; index += 1) {
      const backendNodeId = document.nodes.backendNodeId[index];
      const ax = axByBackendId.get(backendNodeId);
      const rawName = ax?.name?.value ?? options.dom.strings[document.nodes.nodeValue[index]] ?? '';
      const role = ax?.role?.value ?? options.dom.strings[document.nodes.nodeName[index]] ?? 'generic';
      const interactive = isClickable(document, index) || stateNames(ax).includes('focusable') || ['button', 'link', 'textbox', 'checkbox', 'combobox'].includes(role);
      if (options.mode === 'interactive' && !interactive) continue;
      if (options.mode === 'full' && !interactive && !meaningfulRole(role)) continue;
      if (!rawName && options.mode === 'full' && !meaningfulRole(role)) continue;
      nodes.push(options.references.issue({
        browserSessionId: options.context.browserSessionId,
        tabId: options.context.tabId,
        documentRevision: options.context.documentRevision,
        frameId: frameContext.frameId,
        cdpSessionId: frameContext.cdpSessionId,
        backendNodeId,
        role,
        name: rawName,
        value: ax?.value?.value,
        states: stateNames(ax),
        bounds: layoutFor(document, index),
      }));
    }
  }
  return nodes;
}
