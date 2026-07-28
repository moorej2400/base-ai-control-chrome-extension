export interface ActionPoint {
  topLevelLayoutX: number;
  topLevelLayoutY: number;
  overlayX: number;
  overlayY: number;
  visualViewportScale: number;
}

export interface FrameOwnerGeometry {
  contentWidth: number;
  contentHeight: number;
  /** CDP quad order: top-left, top-right, bottom-right, bottom-left. */
  quad: [number, number, number, number, number, number, number, number];
}

export interface CoordinateMapInput {
  target: { x: number; y: number };
  visualViewport: { offsetX: number; offsetY: number; scale: number };
  /** Ordered from innermost owner up to the top frame. */
  frames: FrameOwnerGeometry[];
}

/**
 * DOM box-model quads and trusted CDP input are both expressed in top-level
 * viewport CSS pixels. Publish that same coordinate to the overlay; applying
 * visualViewport scroll offsets again would visibly shift the cursor.
 * The affine quad mapping is essential for transformed frames.
 */
export class CoordinateMapper {
  map(input: CoordinateMapInput): ActionPoint {
    let point = { ...input.target };
    for (const frame of input.frames) point = this.mapIntoOwner(point, frame);
    return {
      topLevelLayoutX: point.x,
      topLevelLayoutY: point.y,
      overlayX: point.x,
      overlayY: point.y,
      visualViewportScale: input.visualViewport.scale,
    };
  }

  private mapIntoOwner(point: { x: number; y: number }, owner: FrameOwnerGeometry) {
    const [x0, y0, x1, y1, , , x3, y3] = owner.quad;
    const u = point.x / owner.contentWidth;
    const v = point.y / owner.contentHeight;
    return {
      x: x0 + (x1 - x0) * u + (x3 - x0) * v,
      y: y0 + (y1 - y0) * u + (y3 - y0) * v,
    };
  }
}
