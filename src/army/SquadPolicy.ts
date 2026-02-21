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

// ─── Utility functions ───────────────────────────────────────────

export function moveToSlot(u: ArmyUnit, speedMult: number, rules: GameRules): void {
  const d = Phaser.Math.Distance.Between(u.x, u.y, u.slotX, u.slotY);
  if (d < 10) {
    u.setVelocity(0, 0);
  } else if (d <= 60) {
    // Soft convergence: proportional speed, decelerates to 0
    const angle = Phaser.Math.Angle.Between(u.x, u.y, u.slotX, u.slotY);
    const spd = Math.min(d * 2.5, 140);
    u.setVelocity(Math.cos(angle) * spd, Math.sin(angle) * spd);
  } else {
    const angle = Phaser.Math.Angle.Between(u.x, u.y, u.slotX, u.slotY);
    const spd = Math.min(u.unitSpeed * speedMult, d * 3);
    u.setVelocity(Math.cos(angle) * spd, Math.sin(angle) * spd);
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

  // Per-unit stagger: i-th unit starts after i*staggerInterval ms
  const elapsed = rules.now - rules.reformStartTime;
  const staggerDelay = unitIndex * rules.reformStaggerInterval;
  if (elapsed < staggerDelay) {
    // Not yet started — use normal speed
    moveToSlot(u, rules.speedMult, rules);
    return;
  }

  if (d < rules.reformArriveRadius) {
    // Snap to slot
    u.x = u.slotX;
    u.y = u.slotY;
    u.setVelocity(0, 0);
    return;
  }

  const angle = Phaser.Math.Angle.Between(u.x, u.y, u.slotX, u.slotY);
  let spd = u.unitSpeed * rules.reformSpeedMult;

  // Brake within brakeRadius
  if (d < rules.reformBrakeRadius) {
    spd *= (d / rules.reformBrakeRadius);
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

const SLOT_TABLE = [0, -60, 60, -120, 120, -180, 180, -240, 240];

const vanguardPolicy: SquadPolicy = {
  computeSlots(units, _anchor, rules) {
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
    const vb = rules.vanguardBalance;
    const gap = (rules.hasNode('E2') && !rules.player.isMoving)
      ? (vb.vanguardGapStill ?? 35)
      : (vb.vanguardGapNormal ?? 60);

    // Single-rank line formation anchored on FLAG
    const lineDepth = rules.vanguardBalance.lineDepth ?? 160;
    const lineX = rules.flag.x + vfx * lineDepth;
    const lineY = rules.flag.y + vfy * lineDepth;

    for (let i = 0; i < units.length; i++) {
      const offset = i < SLOT_TABLE.length ? SLOT_TABLE[i] : SLOT_TABLE[SLOT_TABLE.length - 1] + (i - SLOT_TABLE.length + 1) * gap;
      const scaledOffset = offset * (gap / 60); // scale by gap ratio for E2
      units[i].slotX = lineX + vrx * scaledOffset;
      units[i].slotY = lineY + vry * scaledOffset;
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

    // ── Hysteresis LINE_HOLD ──
    const holdIn = rules.vanguardBalance.holdIn ?? 35;
    const holdOut = rules.vanguardBalance.holdOut ?? 55;
    const wasHolding = unit.state === 'HOLD';
    const isHolding = wasHolding ? distToSlot < holdOut : distToSlot < holdIn;

    // Always move toward slot — HOLD only reduces speed, never stops
    const holdMult = rules.vanguardBalance.holdSpeedMult ?? 0.7;
    const holdSpeedMult = isHolding ? rules.speedMult * holdMult : rules.speedMult;
    moveToSlot(unit, holdSpeedMult, rules);

    // ── Target lock + attack (always runs, never skipped by formation) ──
    if (!target || !target.active) {
      unit.state = isHolding ? 'HOLD' : 'FORMING';
      return null;
    }

    // Target lock (0.8s)
    if (unit.lockedTarget && rules.now < unit.targetLockUntil && (unit.lockedTarget as EnemyBase).active) {
      // keep locked
    } else {
      unit.lockedTarget = target;
      unit.targetLockUntil = rules.now + (rules.vanguardBalance.targetLockMs ?? 800);
    }
    const lockTarget = unit.lockedTarget as EnemyBase;

    if (lockTarget && lockTarget.active) {
      const dToLock = Phaser.Math.Distance.Between(unit.x, unit.y, lockTarget.x, lockTarget.y);

      // kitingVow: vanguard can't attack beyond aura boundary
      const kitingBound = rules.keystone === 'kitingVow' && rules.aura.active;
      const lockInAura = !kitingBound || Phaser.Math.Distance.Between(rules.aura.cx, rules.aura.cy, lockTarget.x, lockTarget.y) <= rules.aura.r;

      if (dToLock <= unit.atkRange && rules.now >= unit.nextAtk && lockInAura) {
        unit.state = 'ENGAGE';
        return lockTarget;
      }
    }

    unit.state = isHolding ? 'HOLD' : 'FORMING';
    return null;
  },
};

// ─── Archer Policy ───────────────────────────────────────────────

const archerPolicy: SquadPolicy = {
  computeSlots(units, anchor, rules) {
    const fx = rules.dir.x, fy = rules.dir.y;
    const rx = -fy, ry = fx;
    const ab = rules.archerBalance;
    const gap = ab.slotGap ?? 70;
    const spread = ab.maxSpread ?? 240;
    const r0d = ab.rank0Depth ?? 260;
    const r1d = ab.rank1Depth ?? 320;
    const rank0Count = Math.ceil(units.length / 2);
    const rank1Count = units.length - rank0Count;

    for (let i = 0; i < rank0Count; i++) {
      const s = Phaser.Math.Clamp((i - (rank0Count - 1) / 2) * gap, -spread, spread);
      units[i].slotX = anchor.x + fx * -r0d + rx * s;
      units[i].slotY = anchor.y + fy * -r0d + ry * s;
    }
    for (let i = 0; i < rank1Count; i++) {
      const s = Phaser.Math.Clamp((i - (rank1Count - 1) / 2) * gap, -spread, spread);
      units[rank0Count + i].slotX = anchor.x + fx * -r1d + rx * s;
      units[rank0Count + i].slotY = anchor.y + fy * -r1d + ry * s;
    }
  },

  getTarget(unit, enemies, rules) {
    if (rules.keystone === 'singleTargetOath' && rules.k5Target) return rules.k5Target;

    const active = enemies.filter(e => e.active);
    if (active.length === 0) return null;

    // Leader-based range check: use archerLeader position for range, not individual archer
    const ldr = rules.archerLeader;
    const dz = rules.archerBalance.deadZone ?? 120;
    const inRange = active.filter(e => {
      const dToLeader = Phaser.Math.Distance.Between(ldr.x, ldr.y, e.x, e.y);
      return dToLeader <= unit.atkRange && dToLeader >= dz;
    });
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
    const ab = rules.archerBalance;
    const archerSpeedMult = a4Retreat
      ? rules.speedMult * (ab.retreatSpeedMult ?? 1.5)
      : rules.speedMult * (ab.normalSpeedMult ?? 0.5);

    if (distToSlot > 30) {
      moveToSlot(unit, archerSpeedMult, rules);
    } else {
      unit.setVelocity(0, 0);
    }

    // Leader-based fire range: use archerLeader distance
    const ldr = rules.archerLeader;
    const leaderDist = Phaser.Math.Distance.Between(ldr.x, ldr.y, target.x, target.y);
    const inFireRange = leaderDist <= unit.atkRange && leaderDist >= (rules.archerBalance.deadZone ?? 120);

    // B2: no fire if target within 180px of archer leader
    const b2Block = rules.hasNode('B2') && leaderDist < 180;
    const inVolleyWindow = rules.isVolleyOpen && !rules.archerFired.has(unit);
    // B6: extra volley on marked target
    const b6Bonus = rules.hasNode('B6') && target === rules.mark && rules.archerFired.has(unit);
    const canFire = inVolleyWindow || b6Bonus;

    if (inFireRange && rules.now >= unit.nextAtk && rules.canArcherFire && canFire && !rules.archerFireOff && !b2Block) {
      unit.state = 'ENGAGE';
      return target;
    }
    unit.state = 'HOLD';
    return null;
  },
};

// ─── Cavalry Policy ──────────────────────────────────────────────

/** Build gap sample offsets: [-2s, -s, 0, s, 2s] */
function buildGapSamples(spacing: number): number[] {
  return [-2 * spacing, -spacing, 0, spacing, 2 * spacing];
}

// Load-balancing constants
const CAV_LOAD_LAMBDA = 1.25;
const CAV_LATERAL_SPREAD = 80;
const CAV_DEPTH_SPREAD = 40;

/** 32-bit deterministic hash (FNV-1a, no randomness) */
function hash32(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Deterministic per-cavalry offset so same-gap units don't overlap */
function cavOffset(stableId: string): { lateral: number; depth: number } {
  const h = hash32(stableId);
  const u = (h & 0xffff) / 0xffff;
  const v = ((h >>> 16) & 0xffff) / 0xffff;
  return {
    lateral: (u * 2 - 1) * CAV_LATERAL_SPREAD,
    depth: (v * 2 - 1) * CAV_DEPTH_SPREAD,
  };
}

/** Acceleration-limited movement for cavalry (prevents instant velocity jumps) */
function cavMoveTo(unit: ArmyUnit, tx: number, ty: number, maxSpd: number, rules: GameRules): void {
  const dx = tx - unit.x, dy = ty - unit.y;
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d < 10) { unit.setVelocity(0, 0); return; }

  // Desired velocity
  const spd = Math.min(maxSpd, d * 2.5);
  const dvx = (dx / d) * spd, dvy = (dy / d) * spd;

  // Current velocity
  const body = unit.body as Phaser.Physics.Arcade.Body;
  const cvx = body.velocity.x, cvy = body.velocity.y;

  // Limit delta-v per frame
  const accel = (rules.cavalryBalance.cavAccel ?? 2800) * (rules.dtMs / 1000);
  const ddx = dvx - cvx, ddy = dvy - cvy;
  const ddLen = Math.sqrt(ddx * ddx + ddy * ddy);
  if (ddLen <= accel) {
    unit.setVelocity(dvx, dvy);
  } else {
    unit.setVelocity(cvx + (ddx / ddLen) * accel, cvy + (ddy / ddLen) * accel);
  }
}

const cavalryPolicy: SquadPolicy = {
  computeSlots(units, _anchor, rules) {
    if (units.length === 0) return;
    const fx = rules.dir.x, fy = rules.dir.y;
    const rx = -fy, ry = fx;
    const la = rules.lineAnchor;
    const vPositions = rules.vanguardPositions;
    const cb = rules.cavalryBalance;
    const scanR = cb.gapScanRadius ?? 140;
    const gapSamples = buildGapSamples(cb.gapSpacing ?? 120);
    const gapOff = cb.gapOffset ?? -40;
    const calcInterval = cb.gapCalcInterval ?? 200;
    const stickyMs = cb.cavStickyMs ?? 1200;
    const improveDelta = cb.cavImproveDelta ?? 1.25;

    // Batch load-balanced assignment (throttled)
    if (rules.now - units[0].cavLastGapCalc > calcInterval) {
      for (const u of units) u.cavLastGapCalc = rules.now;

      // 1. Thinness per gap
      const thinness: number[] = [];
      for (let g = 0; g < gapSamples.length; g++) {
        const gpx = la.x + rx * gapSamples[g];
        const gpy = la.y + ry * gapSamples[g];
        let count = 0;
        for (const vp of vPositions) {
          if (Phaser.Math.Distance.Between(gpx, gpy, vp.x, vp.y) <= scanR) count++;
        }
        thinness.push(count);
      }

      // 2. Sort by stableId (deterministic order)
      const sorted = [...units].sort((a, b) =>
        a.stableId < b.stableId ? -1 : a.stableId > b.stableId ? 1 : 0);

      // 3. Greedy load-balanced assignment with sticky lock
      const assignedCount = new Array(gapSamples.length).fill(0);
      for (const u of sorted) {
        // Compute best gap score
        let bestIdx = 2;
        let bestScore = Infinity;
        for (let g = 0; g < gapSamples.length; g++) {
          const tie = Math.abs(gapSamples[g]) * 0.001 + (gapSamples[g] > 0 ? 0.0001 : 0);
          const score = thinness[g] + CAV_LOAD_LAMBDA * assignedCount[g] + tie;
          if (score < bestScore) { bestScore = score; bestIdx = g; }
        }

        // Sticky: keep current gap if lock hasn't expired and new score isn't significantly better
        const locked = rules.now < u.cavGapLockUntil;
        const improved = u.cavGapScore - bestScore >= improveDelta;
        if (locked && !improved) {
          // Keep current gap
          assignedCount[u.cavGapIdx]++;
        } else {
          // Assign new gap and lock it
          u.cavGapIdx = bestIdx;
          u.cavGapScore = bestScore;
          u.cavGapLockUntil = rules.now + stickyMs;
          assignedCount[bestIdx]++;
        }
      }
    }

    // Compute cover center + offset slot with LPF
    const alpha0 = cb.cavSlotAlpha ?? 0.2;
    const alpha = 1 - Math.pow(1 - alpha0, rules.dtMs / 16.67);
    for (const u of units) {
      // Cover center (no offset)
      const cx = la.x + rx * gapSamples[u.cavGapIdx];
      const cy = la.y + ry * gapSamples[u.cavGapIdx];
      u.coverX = cx;
      u.coverY = cy;

      // Target slot with offset
      const off = cavOffset(u.stableId);
      const rawX = cx + rx * off.lateral + fx * (gapOff + off.depth);
      const rawY = cy + ry * off.lateral + fy * (gapOff + off.depth);

      // LPF: smooth slot transition
      if (u.slotX === 0 && u.slotY === 0) {
        u.slotX = rawX; u.slotY = rawY;
      } else {
        u.slotX += (rawX - u.slotX) * alpha;
        u.slotY += (rawY - u.slotY) * alpha;
      }
    }
  },

  getTarget(unit, enemies, rules) {
    if (rules.keystone === 'singleTargetOath' && rules.k5Target) return rules.k5Target;

    const active = enemies.filter(e => e.active);
    if (active.length === 0) return null;

    // Use cover center for gap-based target search
    const gapR = rules.cavalryBalance.gapTargetRadius ?? 260;
    const cx = unit.coverX, cy = unit.coverY;
    // Use gapROut for wider search radius
    const searchR = rules.cavalryBalance.cavGapROut ?? 320;

    const nearGap = active.filter(e =>
      Phaser.Math.Distance.Between(cx, cy, e.x, e.y) <= searchR
    );

    // Priority 1: Dasher (isDashing or isWindingUp) near cover center
    const dashersNear = nearGap.filter(e =>
      e instanceof Dasher && ((e as Dasher).isDashing() || (e as Dasher).isWindingUp())
    );
    if (dashersNear.length > 0) return closestEnemy(cx, cy, dashersNear);

    // Priority 2: closest enemy near cover center
    if (nearGap.length > 0) return closestEnemy(cx, cy, nearGap);

    // Priority 3: attack range check
    const inRange = active.filter(e =>
      Phaser.Math.Distance.Between(unit.x, unit.y, e.x, e.y) <= unit.atkRange
    );
    if (inRange.length > 0) return closestEnemyToUnit(unit, inRange);

    return null;
  },

  behave(unit, target, distToSlot, rules, unitIndex) {
    // Reform: force SEEK_GAP, gap cover priority
    if (rules.isReforming) {
      unit.cavPhase = 'seek_gap';
      unit.cavSeenTargetSince = 0;
      reformMoveToSlot(unit, unitIndex, rules);
      unit.state = 'FORMING';
      return null;
    }

    const cb = rules.cavalryBalance;
    const la = rules.lineAnchor;
    const fx = rules.dir.x, fy = rules.dir.y;
    const rx = -fy, ry = fx;

    // Cover center (no offset) for distance checks
    const cx = unit.coverX, cy = unit.coverY;
    const distToCover = Phaser.Math.Distance.Between(unit.x, unit.y, cx, cy);

    // Hysteresis radii
    const gapRIn = cb.cavGapRIn ?? 240;
    const gapROut = cb.cavGapROut ?? 320;
    const seenMs = cb.cavSeenMs ?? 200;

    // ── 4-state machine ──
    switch (unit.cavPhase) {
      case 'seek_gap': {
        // Move toward slot (offset position)
        moveToSlot(unit, rules.speedMult, rules);
        unit.state = 'HOLD';

        // Continuous target detection: must see target for seenMs before entering intercept
        const hasTarget = target && target.active;
        const maxIntercepts = cb.maxConcurrentIntercepts ?? 2;

        if (hasTarget && rules.cavalryInterceptCount < maxIntercepts) {
          // Check target is within gapRIn of cover center
          const distTargetToCover = Phaser.Math.Distance.Between(target!.x, target!.y, cx, cy);
          if (distTargetToCover < gapRIn) {
            // Start or continue tracking
            if (unit.cavSeenTargetSince === 0) {
              unit.cavSeenTargetSince = rules.now;
            } else if (rules.now - unit.cavSeenTargetSince >= seenMs) {
              // Confirmed — enter intercept
              unit.cavPhase = 'intercept';
              unit.cavPhaseTimer = rules.now;
              unit.cavDisruptHits = 0;
              unit.cavSeenTargetSince = 0;
            }
          } else {
            unit.cavSeenTargetSince = 0; // target left inner radius, reset
          }
        } else {
          unit.cavSeenTargetSince = 0;
        }
        return null;
      }

      case 'intercept': {
        if (!target || !target.active) {
          unit.cavPhase = 'seek_gap';
          unit.cavSeenTargetSince = 0;
          moveToSlot(unit, rules.speedMult, rules);
          unit.state = 'HOLD';
          return null;
        }

        // Target left outer radius — return to cover (hysteresis)
        const distTargetToCover = Phaser.Math.Distance.Between(target.x, target.y, cx, cy);
        if (distTargetToCover > gapROut) {
          unit.cavPhase = 'seek_gap';
          unit.cavSeenTargetSince = 0;
          moveToSlot(unit, rules.speedMult, rules);
          unit.state = 'HOLD';
          return null;
        }

        // Stabilized intercept point: project enemy onto rightDir axis, clamp
        const maxLateral = cb.cavInterceptMaxLateral ?? 140;
        const fixedDepth = cb.cavInterceptFixedDepth ?? 60;
        // Enemy position relative to cover center
        const relX = target.x - cx, relY = target.y - cy;
        // Project onto right-direction (lateral axis)
        let lateral = relX * rx + relY * ry;
        lateral = Phaser.Math.Clamp(lateral, -maxLateral, maxLateral);
        // Intercept point: cover center + clamped lateral + fixed forward depth
        const ipx = cx + rx * lateral + fx * fixedDepth;
        const ipy = cy + ry * lateral + fy * fixedDepth;
        unit.cavTargetX = ipx;
        unit.cavTargetY = ipy;

        const spd = unit.unitSpeed * rules.speedMult * (cb.interceptSpeedMult ?? 1.3);
        cavMoveTo(unit, ipx, ipy, spd, rules);
        unit.state = 'ENGAGE';

        // Transition to DISRUPT: close enough or timeout
        const distToTarget = Phaser.Math.Distance.Between(unit.x, unit.y, target.x, target.y);
        if (distToTarget < unit.atkRange || (rules.now - unit.cavPhaseTimer > (cb.interceptTimeout ?? 2000))) {
          unit.cavPhase = 'disrupt';
          unit.cavPhaseTimer = rules.now;
          unit.cavDisruptHits = 0;
        }
        return null;
      }

      case 'disrupt': {
        unit.state = 'ENGAGE';

        const maxHits = cb.cavDisruptMaxHits ?? 2;
        if (target && target.active && unit.cavDisruptHits < maxHits) {
          const distToTarget = Phaser.Math.Distance.Between(unit.x, unit.y, target.x, target.y);
          if (distToTarget <= unit.atkRange && rules.now >= unit.nextAtk) {
            unit.cavDisruptHits++;
            unit.setVelocity(0, 0);
            if (rules.now - unit.cavPhaseTimer > (cb.cavDisruptDuration ?? 700)) {
              unit.cavPhase = 'egress';
              unit.cavPhaseTimer = rules.now;
            }
            return target;
          }
          // Move toward target with acceleration limit
          const spd = unit.unitSpeed * rules.speedMult;
          cavMoveTo(unit, target.x, target.y, spd, rules);
        } else {
          unit.setVelocity(0, 0);
        }

        if (rules.now - unit.cavPhaseTimer > (cb.cavDisruptDuration ?? 700)) {
          unit.cavPhase = 'egress';
          unit.cavPhaseTimer = rules.now;
        }
        return null;
      }

      case 'egress': {
        const gs = buildGapSamples(cb.gapSpacing ?? 120);
        const eDep = cb.egressDepth ?? 260;
        const epx = la.x - fx * eDep + rx * (gs[unit.cavGapIdx] * 0.5);
        const epy = la.y - fy * eDep + ry * (gs[unit.cavGapIdx] * 0.5);
        unit.cavTargetX = epx;
        unit.cavTargetY = epy;

        const spd = unit.unitSpeed * rules.speedMult;
        cavMoveTo(unit, epx, epy, spd, rules);
        unit.state = 'FORMING';

        if (rules.now - unit.cavPhaseTimer > (cb.cavEgressDuration ?? 1000)) {
          unit.cavPhase = 'seek_gap';
          unit.cavSeenTargetSince = 0;
        }
        return null;
      }
    }
  },
};

// ─── Policy map ──────────────────────────────────────────────────

export const POLICIES: Record<SquadType, SquadPolicy> = {
  vanguard: vanguardPolicy,
  archer: archerPolicy,
  cavalry: cavalryPolicy,
};
