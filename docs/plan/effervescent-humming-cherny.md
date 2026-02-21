# Plan: 전체 하드코딩 상수 스키마화 + Sim↔Game 완전 동기화

## Context

게임 코드 전체에 ~65개 하드코딩된 밸런스 상수가 산재. Sim에서 수정 불가.
요구사항: **모든 수치를 `shared/balance/` 스키마 → Sim 편집 → 인게임 자동 반영.**

아키텍처는 이미 올바름 (shared/balance/data.json → Vite API plugin → 양쪽 동일 파일).
문제: 스키마 누락 상수들 + Dasher entity가 balance를 안 읽는 버그.

---

## 파일 변경 요약

| 파일 | 변경 |
|------|------|
| `shared/balance/schema.ts` | CommanderStats/UnitStats/EnemyStats/GameConfig 확장 + ModifierConfig 추가 |
| `shared/balance/defaults.ts` | 모든 신규 필드 기본값 |
| `shared/balance/storage.ts` | validate()에 modifiers 검증 추가 |
| `src/entities/Dasher.ts` | 클래스 프로퍼티 추가, update()에서 참조 (버그 수정) |
| `src/army/GameRules.ts` | reform 상수 필드 추가 |
| `src/army/SquadPolicy.ts` | reform/vanguard/archer 잔여 하드코딩 교체 |
| `src/scenes/GameScene.ts` | 전 메서드 하드코딩 → balanceData 읽기 (가장 큰 변경) |
| `apps/sim/src/SimApp.ts` | 기존 탭 필드 확장 + Modifiers 탭 신설 |
| `CLAUDE.md` | modifiers 섹션 문서화 |

---

## Phase 1: Schema 확장 (`shared/balance/schema.ts`)

### 1-1. CommanderStats 추가 필드

```
reformSpeedMult (2.8), reformArriveRadius (18), reformBrakeRadius (70),
reformStaggerInterval (20), reformDuration (550),
commitAngle (35), commitSpeedThreshold (10), commitHoldTime (180),
commitSlerpFactor (0.6), commitCooldown (250),
chargeDuration (600), chargeRingStart (20), chargeRingMax (60), chargeDamageMult (3)
```

### 1-2. UnitStats 추가 필드

```
vanguardGapNormal (60), vanguardGapStill (35), holdSpeedMult (0.7), targetLockMs (800)
retreatSpeedMult (1.5), normalSpeedMult (0.5)
```

### 1-3. EnemyStats 추가 필드

```
flashInterval (80), telegraphLength (200), cooldownDuration (1200), speedRange (Chaser:20, Buffer:15)
```

### 1-4. GameConfig 추가 필드

```
squadSizeVanguard (8), squadSizeArcher (8), squadSizeCavalry (4),
separationDist (20), separationForce (25), formingExitDist (20),
anchorDecayVanguard (8), anchorDecayArcher (6), anchorDecayCavalry (9),
flagPenetrationRadius (40), flagPenetrationThreshold (2),
cameraZoomProximity (200), cameraZoomEnemyCount (3), cameraZoomIn (0.90), cameraZoomNormal (1.0), cameraZoomEase (4),
encounterStartSec (32), encounterEndSec (42), encounterEarlyExitSec (33),
zoneRadius (80), markExplosionRadius (80),
minAttackCD (100), minDashCD (400), armySpeedBoostMult (1.5)
```

### 1-5. 새 인터페이스: ModifierConfig

```ts
interface ModifierConfig {
  items: Partial<Record<ItemId, Record<string, number>>>;
  supports: Partial<Record<SupportId, Record<string, number>>>;
  keystones: Partial<Record<KeystoneId, Record<string, number>>>;
  nodes: Partial<Record<NodeId, Record<string, number>>>;
}
```

BalanceData에 `modifiers: ModifierConfig` 추가.

