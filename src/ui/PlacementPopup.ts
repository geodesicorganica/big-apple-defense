import Phaser from 'phaser';
import { TowerType, TOWERS, TOWER_NAMES } from '../balance';

/**
 * Click-to-place popup. Shown above a chosen tile after the player clicks
 * a placeable tile, offering tower options + a cancel button.
 *
 * Layout (left → right):
 *   [✕]  [QUANT 150g]  [TRADER 75g]
 *
 * Interactions:
 *   - Click ✕  → cancel
 *   - Click a tower button → fires onPick (whether or not affordable;
 *     GameScene decides whether to actually place or flash a 'not enough gold'
 *     message and keep the popup open)
 *   - Click outside the popup (handled by GameScene) → cancel or re-target
 *   - Press Escape (handled by GameScene) → cancel
 *
 * The popup is centered above the tile with 12px clearance. If the tile is
 * near the top of the screen, it flips below.
 *
 * Affordability is reflected visually but doesn't block clicks. GameScene
 * calls `refresh()` every frame so buttons light up the moment the player's
 * gold rises past a tower's cost — no need to close + reopen.
 */
export interface PlacementPopupCallbacks {
  onPick(type: TowerType): void;
  onCancel(): void;
  /** Returns true if the player can afford the tower at the chosen tile. */
  canAfford(type: TowerType): boolean;
}

interface TowerButtonRefs {
  bg: Phaser.GameObjects.Rectangle;
  icon: Phaser.GameObjects.Rectangle;
  accent: Phaser.GameObjects.Arc;
  nameText: Phaser.GameObjects.Text;
  costText: Phaser.GameObjects.Text;
  hovered: boolean;
}

export class PlacementPopup {
  private static readonly BTN_WIDTH = 78;
  private static readonly BTN_HEIGHT = 52;
  private static readonly CANCEL_WIDTH = 36;
  private static readonly GAP = 8;
  private static readonly MARGIN_FROM_TILE = 12;

  private container: Phaser.GameObjects.Container;
  private bounds!: Phaser.Geom.Rectangle;
  private destroyed = false;
  private towerButtons = new Map<TowerType, TowerButtonRefs>();

  constructor(
    private readonly scene: Phaser.Scene,
    tileCenterX: number,
    tileCenterY: number,
    tileSize: number,
    private readonly types: TowerType[],
    private readonly callbacks: PlacementPopupCallbacks
  ) {
    const popupWidth =
      PlacementPopup.CANCEL_WIDTH +
      PlacementPopup.GAP +
      types.length * PlacementPopup.BTN_WIDTH +
      (types.length - 1) * PlacementPopup.GAP;
    const popupHeight = PlacementPopup.BTN_HEIGHT;

    const halfTile = tileSize / 2;
    const above =
      tileCenterY - halfTile - PlacementPopup.MARGIN_FROM_TILE - popupHeight / 2;
    const below =
      tileCenterY + halfTile + PlacementPopup.MARGIN_FROM_TILE + popupHeight / 2;
    const flipBelow = above - popupHeight / 2 < 0;
    const popupCenterY = flipBelow ? below : above;

    const minX = popupWidth / 2 + 8;
    const maxX = scene.scale.width - popupWidth / 2 - 8;
    const popupCenterX = Math.min(maxX, Math.max(minX, tileCenterX));

    this.container = scene.add.container(popupCenterX, popupCenterY);
    this.container.setDepth(1000);

    this.bounds = new Phaser.Geom.Rectangle(
      popupCenterX - popupWidth / 2,
      popupCenterY - popupHeight / 2,
      popupWidth,
      popupHeight
    );

    const panel = scene.add
      .rectangle(0, 0, popupWidth, popupHeight, 0x18181f, 0.96)
      .setStrokeStyle(2, 0xfff200, 0.85);

    const tail = scene.add.graphics();
    if (flipBelow) {
      tail.fillStyle(0x18181f, 0.96);
      tail.fillTriangle(-8, -popupHeight / 2, 8, -popupHeight / 2, 0, -popupHeight / 2 - 8);
      tail.lineStyle(2, 0xfff200, 0.85);
      tail.strokeTriangle(-8, -popupHeight / 2, 8, -popupHeight / 2, 0, -popupHeight / 2 - 8);
    } else {
      tail.fillStyle(0x18181f, 0.96);
      tail.fillTriangle(-8, popupHeight / 2, 8, popupHeight / 2, 0, popupHeight / 2 + 8);
      tail.lineStyle(2, 0xfff200, 0.85);
      tail.strokeTriangle(-8, popupHeight / 2, 8, popupHeight / 2, 0, popupHeight / 2 + 8);
    }

    this.container.add([panel, tail]);

    const cancelX = -popupWidth / 2 + PlacementPopup.CANCEL_WIDTH / 2 + 6;
    this.buildCancelButton(cancelX);

    const towersStartX =
      cancelX + PlacementPopup.CANCEL_WIDTH / 2 + PlacementPopup.GAP +
      PlacementPopup.BTN_WIDTH / 2;
    types.forEach((type, i) => {
      const x = towersStartX + i * (PlacementPopup.BTN_WIDTH + PlacementPopup.GAP);
      this.buildTowerButton(type, x);
    });

    this.container.setScale(0.85);
    this.container.setAlpha(0);
    scene.tweens.add({
      targets: this.container,
      scale: 1,
      alpha: 1,
      duration: 140,
      ease: 'Back.easeOut',
    });
  }

