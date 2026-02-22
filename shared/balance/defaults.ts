import type { BalanceData } from './schema';
import {
  extractDefaults, extractModifierDefaults,
  COMMANDER_FIELDS, COMMANDER_REFORM_FIELDS, COMMANDER_DIRECTION_FIELDS, COMMANDER_CHARGE_FIELDS,
  VANGUARD_BASE_FIELDS, VANGUARD_FORMATION_FIELDS,
  ARCHER_BASE_FIELDS, ARCHER_FORMATION_FIELDS,
  CAVALRY_BASE_FIELDS, CAVALRY_FORMATION_FIELDS, CAVALRY_STATE_FIELDS, CAVALRY_STABILITY_FIELDS,
  CHASER_BASE_FIELDS, CHASER_FIELDS,
  DASHER_BASE_FIELDS, DASHER_FIELDS,
  BUFFER_BASE_FIELDS, BUFFER_FIELDS,
  GAME_SPAWN_FIELDS, GAME_ARMY_FIELDS, GAME_SEPARATION_FIELDS, GAME_ANCHOR_FIELDS,
  GAME_FLAG_FIELDS, GAME_CAMERA_FIELDS, GAME_ENCOUNTER_FIELDS, GAME_ZONE_FIELDS, GAME_CAP_FIELDS,
  GAME_MOVEMENT_FIELDS, GAME_DIRECTION_FIELDS, GAME_SQUAD_FIELDS, GAME_FRONTLINE_FIELDS,
  MODIFIER_FIELDS,
} from './fields';

export const DEFAULT_BALANCE: BalanceData = {
  commander: {
    ...extractDefaults(COMMANDER_FIELDS),
    ...extractDefaults(COMMANDER_REFORM_FIELDS),
    ...extractDefaults(COMMANDER_DIRECTION_FIELDS),
    ...extractDefaults(COMMANDER_CHARGE_FIELDS),
  } as any,
  units: {
    vanguard: { ...extractDefaults(VANGUARD_BASE_FIELDS), ...extractDefaults(VANGUARD_FORMATION_FIELDS) } as any,
    archer:   { ...extractDefaults(ARCHER_BASE_FIELDS), ...extractDefaults(ARCHER_FORMATION_FIELDS) } as any,
    cavalry:  { ...extractDefaults(CAVALRY_BASE_FIELDS), ...extractDefaults(CAVALRY_FORMATION_FIELDS),
                ...extractDefaults(CAVALRY_STATE_FIELDS), ...extractDefaults(CAVALRY_STABILITY_FIELDS) } as any,
  },
  enemies: {
    chaser: { ...extractDefaults(CHASER_BASE_FIELDS), ...extractDefaults(CHASER_FIELDS) } as any,
    dasher: { ...extractDefaults(DASHER_BASE_FIELDS), ...extractDefaults(DASHER_FIELDS) } as any,
    buffer: { ...extractDefaults(BUFFER_BASE_FIELDS), ...extractDefaults(BUFFER_FIELDS) } as any,
  },
  game: {
    ...extractDefaults(GAME_SPAWN_FIELDS), ...extractDefaults(GAME_ARMY_FIELDS),
    ...extractDefaults(GAME_SEPARATION_FIELDS), ...extractDefaults(GAME_ANCHOR_FIELDS),
    ...extractDefaults(GAME_FLAG_FIELDS), ...extractDefaults(GAME_CAMERA_FIELDS),
    ...extractDefaults(GAME_ENCOUNTER_FIELDS), ...extractDefaults(GAME_ZONE_FIELDS),
    ...extractDefaults(GAME_CAP_FIELDS),
    ...extractDefaults(GAME_MOVEMENT_FIELDS), ...extractDefaults(GAME_DIRECTION_FIELDS),
    ...extractDefaults(GAME_SQUAD_FIELDS), ...extractDefaults(GAME_FRONTLINE_FIELDS),
  } as any,
  modifiers: extractModifierDefaults(MODIFIER_FIELDS) as any,
  meta: { version: 1 },
};
