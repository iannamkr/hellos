# Squad Debug Overlay 구현

## Context

각 부대(선봉/궁병/기병)가 어떻게 슬롯으로 이동하고, 타겟을 선택하고, 교전/대기/정렬 판단을 내리는지 실시간으로 시각화하는 디버그 오버레이. `F` 키로 토글.

변경 파일: `src/scenes/GameScene.ts` 1개만.

---

## 새 필드 (4개)

```typescript
private debugOn = false;
private debugGfx!: Phaser.GameObjects.Graphics;     // world-space (카메라 따라감)
private debugHudGfx!: Phaser.GameObjects.Graphics;   // screen-space (HUD 고정)
private debugText!: Phaser.GameObjects.Text;          // screen-space 정보 패널
```

---

## create()에 추가

- `F` 키 바인딩으로 debugOn 토글 + 3개 오브젝트 visible 전환
- `debugGfx`: `this.add.graphics().setDepth(100)` — world-space
- `debugHudGfx`: `this.add.graphics().setDepth(10001).setScrollFactor(0)` — screen HUD
- `debugText`: 좌상단 13px Courier New, 배경 반투명 검정
- 모두 초기 visible=false

---

## update()에 추가

`_refreshSquadDisplay()` 뒤에 `if (this.debugOn) this._drawSquadDebug();`

---

## `_drawSquadDebug()` 메서드 — 시각화 내용

### World-space 레이어 (debugGfx) — 카메라 따라감

| # | 요소 | 설명 |
|---|------|------|
| 1 | **슬롯 마커** | 각 유닛 슬롯(slotX,slotY)에 작은 X (부대색, alpha 0.4) |
| 2 | **슬롯 연결선** | 유닛 → 슬롯 얇은 선 (부대색, alpha 0.15) |
| 3 | **타겟선** | lockedTarget이 있는 유닛 → 타겟 연결선 (부대색, alpha 0.5, 두꺼움) |
| 4 | **상태 표시** | FORMING=빈 원, HOLD=사각형, ENGAGE=채워진 원+빨강 (유닛 아래) |
| 5 | **교전 반경** | 부대별 대표 1명: engageRadius(점선원, alpha 0.08), returnRadius(원, alpha 0.05) |
| 6 | **앵커 십자** | anchorPosV(파랑), anchorPosA(초록), anchorPosC(노랑) — 큰 십자 마커 |
| 7 | **오라 원** | aura circle (`0x00ff88`, alpha 0.2) |
| 8 | **궁병 사거리** | archerLeader 기준 420px 원 (초록, alpha 0.12) |
| 9 | **궁병 사각지대** | archerLeader 기준 120px 원 (빨강, alpha 0.12) |
| 10 | **진형 방향** | player → dir * 180 (흰색, alpha 0.4) |
| 11 | **Reform 방향** | reformActive 시 노란색 방향선 |
| 12 | **전술 마크** | mark 대상 적 주위 맥동 원 (`0xff00ff`, alpha 0.5) |

### Screen-space 패널 (debugText) — 좌상단

```
[F] Squad Debug
─────────────────
선봉  8  FORM:2  HOLD:4  ENG:2
궁병  8  FORM:0  HOLD:6  ENG:2
기병  4  FORM:0  HOLD:3  ENG:1
─────────────────
Reform: OFF | AtkOff: NO | ArchFire: NO
Volley: OPEN | SpeedMult: 1.50
Mark: (520,300) | K5: none
Aura: ON r=260
Dir: (0.71, -0.71)
```

---

## 검증

```bash
npm run build
npm run test
```

브라우저: F 키 토글, 슬롯/타겟/상태/오라/사거리 실시간 확인
