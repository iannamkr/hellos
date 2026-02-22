// shared/balance/fields.ts — Single source for balance field definitions (default + UI metadata)

export interface FieldSpec {
  key: string;
  default: number;
  label: string;
  tip: string;
  step?: number;
}

export type ModCategory = 'items' | 'supports' | 'keystones' | 'nodes';

// ─── Helpers ─────────────────────────────────────────────

export function extractDefaults(fields: readonly FieldSpec[]): Record<string, number> {
  const r: Record<string, number> = {};
  for (const f of fields) r[f.key] = f.default;
  return r;
}

export function extractModifierDefaults(
  specs: Record<string, Record<string, readonly FieldSpec[]>>,
): Record<string, Record<string, Record<string, number>>> {
  const r: Record<string, Record<string, Record<string, number>>> = {};
  for (const [cat, mods] of Object.entries(specs)) {
    r[cat] = {};
    for (const [id, fields] of Object.entries(mods))
      r[cat][id] = extractDefaults(fields);
  }
  return r;
}

// ─── Unit base factory ───────────────────────────────────

function unitBase(d: Record<string, number>): FieldSpec[] {
  return [
    { key: 'maxHp',        default: d.maxHp,        label: 'Max HP',        tip: '최대 체력' },
    { key: 'dmg',          default: d.dmg,           label: 'Damage',        tip: '공격력' },
    { key: 'atkCD',        default: d.atkCD,         label: 'Atk CD (ms)',   tip: '공격 쿨다운' },
    { key: 'unitSpeed',    default: d.unitSpeed,     label: 'Speed',         tip: '이동 속도' },
    { key: 'range',        default: d.range,         label: 'Range',         tip: '공격 사거리' },
    { key: 'engageRadius', default: d.engageRadius,  label: 'Engage Radius', tip: '교전 반경' },
    { key: 'returnRadius', default: d.returnRadius,  label: 'Return Radius', tip: '복귀 반경' },
  ];
}

export const VANGUARD_BASE_FIELDS = unitBase({ maxHp: 2, dmg: 1, atkCD: 650, unitSpeed: 200, range: 50, engageRadius: 170, returnRadius: 220 });
export const ARCHER_BASE_FIELDS   = unitBase({ maxHp: 1, dmg: 1, atkCD: 900, unitSpeed: 150, range: 420, engageRadius: 120, returnRadius: 160 });
export const CAVALRY_BASE_FIELDS  = unitBase({ maxHp: 2, dmg: 1, atkCD: 775, unitSpeed: 300, range: 65, engageRadius: 160, returnRadius: 210 });

// ─── Enemy base factory ──────────────────────────────────

function enemyBase(d: Record<string, number>): FieldSpec[] {
  return [
    { key: 'maxHp',      default: d.maxHp,      label: 'Max HP',      tip: '최대 체력' },
    { key: 'touchDmg',   default: d.touchDmg,   label: 'Touch Dmg',   tip: '접촉 피해' },
    { key: 'speed',      default: d.speed,       label: 'Speed',       tip: '이동 속도' },
    { key: 'speedRange', default: d.speedRange,  label: 'Speed Range', tip: '속도 변동 범위' },
  ];
}

export const CHASER_BASE_FIELDS = enemyBase({ maxHp: 2, touchDmg: 1, speed: 75, speedRange: 20 });
export const DASHER_BASE_FIELDS = enemyBase({ maxHp: 2, touchDmg: 1, speed: 95, speedRange: 0 });
export const BUFFER_BASE_FIELDS = enemyBase({ maxHp: 3, touchDmg: 0, speed: 48, speedRange: 15 });

// ─── Commander ───────────────────────────────────────────

export const COMMANDER_FIELDS: FieldSpec[] = [
  { key: 'maxHp',           default: 5,    label: 'Max HP',             tip: '최대 체력' },
  { key: 'speed',           default: 220,  label: 'Speed',              tip: '이동 속도' },
  { key: 'atkCD',           default: 400,  label: 'Atk CD (ms)',        tip: '공격 쿨다운' },
  { key: 'dashCD',          default: 1400, label: 'Dash CD (ms)',       tip: '대시 쿨다운' },
  { key: 'dashDuration',    default: 180,  label: 'Dash Duration (ms)', tip: '대시 지속 시간' },
  { key: 'dashSpeed',       default: 480,  label: 'Dash Speed',         tip: '대시 속도' },
  { key: 'iframes',         default: 1200, label: 'I-Frames (ms)',      tip: '무적 지속 시간' },
  { key: 'reformCD',        default: 2200, label: 'Reform CD (ms)',     tip: '재편성 쿨다운' },
  { key: 'reformThreshold', default: 220,  label: 'Reform Hold (ms)',   tip: '재편성 발동 홀드 시간' },
];

