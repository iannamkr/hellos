export type SquadType = 'vanguard' | 'archer' | 'cavalry';
export type EnemyType = 'chaser' | 'dasher' | 'buffer';

export interface CommanderStats {
  maxHp: number;
  speed: number;
  atkCD: number;
  dashCD: number;
  dashDuration: number;
  dashSpeed: number;
  iframes: number;
  reformCD: number;
  reformThreshold: number;
  // Reform movement
  reformSpeedMult?: number;
  reformArriveRadius?: number;
  reformBrakeRadius?: number;
  reformStaggerInterval?: number;
  reformDuration?: number;
  // Committed direction
  commitAngle?: number;
  commitSpeedThreshold?: number;
  commitHoldTime?: number;
  commitSlerpFactor?: number;
  commitCooldown?: number;
  // Charge
  chargeDuration?: number;
  chargeRingStart?: number;
  chargeRingMax?: number;
  chargeDamageMult?: number;
}

export interface UnitStats {
  maxHp: number;
  dmg: number;
  atkCD: number;
  unitSpeed: number;
  range: number;
  engageRadius: number;
  returnRadius: number;
  // Vanguard-specific formation
  lineDepth?: number;
  holdIn?: number;
  holdOut?: number;
  vanguardGapNormal?: number;
  vanguardGapStill?: number;
  holdSpeedMult?: number;
  targetLockMs?: number;
  // Archer-specific formation
  rank0Depth?: number;
  rank1Depth?: number;
  slotGap?: number;
  maxSpread?: number;
  deadZone?: number;
  retreatSpeedMult?: number;
  normalSpeedMult?: number;
  // Cavalry formation
  gapSpacing?: number;
  gapOffset?: number;
  gapCalcInterval?: number;
  seekInterceptDist?: number;
  interceptLerp?: number;
  egressDepth?: number;
  // Cavalry state machine
  interceptTimeout?: number;
  interceptSpeedMult?: number;
  cavDisruptDuration?: number;
  cavDisruptMaxHits?: number;
  cavEgressDuration?: number;
  gapScanRadius?: number;
  gapTargetRadius?: number;
  maxConcurrentIntercepts?: number;
  // Cavalry stability
  cavStickyMs?: number;
  cavImproveDelta?: number;
  cavGapRIn?: number;
  cavGapROut?: number;
  cavSeenMs?: number;
  cavSlotAlpha?: number;
  cavAccel?: number;
  cavInterceptMaxLateral?: number;
  cavInterceptFixedDepth?: number;
  // Vanguard guard/intercept
  protectR?: number;
  protectR2?: number;
  protectROut?: number;
  breachDepth?: number;
  interceptPush?: number;
  guardThreatMs?: number;
  guardThreatSpeedMult?: number;
  // Vanguard A3 push
  a3PushForce?: number;
  // Archer
  slotArrDist?: number;
  // Cavalry spread
  cavLoadLambda?: number;
  cavLateralSpread?: number;
  cavDepthSpread?: number;
  cavEgressGapScale?: number;
}

export interface EnemyStats {
  maxHp: number;
  touchDmg: number;
  speed: number;
  speedRange?: number;
  // Dasher-specific
  dashWindup?: number;
  dashSpeed?: number;
  dashDuration?: number;
  patrolDuration?: number;
  flashInterval?: number;
  telegraphLength?: number;
  cooldownDuration?: number;
  disruptDuration?: number;
  egressDuration?: number;
  egressSpeed?: number;
  penetrationDist?: number;
  // Chaser-specific
  lineHoldDist?: number;
  cohesionRadius?: number;
  slotSpacing?: number;
  lineHoldSpeedMult?: number;
  // Buffer-specific
  auraRadius?: number;
  auraSpeedBoost?: number;
}

export interface GameConfig {
  platoonSpawnInterval: number;
  platoonSizeChaser: number;
  platoonSizeDasher: number;
  platoonSizeBuffer: number;
  volleyCycle: number;
  volleyWindow: number;
  commandAuraRadius: number;
  // Army composition
  squadSizeVanguard?: number;
  squadSizeArcher?: number;
  squadSizeCavalry?: number;
  // Separation
  separationDist?: number;
  separationForce?: number;
  formingExitDist?: number;
  // Anchor decay
  anchorDecayVanguard?: number;
  anchorDecayArcher?: number;
  anchorDecayCavalry?: number;
  // Flag penetration
  flagPenetrationRadius?: number;
  flagPenetrationThreshold?: number;
  // Camera
  cameraZoomProximity?: number;
  cameraZoomEnemyCount?: number;
  cameraZoomIn?: number;
  cameraZoomNormal?: number;
  cameraZoomEase?: number;
  // Encounter timing (core mode)
  encounterStartSec?: number;
  encounterEndSec?: number;
  encounterEarlyExitSec?: number;
  // Zone
  zoneRadius?: number;
  markExplosionRadius?: number;
  // Cooldown caps
  minAttackCD?: number;
  minDashCD?: number;
  // Speed boost
  armySpeedBoostMult?: number;
  // Movement thresholds (moveToSlot)
  moveHaltDist?: number;
  moveSoftZone?: number;
  moveSoftSpeedMult?: number;
  moveSoftSpeedCap?: number;
  moveFarSpeedMult?: number;
  // Direction
  dirTurnRate?: number;
  aimDeadZone?: number;
  // Squad reform/protect timing
  squadReformDur?: number;
  squadProtectDur?: number;
  // Front-line detection
  frontLineFwdMin?: number;
  frontLineFwdMax?: number;
  frontLineMinCount?: number;
  frontLineCollapseDur?: number;
  frontLineEngageDist?: number;
}

export interface ModifierConfig {
  items: Partial<Record<string, Record<string, number>>>;
  supports: Partial<Record<string, Record<string, number>>>;
  keystones: Partial<Record<string, Record<string, number>>>;
  nodes: Partial<Record<string, Record<string, number>>>;
}

export interface BalanceData {
  commander: CommanderStats;
  units: Record<SquadType, UnitStats>;
  enemies: Record<EnemyType, EnemyStats>;
  game: GameConfig;
  modifiers: ModifierConfig;
  meta: { version: number; note?: string };
}