**Items (8종, ~19개 값):**
- heavyBlade: atkCdBonus=200, knockForce=150, knockDur=150
- calmMind: atkCdReduction=100, dashCdBonus=300, atkCdMult=0.8
- sprintBoots: speedMult=1.2, dashCdReduction=200, hpPenalty=1
- ironSkin: speedMult=0.8
- antiDashPlate: iframes=2000
- zoneCore: durationMult=1.5, atkCdBonusOut=200, dashCdReductionIn=400
- hunterCharm: slowFactor=0.4, slowDur=1500
- bloodOath: restoreKills=4
- fragilePower: hpPenalty=2, unitHpPenalty=1, extraDashIframes=100

**Supports (10종, ~17개 값):**
- closeShock: atkCdBonus=150, freezeDur=500, unitFreezeDur=300
- zoneAnchor: atkReduction=0.3, atkIncrease=0.2, duration=4000
- dashPrime: knockForce=200, knockDur=200, window=1000, armyBoostDur=1000
- dashTax: buffDur=1500
- farSnare: slowFactor=0.4, slowDur=1500, unitSlowFactor=0.3, unitSlowDur=1000
- rhythmWindow: cycleDur=3700, powerStart=3000

**Keystones (6종, ~9개 값):**
- closePact: auraRadiusMult=0.77
- momentumMode: movingMult=1.5, stillMult=0.5, dasherWindupMult=1.2
- stillnessStance: anchorLinger=2000
- kitingVow: closeAtkCdMult=2.0, farDashCdMult=0.7, minDistToMark=200
- fragilePower: (키스톤이면서 아이템 효과 — items에서 관리)

**Nodes (5개, ~9개 값):**
- A5: slowFactor=0.3, slowDur=1000
- B5: pullDist=100, pullForce=60, pullDur=1000
- D4: buffDur=3000
- F3: commitAngle=25, cooldown=350

---

## Phase 2: Defaults (`shared/balance/defaults.ts`)

위 모든 값을 DEFAULT_BALANCE에 추가. modifiers 섹션 신설.

---

## Phase 3: Dasher 버그 수정 (`src/entities/Dasher.ts`)

**문제**: GameScene이 `d.dashWindup`, `d.dashSpd` 등을 설정하지만 Dasher.update()가 하드코딩된 700/550/280/2500/80/200/1200 사용.

**수정**:
```ts
// 클래스 프로퍼티 추가
dashWindup = 700;
dashSpd = 550;
dashDur = 280;
patrolDur = 2500;
flashInterval = 80;
telegraphLen = 200;
cooldownDur = 1200;

// update()에서 this.xxx 참조로 교체
```

GameScene._spawnSingleEnemy()에서 patrolDuration/flashInterval/telegraphLength/cooldownDuration도 wiring.

---

## Phase 4: GameRules 확장 (`src/army/GameRules.ts`)

Reform 상수를 commander balance에서 읽어 rules에 전달:

```ts
reformSpeedMult: number;
reformArriveRadius: number;
reformBrakeRadius: number;
reformStaggerInterval: number;
```

---

## Phase 5: SquadPolicy 잔여 상수 교체 (`src/army/SquadPolicy.ts`)

| 상수 | 현재 | 교체 |
|------|------|------|
| REFORM_SPEED_MULT=2.8 | const | rules.reformSpeedMult |
| REFORM_ARRIVE_RADIUS=18 | const | rules.reformArriveRadius |
| REFORM_BRAKE_RADIUS=70 | const | rules.reformBrakeRadius |
| REFORM_STAGGER_INTERVAL=20 | const | rules.reformStaggerInterval |
| gap=60 (vanguard E2 off) | 하드코딩 | rules.vanguardBalance.vanguardGapNormal |
| gap=35 (vanguard E2 on) | 하드코딩 | rules.vanguardBalance.vanguardGapStill |
| 0.7 (hold speed) | 하드코딩 | rules.vanguardBalance.holdSpeedMult |
| 800 (target lock) | 하드코딩 | rules.vanguardBalance.targetLockMs |
| 1.5/0.5 (archer speed) | 하드코딩 | rules.archerBalance.retreatSpeedMult / normalSpeedMult |

---

## Phase 6: GameScene 하드코딩 교체 (`src/scenes/GameScene.ts`)

메서드별 교체 목록 (가장 큰 변경):

