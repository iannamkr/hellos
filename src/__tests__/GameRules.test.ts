import { describe, it, expect } from 'vitest';
import './setup';
import type { GameRules } from '../army/GameRules';

/**
 * GameRules is a pure interface — no runtime code to test.
 * These tests verify that objects conforming to the interface compile correctly
 * and that all fields are accessible.
 */

describe('GameRules interface', () => {
  const mockRules: GameRules = {
    hasNode: () => false,
    hasSup: () => false,
    keystone: 'closePact',
    item: 'bloodOath',
    now: 1000,
    speedMult: 1,
    armyAttackOff: false,
    archerFireOff: false,
    canArcherFire: true,
    isVolleyOpen: false,
    isReforming: false,
    reformStartTime: 0,
    player: { x: 500, y: 300, isMoving: false },
    flag: { x: 960, y: 540 },
    dir: { x: 0, y: -1 },
    mark: null,
    aura: { active: true, cx: 500, cy: 300, r: 260 },
    anchorV: { x: 500, y: 300 },
    archerLeader: { x: 500, y: 300 },
    k5Target: null,
    d4Active: false,
    vanguardLowHp: false,
    archerFired: new Set(),
    getAttackCD: () => 650,
  };

  it('hasNode returns boolean', () => {
    expect(typeof mockRules.hasNode('A1')).toBe('boolean');
  });

  it('hasSup returns boolean', () => {
    expect(typeof mockRules.hasSup('dashPrime')).toBe('boolean');
  });

  it('has keystone', () => {
    expect(mockRules.keystone).toBe('closePact');
  });

  it('has item', () => {
    expect(mockRules.item).toBe('bloodOath');
  });

  it('has numeric fields', () => {
    expect(typeof mockRules.now).toBe('number');
    expect(typeof mockRules.speedMult).toBe('number');
    expect(typeof mockRules.reformStartTime).toBe('number');
  });

  it('has boolean flags', () => {
    expect(typeof mockRules.armyAttackOff).toBe('boolean');
    expect(typeof mockRules.archerFireOff).toBe('boolean');
    expect(typeof mockRules.canArcherFire).toBe('boolean');
    expect(typeof mockRules.isVolleyOpen).toBe('boolean');
    expect(typeof mockRules.isReforming).toBe('boolean');
    expect(typeof mockRules.d4Active).toBe('boolean');
    expect(typeof mockRules.vanguardLowHp).toBe('boolean');
  });

  it('player has x, y, isMoving', () => {
    expect(mockRules.player.x).toBe(500);
    expect(mockRules.player.y).toBe(300);
    expect(mockRules.player.isMoving).toBe(false);
  });

  it('flag has x, y', () => {
    expect(mockRules.flag.x).toBe(960);
    expect(mockRules.flag.y).toBe(540);
  });

  it('dir has x, y', () => {
    expect(mockRules.dir.x).toBe(0);
    expect(mockRules.dir.y).toBe(-1);
  });

  it('mark is nullable', () => {
    expect(mockRules.mark).toBeNull();
  });

  it('aura has active, cx, cy, r', () => {
    expect(mockRules.aura.active).toBe(true);
    expect(mockRules.aura.r).toBe(260);
  });

  it('anchorV has x, y', () => {
    expect(mockRules.anchorV.x).toBe(500);
  });

  it('archerLeader has x, y', () => {
    expect(mockRules.archerLeader.x).toBe(500);
  });

  it('k5Target is nullable', () => {
    expect(mockRules.k5Target).toBeNull();
  });

  it('archerFired is a ReadonlySet', () => {
    expect(mockRules.archerFired).toBeInstanceOf(Set);
  });

  it('getAttackCD returns number', () => {
    expect(typeof mockRules.getAttackCD({} as any)).toBe('number');
  });
});
