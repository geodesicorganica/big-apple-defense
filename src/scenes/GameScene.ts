import Phaser from 'phaser';
import { PathSystem, Waypoint } from '../systems/PathSystem';
import { Enemy, EnemyConfig } from '../entities/Enemy';
import { Tower } from '../entities/Tower';
import { Projectile } from '../entities/Projectile';
import { Economy } from '../systems/Economy';
import { WaveManager } from '../systems/WaveManager';
import { PlacementScorer, gradeColor } from '../systems/PlacementScorer';
import {
  STARTING_GOLD,
  STARTING_LIVES,
  TOWERS,
  TowerType,
  SCORING_REFERENCE_TOWER,
  GRUNT_CONFIG,
  HEAVY_CONFIG,
  WAVE_DEFINITIONS,
  WAVE_REWARDS,
  EnemyType,
} from '../balance';
import { TowerPalette } from '../ui/TowerPalette';
import type { GameOverData } from './GameOverScene';

/**
 * GameScene — full M2 core loop.
 *
 *  - 16x9 grid (80px tiles) with hardcoded Times Square S-curve path
 *  - 3 waves driven by WaveManager (3-sec prep, spawn schedule, mop-up gate)
 *  - Tower placement: click sidewalk, pay gold, tower fires at nearest enemy
 *  - Projectiles deal damage; kills earn gold; leaks cost lives
 *  - Win = all 3 waves cleared with lives > 0
 *  - Lose = lives reach 0 → GameOverScene with stats + retry
 *
 *  HUD overlay (top-left to top-right):
 *    [💰 Gold] [❤ Lives] [Wave status / countdown]
 */
export class GameScene extends Phaser.Scene {
  // Layout constants — these are NOT balance numbers (changing them changes the
  // grid geometry, not difficulty). Tunable balance lives in src/balance.ts.
  static readonly TILE_SIZE = 80;
  static readonly GRID_COLS = 16;
  static readonly GRID_ROWS = 9;
  /** Vertical offset of the bottom palette strip — y >= this is the palette area. */
  static readonly PALETTE_STRIP_Y = 720;

  private path!: PathSystem;
  private economy!: Economy;
  private waveManager!: WaveManager;
  private scorer!: PlacementScorer;
  private palette!: TowerPalette;
  private gradesVisible = false;
  private gradeOverlayTexts: Phaser.GameObjects.Text[] = [];

  private enemies: Enemy[] = [];
  private towers: Tower[] = [];
  private projectiles: Projectile[] = [];
  private occupiedTiles = new Set<string>();

  private gameOver = false;
  private towersPlaced = 0;

  // HUD
  private hudGold!: Phaser.GameObjects.Text;
  private hudLives!: Phaser.GameObjects.Text;
  private hudWave!: Phaser.GameObjects.Text;
  private hudHint!: Phaser.GameObjects.Text;
  private hoverGraphics!: Phaser.GameObjects.Graphics;
  private hoverTile: { col: number; row: number } | null = null;

  constructor() {
    super({ key: 'GameScene' });
  }

