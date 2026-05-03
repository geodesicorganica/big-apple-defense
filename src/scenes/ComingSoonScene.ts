import Phaser from 'phaser';

/**
 * M1 Foundation: "Coming Soon" splash screen.
 * Renders an NYC dusk skyline with the game title and a teaser of the 7 clans.
 * This scene exists primarily to prove the Phaser + TS + Vite + Vercel pipeline works end-to-end.
 */
export class ComingSoonScene extends Phaser.Scene {
  constructor() {
    super({ key: 'ComingSoonScene' });
  }

  create(): void {
    const { width, height } = this.scale;

    this.drawDuskSky(width, height);
    this.drawStars(width, height);
    this.drawSkyline(width, height);
    this.drawTitle(width, height);
    this.drawSubtitleAndStatus(width, height);
    this.drawClanTease(width, height);
    this.drawVersionTag(width, height);
  }

  /** NYC dusk gradient background — deep navy at top fading to warm orange at horizon. */
  private drawDuskSky(width: number, height: number): void {
    const graphics = this.add.graphics();
    for (let y = 0; y < height; y++) {
      const t = y / height;
      const r = Math.floor(0x0a + (0xc8 - 0x0a) * t);
      const g = Math.floor(0x0a + (0x66 - 0x0a) * t);
      const b = Math.floor(0x1a + (0x2a - 0x1a) * t);
      const color = (r << 16) | (g << 8) | b;
      graphics.fillStyle(color, 1);
      graphics.fillRect(0, y, width, 1);
    }
  }

  private drawStars(width: number, height: number): void {
    const graphics = this.add.graphics();
    for (let i = 0; i < 80; i++) {
      const x = Math.random() * width;
      const y = Math.random() * height * 0.5;
      const size = Math.random() * 1.5 + 0.3;
      const alpha = Math.random() * 0.6 + 0.2;
      graphics.fillStyle(0xffffff, alpha);
      graphics.fillCircle(x, y, size);
    }
  }

  private drawSkyline(width: number, height: number): void {
    const graphics = this.add.graphics();
    const buildings = [
      { x: 0, w: 120, h: 280 },
      { x: 130, w: 80, h: 220 },
      { x: 220, w: 140, h: 340 },
      { x: 370, w: 100, h: 260 },
      { x: 480, w: 180, h: 380 },
      { x: 670, w: 90, h: 240 },
      { x: 770, w: 130, h: 310 },
      { x: 910, w: 110, h: 290 },
      { x: 1030, w: 150, h: 360 },
      { x: 1190, w: 90, h: 250 },
    ];
    for (const b of buildings) {
      graphics.fillStyle(0x000000, 0.88);
      graphics.fillRect(b.x, height - b.h, b.w, b.h);
      for (let wy = height - b.h + 20; wy < height - 20; wy += 25) {
        for (let wx = b.x + 10; wx < b.x + b.w - 10; wx += 18) {
          if (Math.random() > 0.7) {
            const alpha = 0.4 + Math.random() * 0.5;
            graphics.fillStyle(0xfff3a0, alpha);
            graphics.fillRect(wx, wy, 4, 8);
          }
        }
      }
    }
  }

  private drawTitle(width: number, height: number): void {
    const title = this.add.text(width / 2, height / 2 - 100, 'BIG APPLE DEFENSE', {
      fontFamily: 'Impact, "Arial Black", system-ui, sans-serif',
      fontSize: '88px',
      fontStyle: 'bold',
      color: '#ffffff',
      stroke: '#c1272d',
      strokeThickness: 6,
    });
    title.setOrigin(0.5);
    title.setShadow(0, 6, '#000000', 12, true, true);
    this.tweens.add({
      targets: title,
      scaleX: 1.02,
      scaleY: 1.02,
      duration: 2400,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  private drawSubtitleAndStatus(width: number, height: number): void {
    const subtitle = this.add.text(
      width / 2,
      height / 2 - 20,
      'NYC vs ALIENS — pick a clan, defend the city',
      {
        fontFamily: 'system-ui, -apple-system, sans-serif',
        fontSize: '22px',
        color: '#fff200',
        fontStyle: 'italic',
      }
    );
    subtitle.setOrigin(0.5);
    const comingSoon = this.add.text(width / 2, height / 2 + 50, 'COMING SOON', {
      fontFamily: 'Impact, "Arial Black", system-ui, sans-serif',
      fontSize: '40px',
      fontStyle: 'bold',
      color: '#ffffff',
    });
    comingSoon.setOrigin(0.5);
    this.tweens.add({
      targets: comingSoon,
      alpha: { from: 1, to: 0.25 },
      duration: 900,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  private drawClanTease(width: number, height: number): void {
    const clans =
      '🏦 Finance Bros · 🍝 Mobsters · 🥗 Housewives · 🧢 Street Thugs · 🎧 Hipsters · 🎸 Punks · 🚕 Cabbies';
    this.add
      .text(width / 2, height - 36, clans, {
        fontFamily: 'system-ui, -apple-system, sans-serif',
        fontSize: '15px',
        color: '#dddddd',
      })
      .setOrigin(0.5);
  }

  private drawVersionTag(width: number, height: number): void {
    this.add.text(20, height - 24, 'v0.1.0 — M1: Foundation', {
      fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
      fontSize: '12px',
      color: '#888888',
    });
  }
}
