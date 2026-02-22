import Phaser from 'phaser';

export interface EnemyUpdateContext {
  flagX: number; flagY: number;
  frontDirX: number; frontDirY: number;
  rightDirX: number; rightDirY: number;
  now: number; dt: number;
  vanguardPositions: Array<{ x: number; y: number }>;
  enemies: EnemyBase[];
}

export class EnemyBase extends Phaser.Physics.Arcade.Image {
  hp: number;
  baseSpeed: number;
  speed: number;
  markStacks = 0;
  atkCD = 1000;
  nextAtk = 0;

  private slows: Array<{ factor: number; until: number }> = [];
  private frozenUntil = 0;
  private _wasFrozen = false;
  private knockbackUntil = 0;

  constructor(scene: Phaser.Scene, x: number, y: number, texture: string, hp: number, speed: number) {
    super(scene, x, y, texture);
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.hp = hp;
    this.baseSpeed = speed;
    this.speed = speed;
    this.setDepth(3);
  }

  takeDamage(amount = 1): boolean {
    this.hp -= amount;
    if (this.hp <= 0) {
      this.destroy();
      return true;
    }
    return false;
  }

  addMark(count = 1): number {
    this.markStacks += count;
    if (this.markStacks >= 3) this.setAlpha(0.4);
    else if (this.markStacks === 2) this.setAlpha(0.55);
    else if (this.markStacks === 1) this.setAlpha(0.7);
    return this.markStacks;
  }

  clearMarks(): void {
    this.markStacks = 0;
    if (!this.isFrozen()) this.setAlpha(1);
  }

  applySlow(factor: number, durationMs: number): void {
    this.slows.push({ factor, until: this.scene.time.now + durationMs });
  }

  applyFreeze(durationMs: number): void {
    const until = this.scene.time.now + durationMs;
    if (until > this.frozenUntil) {
      this.frozenUntil = until;
      this.setAlpha(0.3);
    }
  }

  applyKnockback(fromX: number, fromY: number, force: number, durationMs: number): void {
    const angle = Math.atan2(this.y - fromY, this.x - fromX);
    this.setVelocity(Math.cos(angle) * force, Math.sin(angle) * force);
    this.knockbackUntil = this.scene.time.now + durationMs;
  }

  isSlowed(): boolean {
    const now = this.scene.time.now;
    return this.slows.some(s => now < s.until);
  }

  isFrozen(): boolean {
    return this.scene.time.now < this.frozenUntil;
  }

  isKnockedBack(): boolean {
    return this.scene.time.now < this.knockbackUntil;
  }

  computeSpeed(now: number): void {
    const frozen = now < this.frozenUntil;

    if (frozen) {
      this.speed = 0;
      if (!this._wasFrozen) this.setAlpha(0.3);
      this._wasFrozen = true;
      return;
    }

    if (this._wasFrozen) {
      this._wasFrozen = false;
      if (this.markStacks >= 3) this.setAlpha(0.4);
      else if (this.markStacks === 2) this.setAlpha(0.55);
      else if (this.markStacks === 1) this.setAlpha(0.7);
      else this.setAlpha(1);
    }

    this.speed = this.baseSpeed;
    let maxSlow = 0;
    for (let i = this.slows.length - 1; i >= 0; i--) {
      if (now >= this.slows[i].until) {
        this.slows.splice(i, 1);
      } else if (this.slows[i].factor > maxSlow) {
        maxSlow = this.slows[i].factor;
      }
    }
    this.speed *= (1 - maxSlow);
  }

  update(targetX: number, targetY: number, _ctx?: EnemyUpdateContext): void {
    if (!this.active) return;
    if (this.isFrozen()) { this.setVelocity(0, 0); return; }
    if (this.isKnockedBack()) return;
    const angle = Phaser.Math.Angle.Between(this.x, this.y, targetX, targetY);
    this.setVelocity(Math.cos(angle) * this.speed, Math.sin(angle) * this.speed);
  }
}