export const COMMANDER_REFORM_FIELDS: FieldSpec[] = [
  { key: 'reformSpeedMult',       default: 2.8, label: 'Reform Speed x',   tip: '재편성 이동 속도 배율', step: 0.01 },
  { key: 'reformArriveRadius',    default: 18,  label: 'Arrive Radius',    tip: '슬롯 도착 판정 반경' },
  { key: 'reformBrakeRadius',     default: 70,  label: 'Brake Radius',     tip: '감속 시작 반경' },
  { key: 'reformStaggerInterval', default: 20,  label: 'Stagger (ms/unit)', tip: '유닛별 재편성 시차' },
  { key: 'reformDuration',        default: 550, label: 'Duration (ms)',     tip: '재편성 지속 시간' },
];

export const COMMANDER_DIRECTION_FIELDS: FieldSpec[] = [
  { key: 'commitAngle',          default: 35,  label: 'Commit Angle (°)', tip: '방향 전환 임계 각도' },
  { key: 'commitSpeedThreshold', default: 10,  label: 'Speed Threshold',  tip: '방향 갱신 최소 속도' },
  { key: 'commitHoldTime',       default: 180, label: 'Hold Time (ms)',   tip: '방향 전환 유지 시간' },
  { key: 'commitSlerpFactor',    default: 0.6, label: 'Slerp Factor',     tip: '방향 보간 계수 (0~1)', step: 0.01 },
  { key: 'commitCooldown',       default: 250, label: 'Cooldown (ms)',    tip: '방향 전환 후 쿨다운' },
];

export const COMMANDER_CHARGE_FIELDS: FieldSpec[] = [
  { key: 'chargeDuration',   default: 600, label: 'Charge Duration (ms)', tip: '차지 완충 시간' },
  { key: 'chargeRingStart',  default: 20,  label: 'Ring Start (px)',      tip: '차지 링 시작 반경' },
  { key: 'chargeRingMax',    default: 60,  label: 'Ring Max (px)',        tip: '차지 링 최대 반경' },
  { key: 'chargeDamageMult', default: 3,   label: 'Damage Mult',         tip: '차지 완충 시 데미지 배율', step: 0.01 },
];

// ─── Vanguard formation ──────────────────────────────────

export const VANGUARD_FORMATION_FIELDS: FieldSpec[] = [
  { key: 'lineDepth',         default: 160, label: 'Line Depth',        tip: '전선 깊이 (FLAG에서 전선까지 거리)' },
  { key: 'holdIn',            default: 35,  label: 'Hold In (px)',      tip: 'HOLD 진입 거리 (슬롯 근접 시 감속 시작)' },
  { key: 'holdOut',           default: 55,  label: 'Hold Out (px)',     tip: 'HOLD 탈출 거리 (이 이상이면 정상 속도)' },
  { key: 'vanguardGapNormal', default: 60,  label: 'Gap Normal',       tip: '이동 시 슬롯 간격' },
  { key: 'vanguardGapStill',  default: 35,  label: 'Gap Still (E2)',   tip: '정지 시 슬롯 간격 (E2 노드)' },
  { key: 'holdSpeedMult',     default: 0.7, label: 'Hold Speed x',     tip: 'HOLD 상태 속도 배율', step: 0.01 },
  { key: 'targetLockMs',      default: 800, label: 'Target Lock (ms)', tip: '타겟 고정 유지 시간' },
  { key: 'protectR',              default: 220, label: 'Protect R',         tip: '지휘관 보호 반경' },
  { key: 'protectR2',             default: 240, label: 'Protect R2',        tip: '궁병리더 보호 반경' },
  { key: 'protectROut',           default: 300, label: 'Protect R Out',     tip: '보호 이탈 반경 (히스테리시스)' },
  { key: 'breachDepth',           default: 60,  label: 'Breach Depth',      tip: '적 라인 침범 깊이' },
  { key: 'interceptPush',         default: 80,  label: 'Intercept Push',    tip: 'INTERCEPT 전진 거리' },
  { key: 'guardThreatMs',         default: 120, label: 'Guard Threat (ms)', tip: '위협 연속 감지 시간' },
  { key: 'guardThreatSpeedMult',  default: 0.6, label: 'Threat Speed x',   tip: '위협 감지 시 이동 감속', step: 0.01 },
  { key: 'a3PushForce',           default: 50,  label: 'A3 Push Force',    tip: 'A3 노드 후퇴 방지 밀기 힘' },
];

// ─── Archer formation ────────────────────────────────────

