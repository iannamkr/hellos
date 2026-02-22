import Phaser from 'phaser';

const TAU = Math.PI * 2;
const HALF_PI = Math.PI / 2;
const SPACING = 20;
const MAX_VISIBLE = 6;
const RING_R = 14;
const DEPTH = 9;
const POP_LERP = 0.15;
const PULSE_PERIOD = 2000;

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface TokenState {
  active: boolean;
  gauge?: number;   // 0-1
  stacks?: number;
  x?: number;       // position override (enemy-attached)
  y?: number;
}

type Anchor = 'pH' | 'pF' | 'pN' | 'V' | 'A' | 'C' | 'E' | 'bk' | 'fl';

export interface WorldRuleSnapshot {
  now: number;
  playerX: number; playerY: number;
  vanguardX: number; vanguardY: number;
  archerX: number; archerY: number;
  cavalryX: number; cavalryY: number;
  flagX: number; flagY: number;
  backSealX: number; backSealY: number;
  tokens: Record<string, TokenState>;
}

export interface WorldRuleTokens {
  update(snap: WorldRuleSnapshot): void;
  destroy(): void;
}

type DrawFn = (g: Phaser.GameObjects.Graphics, c: number) => void;

interface TokenDef {
  id: string;
  priority: number;
  anchor: Anchor;
  color: number;
  draw: DrawFn;
  hasGauge: boolean;
  stackMax?: number;
}

// ═══════════════════════════════════════════════════════════════
// ICON DRAWING
// ═══════════════════════════════════════════════════════════════

function clamp01(v: number): number { return v < 0 ? 0 : v > 1 ? 1 : v; }

// Prohibition wrapper — draws inner, then circle + slash over it
function prohibit(inner: DrawFn): DrawFn {
  return (g, c) => {
    inner(g, c);
    g.lineStyle(1.5, c, 0.85);
    g.strokeCircle(0, 0, 8);
    g.beginPath(); g.moveTo(-5.5, 5.5); g.lineTo(5.5, -5.5); g.strokePath();
  };
}

// ─── Base shapes ───

function iLock(g: Phaser.GameObjects.Graphics, c: number): void {
  g.fillStyle(c, 1);
  g.fillRect(-5, -1, 10, 8);
  g.lineStyle(2, c, 1);
  g.beginPath(); g.arc(0, -1, 5, Math.PI, 0, false); g.strokePath();
}

function iSword(g: Phaser.GameObjects.Graphics, c: number): void {
  g.lineStyle(1.5, c, 1);
  g.beginPath(); g.moveTo(0, -5); g.lineTo(0, 5); g.strokePath();
  g.beginPath(); g.moveTo(-3, -1); g.lineTo(3, -1); g.strokePath();
}

function iShield(g: Phaser.GameObjects.Graphics, c: number): void {
  g.lineStyle(1.5, c, 1);
  g.beginPath();
  g.moveTo(-4, -5); g.lineTo(-4, 1);
  g.arc(0, 1, 4, Math.PI, 0, false);
  g.lineTo(4, -5); g.closePath(); g.strokePath();
}

function iArrowBolt(g: Phaser.GameObjects.Graphics, c: number): void {
  g.fillStyle(c, 1);
  g.fillTriangle(0, -6, -3, -1, 3, -1);
  g.lineStyle(1.5, c, 1);
  g.beginPath(); g.moveTo(0, -1); g.lineTo(0, 6); g.strokePath();
}

function iLightning(g: Phaser.GameObjects.Graphics, c: number): void {
  g.lineStyle(1.5, c, 1);
  g.beginPath();
  g.moveTo(2, -6); g.lineTo(-1, -1); g.lineTo(2, -1); g.lineTo(-1, 6);
  g.strokePath();
}

function iBackArrow(g: Phaser.GameObjects.Graphics, c: number): void {
  g.lineStyle(1.5, c, 1);
  g.beginPath(); g.moveTo(3, -4); g.lineTo(-3, 0); g.lineTo(3, 4); g.strokePath();
  g.beginPath(); g.moveTo(-3, 0); g.lineTo(5, 0); g.strokePath();
}

