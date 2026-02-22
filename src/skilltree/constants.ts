import type { NodeDef, NodeState } from './types';

// ── Layout ──────────────────────────────────────────────────────
export const SCREEN_H = 1080;
export const LEFT_W = 560;
export const CENTER_W = 880;
export const RIGHT_W = 480;
export const CENTER_X = LEFT_W;
export const RIGHT_X = LEFT_W + CENTER_W;

// ── Cards ──
export const CARD_PAD = 16;
export const CARD_GAP = 12;
export const CARD_COLS = 2;
export const CARD_W = Math.floor((CENTER_W - CARD_PAD * 2 - CARD_GAP) / CARD_COLS);
export const CARD_H = 170;
export const FILTER_H = 88;
export const PCARD_H = 95;
export const MAX_VISIBLE = 10;
export const MAX_UTILITY = 4;

// ── Tree (map overlay) ──
export const WORLD = 4000;
export const HALF = WORLD / 2;
export const ZOOM_MIN = 0.25;
export const ZOOM_MAX = 1.6;
export const DEFAULT_SP = 50;
export const DEFAULT_SEED = 42;

export const RCOL: Record<string, number> = {
  HUB: 0xaaaaaa, R1: 0x4488cc, R2: 0xcc8844, R3: 0x44cc88, R4: 0xcc4444,
  R5: 0x8844cc, R6: 0xcccc44, R7: 0x44cccc, R8: 0xcc44cc, BRIDGE: 0x777777,
};
export const CARD_BG: Record<string, number> = {
  HUB: 0x161620, R1: 0x101820, R2: 0x201810, R3: 0x102018, R4: 0x201010,
  R5: 0x181020, R6: 0x202010, R7: 0x102020, R8: 0x201020, BRIDGE: 0x161616,
};

export function nRad(tier: string): number {
  return tier === 'START' ? 18 : tier === 'STANCE' ? 16 : tier === 'KEYSTONE' ? 16 : tier === 'MAJOR' ? 13 : 7;
}
export const TIER_PRI: Record<string, number> = { STANCE: 4, KEYSTONE: 3, MAJOR: 2, MINOR: 0, START: -1 };
export const REGIONS = ['R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7', 'R8'];

export type CardEntry = { id: string; def: NodeDef; state: NodeState; cost: number; score: number; isNew: boolean };
