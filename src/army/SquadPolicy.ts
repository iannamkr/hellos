import Phaser from 'phaser';
import type { SquadType } from '../types';
import type { ArmyUnit } from '../entities/ArmyUnit';
import type { EnemyBase } from '../entities/EnemyBase';
import { Dasher } from '../entities/Dasher';
import { BufferEnemy } from '../entities/BufferEnemy';
import type { GameRules } from './GameRules';

export interface Vec2 { x: number; y: number }

export interface SquadPolicy {
  computeSlots(units: ArmyUnit[], anchor: Vec2, rules: GameRules): void;
  getTarget(unit: ArmyUnit, enemies: EnemyBase[], rules: GameRules): EnemyBase | null;
  /** Returns attack target or null. unitIndex is used for reform stagger. */
  behave(unit: ArmyUnit, target: EnemyBase | null, distToSlot: number, rules: GameRules, unitIndex: number): EnemyBase | null;
}

// ─── Constants ───────────────────────────────────────────────────

const REFORM_SPEED_MULT = 2.8;
const REFORM_ARRIVE_RADIUS = 18;
const REFORM_BRAKE_RADIUS = 70;
const REFORM_STAGGER_INTERVAL = 20; // ms per unit index

// ─── Utility functions ───────────────────────────────────────────

export function moveToSlot(u: ArmyUnit, speedMult: number, rules: GameRules): void {
  const d = Phaser.Math.Distance.Between(u.x, u.y, u.slotX, u.slotY);
  if (d > 40) {
    const angle = Phaser.Math.Angle.Between(u.x, u.y, u.slotX, u.slotY);
    const spd = Math.min(u.unitSpeed * speedMult, d * 3);
    u.setVelocity(Math.cos(angle) * spd, Math.sin(angle) * spd);
  } else if (d > 5) {
    const angle = Phaser.Math.Angle.Between(u.x, u.y, u.slotX, u.slotY);
    const spd = d * 2;
    u.setVelocity(Math.cos(angle) * spd, Math.sin(angle) * spd);
  } else {
    u.setVelocity(0, 0);
  }

  // A3: vanguard can't retreat behind anchorPos
  if (rules.hasNode('A3') && u.squadType === 'vanguard') {
    const relX = u.x - rules.anchorV.x;
    const relY = u.y - rules.anchorV.y;
    const dot = relX * rules.dir.x + relY * rules.dir.y;
    if (dot < 0) {
      const body = u.body as Phaser.Physics.Arcade.Body;
      u.setVelocity(
        body.velocity.x + rules.dir.x * 50,
        body.velocity.y + rules.dir.y * 50,
      );
    }
  }
}

/** Reform movement: fast snap to slot with braking and per-unit stagger */
export function reformMoveToSlot(u: ArmyUnit, unitIndex: number, rules: GameRules): void {
  const d = Phaser.Math.Distance.Between(u.x, u.y, u.slotX, u.slotY);

  // Per-unit stagger: i-th unit starts after i*0.02s
  const elapsed = rules.now - rules.reformStartTime;
  const staggerDelay = unitIndex * REFORM_STAGGER_INTERVAL;
  if (elapsed < staggerDelay) {
    // Not yet started — use normal speed
    moveToSlot(u, rules.speedMult, rules);
    return;
  }

  if (d < REFORM_ARRIVE_RADIUS) {
    // Snap to slot
    u.x = u.slotX;
    u.y = u.slotY;
    u.setVelocity(0, 0);
    return;
  }

  const angle = Phaser.Math.Angle.Between(u.x, u.y, u.slotX, u.slotY);
  let spd = u.unitSpeed * REFORM_SPEED_MULT;

  // Brake within brakeRadius
  if (d < REFORM_BRAKE_RADIUS) {
    spd *= (d / REFORM_BRAKE_RADIUS);
  }

  u.setVelocity(Math.cos(angle) * spd, Math.sin(angle) * spd);
}

export function closestEnemy(x: number, y: number, pool: EnemyBase[]): EnemyBase | null {
  let nearest: EnemyBase | null = null;
  let minD = Infinity;
  for (const e of pool) {
    const d = Phaser.Math.Distance.Between(x, y, e.x, e.y);
    if (d < minD) { minD = d; nearest = e; }
  }
  return nearest;
}

export function closestEnemyToUnit(u: ArmyUnit, pool: EnemyBase[]): EnemyBase | null {
  return closestEnemy(u.x, u.y, pool);
}

