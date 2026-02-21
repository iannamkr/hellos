import type { BalanceData, UnitStats, EnemyStats, SquadType, EnemyType } from './schema';

export function calcUnitDps(unit: UnitStats): number {
  if (unit.atkCD <= 0) return 0;
  return unit.dmg / (unit.atkCD / 1000);
}

export function calcTtk(unit: UnitStats, enemy: EnemyStats): number {
  const dps = calcUnitDps(unit);
  if (dps <= 0) return Infinity;
  return enemy.maxHp / dps;
}

export interface BalanceSummary {
  unitDps: Record<SquadType, number>;
  ttkMatrix: Record<SquadType, Record<EnemyType, number>>;
}

export function summarize(balance: BalanceData): BalanceSummary {
  const squads: SquadType[] = ['vanguard', 'archer', 'cavalry'];
  const enemyTypes: EnemyType[] = ['chaser', 'dasher', 'buffer'];

  const unitDps = {} as Record<SquadType, number>;
  const ttkMatrix = {} as Record<SquadType, Record<EnemyType, number>>;

  for (const s of squads) {
    unitDps[s] = calcUnitDps(balance.units[s]);
    ttkMatrix[s] = {} as Record<EnemyType, number>;
    for (const e of enemyTypes) {
      ttkMatrix[s][e] = calcTtk(balance.units[s], balance.enemies[e]);
    }
  }

  return { unitDps, ttkMatrix };
}
