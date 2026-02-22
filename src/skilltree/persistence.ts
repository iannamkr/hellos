import type { SaveData, TreeMode, BuildExport, NodeDef, OverridePatch } from './types';

const STORAGE_KEY = 'hellos_skill_tree_save';

export function saveTree(data: SaveData): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch { /* quota exceeded or private mode */ }
}

export function loadTree(): SaveData | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as SaveData;
  } catch {
    return null;
  }
}

export function clearTree(): void {
  localStorage.removeItem(STORAGE_KEY);
}

/** Simple stable hash of sorted node IDs for checksum. */
function stableHash(ids: string[]): string {
  const sorted = [...ids].sort();
  let h = 0;
  for (const s of sorted) {
    for (let i = 0; i < s.length; i++) {
      h = ((h << 5) - h + s.charCodeAt(i)) | 0;
    }
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

export function exportBuild(
  treeVersion: string,
  seed: number,
  mode: TreeMode,
  allocatedNodeIds: string[],
  nodeMap?: Map<string, NodeDef>,
): string {
  const data: BuildExport = {
    version: '1',
    treeVersion,
    seed,
    mode,
    allocatedNodeIds: [...allocatedNodeIds].sort(),
    checksum: stableHash(allocatedNodeIds),
  };
  if (nodeMap) {
    const snap: BuildExport['nodeSnapshot'] = {};
    for (const id of allocatedNodeIds) {
      const n = nodeMap.get(id);
      if (!n) continue;
      snap[id] = {
        effect_lines: n.effect_lines,
        tradeoff_lines: n.tradeoff_lines,
        stats: n.stats,
        rules: n.rules,
      };
    }
    data.nodeSnapshot = snap;
  }
  return JSON.stringify(data);
}

export function applyOverrides(nodeMap: Map<string, NodeDef>, patch: OverridePatch): void {
  for (const [id, p] of Object.entries(patch)) {
    const n = nodeMap.get(id);
    if (!n) continue;
    if (p.effect_lines) n.effect_lines = p.effect_lines;
    if (p.tradeoff_lines) n.tradeoff_lines = p.tradeoff_lines;
    if (p.stats) n.stats = p.stats;
    if (p.rules) n.rules = p.rules;
  }
}

export function importBuild(json: string): {
  ok: boolean;
  data?: BuildExport;
  error?: string;
} {
  try {
    const data = JSON.parse(json) as BuildExport;
    if (!data.version || !data.allocatedNodeIds) {
      return { ok: false, error: 'Invalid format' };
    }
    const check = stableHash(data.allocatedNodeIds);
    if (check !== data.checksum) {
      return { ok: false, error: 'Checksum mismatch' };
    }
    return { ok: true, data };
  } catch {
    return { ok: false, error: 'Invalid JSON' };
  }
}
