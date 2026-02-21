import type { BalanceData, SquadType, EnemyType, UnitStats, EnemyStats, CommanderStats, GameConfig } from '../../../shared/balance/schema';
import { DEFAULT_BALANCE } from '../../../shared/balance/defaults';
import { loadBalance, saveBalanceToApi, exportBalanceToJson, importBalanceFromJson } from '../../../shared/balance/storage';
import { summarize } from '../../../shared/balance/calc';
import { SimPreview } from './SimPreview';

const SQUAD_TYPES: SquadType[] = ['vanguard', 'archer', 'cavalry'];
const ENEMY_TYPES: EnemyType[] = ['chaser', 'dasher', 'buffer'];

type FieldDef<T> = Array<{ key: keyof T & string; label: string; tip: string }>;

const COMMANDER_FIELDS: FieldDef<CommanderStats> = [
  { key: 'maxHp', label: 'Max HP', tip: '최대 체력' },
  { key: 'speed', label: 'Speed', tip: '이동 속도' },
  { key: 'atkCD', label: 'Atk CD (ms)', tip: '공격 쿨다운' },
  { key: 'dashCD', label: 'Dash CD (ms)', tip: '대시 쿨다운' },
  { key: 'dashDuration', label: 'Dash Duration (ms)', tip: '대시 지속 시간' },
  { key: 'dashSpeed', label: 'Dash Speed', tip: '대시 속도' },
  { key: 'iframes', label: 'I-Frames (ms)', tip: '무적 지속 시간' },
  { key: 'reformCD', label: 'Reform CD (ms)', tip: '재편성 쿨다운' },
  { key: 'reformThreshold', label: 'Reform Hold (ms)', tip: '재편성 발동 홀드 시간' },
];

const COMMANDER_REFORM_FIELDS: FieldDef<CommanderStats> = [
  { key: 'reformSpeedMult', label: 'Reform Speed x', tip: '재편성 이동 속도 배율' },
  { key: 'reformArriveRadius', label: 'Arrive Radius', tip: '슬롯 도착 판정 반경' },
  { key: 'reformBrakeRadius', label: 'Brake Radius', tip: '감속 시작 반경' },
  { key: 'reformStaggerInterval', label: 'Stagger (ms/unit)', tip: '유닛별 재편성 시차' },
  { key: 'reformDuration', label: 'Duration (ms)', tip: '재편성 지속 시간' },
];

const COMMANDER_DIRECTION_FIELDS: FieldDef<CommanderStats> = [
  { key: 'commitAngle', label: 'Commit Angle (°)', tip: '방향 전환 임계 각도' },
  { key: 'commitSpeedThreshold', label: 'Speed Threshold', tip: '방향 갱신 최소 속도' },
  { key: 'commitHoldTime', label: 'Hold Time (ms)', tip: '방향 전환 유지 시간' },
  { key: 'commitSlerpFactor', label: 'Slerp Factor', tip: '방향 보간 계수 (0~1)' },
  { key: 'commitCooldown', label: 'Cooldown (ms)', tip: '방향 전환 후 쿨다운' },
];

const COMMANDER_CHARGE_FIELDS: FieldDef<CommanderStats> = [
  { key: 'chargeDuration', label: 'Charge Duration (ms)', tip: '차지 완충 시간' },
  { key: 'chargeRingStart', label: 'Ring Start (px)', tip: '차지 링 시작 반경' },
  { key: 'chargeRingMax', label: 'Ring Max (px)', tip: '차지 링 최대 반경' },
  { key: 'chargeDamageMult', label: 'Damage Mult', tip: '차지 완충 시 데미지 배율' },
];

const UNIT_FIELDS: FieldDef<UnitStats> = [
  { key: 'maxHp', label: 'Max HP', tip: '최대 체력' },
  { key: 'dmg', label: 'Damage', tip: '공격력' },
  { key: 'atkCD', label: 'Atk CD (ms)', tip: '공격 쿨다운' },
  { key: 'unitSpeed', label: 'Speed', tip: '이동 속도' },
  { key: 'range', label: 'Range', tip: '공격 사거리' },
  { key: 'engageRadius', label: 'Engage Radius', tip: '교전 반경 (이 안에 적이 오면 공격)' },
  { key: 'returnRadius', label: 'Return Radius', tip: '복귀 반경 (이 밖으로 나가면 슬롯 복귀)' },
];

const VANGUARD_FIELDS: FieldDef<UnitStats> = [
  { key: 'lineDepth', label: 'Line Depth', tip: '전선 깊이 (FLAG에서 전선까지 거리)' },
  { key: 'holdIn', label: 'Hold In (px)', tip: 'HOLD 진입 거리 (슬롯 근접 시 감속 시작)' },
  { key: 'holdOut', label: 'Hold Out (px)', tip: 'HOLD 탈출 거리 (이 이상이면 정상 속도)' },
  { key: 'vanguardGapNormal', label: 'Gap Normal', tip: '이동 시 슬롯 간격' },
  { key: 'vanguardGapStill', label: 'Gap Still (E2)', tip: '정지 시 슬롯 간격 (E2 노드)' },
  { key: 'holdSpeedMult', label: 'Hold Speed x', tip: 'HOLD 상태 속도 배율' },
  { key: 'targetLockMs', label: 'Target Lock (ms)', tip: '타겟 고정 유지 시간' },
];

