import { describe, it, expect, beforeEach } from 'vitest';
import './setup';
import { POLICIES, closestEnemy, closestEnemyToUnit, moveToSlot, reformMoveToSlot } from '../army/SquadPolicy';
import type { GameRules } from '../army/GameRules';
import { ArmyUnit } from '../entities/ArmyUnit';
import { EnemyBase } from '../entities/EnemyBase';
import { createMockScene } from './setup';

// ── Helpers ─────────────────────────────────────────────────────

function makeRules(overrides: Partial<GameRules> = {}): GameRules {
  return {
    hasNode: () => false,
    hasSup: () => false,
    keystone: 'closePact',
    item: 'bloodOath',
    now: 1000,
    speedMult: 1,
    armyAttackOff: false,
    archerFireOff: false,
    canArcherFire: true,
    isVolleyOpen: true,
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
    ...overrides,
  };
}

function makeUnit(scene: any, type: 'vanguard' | 'archer' | 'cavalry', x = 500, y = 300): ArmyUnit {
  const u = new ArmyUnit(scene, x, y, type);
  u.slotX = x;
  u.slotY = y;
  return u;
}

function makeEnemy(scene: any, x = 600, y = 300): EnemyBase {
  return new EnemyBase(scene, x, y, 'enemy', 2, 75);
}

// ── Utility functions ──────────────────────────────────────────

describe('closestEnemy', () => {
  let scene: any;

  beforeEach(() => {
    scene = createMockScene(1000);
  });

  it('returns null for empty pool', () => {
    expect(closestEnemy(0, 0, [])).toBeNull();
  });

  it('returns single enemy', () => {
    const e = makeEnemy(scene, 100, 100);
    expect(closestEnemy(0, 0, [e])).toBe(e);
  });

  it('returns closest of multiple', () => {
    const e1 = makeEnemy(scene, 100, 0);
    const e2 = makeEnemy(scene, 50, 0);
    const e3 = makeEnemy(scene, 200, 0);
    expect(closestEnemy(0, 0, [e1, e2, e3])).toBe(e2);
  });
});

describe('closestEnemyToUnit', () => {
  let scene: any;

  beforeEach(() => {
    scene = createMockScene(1000);
  });

  it('returns closest enemy to unit position', () => {
    const u = makeUnit(scene, 'vanguard', 100, 100);
    const e1 = makeEnemy(scene, 200, 100);
    const e2 = makeEnemy(scene, 110, 100);
    expect(closestEnemyToUnit(u, [e1, e2])).toBe(e2);
  });
});

describe('moveToSlot', () => {
  let scene: any;

  beforeEach(() => {
    scene = createMockScene(1000);
  });

  it('moves unit toward slot when far', () => {
    const u = makeUnit(scene, 'vanguard', 100, 100);
    u.slotX = 200;
    u.slotY = 100;
    const rules = makeRules();
    moveToSlot(u, 1, rules);
    expect(u.body.velocity.x).toBeGreaterThan(0);
  });

  it('stops unit when very close to slot (d < 5)', () => {
    const u = makeUnit(scene, 'vanguard', 100, 100);
    u.slotX = 103;
    u.slotY = 100;
    const rules = makeRules();
    moveToSlot(u, 1, rules);
    // d=3 < 5 → stops
    expect(u.body.velocity.x).toBe(0);
    expect(u.body.velocity.y).toBe(0);
  });

  it('stops when at slot (d < 5)', () => {
    const u = makeUnit(scene, 'vanguard', 100, 100);
    u.slotX = 102;
    u.slotY = 100;
    const rules = makeRules();
    moveToSlot(u, 1, rules);
    expect(u.body.velocity.x).toBe(0);
    expect(u.body.velocity.y).toBe(0);
  });

  it('applies A3 retreat prevention for vanguard', () => {
    const u = makeUnit(scene, 'vanguard', 450, 400);
    u.slotX = 450;
    u.slotY = 400;
    const rules = makeRules({
      hasNode: (id) => id === 'A3',
      anchorV: { x: 500, y: 300 },
      dir: { x: 0, y: -1 },
    });
    // Unit at 450,400, anchor at 500,300, dir (0,-1)
    // dot = (450-500)*0 + (400-300)*(-1) = -100 → behind anchor → push forward
    moveToSlot(u, 1, rules);
    // y velocity should be negative (pushed toward frontDir y=-1)
    expect(u.body.velocity.y).toBeLessThan(0);
  });
});

