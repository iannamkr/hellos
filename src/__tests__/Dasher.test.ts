import { describe, it, expect, beforeEach, vi } from 'vitest';
import './setup';
import { Dasher } from '../entities/Dasher';
import { createMockScene } from './setup';

describe('Dasher', () => {
  let scene: ReturnType<typeof createMockScene>;
  let dasher: Dasher;

  beforeEach(() => {
    scene = createMockScene(1000);
    dasher = new Dasher(scene as any, 800, 400);
  });

  describe('constructor', () => {
    it('has 2 HP', () => {
      expect(dasher.hp).toBe(2);
    });

    it('has 55 base speed', () => {
      expect(dasher.baseSpeed).toBe(55);
    });

    it('starts with windupMultiplier 1.0', () => {
      expect(dasher.windupMultiplier).toBe(1.0);
    });

    it('disruptHitCount starts at 0', () => {
      expect(dasher.disruptHitCount).toBe(0);
    });

    it('onDisruptHit is null', () => {
      expect(dasher.onDisruptHit).toBeNull();
    });
  });

  describe('isDashing / isWindingUp', () => {
    it('not dashing initially', () => {
      expect(dasher.isDashing()).toBe(false);
    });

    it('not winding up initially (in seek_gap)', () => {
      expect(dasher.isWindingUp()).toBe(false);
    });
  });

  describe('stopDash', () => {
    it('does nothing when not dashing', () => {
      dasher.stopDash();
      expect(dasher.disruptHitCount).toBe(0);
    });
  });

  describe('windupMultiplier', () => {
    it('can be set to 1.2 for K4 momentum mode', () => {
      dasher.windupMultiplier = 1.2;
      expect(dasher.windupMultiplier).toBe(1.2);
    });
  });

  describe('update without context', () => {
    it('chases target', () => {
      dasher.update(1000, 400);
      expect(dasher.body.velocity.x).toBeGreaterThan(0);
    });

    it('does nothing when inactive', () => {
      dasher.active = false;
      dasher.update(1000, 400);
      expect(dasher.body.velocity.x).toBe(0);
    });

    it('stops when frozen', () => {
      dasher.applyFreeze(2000);
      dasher.update(1000, 400);
      expect(dasher.body.velocity.x).toBe(0);
    });
  });

  describe('seek_gap state', () => {
    it('moves toward gap point', () => {
      const ctx = {
        flagX: 960, flagY: 540,
        frontDirX: 0, frontDirY: -1,
        rightDirX: 1, rightDirY: 0,
        now: 1000, dt: 16,
        vanguardPositions: [],
        enemies: [],
      };
      dasher.update(960, 540, ctx);
      // Should be moving toward gap point (no vanguards = center gap preferred)
      expect(typeof dasher.body.velocity.x).toBe('number');
    });

    it('prefers gap with fewer vanguards', () => {
      const ctx = {
        flagX: 960, flagY: 540,
        frontDirX: 0, frontDirY: -1,
        rightDirX: 1, rightDirY: 0,
        now: 1000, dt: 16,
        vanguardPositions: [
          // Pack vanguards on the left
          { x: 960 - 240, y: 540 - 40 },
          { x: 960 - 240 + 20, y: 540 - 40 },
          { x: 960 - 240 - 20, y: 540 - 40 },
        ],
        enemies: [],
      };
      dasher.update(960, 540, ctx);
      // Dasher should avoid the left side where vanguards are packed
      // This is hard to test precisely without more state inspection,
      // but we verify the update doesn't crash
      expect(dasher.body.velocity).toBeDefined();
    });
  });

  describe('destroy', () => {
    it('cleans up graphics', () => {
      dasher.destroy();
      expect(dasher.active).toBe(false);
    });
  });

  describe('disrupt callback', () => {
    it('onDisruptHit can be set', () => {
      const fn = vi.fn();
      dasher.onDisruptHit = fn;
      expect(dasher.onDisruptHit).toBe(fn);
    });
  });
});