function iHourglass(g: Phaser.GameObjects.Graphics, c: number): void {
  g.lineStyle(1.5, c, 1);
  g.beginPath(); g.moveTo(-4, -6); g.lineTo(4, -6); g.lineTo(0, 0); g.closePath(); g.strokePath();
  g.beginPath(); g.moveTo(0, 0); g.lineTo(-4, 6); g.lineTo(4, 6); g.closePath(); g.strokePath();
}

function iShockwave(g: Phaser.GameObjects.Graphics, c: number): void {
  g.lineStyle(1.5, c, 1);
  g.beginPath(); g.arc(0, 0, 4, -HALF_PI - 0.8, -HALF_PI + 0.8, false); g.strokePath();
  g.beginPath(); g.arc(0, 0, 7, -HALF_PI - 0.6, -HALF_PI + 0.6, false); g.strokePath();
}

function iTarget(g: Phaser.GameObjects.Graphics, c: number): void {
  g.lineStyle(1.5, c, 1);
  g.strokeCircle(0, 0, 7);
  g.strokeCircle(0, 0, 3.5);
  g.fillStyle(c, 1);
  g.fillCircle(0, 0, 1.5);
}

function iStar(g: Phaser.GameObjects.Graphics, c: number): void {
  g.fillStyle(c, 1);
  g.beginPath();
  for (let i = 0; i < 5; i++) {
    const oa = -HALF_PI + (i * TAU) / 5;
    const ia = oa + Math.PI / 5;
    if (i === 0) g.moveTo(Math.cos(oa) * 5, Math.sin(oa) * 5);
    else g.lineTo(Math.cos(oa) * 5, Math.sin(oa) * 5);
    g.lineTo(Math.cos(ia) * 2, Math.sin(ia) * 2);
  }
  g.closePath(); g.fillPath();
}

function iHeart(g: Phaser.GameObjects.Graphics, c: number): void {
  g.fillStyle(c, 1);
  g.beginPath();
  g.arc(-2.5, -2, 3, Math.PI, 0, false);
  g.arc(2.5, -2, 3, Math.PI, 0, false);
  g.lineTo(0, 5); g.lineTo(-5.5, -2);
  g.closePath(); g.fillPath();
}

function iSmallShield(g: Phaser.GameObjects.Graphics, c: number): void {
  g.lineStyle(1.2, c, 1);
  g.beginPath();
  g.moveTo(-3, -4); g.lineTo(-3, 0);
  g.arc(0, 0, 3, Math.PI, 0, false);
  g.lineTo(3, -4); g.closePath(); g.strokePath();
}

function iCrackedShield(g: Phaser.GameObjects.Graphics, c: number): void {
  iShield(g, c);
  g.lineStyle(1, c, 0.8);
  g.beginPath(); g.moveTo(0, -4); g.lineTo(-2, -1); g.lineTo(1, 1); g.lineTo(-1, 4); g.strokePath();
}

function iSkull(g: Phaser.GameObjects.Graphics, c: number): void {
  g.lineStyle(1.5, c, 1);
  g.strokeCircle(0, -2, 5);
  g.fillStyle(c, 1);
  g.fillCircle(-2, -3, 1); g.fillCircle(2, -3, 1);
  g.beginPath(); g.moveTo(-3, 2); g.lineTo(-3, 4); g.lineTo(3, 4); g.lineTo(3, 2); g.strokePath();
}

function iCrackedSword(g: Phaser.GameObjects.Graphics, c: number): void {
  g.lineStyle(1.5, c, 1);
  g.beginPath(); g.moveTo(0, -5); g.lineTo(0, -1); g.strokePath();
  g.beginPath(); g.moveTo(-1, 0); g.lineTo(1, 0); g.strokePath(); // break
  g.beginPath(); g.moveTo(0, 1); g.lineTo(0, 5); g.strokePath();
  g.beginPath(); g.moveTo(-3, -1); g.lineTo(3, -1); g.strokePath();
}

