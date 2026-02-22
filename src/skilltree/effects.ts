import type { EffectSpec, StatMod, RuleMod } from './types';

/** Major/Keystone effect definitions. */
export const EFFECT_DEFS: Record<string, EffectSpec> = {
  'R1-M1': { effect_id: 'R1_METRONOME_WARMUP_REDUCE', params: { warmupMult: 0.85 }, stack_rule: 'unique', scope: 'archer' },
  'R1-M2': { effect_id: 'R1_SYNC_GRACE', params: { graceMs: 250 }, stack_rule: 'unique', scope: 'archer' },
  'R1-M3': { effect_id: 'R1_DEFENSIVE_VOLLEY', params: { mode: 1, chance: 1.0 }, stack_rule: 'unique', scope: 'archer' },
  'R1-K1': { effect_id: 'R1_METRONOME_CORE', params: { cycleMs: 1000 }, stack_rule: 'unique', scope: 'global' },

  'R2-M1': { effect_id: 'R2_MOMENTUM_STACK', params: { maxStacks: 5, stackPerSec: 1 }, stack_rule: 'unique', scope: 'global' },
  'R2-M2': { effect_id: 'R2_TURN_CUT_WINDOW', params: { windowMs: 350 }, stack_rule: 'unique', scope: 'global' },
  'R2-M3': { effect_id: 'R2_MOBILE_GUARDRAIL', params: { interceptAssist: 1, capMult: 0.85 }, stack_rule: 'unique', scope: 'global' },
  'R2-K1': { effect_id: 'R2_MOMENTUM_KEYSTONE', params: { movingMult: 1.5, stillMult: 0.5 }, stack_rule: 'unique', scope: 'global' },

  'R3-M1': { effect_id: 'R3_SAFE_DISTANCE_REWARD', params: { rewardMult: 1.2 }, stack_rule: 'unique', scope: 'global' },
  'R3-M2': { effect_id: 'R3_APPROACHER_PRIORITY', params: { enabled: 1 }, stack_rule: 'unique', scope: 'archer' },
  'R3-M3': { effect_id: 'R3_REACQUIRE_BURST', params: { burstMs: 500 }, stack_rule: 'unique', scope: 'global' },
  'R3-K1': { effect_id: 'R3_KITING_KEYSTONE', params: { closePenaltyMult: 0.85 }, stack_rule: 'unique', scope: 'global' },

  'R4-M1': { effect_id: 'R4_CLOSE_SHORTEN', params: { shortenMult: 1.2 }, stack_rule: 'unique', scope: 'vanguard' },
  'R4-M2': { effect_id: 'R4_CONTROL_CHAIN', params: { chainChance: 1.0 }, stack_rule: 'unique', scope: 'vanguard' },
  'R4-M3': { effect_id: 'R4_CLOSE_BUFFER', params: { bufferMs: 300 }, stack_rule: 'unique', scope: 'vanguard' },
  'R4-K1': { effect_id: 'R4_CLOSE_KEYSTONE', params: { controlBoost: 1.15 }, stack_rule: 'unique', scope: 'vanguard' },

  'R5-M1': { effect_id: 'R5_MARK_UPTIME_SCALE', params: { scalePerSec: 1 }, stack_rule: 'unique', scope: 'mark' },
  'R5-M2': { effect_id: 'R5_EXECUTE_WINDOW', params: { executeThreshold: 0.25 }, stack_rule: 'unique', scope: 'mark' },
  'R5-M3': { effect_id: 'R5_MARK_THREAT_SUPPRESS', params: { priorityBoost: 1.2 }, stack_rule: 'unique', scope: 'mark' },
  'R5-K1': { effect_id: 'R5_EXECUTE_PROTOCOL', params: { enabled: 1 }, stack_rule: 'unique', scope: 'mark' },

  'R6-M1': { effect_id: 'R6_ZONE_IN_OUT_RULES', params: { inBonus: 1.2, outPenalty: 0.9 }, stack_rule: 'unique', scope: 'zone' },
  'R6-M2': { effect_id: 'R6_ZONE_OBJECTIVE', params: { enabled: 1 }, stack_rule: 'unique', scope: 'zone' },
  'R6-M3': { effect_id: 'R6_ZONE_COUNTER_WINDOW', params: { windowMs: 400 }, stack_rule: 'unique', scope: 'zone' },
  'R6-K1': { effect_id: 'R6_ZONE_DOMINION', params: { inBonus: 1.3, outPenalty: 0.85 }, stack_rule: 'unique', scope: 'zone' },

  'R7-M1': { effect_id: 'R7_REFORM_SUCCESS_WINDOW', params: { windowMs: 450 }, stack_rule: 'unique', scope: 'reform' },
  'R7-M2': { effect_id: 'R7_REFORM_STABILITY', params: { stabilityMult: 1.2 }, stack_rule: 'unique', scope: 'reform' },
  'R7-M3': { effect_id: 'R7_FORMATION_BRANCH', params: { enabled: 1 }, stack_rule: 'unique', scope: 'reform' },
  'R7-K1': { effect_id: 'R7_REFORM_DOCTRINE', params: { enabled: 1 }, stack_rule: 'unique', scope: 'reform' },

  'R8-M1': { effect_id: 'R8_INTERCEPT_PRIORITY', params: { enabled: 1 }, stack_rule: 'unique', scope: 'intercept' },
  'R8-M2': { effect_id: 'R8_POST_INTERCEPT_STABILIZE', params: { stabilizeMs: 600 }, stack_rule: 'unique', scope: 'intercept' },
  'R8-M3': { effect_id: 'R8_FAILSAFE', params: { reduceLossMult: 0.85 }, stack_rule: 'unique', scope: 'intercept' },
  'R8-K1': { effect_id: 'R8_INTERCEPT_KEYSTONE', params: { priorityMult: 1.25 }, stack_rule: 'unique', scope: 'intercept' },
};

