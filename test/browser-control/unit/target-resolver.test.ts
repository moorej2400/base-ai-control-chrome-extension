import { describe, expect, it } from 'vitest';
import { NodeReferenceRegistry } from '@/lib/agent-tools/browser-control/driver/cdp/node-references';
import { TargetResolver, type TargetResolverApi } from '@/lib/agent-tools/browser-control/driver/cdp/target-resolver';

function setup() {
  const refs = new NodeReferenceRegistry(() => 'target');
  refs.issue({ browserSessionId: 'session', tabId: 1, documentRevision: 'r1', frameId: 'main', backendNodeId: 9, role: 'button', name: 'Save', states: [] });
  const quad: [number, number, number, number, number, number, number, number] = [10, 20, 110, 20, 110, 60, 10, 60];
  const api: TargetResolverApi = {
    currentRevision: async () => 'r1',
    scrollIntoView: async () => {},
    contentQuad: async () => quad,
    frameChain: async () => [],
    pointIsInsideTarget: async () => true,
    visualViewport: async () => ({ offsetX: 0, offsetY: 0, scale: 1 }),
  };
  return { refs, api };
}

describe('TargetResolver', () => {
  it('scrolls, rereads geometry, and hit-tests immediately before the action', async () => {
    const { refs, api } = setup();
    const result = await new TargetResolver(refs, api).resolve('target', { browserSessionId: 'session', tabId: 1, documentRevision: 'r1' });
    expect(result).toEqual(expect.objectContaining({ ok: true, point: expect.objectContaining({ topLevelLayoutX: 60, topLevelLayoutY: 40 }) }));
  });

  it('rejects a stale document revision before issuing input', async () => {
    const { refs, api } = setup();
    api.currentRevision = async () => 'r2';
    const result = await new TargetResolver(refs, api).resolve('target', { browserSessionId: 'session', tabId: 1, documentRevision: 'r1' });
    expect(result).toEqual({ ok: false, code: 'STALE_REFERENCE' });
  });

  it('rejects an occluded target after its final hit test', async () => {
    const { refs, api } = setup();
    api.pointIsInsideTarget = async () => false;
    const result = await new TargetResolver(refs, api).resolve('target', { browserSessionId: 'session', tabId: 1, documentRevision: 'r1' });
    expect(result).toEqual({ ok: false, code: 'TARGET_OCCLUDED', detail: 'target 9 is not at 60,40' });
  });

  it('accepts the target when elementFromPoint lands on its child text node', async () => {
    const { refs, api } = setup();
    api.pointIsInsideTarget = async (targetBackendNodeId: number) => targetBackendNodeId === 9;

    await expect(new TargetResolver(refs, api).resolve('target', {
      browserSessionId: 'session', tabId: 1, documentRevision: 'r1',
    })).resolves.toMatchObject({ ok: true });
  });

  it('identifies which CDP resolution step rejected a live target', async () => {
    const { refs, api } = setup();
    api.scrollIntoView = async () => { throw new Error('No node with given id found'); };

    const result = await new TargetResolver(refs, api).resolve('target', { browserSessionId: 'session', tabId: 1, documentRevision: 'r1' });

    expect(result).toEqual({ ok: false, code: 'TARGET_NOT_FOUND', detail: 'scrollIntoView: No node with given id found' });
  });
});