function iChain(g: Phaser.GameObjects.Graphics, c: number): void {
  g.lineStyle(1.2, c, 1);
  g.strokeCircle(-2, -2, 3);
  g.strokeCircle(2, 2, 3);
}

function iBrokenBarrier(g: Phaser.GameObjects.Graphics, c: number): void {
  g.lineStyle(2, c, 1);
  g.beginPath(); g.moveTo(-7, 0); g.lineTo(-2, 0); g.strokePath();
  g.beginPath(); g.moveTo(2, 0); g.lineTo(7, 0); g.strokePath();
  g.lineStyle(1, c, 0.7);
  g.beginPath(); g.moveTo(-1, -3); g.lineTo(1, 3); g.strokePath();
}

function iAnchorPin(g: Phaser.GameObjects.Graphics, c: number): void {
  g.lineStyle(1.5, c, 1);
  g.strokeCircle(0, -3, 3);
  g.beginPath(); g.moveTo(0, 0); g.lineTo(0, 6); g.strokePath();
  g.beginPath(); g.moveTo(-3, 3); g.lineTo(3, 3); g.strokePath();
}

function iAlignArrows(g: Phaser.GameObjects.Graphics, c: number): void {
  g.lineStyle(1.5, c, 1);
  const d = 5;
  // up
  g.beginPath(); g.moveTo(0, -d); g.lineTo(-2, -d + 3); g.moveTo(0, -d); g.lineTo(2, -d + 3); g.strokePath();
  // down
  g.beginPath(); g.moveTo(0, d); g.lineTo(-2, d - 3); g.moveTo(0, d); g.lineTo(2, d - 3); g.strokePath();
  // left
  g.beginPath(); g.moveTo(-d, 0); g.lineTo(-d + 3, -2); g.moveTo(-d, 0); g.lineTo(-d + 3, 2); g.strokePath();
  // right
  g.beginPath(); g.moveTo(d, 0); g.lineTo(d - 3, -2); g.moveTo(d, 0); g.lineTo(d - 3, 2); g.strokePath();
}

function iDocument(g: Phaser.GameObjects.Graphics, c: number): void {
  g.lineStyle(1.5, c, 1);
  g.strokeRect(-4, -5, 8, 10);
  g.beginPath(); g.moveTo(-2, 0); g.lineTo(0, 2); g.lineTo(3, -2); g.strokePath();
}

function iSwordUp(g: Phaser.GameObjects.Graphics, c: number): void {
  iSword(g, c);
  g.beginPath(); g.moveTo(3, -4); g.lineTo(5, -6); g.lineTo(5, -3); g.strokePath();
}

function iShieldGlow(g: Phaser.GameObjects.Graphics, c: number): void {
  iSmallShield(g, c);
  g.lineStyle(1, c, 0.5);
  g.beginPath(); g.moveTo(5, -3); g.lineTo(7, -4); g.strokePath();
  g.beginPath(); g.moveTo(5, 0); g.lineTo(7, 0); g.strokePath();
  g.beginPath(); g.moveTo(-5, -3); g.lineTo(-7, -4); g.strokePath();
}

function iLightningDouble(g: Phaser.GameObjects.Graphics, c: number): void {
  g.lineStyle(1.5, c, 1);
  g.beginPath(); g.moveTo(0, -6); g.lineTo(-3, -1); g.lineTo(0, -1); g.lineTo(-3, 4); g.strokePath();
  g.beginPath(); g.moveTo(4, -4); g.lineTo(1, 1); g.lineTo(4, 1); g.lineTo(1, 6); g.strokePath();
}

function iArrowStar(g: Phaser.GameObjects.Graphics, c: number): void {
  // Small arrow
  g.fillStyle(c, 1);
  g.fillTriangle(-3, -6, -6, -1, 0, -1);
  g.lineStyle(1, c, 1);
  g.beginPath(); g.moveTo(-3, -1); g.lineTo(-3, 4); g.strokePath();
  // Small star
  g.fillCircle(4, 0, 2);
}

