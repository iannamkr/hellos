export type NodeTier = 'START' | 'MINOR' | 'MAJOR' | 'KEYSTONE' | 'STANCE';
export type TreeMode = 'enumerated' | 'generated';
export type NodeState = 'locked' | 'reachable' | 'allocatable' | 'allocated';

export interface StatMod {
  stat: string;
  op: 'add' | 'add_pct' | 'mul' | 'mul_pct' | 'set' | 'min' | 'max';
  value: number;
  scope: string;
  cond?: string;
}

export interface RuleMod {
  rule_id: string;
  params: Record<string, number>;
  scope: string;
  cond?: string;
}

export interface OverridePatch {
  [nodeId: string]: {
    effect_lines?: string[];
    tradeoff_lines?: string[];
    stats?: StatMod[];
    rules?: RuleMod[];
  };
}

export interface NodeDef {
  id: string;
  region: string;
  tier: NodeTier;
  name: string;
  trigger: string;
  effect: string;
  tradeoff: string;
  visibility: string;
  requires: string[];
  effect_id?: string;
  params?: Record<string, number>;
  effect_lines: string[];
  tradeoff_lines: string[];
  stats: StatMod[];
  rules: RuleMod[];
}

export interface EdgeDef {
  a: string;
  b: string;
}

export interface RegionDef {
  id: number;
  code: string;
  name: string;
  theme: string;
  primary_trigger: string;
}

export interface SkillSystemConfig {
  type: string;
  max_active_stances: number;
  switch_only: boolean;
  switch_cooldown_ms: number;
}

export interface SkillTreeJson {
  meta: {
    name: string;
    version: string;
    tree_type: string;
    region_count: number;
    skill_system?: SkillSystemConfig;
    pathing: {
      start_node: string;
      [k: string]: unknown;
    };
    [k: string]: unknown;
  };
  regions: RegionDef[];
  nodes: NodeDef[];
  edges: EdgeDef[];
  minor_generation: {
    minor_per_region_target: { min: number; max: number };
    templates: {
      region_minor_templates: Record<string, { trigger: string; rule_change: string; tradeoff: string }[]>;
      layout_rules?: {
        end_nodes?: Record<string, string>;
        [k: string]: unknown;
      };
      [k: string]: unknown;
    };
    [k: string]: unknown;
  };
}

export interface EffectSpec {
  effect_id: string;
  params: Record<string, number>;
  stack_rule: 'unique' | 'add' | 'max' | 'min';
  scope: string;
}

export interface BuildExport {
  version: string;
  treeVersion: string;
  seed: number;
  mode: TreeMode;
  allocatedNodeIds: string[];
  checksum: string;
  nodeSnapshot?: Record<string, { effect_lines: string[]; tradeoff_lines: string[]; stats: StatMod[]; rules: RuleMod[] }>;
}

export interface SaveData {
  treeVersion: string;
  mode: TreeMode;
  seed: number;
  remainingSkillPoints: number;
  allocatedNodeIds: string[];
  lastCamera: { x: number; y: number; zoom: number };
  activeStanceId?: string | null;
}
