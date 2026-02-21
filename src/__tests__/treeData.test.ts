import { describe, it, expect } from 'vitest';
import {
  CLUSTERS, TREE_NODES,
  getNode, getCluster,
  getBuildTags, isClusterActive, isNodeUnlocked,
  isMiniKeystoneAvailable, validateTreeSelection,
} from '../data/treeData';
import type { BuildConfig, ClusterId, NodeId, Tag } from '../types';

// ── Data integrity ──────────────────────────────────────────────

describe('CLUSTERS', () => {
  it('has exactly 6 clusters', () => {
    expect(CLUSTERS).toHaveLength(6);
  });

  it('ids are A-F', () => {
    expect(CLUSTERS.map(c => c.id).sort()).toEqual(['A', 'B', 'C', 'D', 'E', 'F']);
  });

  it('each cluster has 6 nodes', () => {
    for (const c of CLUSTERS) {
      expect(c.nodes).toHaveLength(6);
    }
  });

  it('each cluster has activationTags', () => {
    for (const c of CLUSTERS) {
      expect(c.activationTags.length).toBeGreaterThan(0);
    }
  });

  it('node ids match cluster prefix', () => {
    for (const c of CLUSTERS) {
      for (const nodeId of c.nodes) {
        expect(nodeId.startsWith(c.id)).toBe(true);
      }
    }
  });
});

describe('TREE_NODES', () => {
  it('has exactly 36 nodes', () => {
    expect(TREE_NODES).toHaveLength(36);
  });

  it('all ids are unique', () => {
    const ids = TREE_NODES.map(n => n.id);
    expect(new Set(ids).size).toBe(36);
  });

  it('each node has valid type', () => {
    for (const n of TREE_NODES) {
      expect(['ban', 'convert', 'rule']).toContain(n.type);
    }
  });

  it('each node has ban and liberation', () => {
    for (const n of TREE_NODES) {
      expect(n.ban).toBeTruthy();
      expect(n.liberation).toBeTruthy();
    }
  });

  it('each cluster has exactly 1 mini-keystone', () => {
    const clusters: ClusterId[] = ['A', 'B', 'C', 'D', 'E', 'F'];
    for (const c of clusters) {
      const miniKeys = TREE_NODES.filter(n => n.cluster === c && n.isMiniKeystone);
      expect(miniKeys).toHaveLength(1);
    }
  });

  it('mini-keystones are the x6 nodes', () => {
    const miniKeys = TREE_NODES.filter(n => n.isMiniKeystone);
    // D1 is also a mini-keystone (exception), and F3
    const miniKeyIds = miniKeys.map(n => n.id).sort();
    expect(miniKeyIds).toEqual(['A6', 'B6', 'C6', 'D6', 'E6', 'F6'].sort());
  });
});

// ── Lookup functions ────────────────────────────────────────────

describe('getNode', () => {
  it('returns correct node', () => {
    expect(getNode('A1').label).toBe('방패벽');
    expect(getNode('C1').label).toBe('요격 우선권');
  });

  it('returns node with correct cluster', () => {
    expect(getNode('B3').cluster).toBe('B');
    expect(getNode('F5').cluster).toBe('F');
  });
});

describe('getCluster', () => {
  it('returns correct cluster', () => {
    expect(getCluster('A').label).toBe('전열');
    expect(getCluster('C').labelEn).toBe('Intercept');
  });
});

// ── getBuildTags ────────────────────────────────────────────────

describe('getBuildTags', () => {
  it('collects tags from all build components', () => {
    const build: BuildConfig = {
      keystone: 'closePact',       // close, posture
      skill: 'slash',              // melee, attack
      supports: ['dashPrime', 'markStack'], // dash,prime + mark,execute
      item: 'bloodOath',           // sustain, risk
      clusters: [],
      nodes: [],
    };
    const tags = getBuildTags(build);
    expect(tags).toContain('close');
    expect(tags).toContain('posture');
    expect(tags).toContain('melee');
    expect(tags).toContain('attack');
    expect(tags).toContain('dash');
    expect(tags).toContain('prime');
    expect(tags).toContain('mark');
    expect(tags).toContain('execute');
    expect(tags).toContain('sustain');
    expect(tags).toContain('risk');
  });

  it('deduplicates overlapping tags', () => {
    const build: BuildConfig = {
      keystone: 'fragilePower',    // risk, sustain
      skill: 'slash',              // melee, attack
      supports: ['dashTax', 'markStack'], // dash,risk + mark,execute
      item: 'bloodOath',           // sustain, risk
      clusters: [],
      nodes: [],
    };
    const tags = getBuildTags(build);
    // risk appears in keystone, dashTax, and bloodOath — only once in result
    const riskCount = tags.filter(t => t === 'risk').length;
    expect(riskCount).toBe(1);
  });
});

// ── isClusterActive ────────────────────────────────────────────

describe('isClusterActive', () => {
  it('activates cluster A with close tag', () => {
    expect(isClusterActive('A', ['close'])).toBe(true);
  });

  it('activates cluster A with posture tag', () => {
    expect(isClusterActive('A', ['posture'])).toBe(true);
  });

  it('activates cluster A with commit tag', () => {
    expect(isClusterActive('A', ['commit'])).toBe(true);
  });

  it('does not activate cluster A without matching tags', () => {
    expect(isClusterActive('A', ['far', 'kite'])).toBe(false);
  });

  it('activates cluster B with far tag', () => {
    expect(isClusterActive('B', ['far'])).toBe(true);
  });

  it('does not activate cluster D without priority/execute/mark', () => {
    expect(isClusterActive('D', ['close', 'melee'])).toBe(false);
  });

  it('activates cluster D with mark tag', () => {
    expect(isClusterActive('D', ['mark'])).toBe(true);
  });
});

