# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Behavioral Guidelines

### 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

### 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

### 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

### 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

## Commands

```bash
npm run dev      # Start Vite dev server (hot reload)
npm run build    # Production build to dist/
npm run preview  # Preview production build
```

No test runner or linter is configured.

## Architecture

Phaser 3.90 + Vite game prototype. Entry point: `index.html` → `src/main.js` → `src/scenes/GameScene.js`.

### Critical Phaser 3.90 Quirk

**`physics.add.group()` resets velocity to 0 on `group.add()`.**

The group's `createCallbackHandler` applies defaults (including `setVelocityX: 0`, `setVelocityY: 0`) to every added body. Always set velocity **after** calling `group.add()`, never before.

```js
// WRONG — velocity gets reset to 0 by group.add()
proj.setVelocity(vx, vy);
this.projectiles.add(proj);

// CORRECT
this.projectiles.add(proj);
proj.setVelocity(vx, vy);
```

### Projectile Pipeline

`GameScene._playerAutoFire()` → `GameScene.fireProjectile(config)` → `createProjectile()` (BaseProjectile.js) → `group.add()` → `setVelocity()`.

On overlap, `GameScene._onProjectileHitEnemy()` builds a shared `ctx` object and runs each modifier's `onHit(ctx)` in fixed order: **Mark → Bounce → Split**. Modifiers push to `ctx.spawnRequests`; the scene processes them after all modifiers run.

### Modifier System

`src/modifiers/Modifier.js` defines the base interface: `onHit(ctx)`.

`ctx` fields modifiers can mutate:
- `ctx.spawnRequests` — push projectile configs or `{ type: 'explosion', ... }`
- `ctx.keepEnemyAlive` — set `true` to prevent enemy death (used by Mark phase 1)
- `ctx.suppressOtherModifiers` — set `true` to skip remaining modifiers

**Adding a new modifier:** extend `Modifier`, implement `onHit(ctx)`, add an instance to `GameScene.modifierInstances`, add a toggle button in `index.html`.

### Entity Pattern

`Player` and `Enemy` extend `Phaser.Physics.Arcade.Image` (not Sprite — no animation needed). Constructor calls `scene.add.existing(this)` then `scene.physics.add.existing(this)`. Projectiles use `scene.physics.add.image()` via `createProjectile()` factory (plain function, not a class).

### Texture Generation

All textures are generated at runtime in `GameScene._createTextures()` using `this.make.graphics({ add: false })` + `generateTexture()`. No external assets.

---

## Lessons Learned (Do Not Repeat)

### 1. 스펙에 없는 기능을 임의로 추가하지 말 것

스펙: "자동 또는 버튼 공격 (둘 중 하나 아무거나)", "기본 공격은 직선 투사체 1개 발사"
실수: 스펙에 없는 "가장 가까운 적 자동 조준" 로직을 임의로 추가함.

**규칙: 스펙에 명시되지 않은 동작(조준 방식, 타겟팅 로직 등)을 추가하기 전에 반드시 확인할 것.**

### 2. 버그 진단 전에 코드부터 바꾸지 말 것

투사체가 움직이지 않는 증상에 대해 원인을 확인하지 않고 코드를 여러 차례 수정했다:
- `activePointer.worldX` 문제 추정 → 코드 변경
- 클래스 상속 문제 추정 → `Sprite`→`Image` 교체
- 팩토리 함수로 교체

실제 원인은 처음부터 하나였다: **`group.add()` 호출 시 velocity 리셋**.
Phaser 소스(`phaser.esm.js`)의 `createCallbackHandler`를 처음부터 확인했으면 한 번에 끝났다.

**규칙: 증상이 재현되면 코드 변경 전에 Phaser 소스에서 관련 메서드를 직접 grep해서 원인을 확정한 후 수정할 것.**

```bash
grep -n "createCallbackHandler\|setVelocityX\|setVelocityY" node_modules/phaser/dist/phaser.esm.js
```

### 3. 수정 후 직접 동작을 확인할 것

`npm run build` 성공 = 컴파일 에러 없음. 런타임 동작과 무관하다.
동작 확인 없이 "수정했으니 됩니다"라고 말하지 말 것.
Phaser 게임 버그는 브라우저 콘솔과 실제 실행으로만 확인 가능하다.
