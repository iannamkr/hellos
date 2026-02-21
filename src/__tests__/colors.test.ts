import { describe, it, expect } from 'vitest';
import { COLOR } from '../colors';

describe('COLOR', () => {
  it('has all 7 entity colors', () => {
    expect(Object.keys(COLOR)).toHaveLength(7);
  });

  it('has commander color (cyan)', () => {
    expect(COLOR.commander).toBe(0x00ffcc);
  });

  it('has vanguard color (blue)', () => {
    expect(COLOR.vanguard).toBe(0x4d88ff);
  });

  it('has archer color (green)', () => {
    expect(COLOR.archer).toBe(0x66ff66);
  });

  it('has cavalry color (yellow)', () => {
    expect(COLOR.cavalry).toBe(0xffcc33);
  });

  it('has enemyChaser color (red)', () => {
    expect(COLOR.enemyChaser).toBe(0xff4444);
  });

  it('has enemyDasher color (orange)', () => {
    expect(COLOR.enemyDasher).toBe(0xff8844);
  });

  it('has enemyBuffer color (purple)', () => {
    expect(COLOR.enemyBuffer).toBe(0xaa55ff);
  });

  it('all values are numbers', () => {
    for (const v of Object.values(COLOR)) {
      expect(typeof v).toBe('number');
    }
  });

  it('all values are valid hex colors (0x000000 - 0xffffff)', () => {
    for (const v of Object.values(COLOR)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(0xffffff);
    }
  });

  it('all values are unique', () => {
    const values = Object.values(COLOR);
    expect(new Set(values).size).toBe(values.length);
  });
});