function iHourglassSmall(g: Phaser.GameObjects.Graphics, c: number): void {
  g.lineStyle(1.2, c, 1);
  g.beginPath(); g.moveTo(-3, -4); g.lineTo(3, -4); g.lineTo(0, 0); g.closePath(); g.strokePath();
  g.beginPath(); g.moveTo(0, 0); g.lineTo(-3, 4); g.lineTo(3, 4); g.closePath(); g.strokePath();
}

// Compound: prohibition + shield + target dot
function iShieldTarget(g: Phaser.GameObjects.Graphics, c: number): void {
  iShield(g, c);
  g.fillStyle(c, 1);
  g.fillCircle(0, 2, 1.5);
}

// ═══════════════════════════════════════════════════════════════
// TOKEN DEFINITIONS (41 tokens)
// ═══════════════════════════════════════════════════════════════

const TOKENS: TokenDef[] = [
  // ─── A. Seals/Suppressions (priority 1-2) ───
  { id: 'backSeal',          priority: 1, anchor: 'bk', color: 0xff6644, draw: iLock, hasGauge: true },
  { id: 'cmdBlockIronWall',  priority: 2, anchor: 'pH', color: 0xff4444, draw: prohibit(iSword), hasGauge: false },
  { id: 'cmdBlockSkirmish',  priority: 2, anchor: 'pH', color: 0xff4444, draw: prohibit(iSword), hasGauge: false },
  { id: 'markLock',          priority: 2, anchor: 'pH', color: 0xff8844, draw: prohibit(iSword), hasGauge: true },
  { id: 'cmdDmgZeroB6',     priority: 2, anchor: 'pN', color: 0x888888, draw: (g, c) => { g.lineStyle(1.2, c, 0.7); g.strokeCircle(0, 0, 5); g.beginPath(); g.moveTo(-3, 3); g.lineTo(3, -3); g.strokePath(); }, hasGauge: false },
  { id: 'armySuppMoving',    priority: 2, anchor: 'V',  color: 0xff6644, draw: prohibit(iShield), hasGauge: false },
  { id: 'armySuppStill',     priority: 2, anchor: 'V',  color: 0xff6644, draw: prohibit(iShield), hasGauge: false },
  { id: 'armySuppNoMark',    priority: 2, anchor: 'V',  color: 0xff6644, draw: prohibit(iShieldTarget), hasGauge: false },
  { id: 'archerSuppMove',    priority: 2, anchor: 'A',  color: 0xff8844, draw: prohibit(iArrowBolt), hasGauge: true },
  { id: 'archerSuppStill',   priority: 2, anchor: 'A',  color: 0xff6644, draw: prohibit(iArrowBolt), hasGauge: false },
  { id: 'dashDisabled',      priority: 2, anchor: 'pN', color: 0x888888, draw: prohibit(iLightning), hasGauge: false },
  { id: 'cavalryIntercept',  priority: 2, anchor: 'C',  color: 0x888888, draw: (g, c) => { g.lineStyle(1.2, c, 0.7); g.strokeCircle(0, 0, 5); g.beginPath(); g.moveTo(-3, 3); g.lineTo(3, -3); g.strokePath(); }, hasGauge: false },
  { id: 'scatterForbidden',  priority: 2, anchor: 'V',  color: 0xff4444, draw: (g, c) => { g.lineStyle(1.5, c, 0.9); g.strokeCircle(0, 0, 7); g.beginPath(); g.moveTo(-5, 5); g.lineTo(5, -5); g.strokePath(); }, hasGauge: false },
  { id: 'backwardRestricted', priority: 2, anchor: 'pF', color: 0xff8844, draw: prohibit(iBackArrow), hasGauge: true },

  // ─── B. Windows/Timing (priority 3) ───
  { id: 'volley',            priority: 3, anchor: 'A',  color: 0x66ff66, draw: iArrowBolt, hasGauge: true },
  { id: 'rhythmWindow',      priority: 3, anchor: 'pN', color: 0xffcc44, draw: iHourglass, hasGauge: true },
  { id: 'dashPrimeWindow',   priority: 3, anchor: 'pH', color: 0x66ccff, draw: iShockwave, hasGauge: true },
  { id: 'dashTaxWindow',     priority: 3, anchor: 'pH', color: 0xff66cc, draw: iSword, hasGauge: true },
  { id: 'flankWeaken',       priority: 3, anchor: 'fl', color: 0x44ccff, draw: iCrackedShield, hasGauge: true },
  { id: 'markKillReward',    priority: 3, anchor: 'A',  color: 0xffaa44, draw: iArrowStar, hasGauge: true },
  { id: 'executionExit',     priority: 3, anchor: 'E',  color: 0xff4444, draw: iSkull, hasGauge: true },
  { id: 'charge',            priority: 3, anchor: 'pH', color: 0xffff44, draw: iStar, hasGauge: true },

  // ─── C. Buffs (priority 6) ───
  { id: 'armySpeedBoost',    priority: 6, anchor: 'V',  color: 0x66ff66, draw: iLightning, hasGauge: true },
  { id: 'stillDmgBonus',     priority: 6, anchor: 'pN', color: 0xffcc44, draw: iSwordUp, hasGauge: false },
  { id: 'k5Stack',           priority: 6, anchor: 'pN', color: 0xffaa44, draw: iStar, hasGauge: false, stackMax: 3 },
  { id: 'stillIframes',      priority: 6, anchor: 'pH', color: 0x44aaff, draw: iShieldGlow, hasGauge: false },
  { id: 'momentumSpeed',     priority: 6, anchor: 'pH', color: 0x66ff66, draw: iLightningDouble, hasGauge: false },
  { id: 'healCounter',       priority: 6, anchor: 'pN', color: 0xff6688, draw: iHeart, hasGauge: false, stackMax: 4 },
  { id: 'squadProtectV',     priority: 6, anchor: 'V',  color: 0x44aaff, draw: iSmallShield, hasGauge: true },
  { id: 'squadProtectA',     priority: 6, anchor: 'A',  color: 0x44aaff, draw: iSmallShield, hasGauge: true },
  { id: 'squadProtectC',     priority: 6, anchor: 'C',  color: 0x44aaff, draw: iSmallShield, hasGauge: true },

  // ─── D. Debuffs/Penalties (priority 4-5) ───
  { id: 'k5SwitchPenalty',   priority: 5, anchor: 'pH', color: 0xff8844, draw: iCrackedSword, hasGauge: false },
  { id: 'commitMovePenalty', priority: 5, anchor: 'pF', color: 0xff8844, draw: iChain, hasGauge: false },
  { id: 'frontLineCollapse', priority: 4, anchor: 'V',  color: 0xff4444, draw: iBrokenBarrier, hasGauge: true },
  { id: 'momentumStillPen',  priority: 4, anchor: 'pH', color: 0xff6644, draw: prohibit(iLightning), hasGauge: false },
  { id: 'stillnessMovePen',  priority: 4, anchor: 'pH', color: 0xff6644, draw: prohibit(iSword), hasGauge: false },

  // ─── E. Focus/Target ───
  { id: 'mark',              priority: 3, anchor: 'E',  color: 0xff4444, draw: iTarget, hasGauge: true },
  { id: 'auraAnchor',        priority: 3, anchor: 'E',  color: 0x44aaff, draw: iAnchorPin, hasGauge: true },
  { id: 'reform',            priority: 1, anchor: 'fl', color: 0xffcc44, draw: iAlignArrows, hasGauge: true },
  { id: 'contract',          priority: 3, anchor: 'V',  color: 0xffcc44, draw: iDocument, hasGauge: true },
  { id: 'stillProgress',     priority: 3, anchor: 'pN', color: 0x44ccff, draw: iHourglassSmall, hasGauge: true },
];

