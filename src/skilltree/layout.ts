import type { NodeDef } from './types';

/** Region angle in radians (R1=0°, R2=45°, ..., R8=315°). */
const REGION_ANGLES: Record<string, number> = {
  R1: 0,
  R2: Math.PI / 4,
  R3: Math.PI / 2,
  R4: (3 * Math.PI) / 4,
  R5: Math.PI,
  R6: (5 * Math.PI) / 4,
  R7: (3 * Math.PI) / 2,
  R8: (7 * Math.PI) / 4,
};

// Radial layers
const HUB_RADIUS = 0;
const HUB_LINK_RADIUS = 180;
const ENTRY_RADIUS = 500;
const MAJOR_RADII = [800, 1050, 1250];
const KEYSTONE_RADIUS = 1500;
const BRIDGE_RADIUS = 1050; // same as M2 radius

/** Spread angle for multiple nodes at the same layer within a region. */
const ENTRY_SPREAD = 0.18; // radians (~10°)

export interface NodePos {
  x: number;
  y: number;
}

/**
 * Calculate positions for all nodes in enumerated mode.
 * Returns a map from nodeId to {x, y}.
 */
export function calculateEnumeratedLayout(nodes: NodeDef[]): Map<string, NodePos> {
  const pos = new Map<string, NodePos>();

  // HUB link node angles: evenly spaced around the center
  const hubLinks: NodeDef[] = [];
  const hubLinkAngles = new Map<string, number>();

  for (const n of nodes) {
    if (n.id === 'HUB-START') {
      pos.set(n.id, { x: 0, y: 0 });
      continue;
    }

    if (n.region === 'HUB') {
      hubLinks.push(n);
      continue;
    }
  }

  // Place HUB link nodes evenly in a ring
  // Order: HUB-N01..N16 → angles spaced 22.5° apart, starting at -11.25° from R1
  hubLinks.sort((a, b) => {
    const ai = parseInt(a.id.replace('HUB-N', ''));
    const bi = parseInt(b.id.replace('HUB-N', ''));
    return ai - bi;
  });
  for (let i = 0; i < hubLinks.length; i++) {
    const angle = (i / hubLinks.length) * Math.PI * 2 - Math.PI / 16;
    hubLinkAngles.set(hubLinks[i].id, angle);
    pos.set(hubLinks[i].id, {
      x: Math.cos(angle) * HUB_LINK_RADIUS,
      y: Math.sin(angle) * HUB_LINK_RADIUS,
    });
  }

  // Group region nodes
  const regionNodes = new Map<string, NodeDef[]>();
  for (const n of nodes) {
    if (n.region === 'HUB' || n.region === 'BRIDGE') continue;
    if (!regionNodes.has(n.region)) regionNodes.set(n.region, []);
    regionNodes.get(n.region)!.push(n);
  }

  // Place region nodes
  for (const [region, rNodes] of regionNodes) {
    const baseAngle = REGION_ANGLES[region];
    if (baseAngle === undefined) continue;

    const entries = rNodes.filter(n => n.id.match(/-E\d$/));
    const majors = rNodes.filter(n => n.id.match(/-M\d$/));
    const keystones = rNodes.filter(n => n.id.match(/-K\d$/));

    // Sort by number suffix
    const byNum = (a: NodeDef, b: NodeDef) => {
      const an = parseInt(a.id.slice(-1));
      const bn = parseInt(b.id.slice(-1));
      return an - bn;
    };
    entries.sort(byNum);
    majors.sort(byNum);
    keystones.sort(byNum);

    // Entries: spread around baseAngle
    for (let i = 0; i < entries.length; i++) {
      const offset = (i - (entries.length - 1) / 2) * ENTRY_SPREAD;
      const a = baseAngle + offset;
      pos.set(entries[i].id, {
        x: Math.cos(a) * ENTRY_RADIUS,
        y: Math.sin(a) * ENTRY_RADIUS,
      });
    }

    // Majors: along the trunk line at increasing radii
    for (let i = 0; i < majors.length; i++) {
      const r = MAJOR_RADII[i] ?? MAJOR_RADII[MAJOR_RADII.length - 1];
      // Slight offset for visual variety
      const jitter = (i - 1) * 0.03;
      pos.set(majors[i].id, {
        x: Math.cos(baseAngle + jitter) * r,
        y: Math.sin(baseAngle + jitter) * r,
      });
    }

    // Keystones: outermost ring
    for (const k of keystones) {
      pos.set(k.id, {
        x: Math.cos(baseAngle) * KEYSTONE_RADIUS,
        y: Math.sin(baseAngle) * KEYSTONE_RADIUS,
      });
    }
  }

  // Place bridge nodes
  for (const n of nodes) {
    if (n.region !== 'BRIDGE') continue;
    // BR-Ri-Rj → angle midpoint between Ri and Rj
    const match = n.id.match(/BR-(R\d)-(R\d)/);
    if (!match) continue;
    const a1 = REGION_ANGLES[match[1]];
    const a2 = REGION_ANGLES[match[2]];
    if (a1 === undefined || a2 === undefined) continue;
    // Handle wrap-around (R8-R1)
    let mid = (a1 + a2) / 2;
    if (Math.abs(a1 - a2) > Math.PI) {
      mid = (a1 + a2) / 2 + Math.PI;
      if (mid > Math.PI * 2) mid -= Math.PI * 2;
    }
    pos.set(n.id, {
      x: Math.cos(mid) * BRIDGE_RADIUS,
      y: Math.sin(mid) * BRIDGE_RADIUS,
    });
  }

  return pos;
}