// ─── Vanguard Policy ─────────────────────────────────────────────

const vanguardPolicy: SquadPolicy = {
  computeSlots(units, anchor, rules) {
    const fx = rules.dir.x, fy = rules.dir.y;
    let vrx = -fy, vry = fx;
    let vfx = fx, vfy = fy;

    // A1: vanguard aligns on FLAG-Commander perpendicular line
    if (rules.hasNode('A1')) {
      const flagDirX = rules.flag.x - rules.player.x;
      const flagDirY = rules.flag.y - rules.player.y;
      const flagLen = Math.sqrt(flagDirX * flagDirX + flagDirY * flagDirY);
      if (flagLen > 1) {
        vfx = flagDirX / flagLen; vfy = flagDirY / flagLen;
        vrx = -vfy; vry = vfx;
      }
    }

    // E2: still → tighter formation
    const gap = (rules.hasNode('E2') && !rules.player.isMoving) ? 35 : 60;
    const rank0Count = Math.ceil(units.length / 2);
    const rank1Count = units.length - rank0Count;

    for (let i = 0; i < rank0Count; i++) {
      const s = Phaser.Math.Clamp((i - (rank0Count - 1) / 2) * gap, -220, 220);
      units[i].slotX = anchor.x + vfx * 160 + vrx * s;
      units[i].slotY = anchor.y + vfy * 160 + vry * s;
    }
    for (let i = 0; i < rank1Count; i++) {
      const s = Phaser.Math.Clamp((i - (rank1Count - 1) / 2) * gap, -220, 220);
      units[rank0Count + i].slotX = anchor.x + vfx * 100 + vrx * s;
      units[rank0Count + i].slotY = anchor.y + vfy * 100 + vry * s;
    }
  },

  getTarget(unit, enemies, rules) {
    // K5: all units focus same target
    if (rules.keystone === 'singleTargetOath' && rules.k5Target) return rules.k5Target;

    const active = enemies.filter(e => e.active);
    if (active.length === 0) return null;

    const inRange = active.filter(e =>
      Phaser.Math.Distance.Between(unit.x, unit.y, e.x, e.y) <= unit.atkRange
    );
    const inRangeAura = inRange.filter(e =>
      rules.aura.active && Phaser.Math.Distance.Between(rules.aura.cx, rules.aura.cy, e.x, e.y) <= rules.aura.r
    );
    const inAura = active.filter(e =>
      rules.aura.active && Phaser.Math.Distance.Between(rules.aura.cx, rules.aura.cy, e.x, e.y) <= rules.aura.r
    );

    const mark = rules.mark;
    const hasActiveMark = mark !== null && mark.active;

    // closePact: cluster on marked enemy in aura
    if (rules.keystone === 'closePact' && hasActiveMark) {
      const markInAura = Phaser.Math.Distance.Between(rules.aura.cx, rules.aura.cy, mark.x, mark.y) <= rules.aura.r;
      if (markInAura) return mark;
    }
    if (hasActiveMark && inRange.includes(mark)) return mark;

    const vPool = inRangeAura.length > 0 ? inRangeAura : inRange;
    if (vPool.length > 0) {
      return vPool.reduce((best, e) => {
        const dBest = Phaser.Math.Distance.Between(rules.player.x, rules.player.y, best.x, best.y);
        const dE = Phaser.Math.Distance.Between(rules.player.x, rules.player.y, e.x, e.y);
        return dE < dBest ? e : best;
      });
    }
    if (inAura.length > 0) return closestEnemy(unit.slotX, unit.slotY, inAura);
    return closestEnemy(unit.slotX, unit.slotY, active);
  },

  behave(unit, target, distToSlot, rules, unitIndex) {
    // Reform: return to slot with fast snap animation
    if (rules.isReforming) {
      reformMoveToSlot(unit, unitIndex, rules);
      unit.state = 'FORMING';
      return null;
    }

    if (!target || !target.active) {
      unit.state = 'HOLD';
      moveToSlot(unit, rules.speedMult, rules);
      return null;
    }

    const distToTarget = Phaser.Math.Distance.Between(unit.x, unit.y, target.x, target.y);

    // A6: FLAG area → vanguard fixed formation
    if (rules.hasNode('A6')) {
      const flagDist = Phaser.Math.Distance.Between(rules.player.x, rules.player.y, rules.flag.x, rules.flag.y);
      if (flagDist <= 260) {
        moveToSlot(unit, rules.speedMult, rules);
        if (distToTarget <= unit.atkRange && rules.now >= unit.nextAtk) {
          unit.state = 'ENGAGE';
          return target;
        }
        unit.state = 'HOLD';
        return null;
      }
    }

    // Target lock (0.8s)
    if (unit.lockedTarget && rules.now < unit.targetLockUntil && (unit.lockedTarget as EnemyBase).active) {
      // keep locked
    } else {
      unit.lockedTarget = target;
      unit.targetLockUntil = rules.now + 800;
    }
    const lockTarget = unit.lockedTarget as EnemyBase;

    if (lockTarget && lockTarget.active) {
      const dToLock = Phaser.Math.Distance.Between(unit.x, unit.y, lockTarget.x, lockTarget.y);

      // kitingVow: vanguard can't chase beyond aura boundary
      const kitingBound = rules.keystone === 'kitingVow' && rules.aura.active;
      const lockInAura = !kitingBound || Phaser.Math.Distance.Between(rules.aura.cx, rules.aura.cy, lockTarget.x, lockTarget.y) <= rules.aura.r;

      if (dToLock <= unit.atkRange && rules.now >= unit.nextAtk && lockInAura) {
        unit.state = 'ENGAGE';
        unit.setVelocity(0, 0);
        return lockTarget;
      } else if (dToLock <= unit.atkRange && lockInAura) {
        unit.state = 'HOLD';
        unit.setVelocity(0, 0);
      } else if (lockInAura) {
        const distLockToSlot = Phaser.Math.Distance.Between(lockTarget.x, lockTarget.y, unit.slotX, unit.slotY);
        if (distLockToSlot <= unit.engageRadius) {
          unit.state = 'ENGAGE';
          const angle = Phaser.Math.Angle.Between(unit.x, unit.y, lockTarget.x, lockTarget.y);
          const spd = unit.unitSpeed * rules.speedMult;
          unit.setVelocity(Math.cos(angle) * spd, Math.sin(angle) * spd);
        } else {
          unit.state = 'HOLD';
          moveToSlot(unit, rules.speedMult, rules);
        }
      } else {
        // kitingVow: target outside aura — hold at slot
        unit.state = 'HOLD';
        moveToSlot(unit, rules.speedMult, rules);
      }
    }
    return null;
  },
};