export const ARCHER_FORMATION_FIELDS: FieldSpec[] = [
  { key: 'rank0Depth',       default: 260, label: 'Rank 0 Depth',    tip: '1열 깊이 (앵커 뒤 거리)' },
  { key: 'rank1Depth',       default: 320, label: 'Rank 1 Depth',    tip: '2열 깊이 (앵커 뒤 거리)' },
  { key: 'slotGap',          default: 70,  label: 'Slot Gap',        tip: '슬롯 간격' },
  { key: 'maxSpread',        default: 240, label: 'Max Spread',      tip: '최대 횡 전개 폭' },
  { key: 'deadZone',         default: 120, label: 'Dead Zone',       tip: '사격 금지 구역 (리더 기준)' },
  { key: 'retreatSpeedMult', default: 1.5, label: 'Retreat Speed x', tip: 'A4 후퇴 시 속도 배율', step: 0.01 },
  { key: 'normalSpeedMult',  default: 0.5, label: 'Normal Speed x',  tip: '일반 이동 속도 배율', step: 0.01 },
  { key: 'slotArrDist',      default: 30,  label: 'Slot Arrive (px)', tip: '슬롯 도착 판정 거리' },
];

// ─── Cavalry ─────────────────────────────────────────────

export const CAVALRY_FORMATION_FIELDS: FieldSpec[] = [
  { key: 'gapSpacing',        default: 120,  label: 'Gap Spacing',         tip: 'Gap 샘플 포인트 간격 (px)' },
  { key: 'gapOffset',         default: -40,  label: 'Gap Offset',          tip: '전선 뒤 오프셋 (음수 = 뒤)' },
  { key: 'gapCalcInterval',   default: 200,  label: 'Gap Calc (ms)',       tip: 'Gap 재계산 쓰로틀 주기' },
  { key: 'seekInterceptDist', default: 160,  label: 'Seek→Intercept (px)', tip: 'Gap 접근 시 요격 전환 거리' },
  { key: 'interceptLerp',     default: 0.55, label: 'Intercept Lerp',      tip: '요격 지점 보간 계수 (0=gap, 1=적)', step: 0.01 },
  { key: 'egressDepth',       default: 260,  label: 'Egress Depth',        tip: '복귀 지점 깊이 (전선 뒤 거리)' },
  { key: 'gapScanRadius',     default: 140,  label: 'Gap Scan Radius',     tip: 'Vanguard 밀도 스캔 반경' },
  { key: 'gapTargetRadius',   default: 260,  label: 'Gap Target Radius',   tip: '빈틈 주변 적 탐색 반경' },
];

export const CAVALRY_STATE_FIELDS: FieldSpec[] = [
  { key: 'interceptTimeout',        default: 2000, label: 'Intercept Timeout (ms)', tip: '요격 최대 시간 → DISRUPT 전환' },
  { key: 'interceptSpeedMult',      default: 1.3,  label: 'Intercept Speed x',      tip: '요격 시 속도 배율', step: 0.01 },
  { key: 'cavDisruptDuration',      default: 700,  label: 'Disrupt Duration (ms)',   tip: '차단 지속 시간' },
  { key: 'cavDisruptMaxHits',       default: 2,    label: 'Disrupt Max Hits',        tip: '차단 중 최대 타격 횟수' },
  { key: 'cavEgressDuration',       default: 1000, label: 'Egress Duration (ms)',    tip: '복귀 지속 시간' },
  { key: 'maxConcurrentIntercepts', default: 2,    label: 'Max Intercepts',          tip: '동시 요격/차단 최대 수' },
];

export const CAVALRY_STABILITY_FIELDS: FieldSpec[] = [
  { key: 'cavStickyMs',            default: 1200, label: 'Sticky (ms)',       tip: 'Gap 교체 최소 유지 시간' },
  { key: 'cavImproveDelta',        default: 1.25, label: 'Improve Delta',    tip: 'Gap 교체 개선 임계값', step: 0.01 },
  { key: 'cavGapRIn',              default: 240,  label: 'Gap R In',         tip: 'Gap 활성 내부 반경' },
  { key: 'cavGapROut',             default: 320,  label: 'Gap R Out',        tip: 'Gap 활성 외부 반경' },
  { key: 'cavSeenMs',              default: 200,  label: 'Seen (ms)',        tip: '적 감지 유지 시간' },
  { key: 'cavSlotAlpha',           default: 0.2,  label: 'Slot Alpha',       tip: '슬롯 보간 계수', step: 0.01 },
  { key: 'cavAccel',               default: 2800, label: 'Accel',            tip: '가속도' },
  { key: 'cavInterceptMaxLateral', default: 140,  label: 'Intercept Max Lat', tip: '요격 최대 횡이동' },
  { key: 'cavInterceptFixedDepth', default: 60,   label: 'Intercept Depth',  tip: '요격 고정 깊이' },
  { key: 'cavLoadLambda',          default: 1.25, label: 'Load Lambda',      tip: '부하 밸런싱 가중치', step: 0.01 },
  { key: 'cavLateralSpread',       default: 80,   label: 'Lateral Spread',   tip: '횡 분산 범위 (px)' },
  { key: 'cavDepthSpread',         default: 40,   label: 'Depth Spread',     tip: '종 분산 범위 (px)' },
  { key: 'cavEgressGapScale',      default: 0.5,  label: 'Egress Gap Scale', tip: '복귀 gap 비율', step: 0.01 },
];

