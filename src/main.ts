import Phaser from 'phaser';
import { ComingSoonScene } from './scenes/ComingSoonScene';
import { GameScene } from './scenes/GameScene';
import { GameOverScene } from './scenes/GameOverScene';

/**
 * Canvas dimensions:
 *   1280 wide × 800 tall.
 *
 * The 16×9 grid (1280×720) lives in the top portion. The bottom 80px is
 * reserved for the tower selection palette. Other scenes (title, game over)
 * scale to fill the full 800px height.
 */
const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game-container',
  width: 1280,
  height: 800,
  backgroundColor: '#0a0a0f',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [ComingSoonScene, GameScene, GameOverScene],
  banner: false,
};

new Phaser.Game(config);
