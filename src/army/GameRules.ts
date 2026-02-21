import type { NodeId, SupportId, KeystoneId, ItemId } from '../types';
import type { ArmyUnit } from '../entities/ArmyUnit';
import type { EnemyBase } from '../entities/EnemyBase';

export interface GameRules {
  // Build queries
  hasNode(id: NodeId): boolean;
  hasSup(id: SupportId): boolean;
  keystone: KeystoneId;
  item: ItemId;

  // Per-frame state (set by GameScene)
  now: number;
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

  // Anchors (for A3 push logic)
  anchorV: { x: number; y: number };

  // State queries
  k5Target: EnemyBase | null;
  d4Active: boolean;
  vanguardLowHp: boolean;
  archerFired: ReadonlySet<ArmyUnit>;
  getAttackCD(u: ArmyUnit): number;
}
