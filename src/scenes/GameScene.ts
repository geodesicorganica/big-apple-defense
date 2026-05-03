import Phaser from 'phaser';
import { PathSystem, Waypoint } from '../systems/PathSystem';
import { Enemy, GRUNT_CONFIG } from '../entities/Enemy';
import { Tower, PLACEHOLDER_TOWER_CONFIG } from '../entities/Tower';
import { Projectile } from '../entities/Projectile';

/**
 * GameScene — main gameplay.
 *
 * M2/C2 (this commit): tower placement + projectiles + enemy kills.
 *  - Click any sidewalk tile to place a placeholder tower (free in C2; gold in C3)
 *  - Towers find nearest enemy in range and fire projectiles
 *  - Enemies take damage, die when HP hits 0
 *  - Hover indicator shows placeable (green) vs blocked (red) tiles
 *
 * Coming next: C3 = wave manager, economy, HUD, win/lose, retry.
 */
export class GameScene extends Phaser.Scene {
  static readonly TILE_SIZE = 80;
  static readonly GRID_COLS = 16;
  static readonly GRID_ROWS = 9;

  private path!: PathSystem;
  private enemies: Enemy[] = [];
  private towers: Tower[] = [];
  private projectiles: Projectile[] = [];
  private occupiedTiles = new Set<string>();

  private spawnTimer = 0;
  private readonly SPAWN_INTERVAL_MS = 1200;

  private hoverGraphics!: Phaser.GameObjects.Graphics;
  private hoverTile: { col: number; row: number } | null = null;
  private towerCountText!: Phaser.GameObjects.Text;

  constructor() {
    super({ key: 'GameScene' });
  }

