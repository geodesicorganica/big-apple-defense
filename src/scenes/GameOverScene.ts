import Phaser from 'phaser';

export interface GameOverData {
  won: boolean;
  waveReached: number;
  totalWaves: number;
  kills: number;
  towersPlaced: number;
  goldSpent: number;
  goldEarned: number;
  livesRemaining: number;
}

/**
 * GameOverScene — shown when the player wins (cleared all waves) or loses
 * (lives ran out). Displays a recap and offers Retry / Back to Title.
 */
export class GameOverScene extends Phaser.Scene {
  private result!: GameOverData;

  constructor() {
    super({ key: 'GameOverScene' });
  }

  init(data: GameOverData): void {
    this.result = data;
  }

  create(): void {
    const { width, height } = this.scale;

    this.add.rectangle(0, 0, width, height, 0x000000, 0.78).setOrigin(0);

    const won = this.result.won;
    const headlineColor = won ? '#fff200' : '#ff4444';
    const headlineText = won ? 'VICTORY' : 'DEFEAT';
    const flavorText = won
      ? 'NYC stands. The aliens fled to Jersey.'
      : 'The aliens are at the bodega. Pizza supplies compromised.';

    const headline = this.add
      .text(width / 2, height / 2 - 200, headlineText, {
        fontFamily: 'Impact, "Arial Black", system-ui, sans-serif',
        fontSize: '120px',
        fontStyle: 'bold',
        color: headlineColor,
        stroke: '#000000',
        strokeThickness: 6,
      })
      .setOrigin(0.5);
    headline.setShadow(0, 8, '#000000', 18, true, true);

    this.tweens.add({
      targets: headline,
      scaleX: 1.04,
      scaleY: 1.04,
      duration: 1600,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    this.add
      .text(width / 2, height / 2 - 110, flavorText, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '20px',
        color: '#dddddd',
        fontStyle: 'italic',
      })
      .setOrigin(0.5);

    this.drawStatsPanel(width / 2, height / 2 - 30);

    this.drawButton(width / 2 - 150, height / 2 + 200, 'PLAY AGAIN', 0x1a2a44, () => {
      this.cameras.main.fadeOut(250, 0, 0, 0);
      this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
        this.scene.start('GameScene');
      });
    });
    this.drawButton(width / 2 + 150, height / 2 + 200, 'BACK TO TITLE', 0x6b1a1a, () => {
      this.cameras.main.fadeOut(250, 0, 0, 0);
      this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
        this.scene.start('ComingSoonScene');
      });
    });
  }

  private drawStatsPanel(cx: number, cy: number): void {
    const panel = this.add
      .rectangle(cx, cy, 460, 200, 0x1a1a26, 0.92)
      .setStrokeStyle(2, 0xfff200, 0.5);
    void panel;

    const stats: ReadonlyArray<readonly [string, string]> = [
      ['Wave reached', `${this.result.waveReached} / ${this.result.totalWaves}`],
      ['Aliens vaporized', `${this.result.kills}`],
      ['Towers placed', `${this.result.towersPlaced}`],
      ['Gold earned', `${this.result.goldEarned}g`],
      ['Gold spent', `${this.result.goldSpent}g`],
      ['Lives remaining', `${this.result.livesRemaining}`],
    ];

    const startY = cy - 80;
    const rowHeight = 26;
    stats.forEach(([label, value], i) => {
      const y = startY + i * rowHeight;
      this.add
        .text(cx - 200, y, label, {
          fontFamily: 'system-ui, sans-serif',
          fontSize: '15px',
          color: '#aaaaaa',
        })
        .setOrigin(0, 0);
      this.add
        .text(cx + 200, y, value, {
          fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
          fontSize: '15px',
          color: '#ffffff',
        })
        .setOrigin(1, 0);
    });
  }

  private drawButton(x: number, y: number, label: string, color: number, onClick: () => void): void {
    const bgWidth = 240;
    const bgHeight = 56;
    const bg = this.add
      .rectangle(x, y, bgWidth, bgHeight, color, 1)
      .setStrokeStyle(2, 0xffffff, 0.6)
      .setInteractive({ useHandCursor: true });
    const text = this.add
      .text(x, y, label, {
        fontFamily: 'Impact, "Arial Black", system-ui, sans-serif',
        fontSize: '22px',
        color: '#ffffff',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    bg.on('pointerover', () => {
      bg.setScale(1.05);
      text.setScale(1.05);
    });
    bg.on('pointerout', () => {
      bg.setScale(1);
      text.setScale(1);
    });
    bg.on('pointerdown', onClick);
  }
}
