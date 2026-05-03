/**
 * Path system for enemy traversal.
 *
 * The path is defined as an ordered list of waypoints. Enemies travel along the path
 * by tracking their distance traveled — `getPositionAtDistance(d)` returns the (x, y)
 * along the path at that distance, plus a `reachedEnd` flag.
 *
 * The path is hardcoded for M2. In M3+ this becomes data-driven per map.
 */

export interface Waypoint {
  readonly x: number;
  readonly y: number;
}

export class PathSystem {
  public readonly waypoints: ReadonlyArray<Waypoint>;
  private readonly segmentLengths: number[];
  private readonly _totalLength: number;

  constructor(waypoints: Waypoint[]) {
    if (waypoints.length < 2) {
      throw new Error('PathSystem requires at least 2 waypoints');
    }
    this.waypoints = waypoints;
    this.segmentLengths = [];
    let total = 0;
    for (let i = 0; i < waypoints.length - 1; i++) {
      const dx = waypoints[i + 1].x - waypoints[i].x;
      const dy = waypoints[i + 1].y - waypoints[i].y;
      const len = Math.hypot(dx, dy);
      this.segmentLengths.push(len);
      total += len;
    }
    this._totalLength = total;
  }

  get totalLength(): number {
    return this._totalLength;
  }

  /** Get position along the path at a given distance from start. */
  getPositionAtDistance(distance: number): { x: number; y: number; reachedEnd: boolean } {
    if (distance >= this._totalLength) {
      const last = this.waypoints[this.waypoints.length - 1];
      return { x: last.x, y: last.y, reachedEnd: true };
    }
    let remaining = Math.max(0, distance);
    for (let i = 0; i < this.segmentLengths.length; i++) {
      const segLen = this.segmentLengths[i];
      if (remaining <= segLen) {
        const a = this.waypoints[i];
        const b = this.waypoints[i + 1];
        const t = segLen === 0 ? 0 : remaining / segLen;
        return {
          x: a.x + (b.x - a.x) * t,
          y: a.y + (b.y - a.y) * t,
          reachedEnd: false,
        };
      }
      remaining -= segLen;
    }
    const last = this.waypoints[this.waypoints.length - 1];
    return { x: last.x, y: last.y, reachedEnd: true };
  }

  /**
   * Returns true if the given tile (col, row) is on the path — i.e. the path passes
   * within `tileSize/2` of the tile's center. Used to determine which tiles are
   * placeable (sidewalk) vs. not (street).
   */
  isOnPath(col: number, row: number, tileSize: number): boolean {
    const cx = col * tileSize + tileSize / 2;
    const cy = row * tileSize + tileSize / 2;
    const threshold = tileSize * 0.55;
    for (let i = 0; i < this.waypoints.length - 1; i++) {
      const a = this.waypoints[i];
      const b = this.waypoints[i + 1];
      if (pointToSegmentDistance(cx, cy, a.x, a.y, b.x, b.y) < threshold) {
        return true;
      }
    }
    return false;
  }
}

/** Shortest distance from point P to line segment AB. */
function pointToSegmentDistance(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) {
    return Math.hypot(px - ax, py - ay);
  }
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
  const projX = ax + t * dx;
  const projY = ay + t * dy;
  return Math.hypot(px - projX, py - projY);
}
