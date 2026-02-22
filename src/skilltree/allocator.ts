import type { NodeDef, NodeState } from './types';
import { type AdjMap, isConnectedWithout, findCheapestPath } from './graph';

export class Allocator {
  readonly adj: AdjMap;
  readonly nodeMap: Map<string, NodeDef>;
  readonly nodeRequires: Map<string, string[]>;
  readonly startNode: string;
  readonly allocated: Set<string>;
  skillPoints: number;

  constructor(adj: AdjMap, nodeMap: Map<string, NodeDef>, startNode: string, skillPoints: number) {
    this.adj = adj;
    this.nodeMap = nodeMap;
    this.startNode = startNode;
    this.allocated = new Set([startNode]);
    this.skillPoints = skillPoints;
    this.nodeRequires = new Map();
    for (const [id, n] of nodeMap) {
      this.nodeRequires.set(id, n.requires ?? []);
    }
  }

  getNodeState(nodeId: string): NodeState {
    if (this.allocated.has(nodeId)) return 'allocated';
    // Check adjacency to allocated
    const neighbors = this.adj.get(nodeId);
    const isAdjacentToAllocated = neighbors ? [...neighbors].some(nb => this.allocated.has(nb)) : false;
    if (!isAdjacentToAllocated) return 'locked';
    // Check requires
    const reqs = this.nodeRequires.get(nodeId) ?? [];
    const reqsMet = reqs.every(r => this.allocated.has(r));
    if (!reqsMet) return 'reachable';
    return 'allocatable';
  }

  canAllocate(nodeId: string): boolean {
    if (this.allocated.has(nodeId)) return false;
    if (this.skillPoints < 1) return false;
    return this.getNodeState(nodeId) === 'allocatable';
  }

  allocate(nodeId: string): boolean {
    if (!this.canAllocate(nodeId)) return false;
    this.allocated.add(nodeId);
    this.skillPoints--;
    return true;
  }

  canRefund(nodeId: string): { ok: boolean; reason?: string } {
    if (!this.allocated.has(nodeId)) return { ok: false, reason: 'Not allocated' };
    if (nodeId === this.startNode) return { ok: false, reason: 'Cannot refund start node' };
    // Check connectivity
    if (!isConnectedWithout(this.adj, this.allocated, nodeId, this.startNode)) {
      return { ok: false, reason: 'Would disconnect the tree' };
    }
    // Check if any remaining node's requires would break
    for (const [id, reqs] of this.nodeRequires) {
      if (id === nodeId || !this.allocated.has(id)) continue;
      if (reqs.includes(nodeId)) {
        return { ok: false, reason: `Required by ${id}` };
      }
    }
    return { ok: true };
  }

  refund(nodeId: string): { ok: boolean; reason?: string } {
    const check = this.canRefund(nodeId);
    if (!check.ok) return check;
    this.allocated.delete(nodeId);
    this.skillPoints++;
    return { ok: true };
  }

  /** Get cheapest path from allocated set to target. */
  getPathTo(nodeId: string): { path: string[]; cost: number } | null {
    return findCheapestPath(this.adj, this.allocated, nodeId, this.nodeRequires);
  }

  /** Allocate all nodes along a path (shift+click). Returns how many were allocated. */
  allocatePath(nodeIds: string[]): number {
    let count = 0;
    for (const id of nodeIds) {
      if (this.canAllocate(id)) {
        this.allocate(id);
        count++;
      } else {
        break;
      }
    }
    return count;
  }

  /** Auto-allocate order reconstruction for import. */
  static reconstructOrder(
    targets: string[],
    adj: AdjMap,
    nodeMap: Map<string, NodeDef>,
    startNode: string,
  ): { order: string[]; failed: string[] } {
    const allocated = new Set([startNode]);
    const remaining = new Set(targets.filter(id => id !== startNode));
    const order: string[] = [];
    const nodeRequires = new Map<string, string[]>();
    for (const [id, n] of nodeMap) {
      nodeRequires.set(id, n.requires ?? []);
    }

    let changed = true;
    while (remaining.size > 0 && changed) {
      changed = false;
      // Find candidates: adjacent to allocated + requires met
      const candidates: string[] = [];
      for (const id of remaining) {
        const neighbors = adj.get(id);
        const isAdj = neighbors ? [...neighbors].some(nb => allocated.has(nb)) : false;
        if (!isAdj) continue;
        const reqs = nodeRequires.get(id) ?? [];
        if (!reqs.every(r => allocated.has(r))) continue;
        candidates.push(id);
      }
      // Sort: shortest requires first, then by input order
      const inputOrder = new Map(targets.map((id, i) => [id, i]));
      candidates.sort((a, b) => {
        const ra = (nodeRequires.get(a) ?? []).length;
        const rb = (nodeRequires.get(b) ?? []).length;
        if (ra !== rb) return ra - rb;
        return (inputOrder.get(a) ?? 999) - (inputOrder.get(b) ?? 999);
      });
      if (candidates.length > 0) {
        const pick = candidates[0];
        allocated.add(pick);
        remaining.delete(pick);
        order.push(pick);
        changed = true;
      }
    }

    return { order, failed: [...remaining] };
  }
}
