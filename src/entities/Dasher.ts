import Phaser from 'phaser';
import { EnemyBase } from './EnemyBase';
import { COLOR } from '../colors';

type State = 'patrol' | 'windup' | 'dashing' | 'cooldown';

export class Dasher extends EnemyBase {
  private state: State = 'patrol';
  private stateTimer = 0;
  private dashDirX = 0;
  private dashDirY = 0;
  private telegraphLine: Phaser.GameObjects.Graphics | null = null;

  /** Set by GameScene for K4 Momentum Mode (1.0 = normal, 1.2 = 20% slower) */
  windupMultiplier = 1.0;

  // Balance-driven properties (set by GameScene from balanceData)
  dashWindup = 700;
  dashSpd = 550;
  dashDur = 280;
  patrolDur = 2500;
  flashInterval = 80;
  telegraphLen = 200;
  cooldownDur = 1200;

  // Disrupt properties (set by GameScene)
  disruptDuration = 900;
  egressDuration = 1200;
  egressSpd = 95;
  penetrationDist = 220;
  disruptHitCount = 0;
  onDisruptHit: ((dasher: Dasher) => void) | null = null;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, 'enemy_dasher', 2, 55);
    this.setTint(COLOR.enemyDasher);
  }

  isDashing(): boolean {
    return this.state === 'dashing';
  }

  isWindingUp(): boolean {
    return this.state === 'windup';
  }

  stopDash(): void {
    if (this.state === 'dashing') {
      this.state = 'cooldown';
      this.stateTimer = 0;
      this.setVelocity(0, 0);
    }
  }

  update(targetX: number, targetY: number): void {
    if (!this.active) return;
    if (this.isFrozen()) { this.setVelocity(0, 0); return; }
    if (this.isKnockedBack()) return;

    const dt = this.scene.game.loop.delta;
    this.stateTimer += dt;
    const windupDuration = this.dashWindup * this.windupMultiplier;

    switch (this.state) {
      case 'patrol': {
        const angle = Phaser.Math.Angle.Between(this.x, this.y, targetX, targetY);
        this.setVelocity(Math.cos(angle) * this.speed, Math.sin(angle) * this.speed);
        if (this.stateTimer > this.patrolDur) {
          this.stateTimer = 0;
          this.state = 'windup';
          this.setVelocity(0, 0);
        }
        break;
      }
      case 'windup': {
        // Flash + telegraph line
        this.setAlpha(Math.floor(this.stateTimer / this.flashInterval) % 2 === 0 ? 1 : 0.3);

        // Draw telegraph line toward player
        if (!this.telegraphLine) {
          this.telegraphLine = this.scene.add.graphics().setDepth(2);
        }
        this.telegraphLine.clear();
        const angle = Phaser.Math.Angle.Between(this.x, this.y, targetX, targetY);
        const progress = Math.min(1, this.stateTimer / windupDuration);
        this.telegraphLine.lineStyle(2, 0xff8800, 0.3 + 0.5 * progress);
        this.telegraphLine.lineBetween(
          this.x, this.y,
          this.x + Math.cos(angle) * this.telegraphLen,
          this.y + Math.sin(angle) * this.telegraphLen,
        );

        if (this.stateTimer > windupDuration) {
          this.stateTimer = 0;
          this.state = 'dashing';
          this.setAlpha(1);
          if (this.telegraphLine) { this.telegraphLine.destroy(); this.telegraphLine = null; }
          const a = Phaser.Math.Angle.Between(this.x, this.y, targetX, targetY);
          this.dashDirX = Math.cos(a);
          this.dashDirY = Math.sin(a);
          this.setVelocity(this.dashDirX * this.dashSpd, this.dashDirY * this.dashSpd);
        }
        break;
      }
      case 'dashing': {
        if (this.stateTimer > this.dashDur) {
          this.stateTimer = 0;
          this.state = 'cooldown';
          this.setVelocity(0, 0);
        }
        break;
      }
      case 'cooldown': {
        if (this.stateTimer > this.cooldownDur) {
          this.stateTimer = 0;
          this.state = 'patrol';
        }
        break;
      }
    }
  }

  destroy(fromScene?: boolean): void {
    if (this.telegraphLine) { this.telegraphLine.destroy(); this.telegraphLine = null; }
    super.destroy(fromScene);
  }
}
