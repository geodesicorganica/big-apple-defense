import Phaser from 'phaser';
import { PathSystem } from '../systems/PathSystem';

/**
 * Base Enemy class. Walks the path from spawn to leak point at a given speed.
 * In M2 there are two placeholder types: grunt (cheap, fast-ish, low HP) and
 * heavy (slow, tanky). Both rendered as colored circles.
 */
export interface EnemyConfig {
  readonly hp: number;
  readonly speed: number; // pixels per second
  readonly radius: number;
  readonly color: number;
  readonly goldReward: number;
}

export class Enemy {
  public readonly sprite: Phaser.GameObjects.Container;
  public readonly body: Phaser.GameObjects.Arc;
  public readonly hpBar: Phaser.GameObjects.Graphics;

  public hp: number;
  public readonly maxHp: number;
  public readonly config: EnemyConfig;

  private distanceTraveled = 0;
  public reachedEnd = false;
  public dead = false;

  /**
   * Multiplier on incoming damage. Default 1.0 (no buff). Aura towers (e.g.
   * Hedge Fund) raise this above 1.0 for enemies in their range. The scene
   * sets it every frame; takeDamage() uses it at hit time.
   */
  private _damageMultiplier = 1.0;

  constructor(
    scene: Phaser.Scene,
    private readonly path: PathSystem,
    config: EnemyConfig
  ) {
    this.config = config;
    this.maxHp = config.hp;
    this.hp = config.hp;

    const start = path.getPositionAtDistance(0);
    this.sprite = scene.add.container(start.x, start.y);

    this.body = scene.add
      .circle(0, 0, config.radius, config.color)
      .setStrokeStyle(2, 0x000000, 0.6);

    this.hpBar = scene.add.graphics();
    this.drawHpBar();

    this.sprite.add([this.body, this.hpBar]);
  }

  update(deltaSeconds: number): void {
    if (this.dead || this.reachedEnd) return;
    this.distanceTraveled += this.config.speed * deltaSeconds;
    const pos = this.path.getPositionAtDistance(this.distanceTraveled);
    this.sprite.setPosition(pos.x, pos.y);
    if (pos.reachedEnd) {
      this.reachedEnd = true;
    }
  }

  takeDamage(amount: number): void {
    if (this.dead) return;
    const adjusted = amount * this._damageMultiplier;
    this.hp = Math.max(0, this.hp - adjusted);
    this.drawHpBar();
    if (this.hp <= 0) {
      this.dead = true;
    }
  }

  /**
   * Set the damage-multiplier for this enemy (1.0 = no buff). Updates the
   * body stroke color so the player can see at a glance which enemies are
   * boosted by an aura.
   */
  setDamageMultiplier(value: number): void {
    if (Math.abs(value - this._damageMultiplier) < 0.001) return;
    this._damageMultiplier = value;
    if (value > 1.0) {
      this.body.setStrokeStyle(3, 0xfff200, 1); // bright yellow = "exposed"
    } else {
      this.body.setStrokeStyle(2, 0x000000, 0.6); // default
    }
  }

  get damageMultiplier(): number {
    return this._damageMultiplier;
  }

  destroy(): void {
    this.sprite.destroy();
  }

  private drawHpBar(): void {
    const w = this.config.radius * 2.2;
    const h = 4;
    const y = -this.config.radius - 8;
    this.hpBar.clear();
    this.hpBar.fillStyle(0x000000, 0.6);
    this.hpBar.fillRect(-w / 2, y, w, h);
    const ratio = this.hp / this.maxHp;
    const fillColor = ratio > 0.5 ? 0x66ff66 : ratio > 0.25 ? 0xffaa00 : 0xff3333;
    this.hpBar.fillStyle(fillColor, 1);
    this.hpBar.fillRect(-w / 2, y, w * ratio, h);
  }
}

// Enemy stats live in src/balance.ts — see GRUNT_CONFIG and HEAVY_CONFIG there.
