import Phaser from 'phaser';
import { EnemyBase } from './EnemyBase';
import { COLOR } from '../colors';

export class Chaser extends EnemyBase {
  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, 'enemy_chaser', 2, Phaser.Math.FloatBetween(65, 85));
    this.setTint(COLOR.enemyChaser);
  }
}
