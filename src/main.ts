import Phaser from 'phaser';
import { BuildScene }  from './scenes/BuildScene';
import { GameScene }   from './scenes/GameScene';
import { ResultScene } from './scenes/ResultScene';
import { SkillTreeScene } from './skilltree/SkillTreeScene';

new Phaser.Game({
  type: Phaser.AUTO,
  width: 1920,
  height: 1080,
  backgroundColor: '#0a0a0a',
  physics: {
    default: 'arcade',
    arcade: { debug: false },
  },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [BuildScene, GameScene, ResultScene, SkillTreeScene],
});