// ═══════════════════════════════════════════════════════════════
// ANCHOR POSITION RESOLUTION
// ═══════════════════════════════════════════════════════════════

const ANCHOR_DY: Record<Anchor, number> = {
  pH: -24, pF: 16, pN: 0, V: -20, A: -20, C: -20, E: -16, bk: 0, fl: -30,
};
const ANCHOR_DX: Record<Anchor, number> = {
  pH: 0, pF: 0, pN: 24, V: 0, A: 0, C: 0, E: 0, bk: 0, fl: 0,
};

function anchorBase(a: Anchor, s: WorldRuleSnapshot): { x: number; y: number } {
  switch (a) {
    case 'pH': case 'pF': case 'pN':
      return { x: s.playerX + ANCHOR_DX[a], y: s.playerY + ANCHOR_DY[a] };
    case 'V': return { x: s.vanguardX, y: s.vanguardY + ANCHOR_DY.V };
    case 'A': return { x: s.archerX, y: s.archerY + ANCHOR_DY.A };
    case 'C': return { x: s.cavalryX, y: s.cavalryY + ANCHOR_DY.C };
    case 'E': return { x: 0, y: 0 };
    case 'bk': return { x: s.backSealX, y: s.backSealY };
    case 'fl': return { x: s.flagX, y: s.flagY + ANCHOR_DY.fl };
  }
}

