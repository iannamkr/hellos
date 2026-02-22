import Phaser from 'phaser';
import { COLOR } from '../colors';

export class Player extends Phaser.Physics.Arcade.Image {
  hp = 5;
  maxHp = 5;
  speed = 220;

  dashSpeed = 480;
  dashCooldown = 1400;
  dashDuration = 180;
  attackCooldown = 400;
  iframesDuration = 1200;
  dashGrantsInvincibility = true;
  extraDashIframes = 0;
  reformCD = 2200;
  reformThreshold = 220;

  private _isDashing = false;
  private _dashUntil = 0;
  private _nextDash = 0;
  private _nextAttack = 0;
  private _iframesUntil = 0;
  private _nextReform = 0;

  dashActivatedThisFrame = false;
  dashJustEnded = false;
  isMoving = false;
  dashDisabled = false;
  reformTriggered = false;
  reformOnCooldown = false;

  private _dashStartPos = { x: 0, y: 0 };
  private _shiftWasDown = false;

  private _cursors: Phaser.Types.Input.Keyboard.CursorKeys;
  private _wasd: { up: Phaser.Input.Keyboard.Key; down: Phaser.Input.Keyboard.Key; left: Phaser.Input.Keyboard.Key; right: Phaser.Input.Keyboard.Key };
  private _shift: Phaser.Input.Keyboard.Key;
  private _rKey: Phaser.Input.Keyboard.Key;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, 'player');
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setCollideWorldBounds(true);
    this.setDepth(5);

    this._cursors = scene.input.keyboard!.createCursorKeys();
    this._wasd = scene.input.keyboard!.addKeys({
      up:    Phaser.Input.Keyboard.KeyCodes.W,
      down:  Phaser.Input.Keyboard.KeyCodes.S,
      left:  Phaser.Input.Keyboard.KeyCodes.A,
      right: Phaser.Input.Keyboard.KeyCodes.D,
    }) as any;
    this._shift = scene.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT);
    this._rKey = scene.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.R);
    this.setTint(COLOR.commander);
  }

  canAttack(): boolean {
    return this.scene.time.now >= this._nextAttack && !this._isDashing;
  }

  markAttackUsed(): void {
    this._nextAttack = this.scene.time.now + this.attackCooldown;
  }

  isDashing(): boolean {
    return this._isDashing;
  }

  isInvincible(): boolean {
    if (this._isDashing && this.dashGrantsInvincibility) return true;
    return this.scene.time.now < this._iframesUntil;
  }

  getDashStartPos(): { x: number; y: number } {
    return this._dashStartPos;
  }

  getAttackCooldownRatio(): number {
    const now = this.scene.time.now;
    if (now >= this._nextAttack) return 1;
    return 1 - (this._nextAttack - now) / this.attackCooldown;
  }

  getDashCooldownRatio(): number {
    const now = this.scene.time.now;
    if (now >= this._nextDash) return 1;
    return 1 - (this._nextDash - now) / this.dashCooldown;
  }

  isHoldingShift(): boolean {
    return this._shift.isDown;
  }

  takeDamage(amount = 1): boolean {
    if (this.isInvincible()) return false;
    this.hp -= amount;
    this._iframesUntil = this.scene.time.now + this.iframesDuration;
    this.setAlpha(0.4);
    this.scene.time.delayedCall(150, () => { if (this.active) this.setAlpha(1); });
    return this.hp <= 0;
  }

  getReformCooldownRatio(): number {
    const now = this.scene.time.now;
    if (now >= this._nextReform) return 1;
    return 1 - (this._nextReform - now) / 2200;
  }

  update(): void {
    this.dashActivatedThisFrame = false;
    this.dashJustEnded = false;
    this.reformOnCooldown = false;
    const now = this.scene.time.now;

    if (this._isDashing && now >= this._dashUntil) {
      this._isDashing = false;
      this.dashJustEnded = true;
      // Extra dash iframes (K6)
      if (this.extraDashIframes > 0) {
        const until = now + this.extraDashIframes;
        if (until > this._iframesUntil) this._iframesUntil = until;
      }
    }
    if (this._isDashing) return;

    const c = this._cursors;
    const w = this._wasd;
    let vx = 0, vy = 0;
    if (c.left.isDown  || w.left.isDown)  vx -= 1;
    if (c.right.isDown || w.right.isDown) vx += 1;
    if (c.up.isDown    || w.up.isDown)    vy -= 1;
    if (c.down.isDown  || w.down.isDown)  vy += 1;
    if (vx !== 0 && vy !== 0) { vx *= 0.707; vy *= 0.707; }

    this.isMoving = (vx !== 0 || vy !== 0);

    // R key: reform (instant)
    if (Phaser.Input.Keyboard.JustDown(this._rKey)) {
      if (now >= this._nextReform && !this.dashDisabled) {
        this.reformTriggered = true;
        this._nextReform = now + this.reformCD;
      } else if (now < this._nextReform) {
        this.reformOnCooldown = true;
      }
    }

    // Shift: dash (on release)
    const shiftDown = this._shift.isDown;
    if (!shiftDown && this._shiftWasDown) {
      if (now >= this._nextDash && this.isMoving && !this.dashDisabled) {
        this._isDashing = true;
        this._dashUntil = now + this.dashDuration;
        this._nextDash  = now + this.dashCooldown;
        this.dashActivatedThisFrame = true;
        this._dashStartPos = { x: this.x, y: this.y };
        const ds = this.dashSpeed;
        this.setVelocity(vx * ds, vy * ds);
        this.setAlpha(0.5);
        this.scene.time.delayedCall(this.dashDuration, () => { if (this.active) this.setAlpha(1); });
        this._shiftWasDown = shiftDown;
        return;
      }
    }
    this._shiftWasDown = shiftDown;

    this.setVelocity(vx * this.speed, vy * this.speed);
  }
}
