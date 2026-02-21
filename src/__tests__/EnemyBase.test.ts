import { describe, it, expect, beforeEach, vi } from 'vitest';
import './setup';
import { EnemyBase } from '../entities/EnemyBase';
import { createMockScene } from './setup';

describe('EnemyBase', () => {
  let scene: ReturnType<typeof createMockScene>;
  let enemy: EnemyBase;

  beforeEach(() => {
    scene = createMockScene(1000);
    enemy = new EnemyBase(scene as any, 100, 200, 'enemy', 3, 75);
  });

  describe('constructor', () => {
    it('sets initial hp', () => {
      expect(enemy.hp).toBe(3);
    });

    it('sets initial speed', () => {
      expect(enemy.baseSpeed).toBe(75);
      expect(enemy.speed).toBe(75);
    });

    it('sets position', () => {
      expect(enemy.x).toBe(100);
      expect(enemy.y).toBe(200);
    });

    it('starts with 0 mark stacks', () => {
      expect(enemy.markStacks).toBe(0);
    });
  });

  describe('takeDamage', () => {
    it('reduces hp by default 1', () => {
      enemy.takeDamage();
      expect(enemy.hp).toBe(2);
    });

    it('reduces hp by specified amount', () => {
      enemy.takeDamage(2);
      expect(enemy.hp).toBe(1);
    });

    it('returns false if still alive', () => {
      expect(enemy.takeDamage(1)).toBe(false);
    });

    it('returns true if killed', () => {
      expect(enemy.takeDamage(3)).toBe(true);
    });

    it('returns true if overkilled', () => {
      expect(enemy.takeDamage(10)).toBe(true);
    });

    it('destroys on death', () => {
      enemy.takeDamage(3);
      expect(enemy.active).toBe(false);
    });
  });

  describe('mark system', () => {
    it('addMark increments stacks', () => {
      expect(enemy.addMark()).toBe(1);
      expect(enemy.markStacks).toBe(1);
    });

    it('addMark with count', () => {
      expect(enemy.addMark(3)).toBe(3);
      expect(enemy.markStacks).toBe(3);
    });

    it('addMark accumulates', () => {
      enemy.addMark();
      enemy.addMark();
      expect(enemy.markStacks).toBe(2);
    });

    it('sets alpha based on stacks', () => {
      enemy.addMark(1);
      expect(enemy.alpha).toBe(0.7);
      enemy.addMark(1);
      expect(enemy.alpha).toBe(0.55);
      enemy.addMark(1);
      expect(enemy.alpha).toBe(0.4);
    });

    it('clearMarks resets to 0', () => {
      enemy.addMark(2);
      enemy.clearMarks();
      expect(enemy.markStacks).toBe(0);
      expect(enemy.alpha).toBe(1);
    });
  });

  describe('slow system', () => {
    it('applySlow adds slow entry', () => {
      enemy.applySlow(0.4, 1000);
      expect(enemy.isSlowed()).toBe(true);
    });

    it('computeSpeed applies max slow factor', () => {
      enemy.applySlow(0.3, 2000); // 30% slow
      enemy.applySlow(0.5, 2000); // 50% slow — this should dominate
      enemy.computeSpeed(1000);
      expect(enemy.speed).toBe(75 * 0.5); // 1 - 0.5 = 50%
    });

    it('expired slows are cleaned up', () => {
      enemy.applySlow(0.4, 500);
      enemy.computeSpeed(2000); // 1000 + 500 = expired
      expect(enemy.speed).toBe(75);
      expect(enemy.isSlowed()).toBe(false);
    });
  });

  describe('freeze system', () => {
    it('applyFreeze sets frozen state', () => {
      enemy.applyFreeze(1000);
      expect(enemy.isFrozen()).toBe(true);
    });

    it('frozen enemy has speed 0', () => {
      enemy.applyFreeze(1000);
      enemy.computeSpeed(1000);
      expect(enemy.speed).toBe(0);
    });

    it('freeze expires', () => {
      enemy.applyFreeze(500);
      enemy.computeSpeed(1600); // 1000 + 500 = expired at 1500
      expect(enemy.speed).toBe(75);
    });

    it('freeze sets alpha to 0.3', () => {
      enemy.applyFreeze(1000);
      enemy.computeSpeed(1000);
      expect(enemy.alpha).toBe(0.3);
    });

    it('alpha restores after freeze ends', () => {
      enemy.applyFreeze(500);
      enemy.computeSpeed(1000); // frozen
      enemy.computeSpeed(1600); // unfrozen
      expect(enemy.alpha).toBe(1);
    });

    it('alpha restores to mark level after freeze', () => {
      enemy.addMark(2);
      enemy.applyFreeze(500);
      enemy.computeSpeed(1000); // frozen, alpha 0.3
      enemy.computeSpeed(1600); // unfrozen, should restore to mark alpha
      expect(enemy.alpha).toBe(0.55);
    });

    it('extends freeze duration', () => {
      enemy.applyFreeze(500);
      enemy.applyFreeze(1500); // longer
      expect(enemy.isFrozen()).toBe(true);
      enemy.computeSpeed(1600); // 1000+500 = 1500, still frozen by second
      expect(enemy.speed).toBe(0);
    });

    it('does not shorten existing freeze', () => {
      enemy.applyFreeze(2000);
      enemy.applyFreeze(500); // shorter — should not override
      enemy.computeSpeed(1600); // still within first freeze
      expect(enemy.speed).toBe(0);
    });
  });

  describe('knockback', () => {
    it('applyKnockback sets velocity', () => {
      enemy.applyKnockback(0, 200, 100, 500);
      expect(enemy.isKnockedBack()).toBe(true);
      // velocity should be away from (0,200), toward (100,200)
      expect(enemy.body.velocity.x).toBeGreaterThan(0);
    });

    it('knockback expires', () => {
      enemy.applyKnockback(0, 200, 100, 500);
      scene.time.now = 1600;
      expect(enemy.isKnockedBack()).toBe(false);
    });
  });

  describe('update', () => {
    it('does nothing when inactive', () => {
      enemy.active = false;
      enemy.update(500, 500);
      expect(enemy.body.velocity.x).toBe(0);
    });

    it('stops when frozen', () => {
      enemy.applyFreeze(2000);
      enemy.update(500, 500);
      expect(enemy.body.velocity.x).toBe(0);
      expect(enemy.body.velocity.y).toBe(0);
    });

    it('moves toward target normally', () => {
      enemy.update(200, 200);
      expect(enemy.body.velocity.x).toBeGreaterThan(0);
      // y unchanged because same direction
    });

    it('preserves velocity during knockback', () => {
      enemy.applyKnockback(0, 200, 100, 2000);
      const vx = enemy.body.velocity.x;
      enemy.update(500, 500); // should not override knockback velocity
      expect(enemy.body.velocity.x).toBe(vx);
    });
  });
});