// ─── Chaser ──────────────────────────────────────────────

export const CHASER_FIELDS: FieldSpec[] = [
  { key: 'lineHoldDist',      default: 350, label: 'Line Hold Dist',    tip: '전열 유지 거리 (깃발 기준)' },
  { key: 'cohesionRadius',    default: 140, label: 'Cohesion Radius',   tip: '결속 반경 (동료 추종 범위)' },
  { key: 'slotSpacing',       default: 45,  label: 'Slot Spacing',      tip: '전열 슬롯 간격' },
  { key: 'lineHoldSpeedMult', default: 0.5, label: 'Line Hold Speed x', tip: '전열 유지 시 속도 배율', step: 0.01 },
];

// ─── Dasher ──────────────────────────────────────────────

export const DASHER_FIELDS: FieldSpec[] = [
  { key: 'patrolDuration',  default: 2500, label: 'Patrol Duration (ms)', tip: '순찰 지속 시간 → 돌진 준비 전환' },
  { key: 'dashWindup',      default: 450,  label: 'Dash Windup (ms)',     tip: '돌진 준비 시간 (텔레그래프)' },
  { key: 'dashSpeed',       default: 550,  label: 'Dash Speed',           tip: '돌진 속도' },
  { key: 'dashDuration',    default: 280,  label: 'Dash Duration (ms)',   tip: '돌진 지속 시간' },
  { key: 'flashInterval',   default: 80,   label: 'Flash Interval (ms)',  tip: '준비 중 깜빡임 주기' },
  { key: 'telegraphLength', default: 200,  label: 'Telegraph Length (px)', tip: '텔레그래프 라인 길이' },
  { key: 'cooldownDuration', default: 1200, label: 'Cooldown (ms)',       tip: '돌진 후 쿨다운' },
  { key: 'penetrationDist', default: 220,  label: 'Penetration Dist',    tip: '침투 거리' },
  { key: 'disruptDuration', default: 900,  label: 'Disrupt Duration (ms)', tip: '붕괴 지속 시간 (정지+넉백)' },
  { key: 'egressDuration',  default: 1200, label: 'Egress Duration (ms)', tip: '이탈 지속 시간' },
  { key: 'egressSpeed',     default: 95,   label: 'Egress Speed',        tip: '이탈 속도' },
];

// ─── Buffer ──────────────────────────────────────────────

export const BUFFER_FIELDS: FieldSpec[] = [
  { key: 'auraRadius',     default: 120, label: 'Aura Radius',  tip: '오라 반경' },
  { key: 'auraSpeedBoost', default: 1.4, label: 'Aura Speed x', tip: '오라 속도 증폭 배율', step: 0.01 },
];

// ─── Game config ─────────────────────────────────────────

export const GAME_SPAWN_FIELDS: FieldSpec[] = [
  { key: 'platoonSpawnInterval', default: 5000, label: 'Spawn Interval (ms)', tip: '소대 생성 주기' },
  { key: 'platoonSizeChaser',    default: 7,    label: 'Platoon: Chaser',     tip: '추격병 소대 인원 수' },
  { key: 'platoonSizeDasher',    default: 5,    label: 'Platoon: Dasher',     tip: '돌진병 소대 인원 수' },
  { key: 'platoonSizeBuffer',    default: 5,    label: 'Platoon: Buffer',     tip: '버퍼 소대 인원 수' },
  { key: 'volleyCycle',          default: 900,  label: 'Volley Cycle (ms)',    tip: '일제 사격 주기' },
  { key: 'volleyWindow',         default: 120,  label: 'Volley Window (ms)',   tip: '일제 사격 창 (발사 가능 구간)' },
  { key: 'commandAuraRadius',    default: 260,  label: 'Cmd Aura Radius',     tip: '지휘 오라 반경' },
];

export const GAME_ARMY_FIELDS: FieldSpec[] = [
  { key: 'squadSizeVanguard', default: 8, label: 'Vanguard Count', tip: '선봉 초기 인원' },
  { key: 'squadSizeArcher',   default: 8, label: 'Archer Count',   tip: '궁병 초기 인원' },
  { key: 'squadSizeCavalry',  default: 4, label: 'Cavalry Count',  tip: '기병 초기 인원' },
];

export const GAME_SEPARATION_FIELDS: FieldSpec[] = [
  { key: 'separationDist',  default: 20, label: 'Sep. Distance (px)', tip: '유닛 간 반발 거리' },
  { key: 'separationForce', default: 25, label: 'Sep. Force',         tip: '유닛 간 반발력' },
  { key: 'formingExitDist', default: 20, label: 'Forming Exit (px)',  tip: 'FORMING 상태 탈출 거리' },
];