/**
 * Calculate positions for generated mode nodes.
 * Trunk minors are placed along the radial direction.
 * Branch minors are offset perpendicular.
 */
export function calculateGeneratedLayout(
  nodes: NodeDef[],
  enumPositions: Map<string, NodePos>,
): Map<string, NodePos> {
  const pos = new Map(enumPositions);

  for (const n of nodes) {
    if (pos.has(n.id)) continue;

    // Trunk minor: R{x}-N{###}
    const trunkMatch = n.id.match(/^(R\d)-N(\d{3})$/);
    if (trunkMatch) {
      const region = trunkMatch[1];
      const idx = parseInt(trunkMatch[2]);
      const baseAngle = REGION_ANGLES[region];
      if (baseAngle === undefined) continue;
      // Place along trunk at interpolated radius (500..1500)
      const t = idx / 60; // normalized 0..~1
      const r = ENTRY_RADIUS + t * (KEYSTONE_RADIUS - ENTRY_RADIUS);
      const jitter = ((idx % 7) - 3) * 0.015;
      pos.set(n.id, {
        x: Math.cos(baseAngle + jitter) * r,
        y: Math.sin(baseAngle + jitter) * r,
      });
      continue;
    }

    // Branch minor: R{x}-B{y}-{###}
    const branchMatch = n.id.match(/^(R\d)-B(\d)-(\d{3})$/);
    if (branchMatch) {
      const region = branchMatch[1];
      const brIdx = parseInt(branchMatch[2]);
      const idx = parseInt(branchMatch[3]);
      const baseAngle = REGION_ANGLES[region];
      if (baseAngle === undefined) continue;
      const t = idx / 8;
      const r = ENTRY_RADIUS + 200 + t * 600;
      const latOffset = (brIdx % 2 === 0 ? 1 : -1) * 0.08 * (1 + brIdx * 0.3);
      pos.set(n.id, {
        x: Math.cos(baseAngle + latOffset) * r,
        y: Math.sin(baseAngle + latOffset) * r,
      });
      continue;
    }
  }

  return pos;
}

export { REGION_ANGLES, ENTRY_RADIUS, KEYSTONE_RADIUS, BRIDGE_RADIUS };