const ARCHER_FIELDS: FieldDef<UnitStats> = [
  { key: 'rank0Depth', label: 'Rank 0 Depth', tip: '1열 깊이 (앵커 뒤 거리)' },
  { key: 'rank1Depth', label: 'Rank 1 Depth', tip: '2열 깊이 (앵커 뒤 거리)' },
  { key: 'slotGap', label: 'Slot Gap', tip: '슬롯 간격' },
  { key: 'maxSpread', label: 'Max Spread', tip: '최대 횡 전개 폭' },
  { key: 'deadZone', label: 'Dead Zone', tip: '사격 금지 구역 (리더 기준)' },
  { key: 'retreatSpeedMult', label: 'Retreat Speed x', tip: 'A4 후퇴 시 속도 배율' },
  { key: 'normalSpeedMult', label: 'Normal Speed x', tip: '일반 이동 속도 배율' },
];

const CAVALRY_FORMATION_FIELDS: FieldDef<UnitStats> = [
  { key: 'gapSpacing', label: 'Gap Spacing', tip: 'Gap 샘플 포인트 간격 (px)' },
  { key: 'gapOffset', label: 'Gap Offset', tip: '전선 뒤 오프셋 (음수 = 뒤)' },
  { key: 'gapCalcInterval', label: 'Gap Calc (ms)', tip: 'Gap 재계산 쓰로틀 주기' },
  { key: 'seekInterceptDist', label: 'Seek→Intercept (px)', tip: 'Gap 접근 시 요격 전환 거리' },
  { key: 'interceptLerp', label: 'Intercept Lerp', tip: '요격 지점 보간 계수 (0=gap, 1=적)' },
  { key: 'egressDepth', label: 'Egress Depth', tip: '복귀 지점 깊이 (전선 뒤 거리)' },
  { key: 'gapScanRadius', label: 'Gap Scan Radius', tip: 'Vanguard 밀도 스캔 반경' },
  { key: 'gapTargetRadius', label: 'Gap Target Radius', tip: '빈틈 주변 적 탐색 반경' },
];

const CAVALRY_STATE_FIELDS: FieldDef<UnitStats> = [
  { key: 'interceptTimeout', label: 'Intercept Timeout (ms)', tip: '요격 최대 시간 → DISRUPT 전환' },
  { key: 'interceptSpeedMult', label: 'Intercept Speed x', tip: '요격 시 속도 배율' },
  { key: 'cavDisruptDuration', label: 'Disrupt Duration (ms)', tip: '차단 지속 시간' },
  { key: 'cavDisruptMaxHits', label: 'Disrupt Max Hits', tip: '차단 중 최대 타격 횟수' },
  { key: 'cavEgressDuration', label: 'Egress Duration (ms)', tip: '복귀 지속 시간' },
  { key: 'maxConcurrentIntercepts', label: 'Max Intercepts', tip: '동시 요격/차단 최대 수' },
];

const ENEMY_BASE_FIELDS: FieldDef<EnemyStats> = [
  { key: 'maxHp', label: 'Max HP', tip: '최대 체력' },
  { key: 'touchDmg', label: 'Touch Dmg', tip: '접촉 피해' },
  { key: 'speed', label: 'Speed', tip: '이동 속도' },
  { key: 'speedRange', label: 'Speed Range', tip: '속도 변동 범위 (0~speedRange 랜덤 추가)' },
];

const CHASER_FIELDS: FieldDef<EnemyStats> = [
  { key: 'lineHoldDist', label: 'Line Hold Dist', tip: '전열 유지 거리 (깃발 기준)' },
  { key: 'cohesionRadius', label: 'Cohesion Radius', tip: '결속 반경 (동료 추종 범위)' },
  { key: 'slotSpacing', label: 'Slot Spacing', tip: '전열 슬롯 간격' },
  { key: 'lineHoldSpeedMult', label: 'Line Hold Speed x', tip: '전열 유지 시 속도 배율' },
];

const DASHER_FIELDS: FieldDef<EnemyStats> = [
  { key: 'patrolDuration', label: 'Patrol Duration (ms)', tip: '순찰 지속 시간 → 돌진 준비 전환' },
  { key: 'dashWindup', label: 'Dash Windup (ms)', tip: '돌진 준비 시간 (텔레그래프)' },
  { key: 'dashSpeed', label: 'Dash Speed', tip: '돌진 속도' },
  { key: 'dashDuration', label: 'Dash Duration (ms)', tip: '돌진 지속 시간' },
  { key: 'flashInterval', label: 'Flash Interval (ms)', tip: '준비 중 깜빡임 주기' },
  { key: 'telegraphLength', label: 'Telegraph Length (px)', tip: '텔레그래프 라인 길이' },
  { key: 'cooldownDuration', label: 'Cooldown (ms)', tip: '돌진 후 쿨다운' },
  { key: 'penetrationDist', label: 'Penetration Dist', tip: '침투 거리' },
  { key: 'disruptDuration', label: 'Disrupt Duration (ms)', tip: '붕괴 지속 시간 (정지+넉백)' },
  { key: 'egressDuration', label: 'Egress Duration (ms)', tip: '이탈 지속 시간' },
  { key: 'egressSpeed', label: 'Egress Speed', tip: '이탈 속도' },
];

const BUFFER_FIELDS: FieldDef<EnemyStats> = [
  { key: 'auraRadius', label: 'Aura Radius', tip: '오라 반경' },
  { key: 'auraSpeedBoost', label: 'Aura Speed x', tip: '오라 속도 증폭 배율' },
];