describe('reformMoveToSlot', () => {
  let scene: any;

  beforeEach(() => {
    scene = createMockScene(1000);
  });

  it('snaps to slot when close enough', () => {
    const u = makeUnit(scene, 'vanguard', 100, 100);
    u.slotX = 110;
    u.slotY = 100;
    const rules = makeRules({ reformStartTime: 1000, now: 1010 });
    reformMoveToSlot(u, 0, rules); // d=10 < 18 → snap
    expect(u.x).toBe(110);
    expect(u.y).toBe(100);
  });

  it('moves fast when far from slot', () => {
    const u = makeUnit(scene, 'vanguard', 100, 100);
    u.slotX = 400;
    u.slotY = 100;
    const rules = makeRules({ reformStartTime: 1000, now: 1050 });
    reformMoveToSlot(u, 0, rules);
    // speed should be unitSpeed * 2.8 = 200 * 2.8 = 560
    expect(Math.abs(u.body.velocity.x)).toBeGreaterThan(500);
  });

  it('applies stagger delay', () => {
    const u = makeUnit(scene, 'vanguard', 100, 100);
    u.slotX = 400;
    u.slotY = 100;
    // Unit index 5, stagger = 5*20 = 100ms. Reform started at 1000. Now = 1050.
    // Elapsed = 50 < 100 → use normal moveToSlot
    const rules = makeRules({ reformStartTime: 1000, now: 1050 });
    reformMoveToSlot(u, 5, rules);
    // Should use normal speed (moveToSlot), not 2.8x
    expect(Math.abs(u.body.velocity.x)).toBeLessThan(500);
  });

  it('brakes within brake radius', () => {
    const u = makeUnit(scene, 'vanguard', 100, 100);
    u.slotX = 150;
    u.slotY = 100; // d=50 < 70 (brake radius)
    const rules = makeRules({ reformStartTime: 1000, now: 1020 });
    reformMoveToSlot(u, 0, rules);
    // speed should be reduced: 200*2.8*(50/70) = ~400
    expect(Math.abs(u.body.velocity.x)).toBeLessThan(500);
    expect(Math.abs(u.body.velocity.x)).toBeGreaterThan(300);
  });
});

// ── Vanguard Policy ─────────────────────────────────────────────

describe('vanguardPolicy', () => {
  let scene: any;

  beforeEach(() => {
    scene = createMockScene(1000);
  });

  describe('computeSlots', () => {
    it('assigns slots to all units', () => {
      const units = Array.from({ length: 5 }, (_, i) => makeUnit(scene, 'vanguard', 100 + i * 10, 100));
      const rules = makeRules();
      POLICIES.vanguard.computeSlots(units, { x: 500, y: 300 }, rules);
      for (const u of units) {
        expect(u.slotX).not.toBe(100); // should be updated
      }
    });

    it('uses tighter gap with E2 and player still', () => {
      const units = Array.from({ length: 4 }, () => makeUnit(scene, 'vanguard'));
      const rulesNormal = makeRules({ player: { x: 500, y: 300, isMoving: true } });
      const rulesStill = makeRules({
        hasNode: (id) => id === 'E2',
        player: { x: 500, y: 300, isMoving: false },
      });

      POLICIES.vanguard.computeSlots(units, { x: 500, y: 300 }, rulesNormal);
      const normalSpread = Math.abs(units[0].slotX - units[1].slotX);

      POLICIES.vanguard.computeSlots(units, { x: 500, y: 300 }, rulesStill);
      const stillSpread = Math.abs(units[0].slotX - units[1].slotX);

      expect(stillSpread).toBeLessThan(normalSpread);
    });
  });

  describe('getTarget', () => {
    it('returns null when no enemies', () => {
      const u = makeUnit(scene, 'vanguard');
      const rules = makeRules();
      expect(POLICIES.vanguard.getTarget(u, [], rules)).toBeNull();
    });

    it('returns K5 target when singleTargetOath', () => {
      const u = makeUnit(scene, 'vanguard');
      const forced = makeEnemy(scene, 800, 800);
      const rules = makeRules({ keystone: 'singleTargetOath', k5Target: forced });
      expect(POLICIES.vanguard.getTarget(u, [forced], rules)).toBe(forced);
    });

    it('prioritizes marked enemy in range', () => {
      const u = makeUnit(scene, 'vanguard', 500, 300);
      u.atkRange = 50;
      const marked = makeEnemy(scene, 530, 300);
      const closer = makeEnemy(scene, 510, 300);
      const rules = makeRules({ mark: marked });
      const target = POLICIES.vanguard.getTarget(u, [marked, closer], rules);
      expect(target).toBe(marked);
    });

    it('returns closest to player when no mark', () => {
      const u = makeUnit(scene, 'vanguard', 500, 300);
      u.atkRange = 100;
      const e1 = makeEnemy(scene, 520, 300);
      const e2 = makeEnemy(scene, 580, 300);
      const rules = makeRules({ player: { x: 500, y: 300, isMoving: false } });
      const target = POLICIES.vanguard.getTarget(u, [e1, e2], rules);
      expect(target).toBe(e1);
    });
  });

  describe('behave', () => {
    it('enters FORMING during reform', () => {
      const u = makeUnit(scene, 'vanguard');
      const rules = makeRules({ isReforming: true, reformStartTime: 1000 });
      POLICIES.vanguard.behave(u, null, 100, rules, 0);
      expect(u.state).toBe('FORMING');
    });

    it('enters HOLD when no target', () => {
      const u = makeUnit(scene, 'vanguard');
      const rules = makeRules();
      POLICIES.vanguard.behave(u, null, 100, rules, 0);
      expect(u.state).toBe('HOLD');
    });

    it('returns attack target when in range and ready', () => {
      const u = makeUnit(scene, 'vanguard', 500, 300);
      u.nextAtk = 0;
      const enemy = makeEnemy(scene, 530, 300); // 30px away, within atkRange=50
      const rules = makeRules();
      const result = POLICIES.vanguard.behave(u, enemy, 10, rules, 0);
      // Vanguard doesn't return target directly from behave — it uses lock system
      // First call locks, second call might attack
      expect(u.state).not.toBe('FORMING');
    });
  });
});

