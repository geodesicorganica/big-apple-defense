import Phaser from 'phaser';
import { ComingSoonScene } from './scenes/ComingSoonScene';
import { GameScene } from './scenes/GameScene';
import { GameOverScene } from './scenes/GameOverScene';

/**
 * Canvas dimensions: 1280 × 720.
 *
 * The 16×9 grid (1280×720) fills the canvas. Tower selection happens via a
 * click-to-place popup (PlacementPopup) that appears above the chosen tile,
 * not via a permanent palette strip.
 */
const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game-container',
  width: 1280,
  height: 720,
  backgroundColor: '#0a0a0f',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [ComingSoonScene, GameScene, GameOverScene],
  banner: false,
};

new Phaser.Game(config);
