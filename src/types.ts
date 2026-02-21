export type Tag =
  | 'close' | 'far' | 'move' | 'still' | 'dash' | 'mark' | 'zone' | 'rhythm'
  | 'commit' | 'sustain' | 'execute' | 'control' | 'burst' | 'kite'
  | 'melee' | 'attack' | 'aoe' | 'line' | 'charge' | 'movement'
  | 'prime' | 'timing' | 'priority' | 'counter' | 'risk' | 'posture'
  | 'tank' | 'tradeoff';

export type KeystoneId = 'closePact' | 'kitingVow' | 'stillnessStance' | 'momentumMode' | 'singleTargetOath' | 'fragilePower';
export type SkillId = 'slash' | 'lunge' | 'cleave' | 'thrust' | 'guardBreak' | 'orbitCut';
export type SupportId = 'dashPrime' | 'markStack' | 'zoneAnchor' | 'rhythmWindow' | 'finisherRule' | 'bufferHunter' | 'dashTax' | 'closeShock' | 'farSnare' | 'commitmentLock';
export type ItemId = 'bloodOath' | 'ironSkin' | 'sprintBoots' | 'heavyBlade' | 'calmMind' | 'hunterCharm' | 'antiDashPlate' | 'zoneCore';
export type SquadType = 'vanguard' | 'archer' | 'cavalry';

export interface KeystoneDef {
  id: KeystoneId;
  label: string;
  tags: Tag[];
  penalty: string;
  benefit: string;
  armyRule: string;
}

export interface SkillDef {
  id: SkillId;
  label: string;
  tags: Tag[];
  desc: string;
  arcDeg: number;
  arcRange: number;
  special?: 'lunge' | 'charge';
}

export interface SupportDef {
  id: SupportId;
  label: string;
  tags: Tag[];
  requiredTags: Tag[];
  desc: string;
  armyRule: string;
}

export interface ItemDef {
  id: ItemId;
  label: string;
  tags: Tag[];
  penalty: string;
  benefit: string;
  armyRule: string;
}

export type ClusterId = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';
export type NodeId =
  | 'A1' | 'A2' | 'A3' | 'A4' | 'A5' | 'A6'
  | 'B1' | 'B2' | 'B3' | 'B4' | 'B5' | 'B6'
  | 'C1' | 'C2' | 'C3' | 'C4' | 'C5' | 'C6'
  | 'D1' | 'D2' | 'D3' | 'D4' | 'D5' | 'D6'
  | 'E1' | 'E2' | 'E3' | 'E4' | 'E5' | 'E6'
  | 'F1' | 'F2' | 'F3' | 'F4' | 'F5' | 'F6';

export type NodeType = 'ban' | 'convert' | 'rule';

export interface TreeNodeDef {
  id: NodeId;
  cluster: ClusterId;
  type: NodeType;
  label: string;
  ban: string;
  liberation: string;
  requiredTags: Tag[];
  isMiniKeystone: boolean;
}

export interface ClusterDef {
  id: ClusterId;
  label: string;
  labelEn: string;
  nodes: NodeId[];
  activationTags: Tag[];
}

export interface BuildConfig {
  keystone: KeystoneId;
  skill: SkillId;
  supports: [SupportId, SupportId];
  item: ItemId;
  clusters: [ClusterId, ClusterId] | [];
  nodes: NodeId[];
}

export interface PresetDef {
  label: string;
  desc: string;
  build: BuildConfig;
}

export interface Zone {
  x: number;
  y: number;
  radius: number;
  expiresAt: number;
}

// Mode toggles (mutable — set from BuildScene at runtime)
export const GameMode = {
  core: true,
  repeat: false,
};
