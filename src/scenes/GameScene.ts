import Phaser from 'phaser';
import { PathSystem, Waypoint } from '../systems/PathSystem';
import { Enemy, EnemyConfig } from '../entities/Enemy';
import { Tower } from '../entities/Tower';
import { Projectile } from '../entities/Projectile';
import { Economy } from '../systems/Economy';
import { WaveManager } from '../systems/WaveManager';
import { PlacementScorer, gradeColor } from '../systems/PlacementScorer';
import { BalanceSimulator } from '../systems/BalanceSimulator';
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
  BULL_MARKET,
  getBullMarketMultiplier,
} from '../balance';
import { PlacementPopup } from '../ui/PlacementPopup';
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

  private path!: PathSystem;
  private economy!: Economy;
  private waveManager!: WaveManager;
  private scorer!: PlacementScorer;
  private gradesVisible = false;
  private gradeOverlayTexts: Phaser.GameObjects.Text[] = [];

  // Click-to-place state machine.
  private pendingTile: { col: number; row: number } | null = null;
  private pendingHighlight!: Phaser.GameObjects.Graphics;
  private placementPopup: PlacementPopup | null = null;
  /**
   * Set true when a popup button (or ✕) handler runs, so the scene-level
   * POINTER_DOWN that fires immediately after doesn't treat the click as a
   * click on the tile behind the popup.
   */
  private popupClickConsumed = false;

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

  /**
   * Phaser hook — runs before create(). Loads the post-invasion Times
   * Square sidewalk texture used by drawBackground().
   *
   * Same-origin asset baked into the Vite build (lives under public/assets/,
   * served from /assets/ at runtime). v0.3.5 attempted to load this from a
   * cross-origin CDN URL and got CORS-blocked in production, leaving Phaser
   * with a missing-texture fallback (bright-green field). v0.3.6 ships the
   * binary in the repo to make the load bulletproof.
   */
  preload(): void {
    this.load.image('sidewalk-bg', '/assets/sidewalk-bg.jpg');
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
    BalanceSimulator.logFullAnalysis(this.scorer, STARTING_GOLD);

    this.enemies = [];
    this.towers = [];
    this.projectiles = [];
    this.occupiedTiles = new Set();
    this.gameOver = false;
    this.towersPlaced = 0;
    this.hoverTile = null;
    this.gradesVisible = false;
    this.gradeOverlayTexts = [];
    this.pendingTile = null;
    this.placementPopup = null;

    this.drawBackground();
    this.drawGrid();
    this.drawPath();
    this.drawHUD();

    this.hoverGraphics = this.add.graphics();
    this.pendingHighlight = this.add.graphics();
    this.pendingHighlight.setDepth(900);

    this.wireInput();

    this.cameras.main.fadeIn(250, 0, 0, 0);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.enemies.forEach((e) => e.destroy());
      this.towers.forEach((t) => t.destroy());
      this.projectiles.forEach((p) => p.destroy());
      this.gradeOverlayTexts.forEach((t) => t.destroy());
      this.placementPopup?.destroy();
      this.enemies = [];
      this.towers = [];
      this.projectiles = [];
      this.gradeOverlayTexts = [];
      this.occupiedTiles.clear();
      this.pendingTile = null;
      this.placementPopup = null;
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

    // Apply Bull Market damage scaling to every tower BEFORE they fire so
    // this frame's projectiles carry the up-to-date boost. Cheap: one
    // multiplier read + one comparison per tower (Tower.setDamageMultiplier
    // no-ops when nothing changed).
    this.applyBullMarketEffect();

    // Apply aura effects BEFORE towers fire / projectiles hit, so any
    // damage applied this frame uses the up-to-date multiplier.
    this.applyAuraEffects();

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

  /**
   * Push the current Bull Market multiplier into every tower. The multiplier
   * comes from current gold (per balance.getBullMarketMultiplier). Hot path —
   * called once per frame; Tower.setDamageMultiplier is a cheap no-op when
   * the value hasn't changed.
   */
  private applyBullMarketEffect(): void {
    const mult = getBullMarketMultiplier(this.economy.gold);
    for (const tower of this.towers) {
      tower.setDamageMultiplier(mult);
    }
  }

  /**
   * Walk every enemy × every aura tower and set each enemy's damage
   * multiplier to the strongest aura covering it. Enemies outside any aura
   * reset to 1.0. Called once per frame before towers fire.
   */
  private applyAuraEffects(): void {
    // Collect aura towers up front to avoid re-checking per enemy.
    const auraTowers = this.towers.filter((t) => t.isAura());

    for (const enemy of this.enemies) {
      if (enemy.dead || enemy.reachedEnd) continue;
      let multiplier = 1.0;
      for (const tower of auraTowers) {
        const dx = enemy.sprite.x - tower.x;
        const dy = enemy.sprite.y - tower.y;
        if (dx * dx + dy * dy <= tower.getRangeSq()) {
          multiplier = Math.max(multiplier, tower.getAuraMultiplier());
        }
      }
      enemy.setDamageMultiplier(multiplier);
    }
  }

  // ---- Input -----------------------------------------------------------

  private wireInput(): void {
    this.input.on(Phaser.Input.Events.POINTER_MOVE, (pointer: Phaser.Input.Pointer) => {
      this.hoverTile = this.pointerToTile(pointer);
      this.redrawHover();
    });

    this.input.on(Phaser.Input.Events.POINTER_DOWN, (pointer: Phaser.Input.Pointer) => {
      // CASE 1: a popup button handler just ran (and may have destroyed the
      // popup). The scene-level pointerdown fires AFTER the button's handler,
      // so we'd otherwise misinterpret this as a click on the tile behind the
      // popup. Consume the flag and bail.
      if (this.popupClickConsumed) {
        this.popupClickConsumed = false;
        return;
      }

      // CASE 2: popup still alive and click landed on its panel (not a button).
      // Ignore — keep the popup open.
      if (this.placementPopup?.containsPoint(pointer.worldX, pointer.worldY)) return;

      const tile = this.pointerToTile(pointer);
      if (!tile) {
        // Clicked outside any tile (and outside popup) — cancel.
        this.cancelPlacement();
        return;
      }

      // Clicked a placeable tile: open popup at that tile.
      if (this.isPlaceable(tile.col, tile.row)) {
        this.openPlacementPopup(tile.col, tile.row);
      } else {
        // Path / occupied tile — cancel any open popup.
        this.cancelPlacement();
      }
    });

    // Press G to toggle the placement-grade overlay across all placeable tiles.
    this.input.keyboard?.on('keydown-G', () => {
      this.gradesVisible = !this.gradesVisible;
      this.renderGradeOverlay();
    });

    // Press Escape to cancel an open popup.
    this.input.keyboard?.on('keydown-ESC', () => {
      this.cancelPlacement();
    });
  }

  /** Open the placement popup over a tile. Cancels any prior popup. */
  private openPlacementPopup(col: number, row: number): void {
    this.cancelPlacement();
    this.pendingTile = { col, row };
    this.drawPendingHighlight();

    const T = GameScene.TILE_SIZE;
    const tileCenterX = col * T + T / 2;
    const tileCenterY = row * T + T / 2;

    this.placementPopup = new PlacementPopup(
      this,
      tileCenterX,
      tileCenterY,
      T,
      ['quant', 'trader', 'hedge_fund'],
      {
        onPick: (type) => {
          // Mark click consumed BEFORE any popup-state changes so the
          // scene-level pointerdown that fires next ignores this click.
          this.popupClickConsumed = true;
          this.commitPlacement(type);
        },
        onCancel: () => {
          this.popupClickConsumed = true;
          this.cancelPlacement();
        },
        canAfford: (type) => this.economy.canAfford(TOWERS[type].cost),
      }
    );
  }

  /**
   * Place the selected tower at the pending tile.
   *
   * Behavior:
   *   - Affordable + placeable: place tower, close popup.
   *   - Unaffordable: flash "Not enough gold!" but KEEP popup open. The
   *     popup auto-refreshes affordability each frame, so the user can wait
   *     for kills/wave bonus to push gold over the threshold and click again.
   *   - Tile no longer placeable: cancel.
   */
  private commitPlacement(type: TowerType): void {
    if (!this.pendingTile) return;
    const { col, row } = this.pendingTile;
    const cfg = TOWERS[type];
    if (!this.economy.canAfford(cfg.cost)) {
      this.flashFloatingText('Not enough gold!', this.scale.width / 2, 110, '#ff4444');
      // Keep popup open — user can wait for gold and click again.
      return;
    }
    if (!this.isPlaceable(col, row)) {
      this.cancelPlacement();
      return;
    }
    this.economy.spend(cfg.cost);
    const T = GameScene.TILE_SIZE;
    const x = col * T + T / 2;
    const y = row * T + T / 2;
    this.towers.push(new Tower(this, col, row, x, y, cfg));
    this.occupiedTiles.add(this.tileKey(col, row));
    this.towersPlaced++;
    this.cancelPlacement();
  }

  /** Close the popup and clear the pending tile. */
  private cancelPlacement(): void {
    this.placementPopup?.destroy();
    this.placementPopup = null;
    this.pendingTile = null;
    this.pendingHighlight.clear();
  }

  /** Highlight the pending tile while popup is open. */
  private drawPendingHighlight(): void {
    this.pendingHighlight.clear();
    if (!this.pendingTile) return;
    const T = GameScene.TILE_SIZE;
    const { col, row } = this.pendingTile;
    this.pendingHighlight.lineStyle(3, 0xfff200, 1);
    this.pendingHighlight.strokeRect(col * T + 2, row * T + 2, T - 4, T - 4);
    this.pendingHighlight.fillStyle(0xfff200, 0.15);
    this.pendingHighlight.fillRect(col * T + 2, row * T + 2, T - 4, T - 4);
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

  private tileKey(col: number, row: number): string {
    return `${col},${row}`;
  }

  private redrawHover(): void {
    this.hoverGraphics.clear();
    if (!this.hoverTile) return;
    // Don't draw hover preview over the pending tile (it has its own yellow highlight).
    if (
      this.pendingTile &&
      this.hoverTile.col === this.pendingTile.col &&
      this.hoverTile.row === this.pendingTile.row
    ) {
      return;
    }
    const T = GameScene.TILE_SIZE;
    const { col, row } = this.hoverTile;
    const placeable = this.isPlaceable(col, row);
    const color = placeable ? 0x66ff66 : 0xff3344;
    this.hoverGraphics.lineStyle(3, color, 0.85);
    this.hoverGraphics.strokeRect(col * T + 2, row * T + 2, T - 4, T - 4);
    this.hoverGraphics.fillStyle(color, 0.12);
    this.hoverGraphics.fillRect(col * T + 2, row * T + 2, T - 4, T - 4);
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

    // Lives — pushed right of the gold text, which can grow to "💰 850g  +43% Bull"
    // when Bull Market kicks in. v0.3.5 had this at x=180 and the heart icons
    // overlapped the Bull suffix; 260 leaves room for the longest gold string.
    this.hudLives = this.add.text(260, 40, '', {
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
      .text(this.scale.width - 20, 12, 'v0.3.6 — M3 / C6 (post-invasion art)', {
        fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
        fontSize: '12px',
        color: '#888888',
      })
      .setOrigin(1, 0);
  }

  private refreshHUD(time: number): void {
    // Gold + Bull Market indicator. Hide the suffix below +5% so early-game
    // (~100g) doesn't get noisy with "+1% Bull" — only show once it's
    // meaningful. Once you hit the cap the suffix locks at "+50% Bull (max)"
    // so the player knows hoarding past 1000g is wasted.
    const bullMult = getBullMarketMultiplier(this.economy.gold);
    const bullPct = Math.round((bullMult - 1) * 100);
    let goldText = `💰 ${this.economy.gold}g`;
    if (bullPct >= 5) {
      const atCap = this.economy.gold >= BULL_MARKET.fullBoostGold;
      goldText += atCap ? `  +${bullPct}% Bull (max)` : `  +${bullPct}% Bull`;
    }
    this.hudGold.setText(goldText);

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

    // Hint — context shifts based on placement state.
    let hint: string;
    if (this.pendingTile) {
      hint = `Choose a tower for tile [${this.pendingTile.col},${this.pendingTile.row}] · ✕ or click elsewhere to cancel · Esc to close`;
    } else if (this.hoverTile) {
      const score = this.scorer.scoreTile(this.hoverTile.col, this.hoverTile.row);
      if (score.rawScore > 0) {
        hint = `Click to place — Tile [${this.hoverTile.col},${this.hoverTile.row}] · Grade ${score.grade} (${Math.round(score.rawScore)}px in range, ${Math.round(score.normalized * 100)}% of best) · G for all grades`;
      } else {
        hint = `Tile [${this.hoverTile.col},${this.hoverTile.row}] · blocked (on path or occupied)`;
      }
    } else {
      hint = `Click any sidewalk tile to choose a tower · G for placement grades`;
    }
    this.hudHint.setText(hint);

    // Keep the placement popup's affordability state in sync with current gold
    // so towers light up the moment the player can afford them — without
    // needing to close + reopen the popup.
    this.placementPopup?.refresh();
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
    const hedgeFundBoost = TOWERS.hedge_fund.aura?.damageMultiplier ?? 1.0;

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
      `  Quant:      ${quantDps.toFixed(1)} DPS | range ${TOWERS.quant.range}px | cost ${TOWERS.quant.cost}g`
    );
    console.log(
      `  Trader:     ${traderDps.toFixed(1)} DPS | range ${TOWERS.trader.range}px | cost ${TOWERS.trader.cost}g`
    );
    console.log(
      `  Hedge Fund: aura ×${hedgeFundBoost} | range ${TOWERS.hedge_fund.range}px | cost ${TOWERS.hedge_fund.cost}g (no direct damage; buffs other towers)`
    );
    console.log(
      `  Bull Market: dmg ×1.0 → ×${BULL_MARKET.capMultiplier} as gold goes 0 → ${BULL_MARKET.fullBoostGold}g (+${Math.round((BULL_MARKET.capMultiplier - 1) * 100)}% cap)`
    );
    console.log(
      `  Run total: ${runEnemies} enemies, ${runHp} HP across ${WAVE_DEFINITIONS.length} waves (grunt ${grunt}, heavy ${heavy})`
    );
    console.log(
      '  Press G in-game to toggle the grade overlay; click any tile to choose a tower.'
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

  /**
   * Lay down the Times Square sidewalk photo as the scene background.
   * Stretched to fill the canvas (1280x720 game res; image is 1920x1080
   * for retina-quality at this size). A subtle dark vignette is layered
   * on top so the HUD text still reads against the warm photo and the
   * yellow path stripe pops.
   */
  private drawBackground(): void {
    const { width, height } = this.scale;

    const bg = this.add.image(width / 2, height / 2, 'sidewalk-bg');
    bg.setDisplaySize(width, height);
    bg.setDepth(-100);

    // Soft vignette — keeps HUD legible without flattening the photo.
    const vignette = this.add.graphics();
    vignette.fillStyle(0x000000, 0.22);
    vignette.fillRect(0, 0, width, height);
    vignette.setDepth(-99);
  }

  /**
   * Draw the placement grid. Pre-v0.3.5 we filled non-path tiles with a
   * flat grey overlay so they read as "placeable"; with the photo
   * background we drop the fills (they'd just smudge the texture) and
   * keep only thin grid lines so players can still eyeball tile centers.
   */
  private drawGrid(): void {
    const g = this.add.graphics();
    const T = GameScene.TILE_SIZE;
    g.lineStyle(1, 0xffffff, 0.08); // very faint, just enough to land your eye on a tile
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
