import { CoordinateMapper, type ActionPoint, type FrameOwnerGeometry } from './coordinate-mapper';
import type { ReferenceBinding, NodeReferenceRegistry } from './node-references';

export type TargetResolution =
  | { ok: true; point: ActionPoint; backendNodeId: number; frameId: string; cdpSessionId?: string; role: string }
  | { ok: false; code: 'STALE_REFERENCE' | 'TARGET_NOT_FOUND' | 'TARGET_OCCLUDED'; detail?: string };

export interface TargetResolverApi {
  currentRevision(): Promise<string>;
  scrollIntoView(backendNodeId: number, cdpSessionId?: string): Promise<void>;
  contentQuad(backendNodeId: number, cdpSessionId?: string): Promise<[number, number, number, number, number, number, number, number] | undefined>;
  frameChain(frameId: string, cdpSessionId?: string): Promise<FrameOwnerGeometry[]>;
  pointIsInsideTarget(backendNodeId: number, x: number, y: number): Promise<boolean>;
  visualViewport(): Promise<{ offsetX: number; offsetY: number; scale: number }>;
}

export class TargetResolver {
  constructor(private readonly refs: NodeReferenceRegistry, private readonly api: TargetResolverApi, private readonly mapper = new CoordinateMapper()) {}

  async resolve(ref: string, binding: ReferenceBinding): Promise<TargetResolution> {
    const node = this.refs.resolve(ref, binding);
    if (!node) return { ok: false, code: 'STALE_REFERENCE' };
    if (await this.api.currentRevision() !== binding.documentRevision) return { ok: false, code: 'STALE_REFERENCE' };
    try {
      await this.api.scrollIntoView(node.backendNodeId, node.cdpSessionId);
    } catch (error) {
      return targetNotFound('scrollIntoView', error);
    }
    try {
      const quad = await this.api.contentQuad(node.backendNodeId, node.cdpSessionId);
      if (!quad) return { ok: false, code: 'TARGET_NOT_FOUND' };
      // Reread after scrolling: a layout change invalidates both an old ref and
      // a point that was computed before the browser settled the scroll.
      if (await this.api.currentRevision() !== binding.documentRevision) return { ok: false, code: 'STALE_REFERENCE' };
      const center = { x: (quad[0] + quad[2] + quad[4] + quad[6]) / 4, y: (quad[1] + quad[3] + quad[5] + quad[7]) / 4 };
      const point = this.mapper.map({
        target: center,
        frames: await this.api.frameChain(node.frameId, node.cdpSessionId),
        visualViewport: await this.api.visualViewport(),
      });
      // A flattened OOPIF session has its own id namespace, so its frame-owner
      // chain already establishes the target coordinate and root hit testing
      // must not falsely label it occluded. Resolve the target object itself
      // before checking elementFromPoint: CDP snapshot and location back-end
      // ids are not consistently comparable in all Chrome builds.
      if (!node.cdpSessionId && !await this.api.pointIsInsideTarget(node.backendNodeId, point.topLevelLayoutX, point.topLevelLayoutY)) {
          return {
            ok: false,
            code: 'TARGET_OCCLUDED',
            detail: `target ${node.backendNodeId} is not at ${Math.round(point.topLevelLayoutX)},${Math.round(point.topLevelLayoutY)}`,
          };
      }
      return { ok: true, point, backendNodeId: node.backendNodeId, frameId: node.frameId, cdpSessionId: node.cdpSessionId, role: node.role };
    } catch (error) {
      return targetNotFound('geometry', error);
    }
  }
}

function targetNotFound(step: string, error: unknown): Extract<TargetResolution, { ok: false }> {
  return {
    ok: false,
    code: 'TARGET_NOT_FOUND',
    detail: `${step}: ${error instanceof Error ? error.message : String(error)}`,
  };
}