const GAME_SPAWN_FIELDS: FieldDef<GameConfig> = [
  { key: 'platoonSpawnInterval', label: 'Spawn Interval (ms)', tip: '소대 생성 주기' },
  { key: 'platoonSizeChaser', label: 'Platoon: Chaser', tip: '추격병 소대 인원 수' },
  { key: 'platoonSizeDasher', label: 'Platoon: Dasher', tip: '돌진병 소대 인원 수' },
  { key: 'platoonSizeBuffer', label: 'Platoon: Buffer', tip: '버퍼 소대 인원 수' },
  { key: 'volleyCycle', label: 'Volley Cycle (ms)', tip: '일제 사격 주기' },
  { key: 'volleyWindow', label: 'Volley Window (ms)', tip: '일제 사격 창 (발사 가능 구간)' },
  { key: 'commandAuraRadius', label: 'Cmd Aura Radius', tip: '지휘 오라 반경' },
];

const GAME_ARMY_FIELDS: FieldDef<GameConfig> = [
  { key: 'squadSizeVanguard', label: 'Vanguard Count', tip: '선봉 초기 인원' },
  { key: 'squadSizeArcher', label: 'Archer Count', tip: '궁병 초기 인원' },
  { key: 'squadSizeCavalry', label: 'Cavalry Count', tip: '기병 초기 인원' },
];

const GAME_SEPARATION_FIELDS: FieldDef<GameConfig> = [
  { key: 'separationDist', label: 'Sep. Distance (px)', tip: '유닛 간 반발 거리' },
  { key: 'separationForce', label: 'Sep. Force', tip: '유닛 간 반발력' },
  { key: 'formingExitDist', label: 'Forming Exit (px)', tip: 'FORMING 상태 탈출 거리' },
];

const GAME_ANCHOR_FIELDS: FieldDef<GameConfig> = [
  { key: 'anchorDecayVanguard', label: 'Anchor: Vanguard', tip: '선봉 앵커 추적 속도' },
  { key: 'anchorDecayArcher', label: 'Anchor: Archer', tip: '궁병 앵커 추적 속도' },
  { key: 'anchorDecayCavalry', label: 'Anchor: Cavalry', tip: '기병 앵커 추적 속도' },
];

const GAME_FLAG_FIELDS: FieldDef<GameConfig> = [
  { key: 'flagPenetrationRadius', label: 'Pen. Radius (px)', tip: 'FLAG 침투 판정 반경' },
  { key: 'flagPenetrationThreshold', label: 'Pen. Threshold (s)', tip: 'FLAG 침투 누적 시간 → 궁병 피해' },
];

const GAME_CAMERA_FIELDS: FieldDef<GameConfig> = [
  { key: 'cameraZoomProximity', label: 'Proximity (px)', tip: '줌 트리거 거리 (FLAG 기준)' },
  { key: 'cameraZoomEnemyCount', label: 'Enemy Count', tip: '줌 트리거 적 수' },
  { key: 'cameraZoomIn', label: 'Zoom In', tip: '줌인 배율' },
  { key: 'cameraZoomNormal', label: 'Zoom Normal', tip: '기본 줌 배율' },
  { key: 'cameraZoomEase', label: 'Ease Rate', tip: '줌 이징 속도' },
];

const GAME_ENCOUNTER_FIELDS: FieldDef<GameConfig> = [
  { key: 'encounterStartSec', label: 'Start (s)', tip: '이벤트 시작 시간 (코어 모드)' },
  { key: 'encounterEndSec', label: 'End (s)', tip: '이벤트 종료 시간' },
  { key: 'encounterEarlyExitSec', label: 'Early Exit (s)', tip: '조기 종료 가능 시간' },
];

const GAME_ZONE_FIELDS: FieldDef<GameConfig> = [
  { key: 'zoneRadius', label: 'Zone Radius (px)', tip: '존 반경' },
  { key: 'markExplosionRadius', label: 'Mark Explosion (px)', tip: '마크 폭발 반경' },
];

const GAME_CAP_FIELDS: FieldDef<GameConfig> = [
  { key: 'minAttackCD', label: 'Min Atk CD (ms)', tip: '공격 쿨다운 하한' },
  { key: 'minDashCD', label: 'Min Dash CD (ms)', tip: '대시 쿨다운 하한' },
  { key: 'armySpeedBoostMult', label: 'Army Boost x', tip: '군대 속도 부스트 배율' },
];

// ─── Modifier field definitions ─────────────────────────────────

type ModCategory = 'items' | 'supports' | 'keystones' | 'nodes';

interface ModFieldDef {
  key: string;
  label: string;
  tip: string;
  step?: string;
}