// ── isNodeUnlocked ─────────────────────────────────────────────

describe('isNodeUnlocked', () => {
  it('unlocks A1 with no required tags', () => {
    expect(isNodeUnlocked('A1', [])).toBe(true);
  });

  it('unlocks B3 with mark tag', () => {
    expect(isNodeUnlocked('B3', ['mark'])).toBe(true);
  });

  it('does not unlock B3 without mark tag', () => {
    expect(isNodeUnlocked('B3', ['close', 'far'])).toBe(false);
  });

  it('unlocks D6 with both mark and execute', () => {
    expect(isNodeUnlocked('D6', ['mark', 'execute'])).toBe(true);
  });

  it('does not unlock D6 with only mark', () => {
    expect(isNodeUnlocked('D6', ['mark'])).toBe(false);
  });

  it('does not unlock D6 with only execute', () => {
    expect(isNodeUnlocked('D6', ['execute'])).toBe(false);
  });

  it('unlocks E2 with still tag', () => {
    expect(isNodeUnlocked('E2', ['still'])).toBe(true);
  });
});

// ── isMiniKeystoneAvailable ────────────────────────────────────

describe('isMiniKeystoneAvailable', () => {
  it('non-keystone nodes are always available', () => {
    expect(isMiniKeystoneAvailable('A1', [])).toBe(true);
    expect(isMiniKeystoneAvailable('B2', [])).toBe(true);
  });

  it('mini-keystone requires 3 non-keystone nodes in same cluster', () => {
    expect(isMiniKeystoneAvailable('A6', ['A1', 'A2', 'A3'])).toBe(true);
  });

  it('mini-keystone not available with only 2 non-keystone nodes', () => {
    expect(isMiniKeystoneAvailable('A6', ['A1', 'A2'])).toBe(false);
  });

  it('mini-keystone not available with 0 nodes', () => {
    expect(isMiniKeystoneAvailable('A6', [])).toBe(false);
  });

  it('does not count nodes from other clusters', () => {
    expect(isMiniKeystoneAvailable('A6', ['B1', 'B2', 'B3'])).toBe(false);
  });

  it('does not count other mini-keystones toward the 3 requirement', () => {
    // A6 is mini-keystone, so selecting A6 itself shouldn't count
    expect(isMiniKeystoneAvailable('A6', ['A1', 'A2', 'A6'])).toBe(false);
  });

  it('works for cluster B', () => {
    expect(isMiniKeystoneAvailable('B6', ['B1', 'B2', 'B3'])).toBe(true);
    expect(isMiniKeystoneAvailable('B6', ['B1', 'B2'])).toBe(false);
  });

  it('works for cluster D', () => {
    // D1 is NOT a mini-keystone, D6 is
    expect(isMiniKeystoneAvailable('D6', ['D1', 'D2', 'D3'])).toBe(true);
  });
});

// ── validateTreeSelection ──────────────────────────────────────

describe('validateTreeSelection', () => {
  const baseTags: Tag[] = ['close', 'posture', 'melee', 'attack', 'dash', 'prime', 'far', 'kite'];

  it('returns null for empty selection', () => {
    expect(validateTreeSelection([], [], baseTags)).toBeNull();
  });

  it('returns null for valid single cluster selection', () => {
    expect(validateTreeSelection(['A'], ['A1', 'A2'], baseTags)).toBeNull();
  });

  it('returns null for valid two cluster selection', () => {
    expect(validateTreeSelection(['A', 'B'], ['A1', 'B1'], baseTags)).toBeNull();
  });

  it('rejects 3 clusters', () => {
    const result = validateTreeSelection(['A', 'B', 'C'] as any, [], baseTags);
    expect(result).toContain('최대 2개');
  });

  it('rejects inactive cluster', () => {
    // D requires priority/execute/mark — baseTags don't include those
    const result = validateTreeSelection(['D'], ['D2'], baseTags);
    expect(result).toBeTruthy();
  });

  it('rejects more than 4 nodes per cluster', () => {
    const result = validateTreeSelection(['A'], ['A1', 'A2', 'A3', 'A4', 'A5'], baseTags);
    expect(result).toContain('최대 4개');
  });

  it('rejects node from non-selected cluster', () => {
    const result = validateTreeSelection(['A'], ['B1'], baseTags);
    expect(result).toContain('비활성 클러스터');
  });

  it('rejects node with unmet tag requirements', () => {
    // B3 requires 'mark' tag, not in baseTags
    const result = validateTreeSelection(['B'], ['B3'], baseTags);
    expect(result).toContain('태그 잠금');
  });

  it('rejects mini-keystone without 3 non-keystone nodes', () => {
    const result = validateTreeSelection(['A'], ['A1', 'A2', 'A6'], baseTags);
    expect(result).toContain('3노드 필요');
  });

  it('accepts mini-keystone with 3 non-keystone nodes', () => {
    const result = validateTreeSelection(['A'], ['A1', 'A2', 'A3', 'A6'], baseTags);
    expect(result).toBeNull();
  });
});
