import Phaser from 'phaser';
import { Enemy } from './Enemy';

/**
 * Projectile fired by a Tower at a specific Enemy target.
 * Travels at constant speed toward the target's current position. On contact,
 * deals damage and dies. If the target dies or leaks before contact, the
 * projectile dies harmlessly.
 */
export class Projectile {
  public readonly sprite: Phaser.GameObjects.Arc;
  public dead = false;

  private static readonly SPEED = 720; // pixels per second
  private static readonly HIT_RADIUS = 12;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    private readonly target: Enemy,
    private readonly damage: number,
    color: number = 0xfff200
  ) {
    this.sprite = scene.add
      .circle(x, y, 5, color)
      .setStrokeStyle(1, 0xffffff, 0.9);
  }

  update(deltaSeconds: number): void {
    if (this.dead) return;

    if (this.target.dead || this.target.reachedEnd) {
      this.dead = true;
      return;
    }

    const dx = this.target.sprite.x - this.sprite.x;
    const dy = this.target.sprite.y - this.sprite.y;
    const dist = Math.hypot(dx, dy);

    if (dist < Projectile.HIT_RADIUS) {
      this.target.takeDamage(this.damage);
      this.dead = true;
      return;
    }

    const step = Projectile.SPEED * deltaSeconds;
    if (dist > 0) {
      this.sprite.x += (dx / dist) * step;
      this.sprite.y += (dy / dist) * step;
    }
  }

  destroy(): void {
    this.sprite.destroy();
  }
}
