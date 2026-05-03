import Phaser from 'phaser';
import { PathSystem, Waypoint } from '../systems/PathSystem';
import { Enemy, GRUNT_CONFIG } from '../entities/Enemy';

/**
 * GameScene — main gameplay.
 *
 * M2 (this commit): renders the grid + path, spawns a continuous stream of grunts
 * walking along the path. No towers yet, no waves, no economy.
 * Goal of this commit: prove the grid + path + enemy traversal pipeline works.
 *
 * Coming next:
 *  - C2: tower placement, projectiles, enemy kills
 *  - C3: wave manager, economy, HUD, win/lose
 */
export class GameScene extends Phaser.Scene {
  static readonly TILE_SIZE = 80;
  static readonly GRID_COLS = 16;
  static readonly GRID_ROWS = 9;

  private path!: PathSystem;
  private enemies: Enemy[] = [];
  private spawnTimer = 0;
  private readonly SPAWN_INTERVAL_MS = 1200;

  constructor() {
    super({ key: 'GameScene' });
  }

  create(): void {
    this.path = new PathSystem(this.buildPathWaypoints());
    this.enemies = [];
    this.spawnTimer = 0;

    this.drawBackground();
    this.drawGrid();
    this.drawPath();
    this.drawHUDPlaceholder();

    // Reset on scene restart
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.enemies.forEach((e) => e.destroy());
      this.enemies = [];
    });
  }

  override update(_time: number, delta: number): void {
    this.spawnTimer += delta;
    if (this.spawnTimer >= this.SPAWN_INTERVAL_MS) {
      this.spawnTimer = 0;
      this.spawnGrunt();
    }

    const deltaSeconds = delta / 1000;
    for (const enemy of this.enemies) {
      enemy.update(deltaSeconds);
    }

    // Cull enemies that leaked or died
    this.enemies = this.enemies.filter((e) => {
      if (e.reachedEnd || e.dead) {
        e.destroy();
        return false;
      }
      return true;
    });
  }

  /**
   * Times Square placeholder path — enters bottom-right, S-curves through the
   * center, exits top-left. Off-screen entry/exit so spawns and leaks aren't
   * visually abrupt.
   *
   * Tile coordinates → pixel center: (col * TILE_SIZE + TILE_SIZE/2, row * TILE_SIZE + TILE_SIZE/2)
   */
  private buildPathWaypoints(): Waypoint[] {
    const T = GameScene.TILE_SIZE;
    const half = T / 2;
    const tile = (col: number, row: number) => ({
      x: col * T + half,
      y: row * T + half,
    });
    return [
      { x: GameScene.GRID_COLS * T + T, y: 7 * T + half }, // off-screen right
      tile(13, 7),
      tile(3, 7),
      tile(3, 4),
      tile(12, 4),
      tile(12, 1),
      { x: -T, y: 1 * T + half }, // off-screen left
    ];
  }

  private spawnGrunt(): void {
    const enemy = new Enemy(this, this.path, GRUNT_CONFIG);
    this.enemies.push(enemy);
  }

  /** Twilight NYC gradient — slightly lighter than the title splash for play visibility. */
  private drawBackground(): void {
    const g = this.add.graphics();
    const { width, height } = this.scale;
    for (let y = 0; y < height; y++) {
      const t = y / height;
      const r = Math.floor(0x18 + (0x4a - 0x18) * t);
      const gv = Math.floor(0x1c + (0x36 - 0x1c) * t);
      const b = Math.floor(0x2c + (0x4c - 0x2c) * t);
      g.fillStyle((r << 16) | (gv << 8) | b, 1);
      g.fillRect(0, y, width, 1);
    }
  }

  /** Subtle grid + sidewalk highlight on placeable tiles. */
  private drawGrid(): void {
    const g = this.add.graphics();
    const T = GameScene.TILE_SIZE;

    // Sidewalk fill on placeable tiles
    for (let c = 0; c < GameScene.GRID_COLS; c++) {
      for (let r = 0; r < GameScene.GRID_ROWS; r++) {
        if (!this.path.isOnPath(c, r, T)) {
          g.fillStyle(0x4c4860, 0.2);
          g.fillRect(c * T + 2, r * T + 2, T - 4, T - 4);
        }
      }
    }

    // Grid lines
    g.lineStyle(1, 0x2a2a3a, 0.35);
    for (let c = 0; c <= GameScene.GRID_COLS; c++) {
      g.lineBetween(c * T, 0, c * T, GameScene.GRID_ROWS * T);
    }
    for (let r = 0; r <= GameScene.GRID_ROWS; r++) {
      g.lineBetween(0, r * T, GameScene.GRID_COLS * T, r * T);
    }
  }

  /** Path rendered as a thick dark road with a yellow center line. */
  private drawPath(): void {
    const T = GameScene.TILE_SIZE;
    const pts = this.path.waypoints;

    // Road body
    const road = this.add.graphics();
    road.lineStyle(T * 0.85, 0x261506, 1);
    road.beginPath();
    road.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) {
      road.lineTo(pts[i].x, pts[i].y);
    }
    road.strokePath();

    // Asphalt highlight (inner stroke for depth)
    const highlight = this.add.graphics();
    highlight.lineStyle(T * 0.7, 0x352010, 1);
    highlight.beginPath();
    highlight.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) {
      highlight.lineTo(pts[i].x, pts[i].y);
    }
    highlight.strokePath();

    // Yellow dashed center line
    const center = this.add.graphics();
    center.lineStyle(3, 0xfff200, 0.85);
    center.beginPath();
    center.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) {
      center.lineTo(pts[i].x, pts[i].y);
    }
    center.strokePath();
  }

  private drawHUDPlaceholder(): void {
    this.add.text(20, 12, 'BIG APPLE DEFENSE', {
      fontFamily: 'Impact, "Arial Black", system-ui, sans-serif',
      fontSize: '20px',
      color: '#fff200',
      stroke: '#c1272d',
      strokeThickness: 2,
    });
    this.add
      .text(this.scale.width - 20, 12, 'v0.2.0 — M2 / C1', {
        fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
        fontSize: '12px',
        color: '#888888',
      })
      .setOrigin(1, 0);
  }
}
