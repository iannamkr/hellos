import type { NodeDef, EdgeDef, SkillTreeJson } from './types';

/** Deterministic seeded PRNG (mulberry32). */
class Rng {
  private state: number;
  constructor(seed: number) { this.state = seed | 0; }
  next(): number {
    this.state |= 0;
    this.state = (this.state + 0x6D2B79F5) | 0;
    let t = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  intRange(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }
}

const REGIONS = ['R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7', 'R8'];

interface GeneratedTree {
  nodes: NodeDef[];
  edges: EdgeDef[];
}

/**
 * Generate expanded tree with trunk minors and side branches.
 * Merges with existing enumerated nodes/edges.
 */
export function generateTree(data: SkillTreeJson, seed: number): GeneratedTree {
  const rng = new Rng(seed);
  const existingIds = new Set(data.nodes.map(n => n.id));
  const newNodes: NodeDef[] = [...data.nodes];
  const newEdges: EdgeDef[] = [...data.edges];
  const edgeSet = new Set(data.edges.map(e => edgeKey(e.a, e.b)));

  function addEdge(a: string, b: string) {
    const k = edgeKey(a, b);
    if (edgeSet.has(k)) return;
    edgeSet.add(k);
    newEdges.push({ a, b });
  }

  for (const region of REGIONS) {
    const templates = data.minor_generation.templates.region_minor_templates[region] ?? [];
    const minN = data.minor_generation.minor_per_region_target.min;
    const maxN = data.minor_generation.minor_per_region_target.max;
    const totalMinors = rng.intRange(minN, maxN);

    // Segment distribution
    const segA = Math.round(totalMinors * 0.30);
    const segB = Math.round(totalMinors * 0.25);
    const segC = Math.round(totalMinors * 0.25);
    const segD = totalMinors - segA - segB - segC;

    // Segment endpoints (existing nodes)
    const e2 = `${region}-E2`;
    const m1 = `${region}-M1`;
    const m2 = `${region}-M2`;
    const m3 = `${region}-M3`;
    const endNodes = data.minor_generation.templates.layout_rules?.end_nodes as Record<string, string> | undefined;
    const k1 = endNodes?.[region] ?? `${region}-K1`;

    // Remove existing direct trunk edges (E2→M1, M1→M2, etc.) — we'll rewire through minors
    // (They're already in newEdges but we won't duplicate; addEdge deduplicates)

    let nodeCounter = 1;
    function makeMinorId(): string {
      const id = `${region}-N${String(nodeCounter).padStart(3, '0')}`;
      nodeCounter++;
      return id;
    }

    function createTrunkSegment(from: string, to: string, count: number): string[] {
      const ids: string[] = [];
      let prev = from;
      for (let i = 0; i < count; i++) {
        const id = makeMinorId();
        const tpl = templates[rng.intRange(0, templates.length - 1)];
        newNodes.push({
          id,
          region,
          tier: 'MINOR',
          name: `${tpl?.rule_change ?? 'Minor boost'}`,
          trigger: tpl?.trigger ?? '',
          effect: tpl?.rule_change ?? '',
          tradeoff: tpl?.tradeoff ?? '',
          visibility: '',
          requires: [],
          effect_id: `${region}_MINOR_T${nodeCounter}`,
          params: {},
          effect_lines: [tpl?.rule_change ?? 'Minor boost'],
          tradeoff_lines: tpl?.tradeoff ? [tpl.tradeoff] : [],
          stats: [],
          rules: [],
        });
        addEdge(prev, id);
        ids.push(id);
        prev = id;
      }
      addEdge(prev, to);
      return ids;
    }

    const trunkA = createTrunkSegment(e2, m1, segA);
    const trunkB = createTrunkSegment(m1, m2, segB);
    const trunkC = createTrunkSegment(m2, m3, segC);
    const trunkD = createTrunkSegment(m3, k1, segD);
    const allTrunk = [...trunkA, ...trunkB, ...trunkC, ...trunkD];

    // Side branches (1-3 per region)
    const branchCount = rng.intRange(1, 3);
    for (let b = 0; b < branchCount; b++) {
      const branchLen = rng.intRange(3, 8);
      // Pick anchor from trunk (first half for even branches, second half for odd)
      const pool = b % 2 === 0
        ? [...trunkA, ...trunkB]
        : [...trunkC, ...trunkD];
      if (pool.length === 0) continue;
      const anchorIdx = rng.intRange(0, pool.length - 1);
      const anchor = pool[anchorIdx];

      // Pick rejoin point further along trunk
      const anchorTrunkIdx = allTrunk.indexOf(anchor);
      const rejoinPool = allTrunk.slice(Math.min(anchorTrunkIdx + 3, allTrunk.length - 1));
      if (rejoinPool.length === 0) continue;
      const rejoin = rejoinPool[rng.intRange(0, rejoinPool.length - 1)];

      let prev = anchor;
      for (let i = 0; i < branchLen; i++) {
        const id = `${region}-B${b + 1}-${String(i + 1).padStart(3, '0')}`;
        if (existingIds.has(id)) continue;
        const tpl = templates[rng.intRange(0, templates.length - 1)];
        newNodes.push({
          id,
          region,
          tier: 'MINOR',
          name: `${tpl?.rule_change ?? 'Branch boost'}`,
          trigger: tpl?.trigger ?? '',
          effect: tpl?.rule_change ?? '',
          tradeoff: tpl?.tradeoff ?? '',
          visibility: '',
          requires: [],
          effect_id: `${region}_MINOR_B${b + 1}_${i + 1}`,
          params: {},
          effect_lines: [tpl?.rule_change ?? 'Branch boost'],
          tradeoff_lines: tpl?.tradeoff ? [tpl.tradeoff] : [],
          stats: [],
          rules: [],
        });
        addEdge(prev, id);
        prev = id;
      }
      addEdge(prev, rejoin);
    }
  }

  return { nodes: newNodes, edges: newEdges };
}

function edgeKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/** Validate generated tree meets requirements. */
export function validateGenerated(nodes: NodeDef[], edges: EdgeDef[]): string[] {
  const errors: string[] = [];
  if (nodes.length < 350) errors.push(`Only ${nodes.length} nodes (need 350+)`);

  for (const r of REGIONS) {
    const rNodes = nodes.filter(n => n.region === r);
    const entries = rNodes.filter(n => n.id.match(/-E\d$/));
    const majors = rNodes.filter(n => n.id.match(/-M\d$/));
    const endpoints = rNodes.filter(n => n.tier === 'KEYSTONE' || n.tier === 'STANCE');
    if (entries.length < 3) errors.push(`${r}: only ${entries.length} entries`);
    if (majors.length < 3) errors.push(`${r}: only ${majors.length} majors`);
    if (endpoints.length < 1) errors.push(`${r}: no keystone/stance endpoint`);
  }

  // Check for duplicate edges
  const edgeSet = new Set<string>();
  let dupes = 0;
  for (const e of edges) {
    const k = edgeKey(e.a, e.b);
    if (edgeSet.has(k)) dupes++;
    edgeSet.add(k);
  }
  if (dupes > 0) errors.push(`${dupes} duplicate edges`);

  return errors;
}