export const GAME_ANCHOR_FIELDS: FieldSpec[] = [
  { key: 'anchorDecayVanguard', default: 8, label: 'Anchor: Vanguard', tip: '선봉 앵커 추적 속도' },
  { key: 'anchorDecayArcher',   default: 6, label: 'Anchor: Archer',   tip: '궁병 앵커 추적 속도' },
  { key: 'anchorDecayCavalry',  default: 9, label: 'Anchor: Cavalry',  tip: '기병 앵커 추적 속도' },
];

export const GAME_FLAG_FIELDS: FieldSpec[] = [
  { key: 'flagPenetrationRadius',    default: 40, label: 'Pen. Radius (px)',   tip: 'FLAG 침투 판정 반경' },
  { key: 'flagPenetrationThreshold', default: 2,  label: 'Pen. Threshold (s)', tip: 'FLAG 침투 누적 시간 → 궁병 피해' },
];

export const GAME_CAMERA_FIELDS: FieldSpec[] = [
  { key: 'cameraZoomProximity',  default: 200,  label: 'Proximity (px)', tip: '줌 트리거 거리 (FLAG 기준)' },
  { key: 'cameraZoomEnemyCount', default: 3,    label: 'Enemy Count',    tip: '줌 트리거 적 수' },
  { key: 'cameraZoomIn',         default: 0.90, label: 'Zoom In',        tip: '줌인 배율', step: 0.01 },
  { key: 'cameraZoomNormal',     default: 1.0,  label: 'Zoom Normal',    tip: '기본 줌 배율', step: 0.01 },
  { key: 'cameraZoomEase',       default: 4,    label: 'Ease Rate',      tip: '줌 이징 속도' },
];

export const GAME_ENCOUNTER_FIELDS: FieldSpec[] = [
  { key: 'encounterStartSec',     default: 32, label: 'Start (s)',      tip: '이벤트 시작 시간 (코어 모드)' },
  { key: 'encounterEndSec',       default: 42, label: 'End (s)',        tip: '이벤트 종료 시간' },
  { key: 'encounterEarlyExitSec', default: 33, label: 'Early Exit (s)', tip: '조기 종료 가능 시간' },
];

export const GAME_ZONE_FIELDS: FieldSpec[] = [
  { key: 'zoneRadius',          default: 80, label: 'Zone Radius (px)',    tip: '존 반경' },
  { key: 'markExplosionRadius', default: 80, label: 'Mark Explosion (px)', tip: '마크 폭발 반경' },
];

export const GAME_CAP_FIELDS: FieldSpec[] = [
  { key: 'minAttackCD',        default: 100, label: 'Min Atk CD (ms)',  tip: '공격 쿨다운 하한' },
  { key: 'minDashCD',          default: 400, label: 'Min Dash CD (ms)', tip: '대시 쿨다운 하한' },
  { key: 'armySpeedBoostMult', default: 1.5, label: 'Army Boost x',    tip: '군대 속도 부스트 배율', step: 0.01 },
];

export const GAME_MOVEMENT_FIELDS: FieldSpec[] = [
  { key: 'moveHaltDist',      default: 10,  label: 'Halt Dist (px)',     tip: '슬롯 도착 정지 거리' },
  { key: 'moveSoftZone',      default: 60,  label: 'Soft Zone (px)',     tip: '감속 구간 거리' },
  { key: 'moveSoftSpeedMult', default: 2.5, label: 'Soft Speed x',      tip: '감속 구간 속도 배율', step: 0.01 },
  { key: 'moveSoftSpeedCap',  default: 140, label: 'Soft Speed Cap',    tip: '감속 구간 속도 상한' },
  { key: 'moveFarSpeedMult',  default: 3,   label: 'Far Speed x',       tip: '원거리 속도 배율', step: 0.01 },
];

export const GAME_DIRECTION_FIELDS: FieldSpec[] = [
  { key: 'dirTurnRate',  default: 1.2, label: 'Dir Turn Rate (rad/s)', tip: '전열 방향 회전 속도', step: 0.01 },
  { key: 'aimDeadZone',  default: 5,   label: 'Aim Dead Zone (px)',    tip: '커서 사각 판정 거리' },
];

export const GAME_SQUAD_FIELDS: FieldSpec[] = [
  { key: 'squadReformDur',  default: 10000, label: 'Reform Dur (ms)',  tip: '분대 전멸 → 재편성 대기 시간' },
  { key: 'squadProtectDur', default: 2000,  label: 'Protect Dur (ms)', tip: '재편성 후 보호 시간' },
];

