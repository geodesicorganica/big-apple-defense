import { PathSystem } from './PathSystem';

/**
 * Placement quality grade. S/A/B/C/D follow standard tier conventions; F means
 * not placeable (on path). Used both as in-game player feedback and as a
 * systematic balance lens — see logBalanceSummary in GameScene.
 */
export type PlacementGrade = 'S' | 'A' | 'B' | 'C' | 'D' | 'F';

export interface TileScore {
  /** Path length (in pixels) that falls within tower range from this tile's center. */
  rawScore: number;
  /** rawScore / maxRawScore across all tiles in the grid; 0–1. */
  normalized: number;
  grade: PlacementGrade;
}

/**
 * Computes a "placement quality" score for every grid tile.
 *
 * The intuition: a tower's value at a given tile is proportional to how much
 * path length sits inside its range. More path-in-range = more time enemies
 * spend exposed to that tower's fire = more total damage opportunity.
 *
 * For each placeable tile we walk the path in small steps (~4px) and tally the
 * total length that falls within `towerRange` of the tile's center. Then we
 * normalize against the best score in the grid and assign a letter grade.
 *
 * This makes balance work systematic: we can compute the skill ceiling
 * (placing N towers at the top-N tiles) and floor (bottom-N tiles), and verify
 * the run is winnable with great placement and unwinnable with terrible
 * placement.
 */
export class PlacementScorer {
  private static readonly STEP_PX = 4;

  private readonly cache = new Map<string, TileScore>();
  private maxRawScore = 0;

  constructor(
    private readonly path: PathSystem,
    private readonly tileSize: number,
    private readonly towerRange: number
  ) {}

  /** Score a single tile and cache the result. */
  scoreTile(col: number, row: number): TileScore {
    const key = `${col},${row}`;
    const cached = this.cache.get(key);
    if (cached) return cached;

    // Tiles on the path are not placeable, score 0 / grade F.
    if (this.path.isOnPath(col, row, this.tileSize)) {
      const score: TileScore = { rawScore: 0, normalized: 0, grade: 'F' };
      this.cache.set(key, score);
      return score;
    }

    const cx = col * this.tileSize + this.tileSize / 2;
    const cy = row * this.tileSize + this.tileSize / 2;
    const rangeSq = this.towerRange * this.towerRange;

    const totalLength = this.path.totalLength;
    let inRange = 0;
    for (let dist = 0; dist <= totalLength; dist += PlacementScorer.STEP_PX) {
      const pos = this.path.getPositionAtDistance(dist);
      const dx = pos.x - cx;
      const dy = pos.y - cy;
      if (dx * dx + dy * dy <= rangeSq) {
        inRange += PlacementScorer.STEP_PX;
      }
    }

    if (inRange > this.maxRawScore) this.maxRawScore = inRange;

    const score: TileScore = { rawScore: inRange, normalized: 0, grade: 'F' };
    this.cache.set(key, score);
    return score;
  }

  /**
   * Score every tile in the grid up front, then normalize + grade.
   * Call this once after construction before using normalized/grade fields.
   */
  computeAllScores(gridCols: number, gridRows: number): void {
    // Pass 1: raw scores (populates cache + maxRawScore)
    for (let c = 0; c < gridCols; c++) {
      for (let r = 0; r < gridRows; r++) {
        this.scoreTile(c, r);
      }
    }
    // Pass 2: normalize + grade
    for (const score of this.cache.values()) {
      score.normalized =
        this.maxRawScore > 0 ? score.rawScore / this.maxRawScore : 0;
      score.grade = this.gradeFor(score.normalized, score.rawScore);
    }
  }

  /** Return all placeable tile scores (rawScore > 0), sorted descending. */
  getRankedScores(): Array<{ col: number; row: number; score: TileScore }> {
    const out: Array<{ col: number; row: number; score: TileScore }> = [];
    for (const [key, score] of this.cache.entries()) {
      if (score.rawScore <= 0) continue;
      const [colStr, rowStr] = key.split(',');
      out.push({ col: Number(colStr), row: Number(rowStr), score });
    }
    out.sort((a, b) => b.score.rawScore - a.score.rawScore);
    return out;
  }

  getMaxScore(): number {
    return this.maxRawScore;
  }

  private gradeFor(normalized: number, raw: number): PlacementGrade {
    if (raw === 0) return 'F';
    if (normalized >= 0.85) return 'S';
    if (normalized >= 0.7) return 'A';
    if (normalized >= 0.5) return 'B';
    if (normalized >= 0.3) return 'C';
    return 'D';
  }
}

/** UI color per grade. Used for both hover text and the all-grades overlay. */
export function gradeColor(grade: PlacementGrade): string {
  switch (grade) {
    case 'S':
      return '#fff200'; // gold
    case 'A':
      return '#66ff66'; // bright green
    case 'B':
      return '#a0e870'; // pale green
    case 'C':
      return '#ffaa44'; // orange
    case 'D':
      return '#ff5566'; // red
    default:
      return '#666666'; // grey
  }
}