const MODIFIER_FIELDS: Record<ModCategory, Record<string, ModFieldDef[]>> = {
  items: {
    heavyBlade: [
      { key: 'atkCdBonus', label: 'Atk CD Bonus', tip: '공격 쿨다운 증가량' },
      { key: 'knockForce', label: 'Knock Force', tip: '넉백 힘' },
      { key: 'knockDur', label: 'Knock Duration', tip: '넉백 지속 시간' },
    ],
    calmMind: [
      { key: 'atkCdReduction', label: 'Atk CD Reduction', tip: '공격 쿨다운 감소량' },
      { key: 'dashCdBonus', label: 'Dash CD Bonus', tip: '대시 쿨다운 증가량' },
      { key: 'atkCdMult', label: 'Unit Atk CD x', tip: '군대 공격 쿨다운 배율', step: '0.01' },
    ],
    sprintBoots: [
      { key: 'speedMult', label: 'Speed Mult', tip: '이동 속도 배율', step: '0.01' },
      { key: 'dashCdReduction', label: 'Dash CD Reduction', tip: '대시 쿨다운 감소량' },
      { key: 'hpPenalty', label: 'HP Penalty', tip: 'HP 감소량' },
    ],
    ironSkin: [
      { key: 'speedMult', label: 'Speed Mult', tip: '이동 속도 배율', step: '0.01' },
    ],
    antiDashPlate: [
      { key: 'iframes', label: 'I-Frames (ms)', tip: '무적 지속 시간' },
    ],
    zoneCore: [
      { key: 'durationMult', label: 'Duration Mult', tip: '존 지속 시간 배율', step: '0.01' },
      { key: 'atkCdBonusOut', label: 'Atk CD Out', tip: '존 밖 공격 쿨다운 증가' },
      { key: 'dashCdReductionIn', label: 'Dash CD In', tip: '존 안 대시 쿨다운 감소' },
    ],
    hunterCharm: [
      { key: 'slowFactor', label: 'Slow Factor', tip: '감속 비율', step: '0.01' },
      { key: 'slowDur', label: 'Slow Duration', tip: '감속 지속 시간' },
    ],
    bloodOath: [
      { key: 'restoreKills', label: 'Restore Kills', tip: '유닛 복원 필요 킬 수' },
    ],
    fragilePower: [
      { key: 'hpPenalty', label: 'HP Penalty', tip: '지휘관 HP 감소' },
      { key: 'unitHpPenalty', label: 'Unit HP Penalty', tip: '군대 유닛 HP 감소' },
      { key: 'extraDashIframes', label: 'Extra Dash i-Frames', tip: '대시 추가 무적 시간' },
    ],
  },
  supports: {
    closeShock: [
      { key: 'atkCdBonus', label: 'Atk CD Bonus', tip: '공격 쿨다운 증가' },
      { key: 'freezeDur', label: 'Freeze (ms)', tip: '지휘관 공격 동결 시간' },
      { key: 'unitFreezeDur', label: 'Unit Freeze (ms)', tip: '선봉 공격 동결 시간' },
    ],
    zoneAnchor: [
      { key: 'atkReduction', label: 'Atk Reduction', tip: '존 안 공격CD 감소 비율', step: '0.01' },
      { key: 'atkIncrease', label: 'Atk Increase', tip: '존 밖 공격CD 증가 비율', step: '0.01' },
      { key: 'duration', label: 'Duration (ms)', tip: '존 지속 시간' },
    ],
    dashPrime: [
      { key: 'knockForce', label: 'Knock Force', tip: '넉백 힘' },
      { key: 'knockDur', label: 'Knock Duration', tip: '넉백 지속 시간' },
      { key: 'window', label: 'Window (ms)', tip: '대시 프라임 창' },
      { key: 'armyBoostDur', label: 'Army Boost (ms)', tip: '군대 속도 부스트 지속' },
    ],
    dashTax: [
      { key: 'buffDur', label: 'Buff Duration (ms)', tip: '대시 후 공격 버프 지속' },
    ],
    farSnare: [
      { key: 'slowFactor', label: 'Slow Factor', tip: '감속 비율 (지휘관)', step: '0.01' },
      { key: 'slowDur', label: 'Slow Duration', tip: '감속 지속 (지휘관)' },
      { key: 'unitSlowFactor', label: 'Unit Slow Factor', tip: '감속 비율 (궁병)', step: '0.01' },
      { key: 'unitSlowDur', label: 'Unit Slow Dur', tip: '감속 지속 (궁병)' },
    ],
    rhythmWindow: [
      { key: 'cycleDur', label: 'Cycle (ms)', tip: '리듬 사이클 길이' },
      { key: 'powerStart', label: 'Power Start (ms)', tip: '파워 윈도우 시작 시점' },
    ],
  },
  keystones: {
    closePact: [
      { key: 'auraRadiusMult', label: 'Aura Radius x', tip: '오라 반경 배율', step: '0.01' },
    ],
    momentumMode: [
      { key: 'movingMult', label: 'Moving Mult', tip: '이동 시 군대 속도 배율', step: '0.01' },
      { key: 'stillMult', label: 'Still Mult', tip: '정지 시 군대 속도 배율', step: '0.01' },
      { key: 'dasherWindupMult', label: 'Dasher Windup x', tip: '대셔 준비 시간 배율', step: '0.01' },
    ],
    stillnessStance: [
      { key: 'anchorLinger', label: 'Anchor Linger (ms)', tip: '정지 앵커 잔류 시간' },
    ],
    kitingVow: [
      { key: 'closeAtkCdMult', label: 'Close Atk CD x', tip: '근접 공격 쿨다운 배율', step: '0.01' },
      { key: 'farDashCdMult', label: 'Far Dash CD x', tip: '원거리 대시 쿨다운 배율', step: '0.01' },
      { key: 'minDistToMark', label: 'Min Dist to Mark', tip: '궁병 사격 최소 거리' },
    ],
  },
  nodes: {
    A5: [
      { key: 'slowFactor', label: 'Slow Factor', tip: '첫 타 감속 비율', step: '0.01' },
      { key: 'slowDur', label: 'Slow Duration', tip: '첫 타 감속 지속' },
    ],
    B5: [
      { key: 'pullDist', label: 'Pull Dist', tip: '당김 거리' },
      { key: 'pullForce', label: 'Pull Force', tip: '당김 힘' },
      { key: 'pullDur', label: 'Pull Duration', tip: '당김 지속 시간' },
    ],
    D4: [
      { key: 'buffDur', label: 'Buff Duration (ms)', tip: '마크 처치 후 버프 지속' },
    ],
    F3: [
      { key: 'commitAngle', label: 'Commit Angle (°)', tip: '방향 전환 각도 (노드 적용)' },
      { key: 'cooldown', label: 'Cooldown (ms)', tip: '방향 전환 쿨다운 (노드 적용)' },
    ],
  },
};