export const GAME_FRONTLINE_FIELDS: FieldSpec[] = [
  { key: 'frontLineFwdMin',      default: 100,  label: 'Fwd Min (px)',      tip: '전선 감지 최소 전방 거리' },
  { key: 'frontLineFwdMax',      default: 220,  label: 'Fwd Max (px)',      tip: '전선 감지 최대 전방 거리' },
  { key: 'frontLineMinCount',    default: 4,    label: 'Min Count',         tip: '전선 유지 최소 선봉 수' },
  { key: 'frontLineCollapseDur', default: 6000, label: 'Collapse Dur (ms)', tip: '전선 붕괴 지속 시간' },
  { key: 'frontLineEngageDist',  default: 100,  label: 'Engage Dist (px)',  tip: '전선 유지 시 적 교전 거리' },
];

// ─── Modifiers ───────────────────────────────────────────

export const MODIFIER_FIELDS: Record<ModCategory, Record<string, FieldSpec[]>> = {
  items: {
    heavyBlade: [
      { key: 'atkCdBonus', default: 200, label: 'Atk CD Bonus',   tip: '공격 쿨다운 증가량' },
      { key: 'knockForce', default: 150, label: 'Knock Force',    tip: '넉백 힘' },
      { key: 'knockDur',   default: 150, label: 'Knock Duration', tip: '넉백 지속 시간' },
    ],
    calmMind: [
      { key: 'atkCdReduction', default: 100, label: 'Atk CD Reduction', tip: '공격 쿨다운 감소량' },
      { key: 'dashCdBonus',    default: 300, label: 'Dash CD Bonus',    tip: '대시 쿨다운 증가량' },
      { key: 'atkCdMult',      default: 0.8, label: 'Unit Atk CD x',   tip: '군대 공격 쿨다운 배율', step: 0.01 },
    ],
    sprintBoots: [
      { key: 'speedMult',       default: 1.2, label: 'Speed Mult',        tip: '이동 속도 배율', step: 0.01 },
      { key: 'dashCdReduction', default: 200, label: 'Dash CD Reduction', tip: '대시 쿨다운 감소량' },
      { key: 'hpPenalty',       default: 1,   label: 'HP Penalty',        tip: 'HP 감소량' },
    ],
    ironSkin: [
      { key: 'speedMult', default: 0.8, label: 'Speed Mult', tip: '이동 속도 배율', step: 0.01 },
    ],
    antiDashPlate: [
      { key: 'iframes', default: 2000, label: 'I-Frames (ms)', tip: '무적 지속 시간' },
    ],
    zoneCore: [
      { key: 'durationMult',      default: 1.5, label: 'Duration Mult', tip: '존 지속 시간 배율', step: 0.01 },
      { key: 'atkCdBonusOut',     default: 200, label: 'Atk CD Out',    tip: '존 밖 공격 쿨다운 증가' },
      { key: 'dashCdReductionIn', default: 400, label: 'Dash CD In',    tip: '존 안 대시 쿨다운 감소' },
    ],
    hunterCharm: [
      { key: 'slowFactor', default: 0.4,  label: 'Slow Factor',   tip: '감속 비율', step: 0.01 },
      { key: 'slowDur',    default: 1500, label: 'Slow Duration', tip: '감속 지속 시간' },
    ],
    bloodOath: [
      { key: 'restoreKills', default: 4, label: 'Restore Kills', tip: '유닛 복원 필요 킬 수' },
    ],
    fragilePower: [
      { key: 'hpPenalty',        default: 2,   label: 'HP Penalty',          tip: '지휘관 HP 감소' },
      { key: 'unitHpPenalty',    default: 1,   label: 'Unit HP Penalty',     tip: '군대 유닛 HP 감소' },
      { key: 'extraDashIframes', default: 100, label: 'Extra Dash i-Frames', tip: '대시 추가 무적 시간' },
    ],
  },
  supports: {
    closeShock: [
      { key: 'atkCdBonus',    default: 150, label: 'Atk CD Bonus',     tip: '공격 쿨다운 증가' },
      { key: 'freezeDur',     default: 500, label: 'Freeze (ms)',      tip: '지휘관 공격 동결 시간' },
      { key: 'unitFreezeDur', default: 300, label: 'Unit Freeze (ms)', tip: '선봉 공격 동결 시간' },
    ],
    zoneAnchor: [
      { key: 'atkReduction', default: 0.3,  label: 'Atk Reduction', tip: '존 안 공격CD 감소 비율', step: 0.01 },
      { key: 'atkIncrease',  default: 0.2,  label: 'Atk Increase',  tip: '존 밖 공격CD 증가 비율', step: 0.01 },
      { key: 'duration',     default: 4000, label: 'Duration (ms)', tip: '존 지속 시간' },
    ],
    dashPrime: [
      { key: 'knockForce',   default: 200,  label: 'Knock Force',     tip: '넉백 힘' },
      { key: 'knockDur',     default: 200,  label: 'Knock Duration',  tip: '넉백 지속 시간' },
      { key: 'window',       default: 1000, label: 'Window (ms)',     tip: '대시 프라임 창' },
      { key: 'armyBoostDur', default: 1000, label: 'Army Boost (ms)', tip: '군대 속도 부스트 지속' },
    ],
    dashTax: [
      { key: 'buffDur', default: 1500, label: 'Buff Duration (ms)', tip: '대시 후 공격 버프 지속' },
    ],
    farSnare: [
      { key: 'slowFactor',     default: 0.4,  label: 'Slow Factor',      tip: '감속 비율 (지휘관)', step: 0.01 },
      { key: 'slowDur',        default: 1500, label: 'Slow Duration',    tip: '감속 지속 (지휘관)' },
      { key: 'unitSlowFactor', default: 0.3,  label: 'Unit Slow Factor', tip: '감속 비율 (궁병)', step: 0.01 },
      { key: 'unitSlowDur',    default: 1000, label: 'Unit Slow Dur',    tip: '감속 지속 (궁병)' },
    ],
    rhythmWindow: [
      { key: 'cycleDur',   default: 3700, label: 'Cycle (ms)',       tip: '리듬 사이클 길이' },
      { key: 'powerStart', default: 3000, label: 'Power Start (ms)', tip: '파워 윈도우 시작 시점' },
    ],
  },
  keystones: {
    closePact: [
      { key: 'auraRadiusMult', default: 0.77, label: 'Aura Radius x', tip: '오라 반경 배율', step: 0.01 },
    ],
    momentumMode: [
      { key: 'movingMult',       default: 1.5, label: 'Moving Mult',     tip: '이동 시 군대 속도 배율', step: 0.01 },
      { key: 'stillMult',        default: 0.5, label: 'Still Mult',      tip: '정지 시 군대 속도 배율', step: 0.01 },
      { key: 'dasherWindupMult', default: 1.2, label: 'Dasher Windup x', tip: '대셔 준비 시간 배율', step: 0.01 },
    ],
    stillnessStance: [
      { key: 'anchorLinger', default: 2000, label: 'Anchor Linger (ms)', tip: '정지 앵커 잔류 시간' },
    ],
    kitingVow: [
      { key: 'closeAtkCdMult', default: 2.0, label: 'Close Atk CD x',  tip: '근접 공격 쿨다운 배율', step: 0.01 },
      { key: 'farDashCdMult',  default: 0.7, label: 'Far Dash CD x',   tip: '원거리 대시 쿨다운 배율', step: 0.01 },
      { key: 'minDistToMark',  default: 200, label: 'Min Dist to Mark', tip: '궁병 사격 최소 거리' },
    ],
  },
  nodes: {
    vanguardSlowOnHit: [
      { key: 'slowFactor', default: 0.3,  label: 'Slow Factor',   tip: '첫 타 감속 비율', step: 0.01 },
      { key: 'slowDur',    default: 1000, label: 'Slow Duration', tip: '첫 타 감속 지속' },
    ],
    arrowPull: [
      { key: 'pullDist',  default: 100,  label: 'Pull Dist',     tip: '당김 거리' },
      { key: 'pullForce', default: 60,   label: 'Pull Force',    tip: '당김 힘' },
      { key: 'pullDur',   default: 1000, label: 'Pull Duration', tip: '당김 지속 시간' },
    ],
    markKillReward: [
      { key: 'buffDur', default: 3000, label: 'Buff Duration (ms)', tip: '마크 처치 후 버프 지속' },
    ],
    moveRotation: [
      { key: 'commitAngle', default: 25,  label: 'Commit Angle (°)', tip: '방향 전환 각도 (노드 적용)' },
      { key: 'cooldown',    default: 350, label: 'Cooldown (ms)',    tip: '방향 전환 쿨다운 (노드 적용)' },
    ],
    stillReward: [
      { key: 'stillDur',   default: 2000, label: 'Still Dur (ms)',  tip: '정지 유도 필요 시간' },
      { key: 'weakenDur',  default: 4000, label: 'Weaken Dur (ms)', tip: '측면 약화 지속 시간' },
    ],
    moveStartPenalty: [
      { key: 'archerLockDur', default: 1000, label: 'Archer Lock (ms)', tip: '이동 시작 후 궁병 사격 금지 시간' },
    ],
    fortressDoctrine: [
      { key: 'backSealDur', default: 500, label: 'Back Seal (ms)', tip: '정지 시 후방 봉쇄 시간' },
    ],
    stillCombatBan: [
      { key: 'speedThreshold', default: 10, label: 'Speed Threshold', tip: '군대 공격 억제 속도 임계값' },
    ],
    noBackwalk: [
      { key: 'velThreshold', default: 10,   label: 'Vel Threshold',    tip: '역주행 감지 속도 임계값' },
      { key: 'backDot',      default: 0.5,  label: 'Back Dot',         tip: '역주행 판정 내적 임계값 (부호 반전)', step: 0.01 },
      { key: 'backDirDur',   default: 1000, label: 'Back Dir Dur (ms)', tip: '역주행 허용 시간' },
      { key: 'clampMult',    default: 0.8,  label: 'Clamp Mult',       tip: '역주행 속도 감쇄 배율', step: 0.01 },
    ],
    skirmishDoctrine: [
      { key: 'flagDist',    default: 260, label: 'Flag Dist (px)',  tip: 'FLAG 기준 거리 임계값' },
      { key: 'backSealDur', default: 500, label: 'Back Seal (ms)', tip: '후방 봉쇄 시간' },
    ],
    ironWall: [
      { key: 'flagDist', default: 260, label: 'Flag Dist (px)', tip: 'FLAG 기준 공격 금지 거리' },
    ],
    markLock: [
      { key: 'lockDur', default: 2000, label: 'Lock Dur (ms)', tip: '마크 전환 잠금 시간' },
    ],
    executionDoctrine: [
      { key: 'exitDur', default: 2000, label: 'Exit Dur (ms)', tip: '마크 대상 강제 퇴장 시간' },
    ],
    archerMinRange: [
      { key: 'blockDist', default: 180, label: 'Block Dist (px)', tip: '궁병 사격 금지 근접 거리' },
    ],
    archerGuard: [
      { key: 'backSealDur', default: 2000, label: 'Back Seal (ms)', tip: '궁병 피격 시 후방 봉쇄 시간' },
    ],
    cavalryDoctrine: [
      { key: 'chaserFreezeDur', default: 2000, label: 'Chaser Freeze (ms)', tip: '기병 요격 시 추격병 동결 시간' },
      { key: 'backSealDur',     default: 2000, label: 'Back Seal (ms)',     tip: '기병 요격 후 후방 봉쇄 시간' },
    ],
  },
};

