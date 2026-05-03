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
    this.hp = Math.max(0, this.hp - amount);
    this.drawHpBar();
    if (this.hp <= 0) {
      this.dead = true;
    }
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

/** Standard grunt — basic enemy, low HP, normal speed, alien green. */
export const GRUNT_CONFIG: EnemyConfig = {
  hp: 60,
  speed: 70,
  radius: 14,
  color: 0x7cf28a,
  goldReward: 10,
};

/** Heavy — tanky alien, slow, high HP, acid purple. Introduced wave 3. */
export const HEAVY_CONFIG: EnemyConfig = {
  hp: 220,
  speed: 50,
  radius: 22,
  color: 0x8a2be2,
  goldReward: 30,
};