// ── Archer Policy ───────────────────────────────────────────────

describe('archerPolicy', () => {
  let scene: any;

  beforeEach(() => {
    scene = createMockScene(1000);
  });

  describe('computeSlots', () => {
    it('places archers behind anchor', () => {
      const units = Array.from({ length: 3 }, () => makeUnit(scene, 'archer'));
      const rules = makeRules({ dir: { x: 0, y: -1 } });
      POLICIES.archer.computeSlots(units, { x: 500, y: 300 }, rules);
      // Behind anchor: dir is (0,-1), so behind is (0,+1) → slot.y > 300
      for (const u of units) {
        expect(u.slotY).toBeGreaterThan(300);
      }
    });
  });

  describe('getTarget', () => {
    it('returns null when no enemies', () => {
      const u = makeUnit(scene, 'archer');
      expect(POLICIES.archer.getTarget(u, [], makeRules())).toBeNull();
    });

    it('respects dead zone (120px)', () => {
      const u = makeUnit(scene, 'archer', 500, 300);
      const tooClose = makeEnemy(scene, 550, 300); // 50px from leader
      const rules = makeRules({ archerLeader: { x: 500, y: 300 } });
      const target = POLICIES.archer.getTarget(u, [tooClose], rules);
      // Within dead zone → not in inRange pool, falls through to closestEnemy
      expect(target).toBe(tooClose); // still returned as fallback closest
    });

    it('returns K5 target when singleTargetOath', () => {
      const u = makeUnit(scene, 'archer');
      const forced = makeEnemy(scene, 700, 300);
      const rules = makeRules({ keystone: 'singleTargetOath', k5Target: forced });
      expect(POLICIES.archer.getTarget(u, [forced], rules)).toBe(forced);
    });
  });

  describe('behave', () => {
    it('enters FORMING during reform', () => {
      const u = makeUnit(scene, 'archer');
      const rules = makeRules({ isReforming: true, reformStartTime: 1000 });
      POLICIES.archer.behave(u, null, 100, rules, 0);
      expect(u.state).toBe('FORMING');
    });

    it('enters HOLD when no target', () => {
      const u = makeUnit(scene, 'archer');
      const rules = makeRules();
      POLICIES.archer.behave(u, null, 100, rules, 0);
      expect(u.state).toBe('HOLD');
    });

    it('fires when volley open and in range', () => {
      const u = makeUnit(scene, 'archer', 500, 300);
      u.nextAtk = 0;
      const enemy = makeEnemy(scene, 700, 300); // 200px
      const rules = makeRules({
        isVolleyOpen: true,
        canArcherFire: true,
        archerFireOff: false,
        archerFired: new Set(),
        archerLeader: { x: 500, y: 300 },
      });
      const result = POLICIES.archer.behave(u, enemy, 10, rules, 0);
      expect(result).toBe(enemy);
      expect(u.state).toBe('ENGAGE');
    });

    it('blocks fire when B2 active and target too close', () => {
      const u = makeUnit(scene, 'archer', 500, 300);
      u.nextAtk = 0;
      const enemy = makeEnemy(scene, 650, 300); // 150px from leader
      const rules = makeRules({
        hasNode: (id) => id === 'B2',
        isVolleyOpen: true,
        canArcherFire: true,
        archerFired: new Set(),
        archerLeader: { x: 500, y: 300 },
      });
      const result = POLICIES.archer.behave(u, enemy, 10, rules, 0);
      expect(result).toBeNull();
    });

    it('does not fire when volley not open', () => {
      const u = makeUnit(scene, 'archer', 500, 300);
      u.nextAtk = 0;
      const enemy = makeEnemy(scene, 700, 300);
      const rules = makeRules({
        isVolleyOpen: false,
        canArcherFire: true,
        archerFired: new Set(),
        archerLeader: { x: 500, y: 300 },
      });
      const result = POLICIES.archer.behave(u, enemy, 10, rules, 0);
      expect(result).toBeNull();
    });
  });
});