// ─── Archer Policy ───────────────────────────────────────────────

const archerPolicy: SquadPolicy = {
  computeSlots(units, anchor, rules) {
    const fx = rules.dir.x, fy = rules.dir.y;
    const rx = -fy, ry = fx;
    const gap = 70;
    const rank0Count = Math.ceil(units.length / 2);
    const rank1Count = units.length - rank0Count;

    for (let i = 0; i < rank0Count; i++) {
      const s = Phaser.Math.Clamp((i - (rank0Count - 1) / 2) * gap, -240, 240);
      units[i].slotX = anchor.x + fx * -260 + rx * s;
      units[i].slotY = anchor.y + fy * -260 + ry * s;
    }
    for (let i = 0; i < rank1Count; i++) {
      const s = Phaser.Math.Clamp((i - (rank1Count - 1) / 2) * gap, -240, 240);
      units[rank0Count + i].slotX = anchor.x + fx * -320 + rx * s;
      units[rank0Count + i].slotY = anchor.y + fy * -320 + ry * s;
    }
  },

  getTarget(unit, enemies, rules) {
    if (rules.keystone === 'singleTargetOath' && rules.k5Target) return rules.k5Target;

    const active = enemies.filter(e => e.active);
    if (active.length === 0) return null;

    const inRange = active.filter(e =>
      Phaser.Math.Distance.Between(unit.x, unit.y, e.x, e.y) <= unit.atkRange
    );
    const inRangeAura = inRange.filter(e =>
      rules.aura.active && Phaser.Math.Distance.Between(rules.aura.cx, rules.aura.cy, e.x, e.y) <= rules.aura.r
    );

    const mark = rules.mark;
    const hasActiveMark = mark !== null && mark.active;

    // B3: mark target = top archer priority
    if (rules.hasNode('B3') && hasActiveMark && inRange.includes(mark)) return mark;
    if (hasActiveMark && inRange.includes(mark)) return mark;

    const aPool = inRangeAura.length > 0 ? inRangeAura : inRange;
    if (aPool.length > 0) {
      // D4: after mark kill, priority = Buffer→Dasher for 3s
      if (rules.d4Active) {
        const buffers = aPool.filter(e => e instanceof BufferEnemy);
        if (buffers.length > 0) return closestEnemyToUnit(unit, buffers);
        const dashers = aPool.filter(e => e instanceof Dasher);
        if (dashers.length > 0) return closestEnemyToUnit(unit, dashers);
        return closestEnemyToUnit(unit, aPool);
      }
      // Normal priority: Buffer > Dasher(telegraph) > closest
      const buffers = aPool.filter(e => e instanceof BufferEnemy);
      if (buffers.length > 0) return closestEnemyToUnit(unit, buffers);
      const telegraphing = aPool.filter(e => e instanceof Dasher && (e as Dasher).isWindingUp());
      if (telegraphing.length > 0) return closestEnemyToUnit(unit, telegraphing);
      const dashers = aPool.filter(e => e instanceof Dasher);
      if (dashers.length > 0) return closestEnemyToUnit(unit, dashers);
      return closestEnemyToUnit(unit, aPool);
    }
    return closestEnemy(unit.slotX, unit.slotY, active);
  },

  behave(unit, target, distToSlot, rules, unitIndex) {
    // Reform: return to slot with fast snap animation
    if (rules.isReforming) {
      reformMoveToSlot(unit, unitIndex, rules);
      unit.state = 'FORMING';
      return null;
    }

    if (!target || !target.active) {
      unit.state = 'HOLD';
      moveToSlot(unit, rules.speedMult, rules);
      return null;
    }

    const distToTarget = Phaser.Math.Distance.Between(unit.x, unit.y, target.x, target.y);

    // A4: vanguard low HP → archers auto-retreat
    const a4Retreat = rules.hasNode('A4') && rules.vanguardLowHp;
    const archerSpeedMult = a4Retreat ? rules.speedMult * 1.5 : rules.speedMult * 0.5;

    if (distToSlot > 30) {
      moveToSlot(unit, archerSpeedMult, rules);
    } else {
      unit.setVelocity(0, 0);
    }

    // B2: no fire if target within 180px
    const b2Block = rules.hasNode('B2') && distToTarget < 180;
    const inVolleyWindow = rules.isVolleyOpen && !rules.archerFired.has(unit);
    // B6: extra volley on marked target
    const b6Bonus = rules.hasNode('B6') && target === rules.mark && rules.archerFired.has(unit);
    const canFire = inVolleyWindow || b6Bonus;

    if (distToTarget <= unit.atkRange && rules.now >= unit.nextAtk && rules.canArcherFire && canFire && !rules.archerFireOff && !b2Block) {
      unit.state = 'ENGAGE';
      return target;
    }
    unit.state = 'HOLD';
    return null;
  },
};

