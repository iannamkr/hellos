import type { NodeId, SupportId, KeystoneId, ItemId } from '../types';
import type { ArmyUnit } from '../entities/ArmyUnit';
import type { EnemyBase } from '../entities/EnemyBase';
import type { UnitStats, GameConfig } from '../../shared/balance/schema';

export interface GameRules {
  // Build queries
  hasNode(id: NodeId): boolean;
  hasSup(id: SupportId): boolean;
  keystone: KeystoneId;
  item: ItemId;

  // Per-frame state (set by GameScene)
  now: number;
  dtMs: number;
  speedMult: number;
  armyAttackOff: boolean;
  archerFireOff: boolean;
  canArcherFire: boolean;
  isVolleyOpen: boolean;
  isReforming: boolean;
  reformStartTime: number;

  // References
  player: { x: number; y: number; isMoving: boolean };
  flag: { x: number; y: number };
  dir: { x: number; y: number };
  mark: EnemyBase | null;
  aura: { active: boolean; cx: number; cy: number; r: number };

  // Front-line anchor (FLAG + dir * V_LINE_DEPTH)
  lineAnchor: { x: number; y: number };
  // Active vanguard positions (for cavalry gap detection)
  vanguardPositions: Array<{ x: number; y: number }>;
  // Number of cavalry currently in intercept/disrupt phase
  cavalryInterceptCount: number;
  // Active enemies reference (for cavalry gap scanning)
  enemies: readonly EnemyBase[];

  // Anchors (for A3 push logic)
  anchorV: { x: number; y: number };

  // Archer leader position (first active vanguard, or player if none)
  archerLeader: { x: number; y: number };

  // Reform movement constants (from commander balance)
  reformSpeedMult: number;
  reformArriveRadius: number;
  reformBrakeRadius: number;
  reformStaggerInterval: number;

  // Balance data (per-squad + game)
  vanguardBalance: UnitStats;
  archerBalance: UnitStats;
  cavalryBalance: UnitStats;
  gameBalance: GameConfig;
  modifierNodes: Partial<Record<string, Record<string, number>>>;
  modifierKeystones: Partial<Record<string, Record<string, number>>>;

  // State queries
  k5Target: EnemyBase | null;
  d4Active: boolean;
  vanguardLowHp: boolean;
  archerFired: ReadonlySet<ArmyUnit>;
  getAttackCD(u: ArmyUnit): number;
}