export const MOD_CATEGORY_LABELS: Record<ModCategory, string> = {
  items: 'Items',
  supports: 'Supports',
  keystones: 'Keystones',
  nodes: 'Nodes',
};

export const ITEM_DESCRIPTIONS: Record<string, string> = {
  heavyBlade: '공속↓ 넉백 부여',
  calmMind: '공속↑ 대시쿨↑ 군대공속↑',
  sprintBoots: '이속↑ 대시쿨↓ 체력↓',
  ironSkin: '이속↓ 정지 시 피격 무효',
  antiDashPlate: '무적 시간 연장',
  zoneCore: '존 강화 · 존밖 공속↓',
  hunterCharm: '적 감속 부여',
  bloodOath: '처치 누적 → 유닛 복원',
  fragilePower: '체력↓↓ 대시 무적↑',
};

export const SUPPORT_DESCRIPTIONS: Record<string, string> = {
  closeShock: '근접 시 공격 동결',
  zoneAnchor: '존 안 공속↑ 밖 공속↓',
  dashPrime: '대시 후 넉백 + 군대 가속',
  dashTax: '대시 후 공격 버프',
  farSnare: '원거리 감속 부여',
  rhythmWindow: '주기적 파워 윈도우',
};

export const KEYSTONE_DESCRIPTIONS: Record<string, string> = {
  closePact: '오라 축소 · 근접 자동 조준',
  momentumMode: '이동 시 군대↑↑ 정지 시 ↓↓',
  stillnessStance: '정지 앵커 잔류',
  kitingVow: '근접 공속↓ 원거리 대시↑',
};