  create(): void {
    this.path = new PathSystem(this.buildPathWaypoints());
    this.economy = new Economy(STARTING_GOLD, STARTING_LIVES);
    this.waveManager = new WaveManager(this, WAVE_DEFINITIONS);
    this.scorer = new PlacementScorer(
      this.path,
      GameScene.TILE_SIZE,
      SCORING_REFERENCE_TOWER.range
    );
    this.scorer.computeAllScores(GameScene.GRID_COLS, GameScene.GRID_ROWS);
    this.logBalanceSummary();

    this.enemies = [];
    this.towers = [];
    this.projectiles = [];
    this.occupiedTiles = new Set();
    this.gameOver = false;
    this.towersPlaced = 0;
    this.hoverTile = null;
    this.gradesVisible = false;
    this.gradeOverlayTexts = [];

    this.drawBackground();
    this.drawPaletteStripBackground();
    this.drawGrid();
    this.drawPath();
    this.drawHUD();

    this.hoverGraphics = this.add.graphics();

    // Tower selection palette in the bottom strip.
    this.palette = new TowerPalette(
      this,
      ['quant', 'trader'],
      this.scale.width / 2,
      GameScene.PALETTE_STRIP_Y + (this.scale.height - GameScene.PALETTE_STRIP_Y) / 2
    );

    this.wireInput();

    this.cameras.main.fadeIn(250, 0, 0, 0);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.enemies.forEach((e) => e.destroy());
      this.towers.forEach((t) => t.destroy());
      this.projectiles.forEach((p) => p.destroy());
      this.gradeOverlayTexts.forEach((t) => t.destroy());
      this.enemies = [];
      this.towers = [];
      this.projectiles = [];
      this.gradeOverlayTexts = [];
      this.occupiedTiles.clear();
    });
  }

  override update(time: number, delta: number): void {
    if (this.gameOver) return;

    const enemiesOnField = this.enemies.length;
    const step = this.waveManager.update(time, enemiesOnField);
    if (step) {
      this.spawnEnemy(step.enemyType);
    }

    if (this.waveManager.isAwaitingAdvance() && !this.waveManager.isAllDone()) {
      const waveIdx = this.waveManager.getCurrentWaveNumber() - 1;
      const reward = WAVE_REWARDS[waveIdx] ?? 50;
      this.economy.earn(reward);
      this.flashFloatingText(
        `Wave ${this.waveManager.getCurrentWaveNumber()} clear! +${reward}g`,
        this.scale.width / 2,
        110,
        '#fff200'
      );
      this.waveManager.advance();
    }

    if (
      this.waveManager.isAllDone() &&
      this.enemies.length === 0 &&
      !this.gameOver
    ) {
      this.endGame(true);
      return;
    }

    const deltaSeconds = delta / 1000;
    for (const enemy of this.enemies) enemy.update(deltaSeconds);

    for (const tower of this.towers) {
      const projectile = tower.update(time, this.enemies);
      if (projectile) this.projectiles.push(projectile);
    }

    for (const projectile of this.projectiles) projectile.update(deltaSeconds);

    // Cull dead/leaked entities and update economy
    const stillAlive: Enemy[] = [];
    for (const enemy of this.enemies) {
      if (enemy.dead) {
        this.economy.earn(enemy.config.goldReward);
        this.economy.recordKill();
        enemy.destroy();
      } else if (enemy.reachedEnd) {
        const ranOut = this.economy.loseLife();
        enemy.destroy();
        if (ranOut) {
          this.endGame(false);
          // Flush remaining cleanup but skip further game logic this frame
          this.enemies = [];
          this.projectiles = this.projectiles.filter((p) => {
            p.destroy();
            return false;
          });
          return;
        }
      } else {
        stillAlive.push(enemy);
      }
    }
    this.enemies = stillAlive;

    this.projectiles = this.projectiles.filter((p) => {
      if (p.dead) {
        p.destroy();
        return false;
      }
      return true;
    });

    this.refreshHUD(time);
  }

  // ---- Setup -----------------------------------------------------------

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

  private spawnEnemy(type: EnemyType): void {
    const config: EnemyConfig = type === 'heavy' ? HEAVY_CONFIG : GRUNT_CONFIG;
    this.enemies.push(new Enemy(this, this.path, config));
  }

  // ---- Input -----------------------------------------------------------

  private wireInput(): void {
    this.input.on(Phaser.Input.Events.POINTER_MOVE, (pointer: Phaser.Input.Pointer) => {
      this.hoverTile = this.pointerToTile(pointer);
      this.redrawHover();
    });

    this.input.on(Phaser.Input.Events.POINTER_DOWN, (pointer: Phaser.Input.Pointer) => {
      // Skip if click landed on the tower palette — it has its own handlers.
      if (this.palette.containsPoint(pointer.worldX, pointer.worldY)) return;
      const tile = this.pointerToTile(pointer);
      if (!tile) return;
      this.tryPlaceTower(tile.col, tile.row);
    });

    // Press G to toggle the placement-grade overlay across all placeable tiles.
    this.input.keyboard?.on('keydown-G', () => {
      this.gradesVisible = !this.gradesVisible;
      this.renderGradeOverlay();
    });
  }

  /** Currently selected tower's config, via the palette. */
  private selectedTowerConfig() {
    return TOWERS[this.palette.getSelected()];
  }

  private pointerToTile(pointer: Phaser.Input.Pointer): { col: number; row: number } | null {
    const T = GameScene.TILE_SIZE;
    // Clicks below the grid (in the palette strip) don't map to a tile.
    if (pointer.worldY >= GameScene.PALETTE_STRIP_Y) return null;
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
    const cfg = this.selectedTowerConfig();
    if (!this.economy.canAfford(cfg.cost)) {
      this.flashFloatingText('Not enough gold!', this.scale.width / 2, 110, '#ff4444');
      return;
    }
    this.economy.spend(cfg.cost);
    const T = GameScene.TILE_SIZE;
    const x = col * T + T / 2;
    const y = row * T + T / 2;
    this.towers.push(new Tower(this, col, row, x, y, cfg));
    this.occupiedTiles.add(this.tileKey(col, row));
    this.towersPlaced++;
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
    const cfg = this.selectedTowerConfig();
    const affordable = this.economy.canAfford(cfg.cost);
    const ok = placeable && affordable;
    const color = ok ? 0x66ff66 : 0xff3344;
    this.hoverGraphics.lineStyle(3, color, 0.85);
    this.hoverGraphics.strokeRect(col * T + 2, row * T + 2, T - 4, T - 4);
    this.hoverGraphics.fillStyle(color, 0.12);
    this.hoverGraphics.fillRect(col * T + 2, row * T + 2, T - 4, T - 4);

    // Range preview circle on the hovered tile.
    if (placeable) {
      const cx = col * T + T / 2;
      const cy = row * T + T / 2;
      this.hoverGraphics.lineStyle(1, cfg.accentColor, 0.5);
      this.hoverGraphics.strokeCircle(cx, cy, cfg.range);
    }
  }

  // ---- HUD -------------------------------------------------------------

  private drawHUD(): void {
    // Top-left: title
    this.add.text(20, 12, 'BIG APPLE DEFENSE', {
      fontFamily: 'Impact, "Arial Black", system-ui, sans-serif',
      fontSize: '20px',
      color: '#fff200',
      stroke: '#c1272d',
      strokeThickness: 2,
    });

    // Gold
    this.hudGold = this.add.text(20, 40, '', {
      fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
      fontSize: '18px',
      color: '#fff200',
      fontStyle: 'bold',
    });

    // Lives
    this.hudLives = this.add.text(180, 40, '', {
      fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
      fontSize: '18px',
      color: '#ff5566',
      fontStyle: 'bold',
    });

    // Wave status (top center)
    this.hudWave = this.add
      .text(this.scale.width / 2, 20, '', {
        fontFamily: 'Impact, "Arial Black", system-ui, sans-serif',
        fontSize: '24px',
        color: '#ffffff',
      })
      .setOrigin(0.5, 0);

    // Hint (top-center, below wave indicator). Updates on hover with placement
    // grade info from the scorer.
    this.hudHint = this.add
      .text(this.scale.width / 2, 50, '', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '13px',
        color: '#bbbbbb',
        fontStyle: 'italic',
      })
      .setOrigin(0.5, 0);

    // Version tag (top-right corner)
    this.add
      .text(this.scale.width - 20, 12, 'v0.3.0 — M3 / C1 (Finance Bros)', {
        fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
        fontSize: '12px',
        color: '#888888',
      })
      .setOrigin(1, 0);
  }

  /**
   * Render a dark strip across the bottom of the canvas to visually separate
   * the tower palette from the gameplay grid.
   */
  private drawPaletteStripBackground(): void {
    const stripHeight = this.scale.height - GameScene.PALETTE_STRIP_Y;
    const g = this.add.graphics();
    g.fillStyle(0x0a0a14, 1);
    g.fillRect(0, GameScene.PALETTE_STRIP_Y, this.scale.width, stripHeight);
    // Top border accent
    g.lineStyle(1, 0xfff200, 0.35);
    g.lineBetween(0, GameScene.PALETTE_STRIP_Y, this.scale.width, GameScene.PALETTE_STRIP_Y);
  }

  private refreshHUD(time: number): void {
    // Gold
    this.hudGold.setText(`💰 ${this.economy.gold}g`);

    // Lives — heart icons
    const filled = '❤'.repeat(this.economy.lives);
    const empty = '♡'.repeat(this.economy.maxLives - this.economy.lives);
    this.hudLives.setText(filled + empty);

    // Wave status
    const state = this.waveManager.getState();
    const wave = this.waveManager.getCurrentWaveNumber();
    const total = this.waveManager.getTotalWaves();
    let waveText = `Wave ${wave}/${total}`;
    if (state === 'prep') {
      const remaining = Math.ceil(this.waveManager.getPrepRemainingMs(time) / 1000);
      waveText = `Wave ${wave}/${total} starts in ${remaining}…`;
    } else if (state === 'spawning' || state === 'mopping_up') {
      const remaining = this.waveManager.getEnemiesRemainingThisWave(this.enemies.length);
      waveText = `Wave ${wave}/${total} — ${remaining} enemies left`;
    } else if (state === 'all_done') {
      waveText = `All waves cleared!`;
    }
    this.hudWave.setText(waveText);

    // Hint — selected tower + hovered tile's placement grade.
    const selected = this.palette.getSelected();
    const cfg = this.selectedTowerConfig();
    const selectedLabel = selected.charAt(0).toUpperCase() + selected.slice(1);
    let hint = `${selectedLabel} (${cfg.cost}g) — pick a sidewalk tile · 1/2 to switch · G for grades`;
    if (this.hoverTile) {
      const score = this.scorer.scoreTile(this.hoverTile.col, this.hoverTile.row);
      if (score.rawScore > 0) {
        hint = `${selectedLabel} (${cfg.cost}g) — Tile [${this.hoverTile.col},${this.hoverTile.row}] · Grade ${score.grade} (${Math.round(score.rawScore)}px in range, ${Math.round(score.normalized * 100)}% of best)`;
      } else {
        hint = `${selectedLabel} (${cfg.cost}g) — Tile [${this.hoverTile.col},${this.hoverTile.row}] · blocked (on path or occupied)`;
      }
    }
    this.hudHint.setText(hint);

    // Reflect affordability state in the palette buttons.
    this.palette.refresh(this.economy);
  }

  /** Render or clear the grade letter overlay across all placeable tiles. */
  private renderGradeOverlay(): void {
    this.gradeOverlayTexts.forEach((t) => t.destroy());
    this.gradeOverlayTexts = [];
    if (!this.gradesVisible) return;

    const T = GameScene.TILE_SIZE;
    for (let c = 0; c < GameScene.GRID_COLS; c++) {
      for (let r = 0; r < GameScene.GRID_ROWS; r++) {
        const score = this.scorer.scoreTile(c, r);
        if (score.rawScore <= 0) continue;
        const text = this.add
          .text(c * T + T / 2, r * T + T / 2, score.grade, {
            fontFamily: 'Impact, "Arial Black", system-ui, sans-serif',
            fontSize: '28px',
            fontStyle: 'bold',
            color: gradeColor(score.grade),
            stroke: '#000000',
            strokeThickness: 4,
          })
          .setOrigin(0.5);
        text.setAlpha(0.85);
        this.gradeOverlayTexts.push(text);
      }
    }
  }

  /**
   * Print a balance summary to the browser console at scene start. Lets us
   * verify systematically that good placement wins and bad placement loses.
   */
  private logBalanceSummary(): void {
    const ranked = this.scorer.getRankedScores();
    if (ranked.length === 0) return;

    const counts: Record<string, number> = { S: 0, A: 0, B: 0, C: 0, D: 0 };
    for (const r of ranked) counts[r.score.grade] = (counts[r.score.grade] ?? 0) + 1;

    const top = (n: number) =>
      ranked.slice(0, n).reduce((s, r) => s + r.score.rawScore, 0);
    const bottom = (n: number) =>
      ranked
        .slice(Math.max(0, ranked.length - n))
        .reduce((s, r) => s + r.score.rawScore, 0);

    // Total HP across the run for context.
    const grunt = GRUNT_CONFIG.hp;
    const heavy = HEAVY_CONFIG.hp;
    let runHp = 0;
    let runEnemies = 0;
    for (const wave of WAVE_DEFINITIONS) {
      for (const step of wave) {
        runHp += step.enemyType === 'heavy' ? heavy : grunt;
        runEnemies++;
      }
    }

    const quantDps = TOWERS.quant.damage / (TOWERS.quant.fireRateMs / 1000);
    const traderDps = TOWERS.trader.damage / (TOWERS.trader.fireRateMs / 1000);

    /* eslint-disable no-console */
    console.log('%c[Balance] Big Apple Defense placement scores', 'color:#fff200;font-weight:bold');
    console.log(
      `  Tile distribution (Quant range ref) — S:${counts.S}  A:${counts.A}  B:${counts.B}  C:${counts.C}  D:${counts.D}  (placeable total: ${ranked.length})`
    );
    console.log(
      `  Best placement: [${ranked[0].col},${ranked[0].row}] = ${Math.round(ranked[0].score.rawScore)}px in range (Grade ${ranked[0].score.grade})`
    );
    const worst = ranked[ranked.length - 1];
    console.log(
      `  Worst placement: [${worst.col},${worst.row}] = ${Math.round(worst.score.rawScore)}px in range (Grade ${worst.score.grade})`
    );
    console.log(
      `  Skill ceiling (top 4 tiles, sum of px-in-range): ${Math.round(top(4))}`
    );
    console.log(
      `  Skill floor   (bottom 4 tiles): ${Math.round(bottom(4))}`
    );
    console.log(
      `  Quant:  ${quantDps.toFixed(1)} DPS | range ${TOWERS.quant.range}px | cost ${TOWERS.quant.cost}g`
    );
    console.log(
      `  Trader: ${traderDps.toFixed(1)} DPS | range ${TOWERS.trader.range}px | cost ${TOWERS.trader.cost}g`
    );
    console.log(
      `  Run total: ${runEnemies} enemies, ${runHp} HP (grunt ${grunt}, heavy ${heavy})`
    );
    console.log(
      '  Press G in-game to toggle the grade overlay; press 1/2 to switch towers.'
    );
    /* eslint-enable no-console */
  }

  private flashFloatingText(text: string, x: number, y: number, color: string): void {
    const t = this.add
      .text(x, y, text, {
        fontFamily: 'Impact, "Arial Black", system-ui, sans-serif',
        fontSize: '28px',
        color,
        fontStyle: 'bold',
        stroke: '#000000',
        strokeThickness: 4,
      })
      .setOrigin(0.5);
    this.tweens.add({
      targets: t,
      y: y - 40,
      alpha: 0,
      duration: 1400,
      ease: 'Quad.easeOut',
      onComplete: () => t.destroy(),
    });
  }

  // ---- Game over -------------------------------------------------------

  private endGame(won: boolean): void {
    if (this.gameOver) return;
    this.gameOver = true;

    const data: GameOverData = {
      won,
      waveReached: this.waveManager.getCurrentWaveNumber(),
      totalWaves: this.waveManager.getTotalWaves(),
      kills: this.economy.kills,
      towersPlaced: this.towersPlaced,
      goldSpent: this.economy.goldSpent,
      goldEarned: this.economy.goldEarned,
      livesRemaining: this.economy.lives,
    };

    this.cameras.main.fadeOut(400, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.start('GameOverScene', data);
    });
  }

  // ---- Rendering -------------------------------------------------------

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
}