// ═══════════════════════════════════════════════════════════════
// RUNTIME TOKEN STATE
// ═══════════════════════════════════════════════════════════════

interface TokenRT {
  def: TokenDef;
  icon: Phaser.GameObjects.Graphics;
  ring: Phaser.GameObjects.Graphics;
  prevActive: boolean;
  alpha: number; // current display alpha
  scale: number; // current display scale
}

// ═══════════════════════════════════════════════════════════════
// RENDERING HELPERS
// ═══════════════════════════════════════════════════════════════

function drawRing(ring: Phaser.GameObjects.Graphics, gauge: number, color: number): void {
  ring.clear();
  if (gauge <= 0) return;
  ring.lineStyle(3, color, 0.7);
  ring.beginPath();
  ring.arc(0, 0, RING_R, -HALF_PI, -HALF_PI + clamp01(gauge) * TAU, false);
  ring.strokePath();
}

function drawStacks(ring: Phaser.GameObjects.Graphics, stacks: number, max: number, color: number): void {
  ring.clear();
  const n = Math.min(stacks, max);
  if (n <= 0) return;
  const gap = 5;
  const startX = -(n - 1) * gap / 2;
  for (let i = 0; i < n; i++) {
    ring.fillStyle(color, 1);
    ring.fillCircle(startX + i * gap, 12, 2);
  }
}

// ═══════════════════════════════════════════════════════════════
// OVERFLOW DOTS
// ═══════════════════════════════════════════════════════════════

function drawOverflow(g: Phaser.GameObjects.Graphics, x: number, y: number): void {
  g.clear();
  g.fillStyle(0xaaaaaa, 0.8);
  g.fillCircle(x, y, 2);
  g.fillCircle(x + 6, y, 2);
  g.fillCircle(x + 12, y, 2);
}

// ═══════════════════════════════════════════════════════════════
// FACTORY
// ═══════════════════════════════════════════════════════════════

