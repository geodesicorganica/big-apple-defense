import Phaser from 'phaser';
import { Enemy } from './Enemy';
import { Projectile } from './Projectile';

/**
 * Base Tower class. Placed on a sidewalk tile, fires projectiles at the nearest
 * enemy within range. M2 uses a single placeholder tower configuration; M3+
 * introduces clan-specific subclasses (Quant, Trader, Hedge Fund, etc.).
 */
export interface TowerConfig {
  readonly damage: number;
  readonly range: number;
  readonly fireRateMs: number;
  readonly bodyColor: number;
  readonly accentColor: number;
  readonly cost: number;
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

    this.sprite.setScale(0.3);
    scene.tweens.add({
      targets: this.sprite,
      scale: 1,
      duration: 200,
      ease: 'Back.easeOut',
    });

    this.flashRange();
  }

  /** Tick the tower's targeting logic. Returns a new Projectile if the tower fired. */
  update(currentTimeMs: number, enemies: Enemy[]): Projectile | null {
    const target = this.findNearestTargetInRange(enemies);
    if (!target) return null;
    if (currentTimeMs - this.lastFireTime < this.config.fireRateMs) return null;

    this.lastFireTime = currentTimeMs;

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
}

/**
 * M2 placeholder tower — single type, no clan logic yet.
 *
 * Balance history:
 *   v0.2.2 (original): 22 dmg / 600ms / 200 range — too easy
 *   v0.2.3 (hard):     14 dmg / 850ms / 175 range — too hard, lost on W1/2
 *   v0.2.4 (current):  midpoint pass, dialed back halfway
 */
export const PLACEHOLDER_TOWER_CONFIG: TowerConfig = {
  damage: 18,
  range: 185,
  fireRateMs: 725,
  bodyColor: 0x1a2a44,
  accentColor: 0xd4af37,
  cost: 75,
};
