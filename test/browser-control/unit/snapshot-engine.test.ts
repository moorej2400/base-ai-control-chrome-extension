import { describe, expect, it } from 'vitest';
import basicDom from '../fixtures/dom-snapshot-basic.json';
import basicAx from '../fixtures/ax-tree-basic.json';
import framesDom from '../fixtures/dom-snapshot-frames.json';
import { NodeReferenceRegistry } from '@/lib/agent-tools/browser-control/driver/cdp/node-references';
import { mergeSnapshot } from '@/lib/agent-tools/browser-control/driver/cdp/snapshot-merge';
import { formatSnapshot } from '@/lib/agent-tools/browser-control/driver/cdp/snapshot-format';

describe('CDP snapshot engine', () => {
  it('joins AX metadata to DOM layout and exposes opaque refs', () => {
    const refs = new NodeReferenceRegistry(() => 'ref-save');
    const nodes = mergeSnapshot({
      dom: basicDom,
      ax: basicAx,
      context: { browserSessionId: 'browser-a', tabId: 1, documentRevision: 'r1', frameId: 'main', cdpSessionId: 'root' },
      references: refs,
      mode: 'interactive',
    });

    expect(nodes).toEqual([
      expect.objectContaining({ ref: 'ref-save', role: 'button', name: 'Save', backendNodeId: 3, bounds: { x: 10, y: 20, width: 80, height: 24 } }),
    ]);
    expect(refs.resolve('ref-save', { browserSessionId: 'browser-a', tabId: 1, documentRevision: 'r1' })).toMatchObject({ backendNodeId: 3 });
  });

  it('accepts CDP RareBooleanData clickability records without a value array', () => {
    const dom = {
      documents: basicDom.documents.map((document) => ({
        ...document,
        nodes: {
          ...document.nodes,
          isClickable: { index: [...document.nodes.isClickable.index] },
        },
      })),
      strings: [...basicDom.strings],
    };
    const refs = new NodeReferenceRegistry(() => 'ref-save');

    const nodes = mergeSnapshot({
      dom,
      ax: basicAx,
      context: { browserSessionId: 'browser-a', tabId: 1, documentRevision: 'r1', frameId: 'main' },
      references: refs,
      mode: 'interactive',
    });

    expect(nodes).toEqual([expect.objectContaining({ ref: 'ref-save', role: 'button', name: 'Save' })]);
  });

  it('keeps same backend IDs in separate CDP sessions separate', () => {
    const refs = new NodeReferenceRegistry((index) => `ref-${index}`);
    const nodes = mergeSnapshot({
      dom: framesDom,
      ax: { nodes: [] },
      context: { browserSessionId: 'browser-a', tabId: 1, documentRevision: 'r1', frameId: 'main', cdpSessionId: 'root' },
      references: refs,
      mode: 'full',
      frameContexts: [
        { frameId: 'main', cdpSessionId: 'root' },
        { frameId: 'child', cdpSessionId: 'child-cdp' },
      ],
    });

    expect(nodes).toHaveLength(2);
    expect(nodes.map((node) => node.cdpSessionId)).toEqual(['root', 'child-cdp']);
    expect(new Set(nodes.map((node) => node.ref)).size).toBe(2);
  });

  it('excludes semantic text from interactive snapshots but includes it in full mode', () => {
    const refs = new NodeReferenceRegistry(() => 'ref');
    const interactive = mergeSnapshot({ dom: basicDom, ax: basicAx, context: { browserSessionId: 'a', tabId: 1, documentRevision: 'r', frameId: 'main' }, references: refs, mode: 'interactive' });
    const full = mergeSnapshot({ dom: basicDom, ax: basicAx, context: { browserSessionId: 'a', tabId: 1, documentRevision: 'r', frameId: 'main' }, references: refs, mode: 'full' });

    expect(interactive).toHaveLength(1);
    expect(full).toEqual(expect.arrayContaining([expect.objectContaining({ role: 'paragraph', name: 'Helpful text' })]));
  });

  it('deterministically truncates a serialized snapshot below its byte cap with continuation guidance', () => {
    const output = formatSnapshot({
      nodes: Array.from({ length: 50 }, (_, index) => ({ ref: `r${index}`, role: 'button', name: 'x'.repeat(80), states: [] })),
      mode: 'interactive',
      maxBytes: 550,
    });

    expect(Buffer.byteLength(output.tree)).toBeLessThanOrEqual(550);
    expect(output.truncated).toBe(true);
    expect(output.tree).toContain('truncated');
  });
});