const MOD_CATEGORY_LABELS: Record<ModCategory, string> = {
  items: 'Items',
  supports: 'Supports',
  keystones: 'Keystones',
  nodes: 'Nodes',
};

type Tab = 'commander' | 'units' | 'enemies' | 'game' | 'modifiers';

export class SimApp {
  private root: HTMLElement;
  private balance: BalanceData;
  private tab: Tab = 'commander';
  private selectedUnit: SquadType = 'vanguard';
  private selectedEnemy: EnemyType = 'chaser';
  private selectedModCategory: ModCategory = 'items';
  private selectedModId = 'heavyBlade';
  private errorMsg = '';
  private dirty = false;
  private preview!: SimPreview;
  private previewContainer!: HTMLElement;

  constructor(root: HTMLElement) {
    this.root = root;
    this.balance = loadBalance();
    this.previewContainer = document.createElement('div');
    this.previewContainer.className = 'preview';
    this.injectStyles();
    this.render();
    this.preview = new SimPreview(this.previewContainer, this.balance);
  }

  private injectStyles(): void {
    const style = document.createElement('style');
    style.textContent = `
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { background: #1a1a2e; color: #e0e0e0; font-family: 'Segoe UI', system-ui, sans-serif; font-size: 14px; }
      #app { display: flex; flex-direction: column; height: 100vh; padding: 12px; gap: 12px; }
      .header { display: flex; align-items: center; gap: 12px; flex-shrink: 0; }
      .header h1 { font-size: 18px; color: #ffaa00; }
      .header button { padding: 6px 16px; border: 1px solid #555; background: #2a2a4a; color: #e0e0e0; border-radius: 4px; cursor: pointer; font-size: 13px; }
      .header button:hover { background: #3a3a5a; }
      .header button.primary { background: #2a6a2a; border-color: #4a4; color: #fff; font-weight: bold; }
      .header button.primary:hover { background: #3a8a3a; }
      .header button.primary.dirty { background: #4a8a2a; box-shadow: 0 0 8px #4a4; }
      .header button.danger { border-color: #a44; color: #f88; }
      .header .save-status { font-size: 12px; color: #8a8; }
      .main { display: flex; flex: 1; gap: 12px; min-height: 0; }
      .sidebar { width: 180px; flex-shrink: 0; display: flex; flex-direction: column; gap: 4px; overflow-y: auto; }
      .tab-bar { display: flex; gap: 2px; margin-bottom: 8px; flex-wrap: wrap; }
      .tab-bar button { flex: 1; padding: 6px 4px; border: 1px solid #444; background: #2a2a4a; color: #aaa; cursor: pointer; border-radius: 4px 4px 0 0; font-size: 12px; min-width: 0; }
      .tab-bar button.active { background: #3a3a6a; color: #fff; border-bottom-color: #3a3a6a; }
      .list-item { padding: 8px 12px; border: 1px solid #333; border-radius: 4px; cursor: pointer; font-size: 13px; text-transform: capitalize; }
      .list-item:hover { background: #2a2a4a; }
      .list-item.active { background: #3a3a6a; border-color: #ffaa00; color: #ffaa00; }
      .sub-header { font-size: 11px; color: #666; margin: 8px 0 4px; text-transform: uppercase; letter-spacing: 1px; }
      .editor { flex: 1; background: #22223a; border: 1px solid #333; border-radius: 6px; padding: 16px; overflow-y: auto; }
      .editor h2 { font-size: 16px; margin-bottom: 12px; text-transform: capitalize; color: #ffcc44; }
      .editor h3 { font-size: 13px; color: #888; margin: 12px 0 6px; border-bottom: 1px solid #333; padding-bottom: 4px; }
      .preview { width: 400px; flex-shrink: 0; padding: 12px; background: #22223a; border: 1px solid #333; border-radius: 6px; }
      .field { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
      .field label { width: 150px; text-align: right; color: #aaa; font-size: 13px; cursor: help; }
      #tooltip { position: fixed; background: #111; color: #ffcc44; font-size: 12px; padding: 4px 8px; border-radius: 4px; white-space: nowrap; z-index: 10000; border: 1px solid #555; pointer-events: none; display: none; }
      .field input { width: 100px; padding: 4px 8px; border: 1px solid #444; background: #1a1a2e; color: #e0e0e0; border-radius: 4px; font-size: 14px; }
      .field input:focus { outline: none; border-color: #ffaa00; }
      .io-panel { background: #22223a; border: 1px solid #333; border-radius: 6px; padding: 12px; flex-shrink: 0; }
      .io-panel textarea { width: 100%; height: 70px; background: #1a1a2e; color: #e0e0e0; border: 1px solid #444; border-radius: 4px; padding: 8px; font-family: monospace; font-size: 12px; resize: vertical; }
      .io-panel .btn-row { display: flex; gap: 8px; margin-top: 8px; }
      .io-panel button { padding: 4px 12px; border: 1px solid #555; background: #2a2a4a; color: #e0e0e0; border-radius: 4px; cursor: pointer; font-size: 13px; }
      .io-panel button:hover { background: #3a3a5a; }
      .error { color: #f66; font-size: 12px; margin-top: 4px; }
      .summary { flex-shrink: 0; background: #22223a; border: 1px solid #333; border-radius: 6px; padding: 12px; overflow-x: auto; }
      .summary h3 { font-size: 14px; color: #ffcc44; margin-bottom: 8px; }
      .summary table { border-collapse: collapse; font-size: 13px; }
      .summary th, .summary td { padding: 4px 12px; border: 1px solid #333; text-align: right; }
      .summary th { background: #2a2a4a; color: #aaa; text-transform: capitalize; }
      .summary td { color: #e0e0e0; }
    `;
    document.head.appendChild(style);
  }

