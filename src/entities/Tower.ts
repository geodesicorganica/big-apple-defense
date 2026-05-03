import Phaser from 'phaser';
import { Enemy } from './Enemy';
import { Projectile } from './Projectile';

/**
 * Base Tower class. Placed on a sidewalk tile, fires projectiles at the nearest
 * enemy within range. M2 uses a single placeholder tower configuration; M3+
 * introduces clan-specific subclasses (Quant, Trader, Hedge Fund, etc.).
 *
 * Aura towers (e.g. Hedge Fund) skip the firing path entirely — they exist
 * solely to apply their `aura` effect to enemies in range. The scene applies
 * the effect by reading each tower's aura config every frame.
 */
export interface TowerConfig {
  readonly damage: number;
  readonly range: number;
  readonly fireRateMs: number;
  readonly bodyColor: number;
  readonly accentColor: number;
  readonly cost: number;
  /**
   * If set, this tower is a passive aura — it does not fire projectiles.
   * The scene applies the effect every frame to enemies in range.
   */
  readonly aura?: {
    /**
     * Multiplier applied to incoming damage on enemies in range.
     * 1.0 = no effect, 1.5 = +50% damage taken, 2.0 = double damage.
     */
    readonly damageMultiplier: number;
  };
}

export class Tower {
  public readonly sprite: Phaser.GameObjects.Container;
  public readonly col: number;
  public readonly row: number;
  public readonly x: number;
  public readonly y: number;
  public readonly config: TowerConfig;

  private readonly body: Phaser.GameObjects.Rectangle;
  private readonly accent: Phaser.GameObjects.Arc;
  private auraRing: Phaser.GameObjects.Arc | null = null;

  private lastFireTime = -Infinity;

  constructor(
    private readonly scene: Phaser.Scene,
    col: number,
    row: number,
    x: number,
    y: number,
    config: TowerConfig
  ) {
    this.col = col;
    this.row = row;
    this.x = x;
    this.y = y;
    this.config = config;

    this.sprite = scene.add.container(x, y);

    this.body = scene.add
      .rectangle(0, 0, 52, 52, config.bodyColor)
      .setStrokeStyle(2, 0x000000, 0.7);

    this.accent = scene.add
      .circle(0, 0, 18, config.accentColor)
      .setStrokeStyle(2, 0x000000, 0.5);

    this.sprite.add([this.body, this.accent]);

    // Brief spawn pulse so placement feels punchy
    this.sprite.setScale(0.3);
    scene.tweens.add({
      targets: this.sprite,
      scale: 1,
      duration: 200,
      ease: 'Back.easeOut',
    });

    // Aura towers get a permanent pulsing ring; damage towers get a
    // brief placement flash.
    if (this.isAura()) {
      this.setupAuraRing();
    } else {
      this.flashRange();
    }
  }

  /** True if this tower is a passive aura (no firing). */
  isAura(): boolean {
    return this.config.aura !== undefined;
  }

  /** Damage multiplier applied to enemies in range (1.0 if not an aura). */
  getAuraMultiplier(): number {
    return this.config.aura?.damageMultiplier ?? 1.0;
  }

  /** Squared range — useful for fast distance checks in aura update loops. */
  getRangeSq(): number {
    return this.config.range * this.config.range;
  }

  /** Tick the tower's targeting logic. Returns a new Projectile if the tower fired. */
  update(currentTimeMs: number, enemies: Enemy[]): Projectile | null {
    // Aura towers don't fire — the scene applies their effect each frame.
    if (this.isAura()) return null;

    const target = this.findNearestTargetInRange(enemies);
    if (!target) return null;
    if (currentTimeMs - this.lastFireTime < this.config.fireRateMs) return null;

    this.lastFireTime = currentTimeMs;

    // Brief firing kick: small scale pulse on the accent
    this.scene.tweens.add({
      targets: this.accent,
      scale: { from: 1.25, to: 1 },
      duration: 120,
      ease: 'Quad.easeOut',
    });

    return new Projectile(
      this.scene,
      this.x,
      this.y,
      target,
      this.config.damage,
      this.config.accentColor
    );
  }

  destroy(): void {
    this.sprite.destroy();
    this.auraRing?.destroy();
    this.auraRing = null;
  }

  private findNearestTargetInRange(enemies: Enemy[]): Enemy | null {
    let best: Enemy | null = null;
    let bestDist = this.config.range;
    for (const e of enemies) {
      if (e.dead || e.reachedEnd) continue;
      const dx = e.sprite.x - this.x;
      const dy = e.sprite.y - this.y;
      const dist = Math.hypot(dx, dy);
      if (dist < bestDist) {
        best = e;
        bestDist = dist;
      }
    }
    return best;
  }

  private flashRange(): void {
    const ring = this.scene.add.circle(this.x, this.y, this.config.range, 0xffffff, 0.06);
    ring.setStrokeStyle(2, this.config.accentColor, 0.7);
    this.scene.tweens.add({
      targets: ring,
      alpha: 0,
      duration: 800,
      ease: 'Quad.easeOut',
      onComplete: () => ring.destroy(),
    });
  }

  /**
   * Set up a permanent pulsing aura ring for aura towers. Sits behind enemies
   * so they appear to walk through it. Subtle alpha pulse makes the aura feel
   * "alive" without being visually noisy.
   */
  private setupAuraRing(): void {
    this.auraRing = this.scene.add.circle(
      this.x,
      this.y,
      this.config.range,
      this.config.accentColor,
      0.1
    );
    this.auraRing.setStrokeStyle(2, this.config.accentColor, 0.55);
    this.auraRing.setDepth(-1); // behind enemy sprites
    this.scene.tweens.add({
      targets: this.auraRing,
      alpha: { from: 0.7, to: 1 },
      duration: 1500,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }
}

// Tower stats live in src/balance.ts — see PLACEHOLDER_TOWER_CONFIG there.
