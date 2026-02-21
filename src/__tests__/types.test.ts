import { describe, it, expect } from 'vitest';
import { GameMode } from '../types';
import type { BuildConfig, Zone, Tag, KeystoneId, SkillId, SupportId, ItemId, SquadType, ClusterId, NodeId, NodeType } from '../types';

describe('GameMode', () => {
  it('defaults to core=true, repeat=false', () => {
    expect(GameMode.core).toBe(true);
    expect(GameMode.repeat).toBe(false);
  });

  it('is mutable', () => {
    const original = { core: GameMode.core, repeat: GameMode.repeat };
    GameMode.core = false;
    GameMode.repeat = true;
    expect(GameMode.core).toBe(false);
    expect(GameMode.repeat).toBe(true);
    // restore
    GameMode.core = original.core;
    GameMode.repeat = original.repeat;
  });
});

describe('type shapes', () => {
  it('BuildConfig has correct shape', () => {
    const build: BuildConfig = {
      keystone: 'closePact',
      skill: 'slash',
      supports: ['dashPrime', 'markStack'],
      item: 'bloodOath',
      clusters: [],
      nodes: [],
    };
    expect(build.keystone).toBe('closePact');
    expect(build.supports).toHaveLength(2);
    expect(build.clusters).toHaveLength(0);
  });

  it('BuildConfig with clusters and nodes', () => {
    const build: BuildConfig = {
      keystone: 'closePact',
      skill: 'slash',
      supports: ['dashPrime', 'markStack'],
      item: 'bloodOath',
      clusters: ['A', 'B'],
      nodes: ['A1', 'A2', 'B1'],
    };
    expect(build.clusters).toHaveLength(2);
    expect(build.nodes).toHaveLength(3);
  });

  it('Zone has correct fields', () => {
    const zone: Zone = { x: 100, y: 200, radius: 80, expiresAt: 5000 };
    expect(zone.x).toBe(100);
    expect(zone.radius).toBe(80);
  });
});

describe('tag values', () => {
  it('Tag type accepts valid values', () => {
    const tags: Tag[] = ['close', 'far', 'move', 'still', 'dash', 'mark', 'zone', 'rhythm',
      'commit', 'sustain', 'execute', 'control', 'burst', 'kite',
      'melee', 'attack', 'aoe', 'line', 'charge', 'movement',
      'prime', 'timing', 'priority', 'counter', 'risk', 'posture',
      'tank', 'tradeoff'];
    expect(tags).toHaveLength(28);
  });
});

describe('id types', () => {
  it('KeystoneId accepts all 6', () => {
    const ids: KeystoneId[] = ['closePact', 'kitingVow', 'stillnessStance', 'momentumMode', 'singleTargetOath', 'fragilePower'];
    expect(ids).toHaveLength(6);
  });

  it('SkillId accepts all 6', () => {
    const ids: SkillId[] = ['slash', 'lunge', 'cleave', 'thrust', 'guardBreak', 'orbitCut'];
    expect(ids).toHaveLength(6);
  });

  it('SupportId accepts all 10', () => {
    const ids: SupportId[] = ['dashPrime', 'markStack', 'zoneAnchor', 'rhythmWindow', 'finisherRule', 'bufferHunter', 'dashTax', 'closeShock', 'farSnare', 'commitmentLock'];
    expect(ids).toHaveLength(10);
  });

  it('ItemId accepts all 8', () => {
    const ids: ItemId[] = ['bloodOath', 'ironSkin', 'sprintBoots', 'heavyBlade', 'calmMind', 'hunterCharm', 'antiDashPlate', 'zoneCore'];
    expect(ids).toHaveLength(8);
  });

  it('SquadType accepts all 3', () => {
    const types: SquadType[] = ['vanguard', 'archer', 'cavalry'];
    expect(types).toHaveLength(3);
  });

  it('ClusterId accepts all 6', () => {
    const ids: ClusterId[] = ['A', 'B', 'C', 'D', 'E', 'F'];
    expect(ids).toHaveLength(6);
  });

  it('NodeId accepts 36 values', () => {
    const ids: NodeId[] = [
      'A1','A2','A3','A4','A5','A6',
      'B1','B2','B3','B4','B5','B6',
      'C1','C2','C3','C4','C5','C6',
      'D1','D2','D3','D4','D5','D6',
      'E1','E2','E3','E4','E5','E6',
      'F1','F2','F3','F4','F5','F6',
    ];
    expect(ids).toHaveLength(36);
  });

  it('NodeType accepts ban/convert/rule', () => {
    const types: NodeType[] = ['ban', 'convert', 'rule'];
    expect(types).toHaveLength(3);
  });
});