export const NODE_DESCRIPTIONS: Record<string, string> = {
  vanguardSlowOnHit: '선봉 첫타 감속',
  arrowPull: '화살 끌기',
  markKillReward: '마크 처치 보상',
  moveRotation: '이동 전열 회전',
  stillReward: '정지 유도 보상',
  moveStartPenalty: '정지 해제 페널티',
  fortressDoctrine: '성채 교리',
  stillCombatBan: '정지 전투 금지',
  noBackwalk: '역주행 금지',
  skirmishDoctrine: '유격 교리',
  ironWall: '철벽 교리',
  markLock: '마크 전환 잠금',
  executionDoctrine: '집행 교리',
  archerMinRange: '궁병 근접 사격 금지',
  archerGuard: '궁병 피격 후방 봉쇄',
  cavalryDoctrine: '돌격 교리',
};

export const MOD_DESCRIPTIONS: Record<ModCategory, Record<string, string>> = {
  items: ITEM_DESCRIPTIONS,
  supports: SUPPORT_DESCRIPTIONS,
  keystones: KEYSTONE_DESCRIPTIONS,
  nodes: NODE_DESCRIPTIONS,
};

export const UNIT_DESCRIPTIONS: Record<string, string> = {
  vanguard: '전열 방어 · 근접전',
  archer: '원거리 화력 · 일제 사격',
  cavalry: '측면 요격 · 기동 차단',
};

export const ENEMY_DESCRIPTIONS: Record<string, string> = {
  chaser: '직선 추격 · 접촉 피해',
  dasher: '돌진 공격 · 관통',
  buffer: '아군 강화 오라',
};

