import type { BalanceData } from './schema';

export const DEFAULT_BALANCE: BalanceData = {
  commander: {
    maxHp: 5,
    speed: 220,
    atkCD: 400,
    dashCD: 1400,
    dashDuration: 180,
    dashSpeed: 480,
    iframes: 1200,
    reformCD: 2200,
    reformThreshold: 220,
    // Reform movement
    reformSpeedMult: 2.8,
    reformArriveRadius: 18,
    reformBrakeRadius: 70,
    reformStaggerInterval: 20,
    reformDuration: 550,
    // Committed direction
    commitAngle: 35,
    commitSpeedThreshold: 10,
    commitHoldTime: 180,
    commitSlerpFactor: 0.6,
    commitCooldown: 250,
    // Charge
    chargeDuration: 600,
    chargeRingStart: 20,
    chargeRingMax: 60,
    chargeDamageMult: 3,
  },
  units: {
    vanguard: {
      maxHp: 2, dmg: 1, atkCD: 650, unitSpeed: 200, range: 50, engageRadius: 170, returnRadius: 220,
      lineDepth: 160, holdIn: 35, holdOut: 55,
      vanguardGapNormal: 60, vanguardGapStill: 35, holdSpeedMult: 0.7, targetLockMs: 800,
    },
    archer: {
      maxHp: 1, dmg: 1, atkCD: 900, unitSpeed: 150, range: 420, engageRadius: 120, returnRadius: 160,
      rank0Depth: 260, rank1Depth: 320, slotGap: 70, maxSpread: 240, deadZone: 120,
      retreatSpeedMult: 1.5, normalSpeedMult: 0.5,
    },
    cavalry: {
      maxHp: 2, dmg: 1, atkCD: 775, unitSpeed: 300, range: 65, engageRadius: 160, returnRadius: 210,
      gapSpacing: 120, gapOffset: -40, gapCalcInterval: 200,
      seekInterceptDist: 160, interceptLerp: 0.55, egressDepth: 260,
      interceptTimeout: 2000, interceptSpeedMult: 1.3, cavDisruptDuration: 700,
      cavDisruptMaxHits: 2, cavEgressDuration: 1000, gapScanRadius: 140,
      gapTargetRadius: 260, maxConcurrentIntercepts: 2,
      cavStickyMs: 1200, cavImproveDelta: 1.25,
      cavGapRIn: 240, cavGapROut: 320, cavSeenMs: 200,
      cavSlotAlpha: 0.2, cavAccel: 2800,
      cavInterceptMaxLateral: 140, cavInterceptFixedDepth: 60,
    },
  },
  enemies: {
    chaser: {
      maxHp: 2, touchDmg: 1, speed: 75, speedRange: 20,
      lineHoldDist: 350, cohesionRadius: 140, slotSpacing: 45, lineHoldSpeedMult: 0.5,
    },
    dasher: {
      maxHp: 2, touchDmg: 1, speed: 95, speedRange: 0,
      dashWindup: 450, dashSpeed: 550, dashDuration: 280, patrolDuration: 2500,
      flashInterval: 80, telegraphLength: 200, cooldownDuration: 1200,
      disruptDuration: 900, egressDuration: 1200, egressSpeed: 95, penetrationDist: 220,
    },
    buffer: {
      maxHp: 3, touchDmg: 0, speed: 48, speedRange: 15,
      auraRadius: 120, auraSpeedBoost: 1.4,
    },
  },
  game: {
    platoonSpawnInterval: 5000,
    platoonSizeChaser: 7,
    platoonSizeDasher: 5,
    platoonSizeBuffer: 5,
    volleyCycle: 900,
    volleyWindow: 120,
    commandAuraRadius: 260,
    // Army composition
    squadSizeVanguard: 8,
    squadSizeArcher: 8,
    squadSizeCavalry: 4,
    // Separation
    separationDist: 20,
    separationForce: 25,
    formingExitDist: 20,
    // Anchor decay
    anchorDecayVanguard: 8,
    anchorDecayArcher: 6,
    anchorDecayCavalry: 9,
    // Flag penetration
    flagPenetrationRadius: 40,
    flagPenetrationThreshold: 2,
    // Camera
    cameraZoomProximity: 200,
    cameraZoomEnemyCount: 3,
    cameraZoomIn: 0.90,
    cameraZoomNormal: 1.0,
    cameraZoomEase: 4,
    // Encounter timing
    encounterStartSec: 32,
    encounterEndSec: 42,
    encounterEarlyExitSec: 33,
    // Zone
    zoneRadius: 80,
    markExplosionRadius: 80,
    // Cooldown caps
    minAttackCD: 100,
    minDashCD: 400,
    // Speed boost
    armySpeedBoostMult: 1.5,
  },
  modifiers: {
    items: {
      heavyBlade: { atkCdBonus: 200, knockForce: 150, knockDur: 150 },
      calmMind: { atkCdReduction: 100, dashCdBonus: 300, atkCdMult: 0.8 },
      sprintBoots: { speedMult: 1.2, dashCdReduction: 200, hpPenalty: 1 },
      ironSkin: { speedMult: 0.8 },
      antiDashPlate: { iframes: 2000 },
      zoneCore: { durationMult: 1.5, atkCdBonusOut: 200, dashCdReductionIn: 400 },
      hunterCharm: { slowFactor: 0.4, slowDur: 1500 },
      bloodOath: { restoreKills: 4 },
      fragilePower: { hpPenalty: 2, unitHpPenalty: 1, extraDashIframes: 100 },
    },
    supports: {
      closeShock: { atkCdBonus: 150, freezeDur: 500, unitFreezeDur: 300 },
      zoneAnchor: { atkReduction: 0.3, atkIncrease: 0.2, duration: 4000 },
      dashPrime: { knockForce: 200, knockDur: 200, window: 1000, armyBoostDur: 1000 },
      dashTax: { buffDur: 1500 },
      farSnare: { slowFactor: 0.4, slowDur: 1500, unitSlowFactor: 0.3, unitSlowDur: 1000 },
      rhythmWindow: { cycleDur: 3700, powerStart: 3000 },
    },
    keystones: {
      closePact: { auraRadiusMult: 0.77 },
      momentumMode: { movingMult: 1.5, stillMult: 0.5, dasherWindupMult: 1.2 },
      stillnessStance: { anchorLinger: 2000 },
      kitingVow: { closeAtkCdMult: 2.0, farDashCdMult: 0.7, minDistToMark: 200 },
    },
    nodes: {
      A5: { slowFactor: 0.3, slowDur: 1000 },
      B5: { pullDist: 100, pullForce: 60, pullDur: 1000 },
      D4: { buffDur: 3000 },
      F3: { commitAngle: 25, cooldown: 350 },
    },
  },
  meta: { version: 1 },
};