  private render(): void {
    const sum = summarize(this.balance);
    const selectedKey = this.tab === 'commander' ? 'Commander'
      : this.tab === 'game' ? 'Game Settings'
      : this.tab === 'modifiers' ? `${MOD_CATEGORY_LABELS[this.selectedModCategory]} / ${this.selectedModId}`
      : this.tab === 'units' ? this.selectedUnit : this.selectedEnemy;

    let listHtml = '';
    if (this.tab === 'units') {
      listHtml = SQUAD_TYPES.map(s => `<div class="list-item ${this.selectedUnit === s ? 'active' : ''}" data-select="${s}">${s}</div>`).join('');
    } else if (this.tab === 'enemies') {
      listHtml = ENEMY_TYPES.map(e => `<div class="list-item ${this.selectedEnemy === e ? 'active' : ''}" data-select="${e}">${e}</div>`).join('');
    } else if (this.tab === 'modifiers') {
      listHtml = this.renderModifierList();
    }

    this.root.innerHTML = `
      <div class="header">
        <h1>Balance Simulator</h1>
        <button id="btn-save" class="primary ${this.dirty ? 'dirty' : ''}">Save</button>
        <span class="save-status" id="save-status">${this.dirty ? 'Unsaved changes' : ''}</span>
        <button id="btn-reset" class="danger">Reset to Defaults</button>
      </div>
      <div class="main">
        <div class="sidebar">
          <div class="tab-bar">
            <button data-tab="commander" class="${this.tab === 'commander' ? 'active' : ''}">Cmdr</button>
            <button data-tab="units" class="${this.tab === 'units' ? 'active' : ''}">Units</button>
            <button data-tab="enemies" class="${this.tab === 'enemies' ? 'active' : ''}">Enemies</button>
            <button data-tab="game" class="${this.tab === 'game' ? 'active' : ''}">Game</button>
            <button data-tab="modifiers" class="${this.tab === 'modifiers' ? 'active' : ''}">Mods</button>
          </div>
          ${listHtml}
        </div>
        <div class="editor">
          <h2>${selectedKey}</h2>
          ${this.renderEditorFields()}
        </div>
      </div>
      <div class="io-panel">
        <textarea id="io-text" placeholder="Paste JSON here to import, or click Export to see current data..."></textarea>
        <div class="btn-row">
          <button id="btn-export">Export</button>
          <button id="btn-copy">Copy</button>
          <button id="btn-import">Import / Apply</button>
          <button id="btn-file">Load File...</button>
          <input type="file" id="file-input" accept=".json" style="display:none">
        </div>
        ${this.errorMsg ? `<div class="error">${this.errorMsg}</div>` : ''}
      </div>
      <div class="summary">
        ${this.renderSummaryInner(sum)}
      </div>
      <div id="tooltip"></div>
    `;

    this.bind();
    this._mountPreview();
  }

  private _mountPreview(): void {
    const main = this.root.querySelector('.main');
    if (main) main.appendChild(this.previewContainer);
  }

  private renderModifierList(): string {
    const cats: ModCategory[] = ['items', 'supports', 'keystones', 'nodes'];
    let html = '';
    for (const cat of cats) {
      html += `<div class="sub-header">${MOD_CATEGORY_LABELS[cat]}</div>`;
      const ids = Object.keys(MODIFIER_FIELDS[cat]);
      for (const id of ids) {
        const active = this.selectedModCategory === cat && this.selectedModId === id;
        html += `<div class="list-item ${active ? 'active' : ''}" data-mod-cat="${cat}" data-mod-id="${id}">${id}</div>`;
      }
    }
    return html;
  }

  private renderEditorFields(): string {
    switch (this.tab) {
      case 'commander': return this.renderCommanderEditor();
      case 'units': return this.renderUnitEditor();
      case 'enemies': return this.renderEnemyEditor();
      case 'game': return this.renderGameEditor();
      case 'modifiers': return this.renderModifierEditor();
    }
  }

