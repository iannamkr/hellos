import { describe, it, expect, beforeEach } from 'vitest';
import './setup';
import { ArmyUnit, SQUAD_CFG } from '../entities/ArmyUnit';
import { createMockScene } from './setup';

describe('SQUAD_CFG', () => {
  it('vanguard has correct defaults', () => {
    const v = SQUAD_CFG.vanguard;
    expect(v.atkRange).toBe(50);
    expect(v.atkCD).toBe(650);
    expect(v.dmg).toBe(1);
    expect(v.speed).toBe(200);
    expect(v.unitHp).toBe(2);
    expect(v.engageRadius).toBe(170);
    expect(v.returnRadius).toBe(220);
  });

  it('archer has correct defaults', () => {
    const a = SQUAD_CFG.archer;
    expect(a.atkRange).toBe(420);
    expect(a.atkCD).toBe(900);
    expect(a.speed).toBe(150);
    expect(a.unitHp).toBe(1);
  });

  it('cavalry has correct defaults', () => {
    const c = SQUAD_CFG.cavalry;
    expect(c.atkRange).toBe(65);
    expect(c.atkCD).toBe(775);
    expect(c.speed).toBe(300);
    expect(c.unitHp).toBe(2);
  });

  it('engageRadius < returnRadius for all types', () => {
    for (const type of ['vanguard', 'archer', 'cavalry'] as const) {
      expect(SQUAD_CFG[type].engageRadius).toBeLessThan(SQUAD_CFG[type].returnRadius);
    }
  });
});

describe('ArmyUnit', () => {
  let scene: ReturnType<typeof createMockScene>;

  beforeEach(() => {
    scene = createMockScene(1000);
  });

  describe('vanguard creation', () => {
    let unit: ArmyUnit;

    beforeEach(() => {
      unit = new ArmyUnit(scene as any, 100, 200, 'vanguard');
    });

    it('sets squad type', () => {
      expect(unit.squadType).toBe('vanguard');
    });

    it('sets stats from config', () => {
      expect(unit.atkRange).toBe(50);
      expect(unit.atkCD).toBe(650);
      expect(unit.dmg).toBe(1);
      expect(unit.unitSpeed).toBe(200);
    });

    it('sets HP from config', () => {
      expect(unit.hp).toBe(6);
      expect(unit.maxHp).toBe(6);
    });

    it('ensures engageRadius < returnRadius', () => {
      expect(unit.engageRadius).toBeLessThan(unit.returnRadius);
    });

    it('starts in FORMING state', () => {
      expect(unit.state).toBe('FORMING');
    });

    it('starts with no locked target', () => {
      expect(unit.lockedTarget).toBeNull();
    });

    it('starts with nextAtk = 0', () => {
      expect(unit.nextAtk).toBe(0);
    });
  });

  describe('archer creation', () => {
    it('sets correct stats', () => {
      const unit = new ArmyUnit(scene as any, 0, 0, 'archer');
      expect(unit.squadType).toBe('archer');
      expect(unit.atkRange).toBe(420);
      expect(unit.hp).toBe(1);
      expect(unit.unitSpeed).toBe(150);
    });
  });

  describe('cavalry creation', () => {
    it('sets correct stats', () => {
      const unit = new ArmyUnit(scene as any, 0, 0, 'cavalry');
      expect(unit.squadType).toBe('cavalry');
      expect(unit.atkRange).toBe(65);
      expect(unit.hp).toBe(2);
      expect(unit.unitSpeed).toBe(300);
    });
  });

  describe('slot position', () => {
    it('defaults to 0,0', () => {
      const unit = new ArmyUnit(scene as any, 100, 200, 'vanguard');
      expect(unit.slotX).toBe(0);
      expect(unit.slotY).toBe(0);
    });

    it('is mutable', () => {
      const unit = new ArmyUnit(scene as any, 100, 200, 'vanguard');
      unit.slotX = 300;
      unit.slotY = 400;
      expect(unit.slotX).toBe(300);
      expect(unit.slotY).toBe(400);
    });
  });

  describe('state flags', () => {
    it('isReturning defaults false', () => {
      const unit = new ArmyUnit(scene as any, 0, 0, 'vanguard');
      expect(unit.isReturning).toBe(false);
    });

    it('isIntercepting defaults false', () => {
      const unit = new ArmyUnit(scene as any, 0, 0, 'cavalry');
      expect(unit.isIntercepting).toBe(false);
    });
  });
});