export class EffectRegistry {
  private active = new Map<string, EffectSpec>();

  apply(nodeId: string): void {
    const def = EFFECT_DEFS[nodeId];
    if (!def) return;
    this.active.set(nodeId, def);
  }

  remove(nodeId: string): void {
    this.active.delete(nodeId);
  }

  clear(): void {
    this.active.clear();
  }

  hasEffect(effectId: string): boolean {
    for (const spec of this.active.values()) {
      if (spec.effect_id === effectId) return true;
    }
    return false;
  }

  getEffectParam(effectId: string, param: string): number | undefined {
    for (const spec of this.active.values()) {
      if (spec.effect_id === effectId && param in spec.params) return spec.params[param];
    }
    return undefined;
  }

  getActiveEffects(): EffectSpec[] {
    return [...this.active.values()];
  }

  getActiveByScope(scope: string): EffectSpec[] {
    return [...this.active.values()].filter(e => e.scope === scope);
  }
}

/** Accumulates StatMod from allocated nodes. add/add_pct are summed per stat key. */
export class StatAccumulator {
  private nodeStats = new Map<string, StatMod[]>();

  apply(nodeId: string, stats: StatMod[]): void {
    if (stats.length === 0) return;
    this.nodeStats.set(nodeId, stats);
  }

  remove(nodeId: string): void {
    this.nodeStats.delete(nodeId);
  }

  clear(): void {
    this.nodeStats.clear();
  }

  /** Get accumulated value for a single stat key (add/add_pct summed). */
  get(statKey: string): number {
    let total = 0;
    for (const mods of this.nodeStats.values()) {
      for (const m of mods) {
        if (m.stat === statKey && (m.op === 'add' || m.op === 'add_pct')) {
          total += m.value;
        }
      }
    }
    return total;
  }

  /** Get all accumulated stats as { statKey → total }. */
  getAll(): Map<string, number> {
    const result = new Map<string, number>();
    for (const mods of this.nodeStats.values()) {
      for (const m of mods) {
        if (m.op === 'add' || m.op === 'add_pct') {
          result.set(m.stat, (result.get(m.stat) ?? 0) + m.value);
        }
      }
    }
    return result;
  }
}

/** Manages concentration (stance) switching runtime state. */
export class ConcentrationManager {
  activeStanceId: string | null = null;
  readonly unlockedStances = new Set<string>();
  switchCooldownUntil = 0;
  switchCooldownMs: number;

  constructor(cooldownMs = 1500) {
    this.switchCooldownMs = cooldownMs;
  }

  unlock(stanceId: string): void {
    this.unlockedStances.add(stanceId);
  }

  lock(stanceId: string): void {
    this.unlockedStances.delete(stanceId);
    if (this.activeStanceId === stanceId) this.activeStanceId = null;
  }

  activate(stanceId: string, now = Date.now()): boolean {
    if (!this.unlockedStances.has(stanceId)) return false;
    if (this.activeStanceId === stanceId) return false;
    if (now < this.switchCooldownUntil) return false;
    this.activeStanceId = stanceId;
    this.switchCooldownUntil = now + this.switchCooldownMs;
    return true;
  }

  isOnCooldown(now = Date.now()): boolean {
    return now < this.switchCooldownUntil;
  }

  getCooldownRemaining(now = Date.now()): number {
    return Math.max(0, this.switchCooldownUntil - now);
  }

  clear(): void {
    this.activeStanceId = null;
    this.unlockedStances.clear();
    this.switchCooldownUntil = 0;
  }
}

/** Tracks rules from allocated nodes. STANCE rules only apply when that stance is active. */
export class RuleRegistry {
  private nodeRules = new Map<string, RuleMod[]>();
  private stanceNodes = new Set<string>();
  private concentration: ConcentrationManager;

  constructor(concentration: ConcentrationManager) {
    this.concentration = concentration;
  }

  apply(nodeId: string, rules: RuleMod[], isStance: boolean): void {
    if (rules.length === 0) return;
    this.nodeRules.set(nodeId, rules);
    if (isStance) this.stanceNodes.add(nodeId);
  }

  remove(nodeId: string): void {
    this.nodeRules.delete(nodeId);
    this.stanceNodes.delete(nodeId);
  }

  clear(): void {
    this.nodeRules.clear();
    this.stanceNodes.clear();
  }

  hasRule(ruleId: string): boolean {
    for (const [nodeId, rules] of this.nodeRules) {
      if (this.stanceNodes.has(nodeId) && this.concentration.activeStanceId !== nodeId) continue;
      for (const r of rules) {
        if (r.rule_id === ruleId) return true;
      }
    }
    return false;
  }

  getRuleParams(ruleId: string): Record<string, number> | null {
    for (const [nodeId, rules] of this.nodeRules) {
      if (this.stanceNodes.has(nodeId) && this.concentration.activeStanceId !== nodeId) continue;
      for (const r of rules) {
        if (r.rule_id === ruleId) return r.params;
      }
    }
    return null;
  }

  getActiveRules(): RuleMod[] {
    const result: RuleMod[] = [];
    for (const [nodeId, rules] of this.nodeRules) {
      if (this.stanceNodes.has(nodeId) && this.concentration.activeStanceId !== nodeId) continue;
      result.push(...rules);
    }
    return result;
  }
}