  private renderCommanderEditor(): string {
    let html = this.renderFields(this.balance.commander, COMMANDER_FIELDS);
    html += `<h3>Reform</h3>` + this.renderFields(this.balance.commander, COMMANDER_REFORM_FIELDS);
    html += `<h3>Direction</h3>` + this.renderFields(this.balance.commander, COMMANDER_DIRECTION_FIELDS);
    html += `<h3>Charge</h3>` + this.renderFields(this.balance.commander, COMMANDER_CHARGE_FIELDS);
    return html;
  }

  private renderUnitEditor(): string {
    const stats = this.balance.units[this.selectedUnit];
    let html = this.renderFields(stats, UNIT_FIELDS);
    if (this.selectedUnit === 'vanguard') {
      html += `<h3>Formation</h3>` + this.renderFields(stats, VANGUARD_FIELDS);
    } else if (this.selectedUnit === 'archer') {
      html += `<h3>Formation</h3>` + this.renderFields(stats, ARCHER_FIELDS);
    } else if (this.selectedUnit === 'cavalry') {
      html += `<h3>Formation</h3>` + this.renderFields(stats, CAVALRY_FORMATION_FIELDS);
      html += `<h3>State Machine</h3>` + this.renderFields(stats, CAVALRY_STATE_FIELDS);
    }
    return html;
  }

  private renderGameEditor(): string {
    let html = this.renderFields(this.balance.game, GAME_SPAWN_FIELDS);
    html += `<h3>Army Composition</h3>` + this.renderFields(this.balance.game, GAME_ARMY_FIELDS);
    html += `<h3>Separation</h3>` + this.renderFields(this.balance.game, GAME_SEPARATION_FIELDS);
    html += `<h3>Anchor Decay</h3>` + this.renderFields(this.balance.game, GAME_ANCHOR_FIELDS);
    html += `<h3>Flag Penetration</h3>` + this.renderFields(this.balance.game, GAME_FLAG_FIELDS);
    html += `<h3>Camera</h3>` + this.renderFields(this.balance.game, GAME_CAMERA_FIELDS);
    html += `<h3>Encounter</h3>` + this.renderFields(this.balance.game, GAME_ENCOUNTER_FIELDS);
    html += `<h3>Zone</h3>` + this.renderFields(this.balance.game, GAME_ZONE_FIELDS);
    html += `<h3>Cooldown Caps / Speed</h3>` + this.renderFields(this.balance.game, GAME_CAP_FIELDS);
    return html;
  }

  private renderModifierEditor(): string {
    const cat = this.selectedModCategory;
    const id = this.selectedModId;
    const fields = MODIFIER_FIELDS[cat]?.[id];
    if (!fields || fields.length === 0) return '<p style="color:#666">No editable fields</p>';

    // Ensure the category/id exists in balance data
    if (!this.balance.modifiers[cat]) (this.balance.modifiers as any)[cat] = {};
    if (!(this.balance.modifiers[cat] as any)[id]) (this.balance.modifiers[cat] as any)[id] = {};
    const obj = (this.balance.modifiers[cat] as any)[id];

    return fields.map(f => {
      const val = obj[f.key];
      const step = f.step ?? (f.key.includes('Mult') || f.key.includes('Factor') || f.key.includes('Lerp') ? '0.01' : '1');
      return `<div class="field">
        <label data-tip="${f.tip}">${f.label}</label>
        <input type="number" data-mod-field="${f.key}" value="${val ?? ''}" min="-9999" max="9999" step="${step}">
      </div>`;
    }).join('');
  }

  private renderFields(obj: any, fields: Array<{ key: string; label: string; tip: string }>): string {
    return fields.map(f => {
      const val = obj[f.key];
      const step = f.key.includes('Mult') || f.key.includes('Boost') || f.key.includes('Factor') || f.key.includes('Lerp') ? '0.01' : '1';
      return `<div class="field">
        <label data-tip="${f.tip}">${f.label}</label>
        <input type="number" data-field="${f.key}" value="${val ?? ''}" min="0" max="9999" step="${step}">
      </div>`;
    }).join('');
  }

  private renderEnemyEditor(): string {
    const stats = this.balance.enemies[this.selectedEnemy];
    let html = this.renderFields(stats, ENEMY_BASE_FIELDS);
    // Type-specific fields
    const extra = this.selectedEnemy === 'chaser' ? CHASER_FIELDS
      : this.selectedEnemy === 'dasher' ? DASHER_FIELDS
      : BUFFER_FIELDS;
    if (extra.length) {
      const label = this.selectedEnemy === 'chaser' ? 'Formation' : this.selectedEnemy === 'dasher' ? 'Dash / Disrupt / Egress' : 'Aura';
      html += `<h3>${label}</h3>` + this.renderFields(stats, extra);
    }
    return html;
  }

