# Development Guide

## Running Apps

Two separate apps share the same codebase:

```bash
# Game (Phaser) — default port 5173
npm run dev -- --app=game
# or
npm run dev:game

# Balance Simulator — default port 5174
npm run dev -- --app=sim
# or
npm run dev:sim
```

## Balance Data Flow

1. **Sim App** (`apps/sim/`) — edit unit/enemy stats via GUI, auto-saved to `localStorage` key `HELL0S_BALANCE_V1`.
2. **Game App** (`apps/game/`) — on scene create, loads balance from the same `localStorage` key.
3. Refresh the game after changing stats in the sim to see the new values applied.

### Export / Import

- In the Sim App, click **Export** to see the current balance as JSON.
- Click **Copy** to copy it to clipboard.
- Paste JSON into the textarea and click **Import / Apply** to load it.
- Click **Load File...** to import from a `.json` file.
- Click **Reset to Defaults** to restore hardcoded defaults.

### Storage

- Key: `HELL0S_BALANCE_V1`
- Location: browser `localStorage` (same origin, so both apps on localhost share it)

## Project Structure

```
apps/
  game/         # Phaser game entry (index.html + src/main.ts + vite.config.ts)
  sim/          # Balance simulator entry (index.html + src/ + vite.config.ts)
shared/
  balance/      # Shared balance schema, defaults, storage, calc
    schema.ts   # Type definitions (SquadType, EnemyType, UnitStats, EnemyStats, BalanceData)
    defaults.ts # Default balance values
    storage.ts  # localStorage load/save/export/import with validation
    calc.ts     # DPS and TTK calculations
scripts/
  dev.mjs       # Dev server launcher (--app=game|sim)
src/            # Core game code (scenes, entities, etc.)
```
