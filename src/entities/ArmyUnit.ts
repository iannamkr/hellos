import Phaser from 'phaser';
import type { SquadType } from '../types';
import { COLOR } from '../colors';

export type UnitState = 'FORMING' | 'HOLD' | 'ENGAGE';

export const SQUAD_CFG = {
  vanguard: { atkRange: 50, atkCD: 650, dmg: 1, speed: 200, engageRadius: 170, returnRadius: 220, unitHp: 2 },
  archer:   { atkRange: 420, atkCD: 900, dmg: 1, speed: 150, engageRadius: 120, returnRadius: 160, unitHp: 1 },
  cavalry:  { atkRange: 65, atkCD: 775, dmg: 1, speed: 300, engageRadius: 160, returnRadius: 210, unitHp: 2 },
} as const;

export class ArmyUnit extends Phaser.Physics.Arcade.Image {
  squadType: SquadType;
  atkRange: number;
  atkCD: number;
  dmg: number;
  unitSpeed: number;
  nextAtk = 0;

  // Individual HP
  hp: number;
  maxHp: number;

  // State (set by GameScene each frame)
  state: UnitState = 'FORMING';

  // Slot position (computed by GameScene each frame)
  slotX = 0;
  slotY = 0;

  // Leash radii (safety: engage always < return)
  engageRadius: number;
  returnRadius: number;

  // Target lock (vanguard body-block: 0.8s lock)
  lockedTarget: Phaser.GameObjects.GameObject | null = null;
  targetLockUntil = 0;

  // Returning to slot
  isReturning = false;

  // Cavalry gap-cover state machine
  cavPhase: 'seek_gap' | 'intercept' | 'disrupt' | 'egress' = 'seek_gap';
  cavPhaseTimer = 0;
  cavGapIdx = 2;          // 현재 커버 중인 gap 인덱스
  cavTargetX = 0;         // 현재 이동 목표
  cavTargetY = 0;
  cavLastGapCalc = 0;     // 마지막 gap 재계산 시각 (200ms 주기 제한)
  cavDisruptHits = 0;     // disrupt 중 타격 횟수 (최대 2)
  stableId = '';            // deterministic ID for load-balancing offset
  cavGapLockUntil = 0;    // gap 변경 최소 유지시간 락
  cavGapScore = Infinity;  // 현재 gap 점수(비교용)
  cavSeenTargetSince = 0;  // intercept 진입 연속 감지 (0=미추적)
  coverX = 0;              // gap 커버 중심 (오프셋 없음)
  coverY = 0;
  guardThreatSince = 0;    // 위협 연속 감지 시작 시각 (0 = 미추적)

  constructor(scene: Phaser.Scene, x: number, y: number, type: SquadType) {
    const tex = type === 'vanguard' ? 'unit_vanguard' : type === 'archer' ? 'unit_archer' : 'unit_cavalry';
    super(scene, x, y, tex);
    scene.add.existing(this);
    scene.physics.add.existing(this);

    const cfg = SQUAD_CFG[type];
    this.squadType = type;
    this.atkRange = cfg.atkRange;
    this.atkCD = cfg.atkCD;
    this.dmg = cfg.dmg;
    this.unitSpeed = cfg.speed;
    this.hp = cfg.unitHp;
    this.maxHp = cfg.unitHp;
    // Safety: engageRadius must always be < returnRadius
    this.engageRadius = Math.min(cfg.engageRadius, cfg.returnRadius);
    this.returnRadius = Math.max(cfg.engageRadius, cfg.returnRadius);
    this.setDepth(4);
    this.setCollideWorldBounds(true);
    this.setTint(COLOR[type]);
  }
}