  create(): void {
    this.path = new PathSystem(this.buildPathWaypoints());
    this.enemies = [];
    this.towers = [];
    this.projectiles = [];
    this.occupiedTiles = new Set();
    this.spawnTimer = 0;
    this.hoverTile = null;

    this.drawBackground();
    this.drawGrid();
    this.drawPath();
    this.drawHUDPlaceholder();

    this.hoverGraphics = this.add.graphics();
    this.wireInput();

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.enemies.forEach((e) => e.destroy());
      this.towers.forEach((t) => t.destroy());
      this.projectiles.forEach((p) => p.destroy());
      this.enemies = [];
      this.towers = [];
      this.projectiles = [];
      this.occupiedTiles.clear();
    });
  }

  override update(time: number, delta: number): void {
    this.spawnTimer += delta;
    if (this.spawnTimer >= this.SPAWN_INTERVAL_MS) {
      this.spawnTimer = 0;
      this.spawnGrunt();
    }

    const deltaSeconds = delta / 1000;

    for (const enemy of this.enemies) {
      enemy.update(deltaSeconds);
    }

    for (const tower of this.towers) {
      const projectile = tower.update(time, this.enemies);
      if (projectile) {
        this.projectiles.push(projectile);
      }
    }

    for (const projectile of this.projectiles) {
      projectile.update(deltaSeconds);
    }

    this.enemies = this.enemies.filter((e) => {
      if (e.reachedEnd || e.dead) {
        e.destroy();
        return false;
      }
      return true;
    });
    this.projectiles = this.projectiles.filter((p) => {
      if (p.dead) {
        p.destroy();
        return false;
      }
      return true;
    });

    this.updateTowerCountText();
  }

  private buildPathWaypoints(): Waypoint[] {
    const T = GameScene.TILE_SIZE;
    const half = T / 2;
    const tile = (col: number, row: number) => ({
      x: col * T + half,
      y: row * T + half,
    });
    return [
      { x: GameScene.GRID_COLS * T + T, y: 7 * T + half },
      tile(13, 7),
      tile(3, 7),
      tile(3, 4),
      tile(12, 4),
      tile(12, 1),
      { x: -T, y: 1 * T + half },
    ];
  }

  private spawnGrunt(): void {
    const enemy = new Enemy(this, this.path, GRUNT_CONFIG);
    this.enemies.push(enemy);
  }

  private wireInput(): void {
    this.input.on(Phaser.Input.Events.POINTER_MOVE, (pointer: Phaser.Input.Pointer) => {
      const tile = this.pointerToTile(pointer);
      this.hoverTile = tile;
      this.redrawHover();
    });

    this.input.on(Phaser.Input.Events.POINTER_DOWN, (pointer: Phaser.Input.Pointer) => {
      const tile = this.pointerToTile(pointer);
      if (!tile) return;
      this.tryPlaceTower(tile.col, tile.row);
    });
  }

  private pointerToTile(pointer: Phaser.Input.Pointer): { col: number; row: number } | null {
    const T = GameScene.TILE_SIZE;
    const col = Math.floor(pointer.worldX / T);
    const row = Math.floor(pointer.worldY / T);
    if (col < 0 || col >= GameScene.GRID_COLS) return null;
    if (row < 0 || row >= GameScene.GRID_ROWS) return null;
    return { col, row };
  }

  private isPlaceable(col: number, row: number): boolean {
    if (this.path.isOnPath(col, row, GameScene.TILE_SIZE)) return false;
    if (this.occupiedTiles.has(this.tileKey(col, row))) return false;
    return true;
  }

  private tryPlaceTower(col: number, row: number): void {
    if (!this.isPlaceable(col, row)) return;
    const T = GameScene.TILE_SIZE;
    const x = col * T + T / 2;
    const y = row * T + T / 2;
    const tower = new Tower(this, col, row, x, y, PLACEHOLDER_TOWER_CONFIG);
    this.towers.push(tower);
    this.occupiedTiles.add(this.tileKey(col, row));
  }

  private tileKey(col: number, row: number): string {
    return `${col},${row}`;
  }

  private redrawHover(): void {
    this.hoverGraphics.clear();
    if (!this.hoverTile) return;
    const T = GameScene.TILE_SIZE;
    const { col, row } = this.hoverTile;
    const placeable = this.isPlaceable(col, row);
    const color = placeable ? 0x66ff66 : 0xff3344;
    this.hoverGraphics.lineStyle(3, color, 0.85);
    this.hoverGraphics.strokeRect(col * T + 2, row * T + 2, T - 4, T - 4);
    this.hoverGraphics.fillStyle(color, 0.12);
    this.hoverGraphics.fillRect(col * T + 2, row * T + 2, T - 4, T - 4);
  }

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

  private drawGrid(): void {
    const g = this.add.graphics();
    const T = GameScene.TILE_SIZE;

    for (let c = 0; c < GameScene.GRID_COLS; c++) {
      for (let r = 0; r < GameScene.GRID_ROWS; r++) {
        if (!this.path.isOnPath(c, r, T)) {
          g.fillStyle(0x4c4860, 0.2);
          g.fillRect(c * T + 2, r * T + 2, T - 4, T - 4);
        }
      }
    }

    g.lineStyle(1, 0x2a2a3a, 0.35);
    for (let c = 0; c <= GameScene.GRID_COLS; c++) {
      g.lineBetween(c * T, 0, c * T, GameScene.GRID_ROWS * T);
    }
    for (let r = 0; r <= GameScene.GRID_ROWS; r++) {
      g.lineBetween(0, r * T, GameScene.GRID_COLS * T, r * T);
    }
  }

  private drawPath(): void {
    const T = GameScene.TILE_SIZE;
    const pts = this.path.waypoints;

    const road = this.add.graphics();
    road.lineStyle(T * 0.85, 0x261506, 1);
    road.beginPath();
    road.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) road.lineTo(pts[i].x, pts[i].y);
    road.strokePath();

    const highlight = this.add.graphics();
    highlight.lineStyle(T * 0.7, 0x352010, 1);
    highlight.beginPath();
    highlight.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) highlight.lineTo(pts[i].x, pts[i].y);
    highlight.strokePath();

    const center = this.add.graphics();
    center.lineStyle(3, 0xfff200, 0.85);
    center.beginPath();
    center.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) center.lineTo(pts[i].x, pts[i].y);
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

    this.add.text(20, 38, 'Click any sidewalk tile to place a tower', {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '13px',
      color: '#bbbbbb',
      fontStyle: 'italic',
    });

    this.towerCountText = this.add.text(this.scale.width - 20, 38, 'Towers: 0', {
      fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
      fontSize: '13px',
      color: '#ffffff',
    });
    this.towerCountText.setOrigin(1, 0);

    this.add
      .text(this.scale.width - 20, 12, 'v0.2.1 — M2 / C2', {
        fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
        fontSize: '12px',
        color: '#888888',
      })
      .setOrigin(1, 0);
  }

  private updateTowerCountText(): void {
    if (this.towerCountText) {
      this.towerCountText.setText(`Towers: ${this.towers.length}`);
    }
  }
}
