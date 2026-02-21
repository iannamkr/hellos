import { describe, it, expect, beforeEach } from 'vitest';
import './setup';
import { BufferEnemy } from '../entities/BufferEnemy';
import { EnemyBase } from '../entities/EnemyBase';
import { createMockScene } from './setup';

describe('BufferEnemy', () => {
  let scene: ReturnType<typeof createMockScene>;
  let buffer: BufferEnemy;

  beforeEach(() => {
    scene = createMockScene(1000);
    buffer = new BufferEnemy(scene as any, 500, 300);
  });

  describe('constructor', () => {
    it('has 3 HP', () => {
      expect(buffer.hp).toBe(3);
    });

    it('has speed between 40 and 55', () => {
      // Mock FloatBetween returns average: (40+55)/2 = 47.5
      expect(buffer.baseSpeed).toBe(47.5);
    });
  });

  describe('applyAura', () => {
    it('buffs nearby enemies speed by 1.4x', () => {
      const enemy1 = new EnemyBase(scene as any, 550, 300, 'enemy', 2, 75);
      // Distance: 50px — within 120px
      buffer.applyAura([enemy1]);
      expect(enemy1.speed).toBe(75 * 1.4);
    });

    it('does not buff enemies outside 120px', () => {
      const enemy1 = new EnemyBase(scene as any, 700, 300, 'enemy', 2, 75);
      // Distance: 200px — outside 120px
      buffer.applyAura([enemy1]);
      expect(enemy1.speed).toBe(75);
    });

    it('does not buff self', () => {
      buffer.applyAura([buffer]);
      expect(buffer.speed).toBe(buffer.baseSpeed);
    });

    it('does not buff inactive enemies', () => {
      const enemy1 = new EnemyBase(scene as any, 550, 300, 'enemy', 2, 75);
      enemy1.active = false;
      buffer.applyAura([enemy1]);
      expect(enemy1.speed).toBe(75);
    });

    it('buffs multiple enemies', () => {
      const e1 = new EnemyBase(scene as any, 510, 300, 'enemy', 2, 75);
      const e2 = new EnemyBase(scene as any, 490, 310, 'enemy', 2, 60);
      const e3 = new EnemyBase(scene as any, 800, 300, 'enemy', 2, 50); // too far
      buffer.applyAura([e1, e2, e3]);
      expect(e1.speed).toBe(75 * 1.4);
      expect(e2.speed).toBe(60 * 1.4);
      expect(e3.speed).toBe(50); // unchanged
    });

    it('buffs at exactly 120px boundary', () => {
      const enemy1 = new EnemyBase(scene as any, 500 + 120, 300, 'enemy', 2, 75);
      buffer.applyAura([enemy1]);
      expect(enemy1.speed).toBe(75 * 1.4);
    });

    it('does not buff at 121px', () => {
      const enemy1 = new EnemyBase(scene as any, 500 + 121, 300, 'enemy', 2, 75);
      buffer.applyAura([enemy1]);
      expect(enemy1.speed).toBe(75);
    });
  });
});
