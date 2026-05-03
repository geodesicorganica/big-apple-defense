import Phaser from 'phaser';
import { TowerType, TOWERS, TOWER_NAMES } from '../balance';
import type { Economy } from '../systems/Economy';

interface PaletteButton {
  type: TowerType;
  container: Phaser.GameObjects.Container;
  bg: Phaser.GameObjects.Rectangle;
  border: Phaser.GameObjects.Rectangle;
  costText: Phaser.GameObjects.Text;
  bounds: Phaser.Geom.Rectangle;
  affordable: boolean;
}

/**
 * Tower selection palette. Renders one button per tower type at the bottom
 * of the screen and lets the player pick which tower to place next.
 *
 * Players can:
 *   - Click a button to select that tower
 *   - Press 1, 2, 3 (number keys) for keyboard shortcuts
 *
 * Affordability is reflected visually: unaffordable buttons fade and turn
 * the cost text red.
 *
 * The palette itself catches pointer events on its buttons; GameScene checks
 * `containsPoint(x, y)` on the scene-level POINTER_DOWN to avoid placing a
 * tower when the player is clicking on a palette button.
 */
export class TowerPalette {
  private static readonly BTN_WIDTH = 110;
  private static readonly BTN_HEIGHT = 64;
  private static readonly GAP = 14;

  private buttons = new Map<TowerType, PaletteButton>();
  private selected: TowerType;
  private listeners: Array<(type: TowerType) => void> = [];
  private stripBounds: Phaser.Geom.Rectangle;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly types: TowerType[],
    centerX: number,
    centerY: number
  ) {
    if (types.length === 0) {
      throw new Error('TowerPalette requires at least one tower type');
    }
    this.selected = types[0];
    this.stripBounds = this.build(centerX, centerY);
    this.wireKeyboard();
  }

  /** Currently selected tower type. */
  getSelected(): TowerType {
    return this.selected;
  }

  /** Subscribe to selection changes. */
  onChange(callback: (type: TowerType) => void): void {
    this.listeners.push(callback);
  }

  /** Refresh button affordability based on current gold. */
  refresh(economy: Economy): void {
    for (const [type, btn] of this.buttons.entries()) {
      const cfg = TOWERS[type];
      const wasAffordable = btn.affordable;
      btn.affordable = economy.canAfford(cfg.cost);
      if (wasAffordable !== btn.affordable) {
        btn.container.setAlpha(btn.affordable ? 1 : 0.55);
        btn.costText.setColor(btn.affordable ? '#fff200' : '#ff6677');
      }
    }
  }

  /** Returns true if the given canvas point is inside any palette button. */
  containsPoint(x: number, y: number): boolean {
    return this.stripBounds.contains(x, y);
  }

  setSelected(type: TowerType): void {
    if (!this.types.includes(type)) return;
    if (this.selected === type) return;
    this.selected = type;
    this.refreshSelectionVisuals();
    for (const cb of this.listeners) cb(type);
  }

  // --- internals --------------------------------------------------------

  private build(centerX: number, centerY: number): Phaser.Geom.Rectangle {
    const totalWidth =
      this.types.length * TowerPalette.BTN_WIDTH +
      (this.types.length - 1) * TowerPalette.GAP;
    const startX = centerX - totalWidth / 2 + TowerPalette.BTN_WIDTH / 2;

    this.types.forEach((type, i) => {
      const cfg = TOWERS[type];
      const x = startX + i * (TowerPalette.BTN_WIDTH + TowerPalette.GAP);
      const container = this.scene.add.container(x, centerY);

      const bg = this.scene.add.rectangle(
        0,
        0,
        TowerPalette.BTN_WIDTH,
        TowerPalette.BTN_HEIGHT,
        0x18181f,
        0.94
      );
      const border = this.scene.add
        .rectangle(0, 0, TowerPalette.BTN_WIDTH, TowerPalette.BTN_HEIGHT, 0x000000, 0)
        .setStrokeStyle(2, 0x666666, 1);

      // Mini tower icon
      const towerBody = this.scene.add
        .rectangle(-32, 0, 28, 28, cfg.bodyColor)
        .setStrokeStyle(2, 0x000000, 0.7);
      const towerAccent = this.scene.add
        .circle(-32, 0, 10, cfg.accentColor)
        .setStrokeStyle(2, 0x000000, 0.5);

      // Tower name + cost
      const nameText = this.scene.add
        .text(2, -14, TOWER_NAMES[type], {
          fontFamily: 'Impact, "Arial Black", system-ui, sans-serif',
          fontSize: '15px',
          color: '#ffffff',
          fontStyle: 'bold',
        })
        .setOrigin(0, 0.5);

      const costText = this.scene.add
        .text(2, 8, `${cfg.cost}g`, {
          fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
          fontSize: '14px',
          color: '#fff200',
          fontStyle: 'bold',
        })
        .setOrigin(0, 0.5);

      // Hotkey number badge
      const hotkey = this.scene.add
        .text(
          -TowerPalette.BTN_WIDTH / 2 + 4,
          -TowerPalette.BTN_HEIGHT / 2 + 4,
          `${i + 1}`,
          {
            fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
            fontSize: '11px',
            color: '#888888',
          }
        )
        .setOrigin(0, 0);

      container.add([bg, border, towerBody, towerAccent, nameText, costText, hotkey]);

      bg.setInteractive({ useHandCursor: true });
      bg.on('pointerover', () => {
        if (this.selected !== type) border.setStrokeStyle(2, 0x999999, 1);
      });
      bg.on('pointerout', () => {
        if (this.selected !== type) border.setStrokeStyle(2, 0x666666, 1);
      });
      bg.on('pointerdown', () => this.setSelected(type));

      const bounds = new Phaser.Geom.Rectangle(
        x - TowerPalette.BTN_WIDTH / 2,
        centerY - TowerPalette.BTN_HEIGHT / 2,
        TowerPalette.BTN_WIDTH,
        TowerPalette.BTN_HEIGHT
      );
      this.buttons.set(type, {
        type,
        container,
        bg,
        border,
        costText,
        bounds,
        affordable: true,
      });
    });

    this.refreshSelectionVisuals();

    // Strip bounds = bounding box across all buttons (used for click filtering).
    const left = startX - TowerPalette.BTN_WIDTH / 2;
    const right =
      startX + (this.types.length - 1) * (TowerPalette.BTN_WIDTH + TowerPalette.GAP) +
      TowerPalette.BTN_WIDTH / 2;
    return new Phaser.Geom.Rectangle(
      left,
      centerY - TowerPalette.BTN_HEIGHT / 2,
      right - left,
      TowerPalette.BTN_HEIGHT
    );
  }

  private refreshSelectionVisuals(): void {
    for (const [type, btn] of this.buttons.entries()) {
      const isSelected = type === this.selected;
      btn.border.setStrokeStyle(
        isSelected ? 3 : 2,
        isSelected ? 0xfff200 : 0x666666,
        1
      );
      btn.container.setScale(isSelected ? 1.05 : 1);
    }
  }

  private wireKeyboard(): void {
    const keyNames = ['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE'];
    this.types.forEach((type, i) => {
      const keyName = keyNames[i];
      if (!keyName) return;
      this.scene.input.keyboard?.on(`keydown-${keyName}`, () => this.setSelected(type));
    });
  }
}
