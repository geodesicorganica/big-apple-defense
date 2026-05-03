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
  private boostRing: Phaser.GameObjects.Arc | null = null;

  private lastFireTime = -Infinity;

  /**
   * Damage multiplier from external buffs (Bull Market, future clan
   * passives). Default 1.0. Applied to projectile damage at fire time and
   * drives the green "boost ring" visual when above 1.0.
   * The scene calls setDamageMultiplier() each frame; we cache so we only
   * touch the visual when the value actually changes.
   */
  private damageMultiplier = 1.0;

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

  /**
   * External buff multiplier (Bull Market, etc.). The scene calls this each
   * frame; we no-op when nothing changed, and update the green boost ring
   * visual only on real transitions. Aura towers track the value (in case
   * future passives matter to them) but don't show the ring since they
   * deal no damage.
   */
  setDamageMultiplier(value: number): void {
    if (Math.abs(value - this.damageMultiplier) < 0.001) return;
    this.damageMultiplier = value;
    if (this.isAura()) return;
    this.refreshBoostRing();
  }

  getDamageMultiplier(): number {
    return this.damageMultiplier;
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
      this.config.damage * this.damageMultiplier,
      this.config.accentColor
    );
  }

  destroy(): void {
    this.sprite.destroy();
    this.auraRing?.destroy();
    this.auraRing = null;
    this.boostRing?.destroy();
    this.boostRing = null;
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

  /**
   * Sync the green Bull Market boost ring with the current damageMultiplier.
   * Lazy-creates the ring on first non-zero boost; alpha scales with the
   * size of the buff so a small reserve looks subtle and a fat reserve looks
   * obvious. Tied to the sprite container so it spawns/dies with the tower.
   */
  private refreshBoostRing(): void {
    const boost = Math.max(0, this.damageMultiplier - 1);

    if (boost <= 0.001) {
      // Hide ring when no boost; keep the object so we don't churn alloc.
      if (this.boostRing) this.boostRing.setVisible(false);
      return;
    }

    if (!this.boostRing) {
      this.boostRing = this.scene.add.circle(0, 0, 32, 0x10b981, 0);
      this.boostRing.setStrokeStyle(2, 0x10b981, 0);
      this.sprite.add(this.boostRing);
      this.sprite.sendToBack(this.boostRing);
    }

    // Cap visual at +50%; alpha 0..0.55 fill, 0..0.85 stroke.
    const v = Math.min(boost / 0.5, 1);
    this.boostRing.setVisible(true);
    this.boostRing.setFillStyle(0x10b981, v * 0.25);
    this.boostRing.setStrokeStyle(2, 0x10b981, 0.3 + v * 0.55);
    // Subtle radius bump so a maxed ring reads as "expanded" cash-glow.
    this.boostRing.setRadius(32 + v * 4);
  }
}

// Tower stats live in src/balance.ts — see PLACEHOLDER_TOWER_CONFIG there.
