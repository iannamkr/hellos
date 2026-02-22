import type { BalanceData, SquadType, EnemyType } from './schema';
import { DEFAULT_BALANCE } from './defaults';

const SQUAD_TYPES: SquadType[] = ['vanguard', 'archer', 'cavalry'];
const ENEMY_TYPES: EnemyType[] = ['chaser', 'dasher', 'buffer'];

/** Deep-merge loaded data with defaults so new optional fields get default values. */
function deepMergeModifiers(
  def: BalanceData['modifiers'],
  data?: Partial<BalanceData['modifiers']>,
): BalanceData['modifiers'] {
  if (!data) return structuredClone(def);
  const result: BalanceData['modifiers'] = { items: {}, supports: {}, keystones: {}, nodes: {} };
  for (const cat of ['items', 'supports', 'keystones', 'nodes'] as const) {
    const defCat = def[cat] ?? {};
    const dataCat = data[cat] ?? {};
    const merged: Record<string, Record<string, number>> = {};
    for (const key of new Set([...Object.keys(defCat), ...Object.keys(dataCat)])) {
      merged[key] = { ...(defCat[key] ?? {}), ...(dataCat[key] ?? {}) };
    }
    result[cat] = merged;
  }
  return result;
}

function mergeWithDefaults(data: BalanceData): BalanceData {
  const def = DEFAULT_BALANCE;
  return {
    ...data,
    commander: { ...def.commander, ...data.commander },
    units: {
      vanguard: { ...def.units.vanguard, ...data.units.vanguard },
      archer: { ...def.units.archer, ...data.units.archer },
      cavalry: { ...def.units.cavalry, ...data.units.cavalry },
    },
    enemies: {
      chaser: { ...def.enemies.chaser, ...data.enemies.chaser },
      dasher: { ...def.enemies.dasher, ...data.enemies.dasher },
      buffer: { ...def.enemies.buffer, ...data.enemies.buffer },
    },
    game: { ...def.game, ...data.game },
    modifiers: deepMergeModifiers(def.modifiers, (data as any).modifiers),
    meta: { ...def.meta, ...data.meta },
  };
}

/** Load balance from /api/balance (synchronous XHR, dev-only). */
export function loadBalance(): BalanceData {
  try {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', '/api/balance', false);
    xhr.send();
    if (xhr.status === 200) {
      const data = JSON.parse(xhr.responseText);
      validate(data);
      return mergeWithDefaults(data);
    }
  } catch { /* fall through */ }
  return structuredClone(DEFAULT_BALANCE);
}

/** Save balance to /api/balance (async POST). */
export async function saveBalanceToApi(data: BalanceData): Promise<void> {
  validate(data);
  await fetch('/api/balance', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data, null, 2),
  });
}

export function exportBalanceToJson(data: BalanceData): string {
  return JSON.stringify(data, null, 2);
}

export function importBalanceFromJson(json: string): BalanceData {
  let data: any;
  try {
    data = JSON.parse(json);
  } catch {
    throw new Error('Invalid JSON');
  }
  validate(data);
  return mergeWithDefaults(data as BalanceData);
}

function validate(data: any): void {
  if (!data || typeof data !== 'object') throw new Error('Root must be an object');
  if (!data.commander || typeof data.commander !== 'object') throw new Error('Missing "commander"');
  if (!data.units || typeof data.units !== 'object') throw new Error('Missing "units"');
  if (!data.enemies || typeof data.enemies !== 'object') throw new Error('Missing "enemies"');
  if (!data.game || typeof data.game !== 'object') throw new Error('Missing "game"');
  if (!data.meta || typeof data.meta !== 'object') throw new Error('Missing "meta"');

  const c = data.commander;
  for (const k of ['maxHp','speed','atkCD','dashCD','dashDuration','dashSpeed','iframes','reformCD','reformThreshold']) {
    checkNum(c[k], `commander.${k}`);
  }

  for (const s of SQUAD_TYPES) {
    const u = data.units[s];
    if (!u) throw new Error(`Missing unit: ${s}`);
    for (const k of ['maxHp','dmg','atkCD','unitSpeed','range','engageRadius','returnRadius']) {
      checkNum(u[k], `units.${s}.${k}`);
    }
  }

  for (const e of ENEMY_TYPES) {
    const en = data.enemies[e];
    if (!en) throw new Error(`Missing enemy: ${e}`);
    checkNum(en.maxHp, `enemies.${e}.maxHp`);
    checkNum(en.touchDmg, `enemies.${e}.touchDmg`);
    checkNum(en.speed, `enemies.${e}.speed`);
    // Optional fields: validate if present
    for (const k of ['dashWindup','dashSpeed','dashDuration','disruptDuration','egressDuration','egressSpeed',
      'penetrationDist','lineHoldDist','cohesionRadius','slotSpacing','lineHoldSpeedMult','auraRadius','auraSpeedBoost',
      'speedRange','patrolDuration','flashInterval','telegraphLength','cooldownDuration']) {
      if (en[k] !== undefined) checkNum(en[k], `enemies.${e}.${k}`);
    }
  }

  const g = data.game;
  for (const k of ['platoonSpawnInterval','platoonSizeChaser','platoonSizeDasher','platoonSizeBuffer',
    'volleyCycle','volleyWindow','commandAuraRadius']) {
    checkNum(g[k], `game.${k}`);
  }

  // Optional game fields
  for (const k of ['squadSizeVanguard','squadSizeArcher','squadSizeCavalry','separationDist','separationForce',
    'formingExitDist','anchorDecayVanguard','anchorDecayArcher','anchorDecayCavalry',
    'flagPenetrationRadius','flagPenetrationThreshold','cameraZoomProximity','cameraZoomEnemyCount',
    'cameraZoomIn','cameraZoomNormal','cameraZoomEase','encounterStartSec','encounterEndSec',
    'encounterEarlyExitSec','zoneRadius','markExplosionRadius','minAttackCD','minDashCD','armySpeedBoostMult',
    'moveHaltDist','moveSoftZone','moveSoftSpeedMult','moveSoftSpeedCap','moveFarSpeedMult',
    'dirTurnRate','aimDeadZone','squadReformDur','squadProtectDur',
    'frontLineFwdMin','frontLineFwdMax','frontLineMinCount','frontLineCollapseDur','frontLineEngageDist']) {
    if (g[k] !== undefined) checkNum(g[k], `game.${k}`);
  }

  // Modifiers: validate nested number values if present
  if (data.modifiers && typeof data.modifiers === 'object') {
    for (const cat of ['items', 'supports', 'keystones', 'nodes']) {
      const section = (data.modifiers as any)[cat];
      if (!section || typeof section !== 'object') continue;
      for (const [id, vals] of Object.entries(section)) {
        if (!vals || typeof vals !== 'object') continue;
        for (const [k, v] of Object.entries(vals as Record<string, unknown>)) {
          if (typeof v === 'number') checkNum(v, `modifiers.${cat}.${id}.${k}`);
        }
      }
    }
  }
}

function checkNum(val: any, label: string): void {
  if (typeof val !== 'number' || isNaN(val)) throw new Error(`${label} must be a number`);
  if (val < 0 || val > 9999) throw new Error(`${label} out of range (0-9999)`);
}
