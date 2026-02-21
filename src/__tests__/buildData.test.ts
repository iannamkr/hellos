import { describe, it, expect } from 'vitest';
import {
  KEYSTONES, SKILLS, SUPPORTS, ITEMS, PRESETS,
  getKeystone, getSkill, getSupport, getItem,
} from '../data/buildData';
import type { KeystoneId, SkillId, SupportId, ItemId } from '../types';

// ── Data integrity ──────────────────────────────────────────────

describe('KEYSTONES', () => {
  it('has exactly 6 entries', () => {
    expect(KEYSTONES).toHaveLength(6);
  });

  it('all ids are unique', () => {
    const ids = KEYSTONES.map(k => k.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('each keystone has required fields', () => {
    for (const k of KEYSTONES) {
      expect(k.id).toBeTruthy();
      expect(k.label).toBeTruthy();
      expect(k.tags.length).toBeGreaterThan(0);
      expect(k.penalty).toBeTruthy();
      expect(k.benefit).toBeTruthy();
      expect(k.armyRule).toBeTruthy();
    }
  });

  it('ids match the KeystoneId union', () => {
    const expected: KeystoneId[] = ['closePact', 'kitingVow', 'stillnessStance', 'momentumMode', 'singleTargetOath', 'fragilePower'];
    expect(KEYSTONES.map(k => k.id).sort()).toEqual(expected.sort());
  });
});

describe('SKILLS', () => {
  it('has exactly 6 entries', () => {
    expect(SKILLS).toHaveLength(6);
  });

  it('all ids are unique', () => {
    const ids = SKILLS.map(s => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('each skill has valid arc geometry', () => {
    for (const s of SKILLS) {
      expect(s.arcDeg).toBeGreaterThan(0);
      expect(s.arcDeg).toBeLessThanOrEqual(360);
      expect(s.arcRange).toBeGreaterThan(0);
    }
  });

  it('special skills are lunge or charge', () => {
    const specials = SKILLS.filter(s => s.special);
    for (const s of specials) {
      expect(['lunge', 'charge']).toContain(s.special);
    }
  });

  it('lunge skill exists with correct special', () => {
    const lunge = SKILLS.find(s => s.id === 'lunge');
    expect(lunge?.special).toBe('lunge');
  });

  it('guardBreak skill exists with charge special', () => {
    const gb = SKILLS.find(s => s.id === 'guardBreak');
    expect(gb?.special).toBe('charge');
  });
});

describe('SUPPORTS', () => {
  it('has exactly 10 entries', () => {
    expect(SUPPORTS).toHaveLength(10);
  });

  it('all ids are unique', () => {
    const ids = SUPPORTS.map(s => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('each support has requiredTags', () => {
    for (const s of SUPPORTS) {
      expect(s.requiredTags.length).toBeGreaterThan(0);
    }
  });

  it('requiredTags are valid tags', () => {
    const allSupportTags = SUPPORTS.flatMap(s => s.requiredTags);
    // All must be strings (tag union members)
    for (const t of allSupportTags) {
      expect(typeof t).toBe('string');
    }
  });
});

describe('ITEMS', () => {
  it('has exactly 8 entries', () => {
    expect(ITEMS).toHaveLength(8);
  });

  it('all ids are unique', () => {
    const ids = ITEMS.map(i => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('each item has penalty and benefit', () => {
    for (const item of ITEMS) {
      expect(item.penalty).toBeTruthy();
      expect(item.benefit).toBeTruthy();
    }
  });
});

describe('PRESETS', () => {
  it('has exactly 6 entries', () => {
    expect(PRESETS).toHaveLength(6);
  });

  it('each preset has a valid build config', () => {
    for (const p of PRESETS) {
      expect(p.label).toBeTruthy();
      expect(p.desc).toBeTruthy();
      expect(p.build.keystone).toBeTruthy();
      expect(p.build.skill).toBeTruthy();
      expect(p.build.supports).toHaveLength(2);
      expect(p.build.item).toBeTruthy();
    }
  });

  it('preset keystones reference valid keystones', () => {
    for (const p of PRESETS) {
      expect(getKeystone(p.build.keystone)).toBeTruthy();
    }
  });

  it('preset skills reference valid skills', () => {
    for (const p of PRESETS) {
      expect(getSkill(p.build.skill)).toBeTruthy();
    }
  });

  it('preset supports reference valid supports', () => {
    for (const p of PRESETS) {
      expect(getSupport(p.build.supports[0])).toBeTruthy();
      expect(getSupport(p.build.supports[1])).toBeTruthy();
    }
  });

  it('preset items reference valid items', () => {
    for (const p of PRESETS) {
      expect(getItem(p.build.item)).toBeTruthy();
    }
  });
});

// ── Lookup functions ────────────────────────────────────────────

describe('getKeystone', () => {
  it('returns correct keystone by id', () => {
    expect(getKeystone('closePact').label).toBe('근접 서약');
    expect(getKeystone('fragilePower').id).toBe('fragilePower');
  });

  it('returns all 6 keystones', () => {
    const ids: KeystoneId[] = ['closePact', 'kitingVow', 'stillnessStance', 'momentumMode', 'singleTargetOath', 'fragilePower'];
    for (const id of ids) {
      expect(getKeystone(id)).toBeDefined();
    }
  });
});

describe('getSkill', () => {
  it('returns correct skill by id', () => {
    expect(getSkill('slash').arcDeg).toBe(90);
    expect(getSkill('thrust').arcRange).toBe(200);
  });
});

describe('getSupport', () => {
  it('returns correct support by id', () => {
    expect(getSupport('dashPrime').requiredTags).toContain('dash');
    expect(getSupport('markStack').requiredTags).toContain('mark');
  });
});

describe('getItem', () => {
  it('returns correct item by id', () => {
    expect(getItem('bloodOath').tags).toContain('sustain');
    expect(getItem('sprintBoots').tags).toContain('dash');
  });
});