// ─── Cavalry Policy ──────────────────────────────────────────────

const cavalryPolicy: SquadPolicy = {
  computeSlots(units, anchor, rules) {
    const fx = rules.dir.x, fy = rules.dir.y;
    const rx = -fy, ry = fx;

    // E3: still → cavalry patrol FLAG perimeter
    const e3Active = rules.hasNode('E3') && !rules.player.isMoving;

    for (let i = 0; i < units.length; i++) {
      if (e3Active) {
        const angle = (i / Math.max(1, units.length)) * Math.PI * 2 + rules.now * 0.001;
        units[i].slotX = rules.flag.x + Math.cos(angle) * 120;
        units[i].slotY = rules.flag.y + Math.sin(angle) * 120;
        continue;
      }
      const wingIdx = i % 2;
      const rank = Math.floor(i / 2);
      const f = rank % 2 === 0 ? 50 : 90;
      const sBase = wingIdx === 0 ? -210 : 210;
      const col = Math.floor(rank / 2);
      const s = wingIdx === 0 ? sBase + col * 40 : sBase - col * 40;
      units[i].slotX = anchor.x + fx * f + rx * s;
      units[i].slotY = anchor.y + fy * f + ry * s;
    }
  },

  getTarget(unit, enemies, rules) {
    if (rules.keystone === 'singleTargetOath' && rules.k5Target) return rules.k5Target;

    const active = enemies.filter(e => e.active);
    if (active.length === 0) return null;

    // C1: forced intercept — closest winding-up dasher (any distance)
    if (rules.hasNode('C1')) {
      let windupDasher: EnemyBase | null = null;
      let minDist = Infinity;
      for (const e of active) {
        if (e instanceof Dasher && (e as Dasher).isWindingUp()) {
          const d = Phaser.Math.Distance.Between(unit.x, unit.y, e.x, e.y);
          if (d < minDist) { minDist = d; windupDasher = e; }
        }
      }
      if (windupDasher) return windupDasher;
    }

    const inRange = active.filter(e =>
      Phaser.Math.Distance.Between(unit.x, unit.y, e.x, e.y) <= unit.atkRange
    );
    const inRangeAura = inRange.filter(e =>
      rules.aura.active && Phaser.Math.Distance.Between(rules.aura.cx, rules.aura.cy, e.x, e.y) <= rules.aura.r
    );

    const mark = rules.mark;
    const hasActiveMark = mark !== null && mark.active;

    // Cavalry prioritizes marked Dasher
    if (hasActiveMark && mark instanceof Dasher && inRange.includes(mark)) return mark;

    // Priority: dashing Dashers in aura first
    const dashingInAura = inRangeAura.filter(e => e instanceof Dasher && (e as Dasher).isDashing());
    if (dashingInAura.length > 0) return closestEnemyToUnit(unit, dashingInAura);
    const dashingInRange = inRange.filter(e => e instanceof Dasher && (e as Dasher).isDashing());
    if (dashingInRange.length > 0) return closestEnemyToUnit(unit, dashingInRange);
    const dashersInRange = inRange.filter(e => e instanceof Dasher);
    if (dashersInRange.length > 0) return closestEnemyToUnit(unit, dashersInRange);
    if (inRange.length > 0) return closestEnemyToUnit(unit, inRange);
    return closestEnemy(unit.slotX, unit.slotY, active);
  },

  behave(unit, target, distToSlot, rules, unitIndex) {
    // Reform: cavalry exception — C1 intercept winding-up dasher overrides reform
    if (rules.isReforming) {
      if (rules.hasNode('C1') && target && target.active && target instanceof Dasher && (target as Dasher).isWindingUp()) {
        // C1 intercept overrides reform
        const angle = Phaser.Math.Angle.Between(unit.x, unit.y, target.x, target.y);
        const spd = unit.unitSpeed * rules.speedMult * 1.3;
        unit.setVelocity(Math.cos(angle) * spd, Math.sin(angle) * spd);
        unit.state = 'ENGAGE';
        return null;
      }
      reformMoveToSlot(unit, unitIndex, rules);
      unit.state = 'FORMING';
      return null;
    }

    if (!target || !target.active) {
      unit.state = 'HOLD';
      moveToSlot(unit, rules.speedMult, rules);
      return null;
    }

    const distToTarget = Phaser.Math.Distance.Between(unit.x, unit.y, target.x, target.y);

    // C1: cavalry forced intercept during dasher telegraph
    if (rules.hasNode('C1') && target instanceof Dasher && (target as Dasher).isWindingUp()) {
      const angle = Phaser.Math.Angle.Between(unit.x, unit.y, target.x, target.y);
      const spd = unit.unitSpeed * rules.speedMult * 1.3;
      unit.setVelocity(Math.cos(angle) * spd, Math.sin(angle) * spd);
      unit.state = 'ENGAGE';
      return null; // intercept movement only, no attack
    }

    // Standard cavalry + fallback engage
    if (distToTarget <= unit.atkRange && rules.now >= unit.nextAtk) {
      unit.state = 'ENGAGE';
      unit.setVelocity(0, 0);
      return target;
    } else if (distToTarget <= unit.atkRange) {
      unit.state = 'HOLD';
      unit.setVelocity(0, 0);
    } else {
      const distTargetToSlot = Phaser.Math.Distance.Between(target.x, target.y, unit.slotX, unit.slotY);
      const isIntercept = target instanceof Dasher && (target as Dasher).isDashing();
      const momentumBonus = (rules.keystone === 'momentumMode' && rules.player.isMoving) ? 100 : 0;
      const effectiveEngage = isIntercept ? 420 + momentumBonus : unit.engageRadius;
      if (distTargetToSlot <= effectiveEngage) {
        unit.state = 'ENGAGE';
        const angle = Phaser.Math.Angle.Between(unit.x, unit.y, target.x, target.y);
        const spd = unit.unitSpeed * rules.speedMult;
        unit.setVelocity(Math.cos(angle) * spd, Math.sin(angle) * spd);
      } else {
        unit.state = 'HOLD';
        moveToSlot(unit, rules.speedMult, rules);
      }
    }
    return null;
  },
};

// ─── Policy map ──────────────────────────────────────────────────

export const POLICIES: Record<SquadType, SquadPolicy> = {
  vanguard: vanguardPolicy,
  archer: archerPolicy,
  cavalry: cavalryPolicy,
};