export function createWorldRuleTokens(scene: Phaser.Scene): WorldRuleTokens {
  // Build runtime tokens
  const rts: TokenRT[] = TOKENS.map(def => {
    const icon = scene.add.graphics().setDepth(DEPTH);
    def.draw(icon, def.color);
    icon.setVisible(false);

    const ring = scene.add.graphics().setDepth(DEPTH);
    ring.setVisible(false);

    return { def, icon, ring, prevActive: false, alpha: 0, scale: 1 };
  });

  // Lookup by id
  const byId = new Map<string, TokenRT>();
  for (const rt of rts) byId.set(rt.def.id, rt);

  // Overflow indicator (shared)
  const overflowGfx = scene.add.graphics().setDepth(DEPTH);
  overflowGfx.setVisible(false);

  return {
    update(snap: WorldRuleSnapshot): void {
      // Collect active tokens per anchor
      const anchorBuckets = new Map<Anchor, TokenRT[]>();

      for (const rt of rts) {
        const state = snap.tokens[rt.def.id];
        const active = state?.active ?? false;

        // Detect activation transitions
        if (active && !rt.prevActive) {
          rt.scale = 1.4; // pop in
          rt.alpha = 1;
        }
        if (!active && rt.prevActive) {
          rt.alpha = 0; // start fade out
        }
        rt.prevActive = active;

        // Lerp animation
        const targetScale = active ? 1.0 : 0.6;
        const targetAlpha = active ? 1.0 : 0.0;
        rt.scale += (targetScale - rt.scale) * POP_LERP;
        rt.alpha += (targetAlpha - rt.alpha) * POP_LERP;

        // Pulse for always-active tokens (no gauge, no stacks)
        if (active && !rt.def.hasGauge && !rt.def.stackMax) {
          rt.alpha = 0.7 + 0.3 * Math.sin(snap.now / PULSE_PERIOD * TAU);
        }

        if (rt.alpha < 0.02) {
          rt.icon.setVisible(false);
          rt.ring.setVisible(false);
          rt.ring.clear();
          continue;
        }

        if (active) {
          const bucket = anchorBuckets.get(rt.def.anchor) ?? [];
          bucket.push(rt);
          anchorBuckets.set(rt.def.anchor, bucket);
        } else {
          rt.icon.setVisible(false);
          rt.ring.setVisible(false);
          rt.ring.clear();
        }
      }

      // Layout per anchor
      let showOverflow = false;
      let overflowX = 0, overflowY = 0;

      for (const [anchor, bucket] of anchorBuckets) {
        // Sort by priority (lower = more important = show first)
        bucket.sort((a, b) => a.def.priority - b.def.priority);

        const base = anchorBase(anchor, snap);
        const visible = bucket.slice(0, MAX_VISIBLE);
        const overflow = bucket.length > MAX_VISIBLE;

        if (overflow) {
          // Only show MAX_VISIBLE - 1 tokens + overflow dots
          visible.length = MAX_VISIBLE - 1;
        }

        // Hide overflow tokens
        for (let i = visible.length; i < bucket.length; i++) {
          bucket[i].icon.setVisible(false);
          bucket[i].ring.setVisible(false);
          bucket[i].ring.clear();
        }

        // Position visible tokens horizontally centered
        const totalW = (visible.length - 1) * SPACING;
        const startX = base.x - totalW / 2;

        for (let i = 0; i < visible.length; i++) {
          const rt = visible[i];
          const state = snap.tokens[rt.def.id]!;

          // Position — enemy-attached tokens use override
          let tx: number, ty: number;
          if (rt.def.anchor === 'E' && state.x != null && state.y != null) {
            tx = state.x;
            ty = state.y + ANCHOR_DY.E;
          } else {
            tx = startX + i * SPACING;
            ty = base.y;
          }

          rt.icon.setVisible(true);
          rt.icon.setPosition(tx, ty);
          rt.icon.setScale(rt.scale);
          rt.icon.setAlpha(rt.alpha);

          // Gauge ring or stack dots
          if (rt.def.stackMax && state.stacks != null && state.stacks > 0) {
            drawStacks(rt.ring, state.stacks, rt.def.stackMax, rt.def.color);
            rt.ring.setVisible(true);
            rt.ring.setPosition(tx, ty);
            rt.ring.setAlpha(rt.alpha);
          } else if (rt.def.hasGauge && state.gauge != null && state.gauge > 0) {
            drawRing(rt.ring, state.gauge, rt.def.color);
            rt.ring.setVisible(true);
            rt.ring.setPosition(tx, ty);
            rt.ring.setAlpha(rt.alpha);
          } else {
            rt.ring.setVisible(false);
            rt.ring.clear();
          }
        }

        // Overflow dots
        if (overflow) {
          showOverflow = true;
          overflowX = startX + visible.length * SPACING;
          overflowY = base.y;
        }
      }

      if (showOverflow) {
        overflowGfx.setVisible(true);
        drawOverflow(overflowGfx, overflowX, overflowY);
      } else {
        overflowGfx.setVisible(false);
        overflowGfx.clear();
      }
    },

    destroy(): void {
      for (const rt of rts) {
        rt.icon.destroy();
        rt.ring.destroy();
      }
      overflowGfx.destroy();
    },
  };
}
