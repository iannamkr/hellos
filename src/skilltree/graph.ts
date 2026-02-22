import type { EdgeDef } from './types';

export type AdjMap = Map<string, Set<string>>;

export function buildAdjacency(edges: EdgeDef[]): AdjMap {
  const adj: AdjMap = new Map();
  const seen = new Set<string>();
  for (const e of edges) {
    if (e.a === e.b) continue;
    const key = e.a < e.b ? `${e.a}|${e.b}` : `${e.b}|${e.a}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (!adj.has(e.a)) adj.set(e.a, new Set());
    if (!adj.has(e.b)) adj.set(e.b, new Set());
    adj.get(e.a)!.add(e.b);
    adj.get(e.b)!.add(e.a);
  }
  return adj;
}

/** BFS from start, returns all reachable node IDs. */
export function bfs(adj: AdjMap, start: string): Set<string> {
  const visited = new Set<string>();
  const queue = [start];
  visited.add(start);
  while (queue.length > 0) {
    const cur = queue.shift()!;
    for (const nb of adj.get(cur) ?? []) {
      if (!visited.has(nb)) { visited.add(nb); queue.push(nb); }
    }
  }
  return visited;
}

/** BFS shortest path (node list) from `from` to `to`, or null if unreachable. */
export function shortestPath(adj: AdjMap, from: string, to: string): string[] | null {
  if (from === to) return [from];
  const parent = new Map<string, string>();
  const visited = new Set<string>([from]);
  const queue = [from];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    for (const nb of adj.get(cur) ?? []) {
      if (visited.has(nb)) continue;
      visited.add(nb);
      parent.set(nb, cur);
      if (nb === to) {
        const path: string[] = [];
        let c: string | undefined = to;
        while (c !== undefined) { path.push(c); c = parent.get(c); }
        return path.reverse();
      }
      queue.push(nb);
    }
  }
  return null;
}

/** Check if all nodes in `allocated` (excluding `removed`) remain connected from `start`. */
export function isConnectedWithout(adj: AdjMap, allocated: Set<string>, removed: string, start: string): boolean {
  const remaining = new Set(allocated);
  remaining.delete(removed);
  if (remaining.size === 0) return true;
  if (!remaining.has(start)) return false;
  const visited = new Set<string>();
  const queue = [start];
  visited.add(start);
  while (queue.length > 0) {
    const cur = queue.shift()!;
    for (const nb of adj.get(cur) ?? []) {
      if (remaining.has(nb) && !visited.has(nb)) { visited.add(nb); queue.push(nb); }
    }
  }
  for (const n of remaining) { if (!visited.has(n)) return false; }
  return true;
}

/**
 * Find cheapest path from any allocated node to target.
 * Returns the ordered list of unallocated nodes to allocate (the "cost" = list.length).
 */
export function findCheapestPath(
  adj: AdjMap,
  allocated: Set<string>,
  target: string,
  nodeRequires: Map<string, string[]>,
): { path: string[]; cost: number } | null {
  if (allocated.has(target)) return { path: [], cost: 0 };

  // Multi-source BFS from all allocated nodes
  const parent = new Map<string, string>();
  const visited = new Set<string>();
  const queue: string[] = [];
  for (const a of allocated) { visited.add(a); queue.push(a); }

  while (queue.length > 0) {
    const cur = queue.shift()!;
    for (const nb of adj.get(cur) ?? []) {
      if (visited.has(nb)) continue;
      // Skip if requires not met by current allocated set
      const reqs = nodeRequires.get(nb) ?? [];
      if (!reqs.every(r => allocated.has(r))) continue;
      visited.add(nb);
      parent.set(nb, cur);
      if (nb === target) {
        const path: string[] = [];
        let c: string | undefined = target;
        while (c !== undefined && !allocated.has(c)) { path.push(c); c = parent.get(c); }
        path.reverse();
        return { path, cost: path.length };
      }
      queue.push(nb);
    }
  }
  return null;
}

/** Validate the tree data: check for missing node refs in edges, etc. */
export function validateTree(nodeIds: Set<string>, edges: EdgeDef[]): string[] {
  const errors: string[] = [];
  for (const e of edges) {
    if (!nodeIds.has(e.a)) errors.push(`Edge references missing node: ${e.a}`);
    if (!nodeIds.has(e.b)) errors.push(`Edge references missing node: ${e.b}`);
  }
  return errors;
}