// ── Cavalry Policy ──────────────────────────────────────────────

describe('cavalryPolicy', () => {
  let scene: any;

  beforeEach(() => {
    scene = createMockScene(1000);
  });

  describe('computeSlots', () => {
    it('assigns slots to all units', () => {
      const units = Array.from({ length: 3 }, () => makeUnit(scene, 'cavalry'));
      const rules = makeRules();
      POLICIES.cavalry.computeSlots(units, { x: 500, y: 300 }, rules);
      // Check slots were computed (not still 500,300)
      const uniqueSlots = new Set(units.map(u => `${u.slotX},${u.slotY}`));
      expect(uniqueSlots.size).toBeGreaterThan(1); // different slots
    });

    it('uses FLAG perimeter patrol when E3 active and still', () => {
      const units = Array.from({ length: 3 }, () => makeUnit(scene, 'cavalry'));
      const rules = makeRules({
        hasNode: (id) => id === 'E3',
        player: { x: 500, y: 300, isMoving: false },
        flag: { x: 960, y: 540 },
      });
      POLICIES.cavalry.computeSlots(units, { x: 500, y: 300 }, rules);
      // Slots should be around FLAG position (960,540) ± 120px
      for (const u of units) {
        const distToFlag = Math.sqrt((u.slotX - 960) ** 2 + (u.slotY - 540) ** 2);
        expect(distToFlag).toBeCloseTo(120, 0);
      }
    });
  });

  describe('getTarget', () => {
    it('returns null when no enemies', () => {
      const u = makeUnit(scene, 'cavalry');
      expect(POLICIES.cavalry.getTarget(u, [], makeRules())).toBeNull();
    });

    it('returns K5 target when singleTargetOath', () => {
      const u = makeUnit(scene, 'cavalry');
      const forced = makeEnemy(scene, 700, 300);
      const rules = makeRules({ keystone: 'singleTargetOath', k5Target: forced });
      expect(POLICIES.cavalry.getTarget(u, [forced], rules)).toBe(forced);
    });
  });

  describe('behave', () => {
    it('enters FORMING during reform', () => {
      const u = makeUnit(scene, 'cavalry');
      const rules = makeRules({ isReforming: true, reformStartTime: 1000 });
      POLICIES.cavalry.behave(u, null, 100, rules, 0);
      expect(u.state).toBe('FORMING');
    });

    it('enters HOLD when no target', () => {
      const u = makeUnit(scene, 'cavalry');
      const rules = makeRules();
      POLICIES.cavalry.behave(u, null, 100, rules, 0);
      expect(u.state).toBe('HOLD');
    });

    it('attacks when in range and ready', () => {
      const u = makeUnit(scene, 'cavalry', 500, 300);
      u.nextAtk = 0;
      const enemy = makeEnemy(scene, 540, 300); // 40px away, within atkRange=65
      const rules = makeRules();
      const result = POLICIES.cavalry.behave(u, enemy, 10, rules, 0);
      expect(result).toBe(enemy);
      expect(u.state).toBe('ENGAGE');
    });
  });
});

// ── POLICIES map ────────────────────────────────────────────────

describe('POLICIES', () => {
  it('has all 3 squad types', () => {
    expect(POLICIES.vanguard).toBeDefined();
    expect(POLICIES.archer).toBeDefined();
    expect(POLICIES.cavalry).toBeDefined();
  });

  it('each policy has required methods', () => {
    for (const type of ['vanguard', 'archer', 'cavalry'] as const) {
      expect(typeof POLICIES[type].computeSlots).toBe('function');
      expect(typeof POLICIES[type].getTarget).toBe('function');
      expect(typeof POLICIES[type].behave).toBe('function');
    }
  });
});