  private bind(): void {
    // Tooltip
    const tip = this.root.querySelector<HTMLDivElement>('#tooltip')!;
    this.root.querySelectorAll<HTMLLabelElement>('label[data-tip]').forEach(lbl => {
      lbl.addEventListener('mouseenter', (e: MouseEvent) => {
        tip.textContent = lbl.dataset.tip!;
        tip.style.display = 'block';
        tip.style.left = e.clientX + 12 + 'px';
        tip.style.top = e.clientY + 12 + 'px';
      });
      lbl.addEventListener('mousemove', (e: MouseEvent) => {
        tip.style.left = e.clientX + 12 + 'px';
        tip.style.top = e.clientY + 12 + 'px';
      });
      lbl.addEventListener('mouseleave', () => {
        tip.style.display = 'none';
      });
    });

    // Tabs
    this.root.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.tab = btn.dataset.tab as Tab;
        this.render();
      });
    });

    // List selection (units/enemies)
    this.root.querySelectorAll<HTMLDivElement>('[data-select]').forEach(el => {
      el.addEventListener('click', () => {
        if (this.tab === 'units') this.selectedUnit = el.dataset.select as SquadType;
        else if (this.tab === 'enemies') this.selectedEnemy = el.dataset.select as EnemyType;
        this.render();
      });
    });

    // Modifier list selection
    this.root.querySelectorAll<HTMLDivElement>('[data-mod-cat]').forEach(el => {
      el.addEventListener('click', () => {
        this.selectedModCategory = el.dataset.modCat as ModCategory;
        this.selectedModId = el.dataset.modId!;
        this.render();
      });
    });

    // Field inputs (commander/units/enemies/game)
    this.root.querySelectorAll<HTMLInputElement>('input[data-field]').forEach(inp => {
      inp.addEventListener('input', () => {
        const key = inp.dataset.field!;
        const val = inp.value === '' ? undefined : Number(inp.value);
        const target = this.tab === 'commander' ? this.balance.commander
          : this.tab === 'units' ? this.balance.units[this.selectedUnit]
          : this.tab === 'enemies' ? this.balance.enemies[this.selectedEnemy]
          : this.balance.game;
        (target as any)[key] = val;
        this.markDirty();
        const sumEl = this.root.querySelector('.summary');
        if (sumEl) sumEl.innerHTML = this.renderSummaryInner(summarize(this.balance));
      });
    });

    // Modifier field inputs
    this.root.querySelectorAll<HTMLInputElement>('input[data-mod-field]').forEach(inp => {
      inp.addEventListener('input', () => {
        const key = inp.dataset.modField!;
        const val = inp.value === '' ? undefined : Number(inp.value);
        const cat = this.selectedModCategory;
        const id = this.selectedModId;
        if (!this.balance.modifiers[cat]) (this.balance.modifiers as any)[cat] = {};
        if (!(this.balance.modifiers[cat] as any)[id]) (this.balance.modifiers[cat] as any)[id] = {};
        (this.balance.modifiers[cat] as any)[id][key] = val;
        this.markDirty();
      });
    });

    // Save
    this.root.querySelector('#btn-save')?.addEventListener('click', () => this.save());

    // Reset
    this.root.querySelector('#btn-reset')?.addEventListener('click', () => {
      this.balance = structuredClone(DEFAULT_BALANCE);
      this.preview.setBalance(this.balance);
      this.save();
    });

    // Export
    const textarea = this.root.querySelector<HTMLTextAreaElement>('#io-text')!;
    this.root.querySelector('#btn-export')?.addEventListener('click', () => {
      textarea.value = exportBalanceToJson(this.balance);
      this.errorMsg = '';
    });

    // Copy
    this.root.querySelector('#btn-copy')?.addEventListener('click', () => {
      textarea.select();
      navigator.clipboard.writeText(textarea.value);
    });

    // Import
    this.root.querySelector('#btn-import')?.addEventListener('click', () => {
      try {
        this.balance = importBalanceFromJson(textarea.value);
        this.errorMsg = '';
        this.preview.setBalance(this.balance);
        this.save();
      } catch (e: any) {
        this.errorMsg = e.message || 'Import failed';
        this.render();
      }
    });

    // File load
    const fileInput = this.root.querySelector<HTMLInputElement>('#file-input')!;
    this.root.querySelector('#btn-file')?.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          this.balance = importBalanceFromJson(reader.result as string);
          this.errorMsg = '';
          this.preview.setBalance(this.balance);
          this.save();
        } catch (e: any) {
          this.errorMsg = e.message || 'File import failed';
          this.render();
        }
      };
      reader.readAsText(file);
    });
  }

  private renderSummaryInner(sum: ReturnType<typeof summarize>): string {
    return `
      <h3>DPS &amp; TTK Summary</h3>
      <table>
        <tr><th></th>${ENEMY_TYPES.map(e => `<th>${e}</th>`).join('')}<th>DPS</th></tr>
        ${SQUAD_TYPES.map(s => `
          <tr>
            <th>${s}</th>
            ${ENEMY_TYPES.map(e => {
              const v = sum.ttkMatrix[s][e];
              return `<td>${v === Infinity ? '---' : v.toFixed(2) + 's'}</td>`;
            }).join('')}
            <td>${sum.unitDps[s].toFixed(2)}</td>
          </tr>
        `).join('')}
      </table>
    `;
  }

  private markDirty(): void {
    if (this.dirty) return;
    this.dirty = true;
    const btn = this.root.querySelector<HTMLButtonElement>('#btn-save');
    if (btn) btn.classList.add('dirty');
    const status = this.root.querySelector('#save-status');
    if (status) status.textContent = 'Unsaved changes';
  }

  private async save(): Promise<void> {
    try {
      await saveBalanceToApi(this.balance);
      this.dirty = false;
      this.errorMsg = '';
      this.render();
      const status = this.root.querySelector('#save-status');
      if (status) {
        status.textContent = 'Saved!';
        setTimeout(() => { if (status.parentElement) status.textContent = ''; }, 1500);
      }
    } catch (e: any) {
      this.errorMsg = 'Save failed: ' + (e.message || 'unknown error');
      this.render();
    }
  }
}
