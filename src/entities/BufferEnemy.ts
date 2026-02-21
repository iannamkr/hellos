import Phaser from 'phaser';
import { EnemyBase } from './EnemyBase';
import { COLOR } from '../colors';

export class BufferEnemy extends EnemyBase {
  private auraRadius = 120;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, 'enemy_buffer', 3, Phaser.Math.FloatBetween(40, 55));
    this.setTint(COLOR.enemyBuffer);
  }

  /** Call each frame AFTER resetting all enemy speeds to baseSpeed. */
  applyAura(enemies: EnemyBase[]): void {
    for (const e of enemies) {
      if (e === this || !e.active) continue;
      if (Phaser.Math.Distance.Between(this.x, this.y, e.x, e.y) <= this.auraRadius) {
        e.speed = e.baseSpeed * 1.4;
      }
    }
  }
}
