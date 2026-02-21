import { describe, it, expect, beforeEach, vi } from 'vitest';
import './setup';
import { Player } from '../entities/Player';
import { createMockScene } from './setup';

describe('Player', () => {
  let scene: ReturnType<typeof createMockScene>;
  let player: Player;

  beforeEach(() => {
    scene = createMockScene(1000);
    player = new Player(scene as any, 500, 300);
  });

  describe('constructor', () => {
    it('sets default HP', () => {
      expect(player.hp).toBe(5);
      expect(player.maxHp).toBe(5);
    });

    it('sets default speed', () => {
      expect(player.speed).toBe(220);
    });

    it('sets default cooldowns', () => {
      expect(player.dashCooldown).toBe(1400);
      expect(player.dashDuration).toBe(180);
      expect(player.attackCooldown).toBe(400);
      expect(player.iframesDuration).toBe(1200);
    });

    it('dash grants invincibility by default', () => {
      expect(player.dashGrantsInvincibility).toBe(true);
    });

    it('no extra dash iframes by default', () => {
      expect(player.extraDashIframes).toBe(0);
    });

    it('dash not disabled by default', () => {
      expect(player.dashDisabled).toBe(false);
    });
  });

  describe('canAttack', () => {
    it('can attack by default (nextAttack=0, not dashing)', () => {
      expect(player.canAttack()).toBe(true);
    });

    it('cannot attack after markAttackUsed', () => {
      player.markAttackUsed();
      expect(player.canAttack()).toBe(false);
    });

    it('can attack after cooldown expires', () => {
      player.markAttackUsed();
      scene.time.now = 1000 + player.attackCooldown + 1;
      expect(player.canAttack()).toBe(true);
    });
  });

  describe('isDashing', () => {
    it('not dashing by default', () => {
      expect(player.isDashing()).toBe(false);
    });
  });

  describe('isInvincible', () => {
    it('not invincible by default', () => {
      expect(player.isInvincible()).toBe(false);
    });
  });

  describe('takeDamage', () => {
    it('reduces HP by 1', () => {
      player.takeDamage();
      expect(player.hp).toBe(4);
    });

    it('reduces HP by amount', () => {
      player.takeDamage(2);
      expect(player.hp).toBe(3);
    });

    it('returns false if alive', () => {
      expect(player.takeDamage(1)).toBe(false);
    });

    it('returns true if killed', () => {
      expect(player.takeDamage(5)).toBe(true);
    });

    it('grants iframes after damage', () => {
      player.takeDamage();
      expect(player.isInvincible()).toBe(true);
    });

    it('iframes expire', () => {
      player.takeDamage();
      scene.time.now = 1000 + player.iframesDuration + 1;
      expect(player.isInvincible()).toBe(false);
    });

    it('does not damage when invincible', () => {
      player.takeDamage(); // grants iframes
      player.takeDamage(); // should be blocked
      expect(player.hp).toBe(4);
    });
  });

  describe('cooldown ratios', () => {
    it('attack cooldown ratio is 1 when ready', () => {
      expect(player.getAttackCooldownRatio()).toBe(1);
    });

    it('attack cooldown ratio is 0 right after use', () => {
      player.markAttackUsed();
      // ratio at moment of use = 1 - (cd/cd) = 0
      expect(player.getAttackCooldownRatio()).toBe(0);
    });

    it('dash cooldown ratio is 1 when ready', () => {
      expect(player.getDashCooldownRatio()).toBe(1);
    });

    it('reform cooldown ratio is 1 when ready', () => {
      expect(player.getReformCooldownRatio()).toBe(1);
    });
  });

  describe('shift hold detection', () => {
    it('isHoldingShift returns false by default', () => {
      expect(player.isHoldingShift()).toBe(false);
    });

    it('getShiftHoldMs returns 0 when not holding', () => {
      expect(player.getShiftHoldMs(1000)).toBe(0);
    });
  });

  describe('reform flags', () => {
    it('reformTriggered starts false', () => {
      expect(player.reformTriggered).toBe(false);
    });

    it('reformOnCooldown starts false', () => {
      expect(player.reformOnCooldown).toBe(false);
    });
  });

  describe('update basics', () => {
    it('resets per-frame flags', () => {
      player.dashActivatedThisFrame = true;
      player.dashJustEnded = true;
      player.reformOnCooldown = true;
      player.update();
      expect(player.dashActivatedThisFrame).toBe(false);
      expect(player.dashJustEnded).toBe(false);
      expect(player.reformOnCooldown).toBe(false);
    });

    it('isMoving false when no keys pressed', () => {
      player.update();
      expect(player.isMoving).toBe(false);
    });
  });
});