### _applyStaticBuildEffects() — items/keystones
- `200, 100, 300, 264, 176, 2000, 150, 0.77, 100, 2` → `bal.modifiers.items.xxx`, `bal.modifiers.keystones.xxx`

### _updateDynamicCooldowns() — zone/kiting
- `2, 0.7, 0.3, 0.2, 200, 400, 100, 400` → modifiers 읽기

### _playerAttack() / _armyUnitAttack() — 효과 수치
- 넉백/동결/감속 모든 수치 → modifiers 읽기

### _spawnSingleEnemy() — speedRange
- `rng() * 20` / `rng() * 15` → `bal.enemies.xxx.speedRange`

### _createArmyUnits() — squad size
- `8, 8, 4` → `bal.game.squadSizeXxx`

### _updateCommittedDir() — direction constants
- `35, 10, 180, 0.6, 250, 25, 350` → `bal.commander.commitXxx`

### _updateAnchors() — decay rates
- `8, 6, 9` → `bal.game.anchorDecayXxx`

### _checkFlagPenetration()
- `40, 2` → `bal.game.flagPenetrationXxx`

### _updateCamera()
- `200, 3, 0.90, 1.0, 4` → `bal.game.cameraZoomXxx`

### _handleReform()
- `550` → `bal.commander.reformDuration`

### _updateZone()
- `80, 4000, 1.5` → `bal.game.zoneRadius`, modifiers

### _updateRhythmWindow()
- `3700, 3000` → `bal.modifiers.supports.rhythmWindow.xxx`

### Separation/Forming
- `20, 25, 20` → `bal.game.separationXxx`, `bal.game.formingExitDist`

---

## Phase 7: SimApp UI (`apps/sim/src/SimApp.ts`)

### 기존 탭 확장
- **Commander**: + Reform 섹션 (5), + Direction 섹션 (5), + Charge 섹션 (4)
- **Vanguard Formation**: + vanguardGapNormal/Still, holdSpeedMult, targetLockMs
- **Archer Formation**: + retreatSpeedMult, normalSpeedMult
- **Dasher**: + flashInterval, telegraphLength, cooldownDuration
- **Chaser/Buffer**: + speedRange
- **Game**: + Army Comp (3), Separation (3), Anchor (3), Flag (2), Camera (5), Encounter (3), Zone (2), Cooldown Cap (2), SpeedBoost (1)

### 새 탭: **Modifiers**
Tab 추가, type 확장: `type Tab = 'commander' | 'units' | 'enemies' | 'game' | 'modifiers'`

Sub-list: Items / Supports / Keystones / Nodes
각 선택 시 해당 key-value 필드 표시.

`renderModifierEditor()` 메서드:
- 선택된 modifier 카테고리(items/supports/keystones/nodes) + 선택된 ID 기반
- 필드 정의는 `MODIFIER_FIELDS` 맵으로 관리

---

## Phase 8: CLAUDE.md + Validation

- CLAUDE.md에 modifiers 섹션 추가
- storage.ts validate()에 modifiers 검증

---

## 구현 순서

```
1. schema.ts 확장 (모든 인터페이스) → build
2. defaults.ts 확장 (모든 기본값) → build
3. Dasher.ts 버그 수정 → build
4. GameRules.ts reform 필드 → build
5. SquadPolicy.ts 잔여 상수 교체 → build
6. GameScene.ts 하드코딩 교체 (메서드별 순차) → build
7. SimApp.ts UI 확장 + Modifiers 탭 → build
8. storage.ts validate 보강 → build
9. CLAUDE.md 업데이트
```

## 검증

- `npm run build` 에러 없음
- `npm run dev:sim`:
  - Commander 탭: Reform/Direction/Charge 섹션 표시
  - Units 탭: 모든 squad에 Formation 필드 완비
  - Enemies 탭: Dasher에 flashInterval 등, Chaser/Buffer에 speedRange
  - Game 탭: Army/Separation/Anchor/Flag/Camera/Encounter/Zone/Cap 표시
  - **Modifiers 탭**: Items/Supports/Keystones/Nodes 편집 가능
- Sim에서 값 변경 → Save → Game 새 씬 → 변경 값 반영 확인
