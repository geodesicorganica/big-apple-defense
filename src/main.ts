import Phaser from 'phaser';
import { ComingSoonScene } from './scenes/ComingSoonScene';

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
  scene: [ComingSoonScene],
  banner: false,
};

new Phaser.Game(config);