  containsPoint(x: number, y: number): boolean {
    return this.bounds.contains(x, y);
  }

  /**
   * Re-evaluate affordability for every button and update its visuals. Called
   * every frame from GameScene's refreshHUD so the popup stays in sync with
   * the live gold counter (no close + reopen needed).
   */
  refresh(): void {
    if (this.destroyed) return;
    for (const type of this.towerButtons.keys()) {
      this.applyAffordabilityVisuals(type);
    }
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.container.destroy();
  }

  // --- internals --------------------------------------------------------

  private buildCancelButton(x: number): void {
    const bg = this.scene.add
      .rectangle(x, 0, PlacementPopup.CANCEL_WIDTH, PlacementPopup.BTN_HEIGHT - 8, 0x6b1a1a, 1)
      .setStrokeStyle(1, 0xff5566, 0.9)
      .setInteractive({ useHandCursor: true });

    const x_text = this.scene.add
      .text(x, 0, '✕', {
        fontFamily: 'Impact, "Arial Black", system-ui, sans-serif',
        fontSize: '22px',
        color: '#ffffff',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    bg.on('pointerover', () => bg.setFillStyle(0x8a2a2a, 1));
    bg.on('pointerout', () => bg.setFillStyle(0x6b1a1a, 1));
    bg.on('pointerdown', () => this.callbacks.onCancel());

    this.container.add([bg, x_text]);
  }

  private buildTowerButton(type: TowerType, x: number): void {
    const cfg = TOWERS[type];

    const bg = this.scene.add
      .rectangle(x, 0, PlacementPopup.BTN_WIDTH, PlacementPopup.BTN_HEIGHT - 8, 0x18181f, 1)
      .setStrokeStyle(2, 0x666666, 1)
      .setInteractive({ useHandCursor: true });

    const icon = this.scene.add
      .rectangle(x - 22, 0, 18, 18, cfg.bodyColor, 1)
      .setStrokeStyle(1.5, 0x000000, 0.7);
    const accent = this.scene.add
      .circle(x - 22, 0, 7, cfg.accentColor, 1)
      .setStrokeStyle(1.5, 0x000000, 0.5);

    const nameText = this.scene.add
      .text(x - 6, -10, TOWER_NAMES[type], {
        fontFamily: 'Impact, "Arial Black", system-ui, sans-serif',
        fontSize: '12px',
        color: '#ffffff',
        fontStyle: 'bold',
      })
      .setOrigin(0, 0.5);

    const costText = this.scene.add
      .text(x - 6, 8, `${cfg.cost}g`, {
        fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
        fontSize: '12px',
        color: '#fff200',
        fontStyle: 'bold',
      })
      .setOrigin(0, 0.5);

    const refs: TowerButtonRefs = { bg, icon, accent, nameText, costText, hovered: false };
    this.towerButtons.set(type, refs);

    bg.on('pointerover', () => {
      refs.hovered = true;
      this.applyAffordabilityVisuals(type);
    });
    bg.on('pointerout', () => {
      refs.hovered = false;
      this.applyAffordabilityVisuals(type);
    });
    bg.on('pointerdown', () => this.callbacks.onPick(type));

    this.container.add([bg, icon, accent, nameText, costText]);
    this.applyAffordabilityVisuals(type);
  }

  /**
   * Apply the visual styling that corresponds to current affordability + hover
   * state for one tower button. Idempotent — safe to call every frame.
   */
  private applyAffordabilityVisuals(type: TowerType): void {
    const btn = this.towerButtons.get(type);
    if (!btn) return;
    const affordable = this.callbacks.canAfford(type);
    const opacity = affordable ? 1 : 0.5;

    btn.icon.setAlpha(opacity);
    btn.accent.setAlpha(opacity);
    btn.nameText.setColor(affordable ? '#ffffff' : '#888888');
    btn.costText.setColor(affordable ? '#fff200' : '#ff6677');

    let borderColor: number;
    if (affordable && btn.hovered) borderColor = 0xffffff;
    else if (affordable) borderColor = 0x666666;
    else borderColor = 0x3a3a3a;
    btn.bg.setStrokeStyle(2, borderColor, 1);
  }
}
