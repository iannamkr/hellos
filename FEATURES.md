# Features Documentation

## Overview

Phaser 3.90 + Vite + TypeScript 전략 전투 프로토타입.
Commander(지휘관)가 3개 분대(선봉/궁병/기병)를 이끌고 3종류 적(Chaser/Dasher/Buffer)을 상대하는 실시간 전술 게임.

---

## 1. Build System (빌드 시스템)

### 1.1 Keystone (키스톤) — 6종
핵심 전투 스타일을 결정하는 단일 선택. 각각 고유 패널티/보상/군단 규칙 보유.

| ID | Label | Tags | Penalty | Benefit | Army Rule |
|----|-------|------|---------|---------|-----------|
| closePact | 근접 서약 | close, posture | 근접 밖 딜 0 | 근접 자동조준 | 선봉대 밀집 전방 대형 |
| kitingVow | 카이팅 서약 | far, kite | 근접 공격쿨 2배 | 원거리 대시쿨 -30% | 아군 지휘관 후방 유지 |
| stillnessStance | 정지 태세 | still, commit | 이동 중 공격 불가 | 정지 무적 +800ms | 정지 시 밀집 방진 |
| momentumMode | 기동 모드 | move, rhythm | 정지 중 공격 불가 | 이동 자동조준+텔레 -20% | 이동 중 아군 속도 +50% |
| singleTargetOath | 단일 서약 | priority, execute | 타겟변경 딜0.3x+마크초기화 | 3연속 처형 | 모든 아군 동일 타겟 집중 |
| fragilePower | 취약한 힘 | risk, sustain | HP최대 -2 | 4적중 HP+1, 대시무적+0.1s | 아군 HP-1, 사기 회복 2배 |

### 1.2 Skill (스킬) — 6종
Commander 공격의 기하학적 특성 결정.

| ID | Label | Arc | Range | Special |
|----|-------|-----|-------|---------|
| slash | 베기 | 90° | 80px | — |
| lunge | 돌진 | 60° | 100px | 60px 돌진 |
| cleave | 휩쓸기 | 180° | 60px | — |
| thrust | 찌르기 | 15° | 200px | — |
| guardBreak | 파쇄 | 120° | 120px | 0.6s 충전 3배 딜 |
| orbitCut | 회전참 | 360° | 50px | — |

### 1.3 Support (서포트) — 10종, 2개 선택
`requiredTags`를 만족하는 경우만 선택 가능. 조건부 보상/패널티.

| ID | Required Tags | Effect |
|----|---------------|--------|
| dashPrime | dash | 대시 후 1초 넉백+아군 이속+50% |
| markStack | mark, priority | 마크 3스택 폭발 (80px 범위 2 딜) |
| zoneAnchor | zone, still | 공격 시 존 생성, 존 안 쿨감 -30% |
| rhythmWindow | rhythm, charge | 3초 주기 0.7초 파워 윈도우 |
| finisherRule | execute | 저HP 적 +2 딜, 고HP -30% |
| bufferHunter | priority | Buffer +2 딜, 기타 -30% |
| dashTax | dash | 대시 HP-1, 공격강화 1.5초 |
| closeShock | close | 근접 500ms 스턴, 공격쿨+ |
| farSnare | far | 원거리 40% 슬로우 1.5초, 근접 -50% |
| commitmentLock | still | 정지 딜+2, 이동 -70% |

### 1.4 Item (아이템) — 8종, 1개 선택
스탯 수정 + 특수 효과.

| ID | Penalty | Benefit |
|----|---------|---------|
| bloodOath | 대시 HP-1 | 4적중 HP+1 |
| ironSkin | 이속 -20% | 정지 무적+500ms |
| sprintBoots | HP최대 -1 | 이속+20%, 대시쿨-200ms |
| heavyBlade | 공격쿨+200ms | 넉백+범위+20% |
| calmMind | 대시쿨+300ms | 공격쿨-100ms |
| hunterCharm | Chaser 피해 2배 | Chaser 딜+1, 슬로우 |
| antiDashPlate | 대시무적 제거 | 무적 2000ms |
| zoneCore | 존밖 공격쿨+200ms | 존+50%, 존안 대시쿨-400ms |

### 1.5 Preset (프리셋) — 6종
사전 정의 빌드 조합 (키스톤+스킬+서포트2+아이템).

### 1.6 Tag System
모든 빌드 요소는 Tag를 보유 (28종). Tag가 서포트 요구사항, 클러스터 활성화, 노드 잠금 해제에 사용됨.

---

## 2. Tree System (패시브 트리)

### 2.1 Cluster (클러스터) — 6종, 최대 2개 선택
활성화 조건: 빌드 태그 중 1개 이상이 클러스터 activationTags에 포함.

| ID | Label | Activation Tags |
|----|-------|-----------------|
| A | 전열 (Frontline) | close, posture, commit |
| B | 후열 (Backline) | far, kite, control |
| C | 요격 (Intercept) | dash, counter, movement |
| D | 표식 (Priority) | priority, execute, mark |
| E | 정지 (Still) | still, commit, zone |
| F | 이동 (Move) | move, dash, rhythm |

### 2.2 Node (노드) — 36종 (6×6), 클러스터당 최대 4개
각 노드는 ban(패널티) + liberation(보상). 타입: ban/convert/rule.

**Mini-Keystone (★)**: A6, B6, C6, D1, D6, E6, F3, F6 — 같은 클러스터에서 비미니키스톤 3개 이상 선택 시 해금.

### 2.3 Validation Rules
- 클러스터 최대 2개
- 클러스터당 노드 최대 4개
- 노드는 선택된 클러스터에 소속해야 함
- 노드 requiredTags 충족 필수
- 미니키스톤은 같은 클러스터 비키스톤 3개 필요

---

## 3. Entity (엔티티)

### 3.1 Player (Commander)
- **HP**: 5 (기본)
- **Speed**: 220px/s
- **Attack**: 400ms 쿨다운, 아크 기반 피해
- **Dash**: Shift 짧게 → 480px/s, 180ms, 1400ms 쿨다운
- **Reform**: Shift 220ms+ 홀드 → 550ms 전열 정렬, 2200ms 쿨다운
- **Invincibility**: 피격 후 1200ms, 대시 중 무적 (antiDashPlate 제외)

### 3.2 ArmyUnit (군단 유닛)
| Squad | ATK Range | ATK CD | DMG | Speed | HP | Engage R | Return R |
|-------|-----------|--------|-----|-------|----|----------|----------|
| Vanguard | 50px | 650ms | 1 | 200 | 2 | 170px | 220px |
| Archer | 420px | 900ms | 1 | 150 | 1 | 120px | 160px |
| Cavalry | 65px | 775ms | 1 | 300 | 2 | 160px | 210px |

### 3.3 EnemyBase
- **HP/Speed**: 타입별 상이
- **Slow System**: 스택형 (최대값 적용)
- **Freeze**: 시간 기반, 속도 0
- **Knockback**: 방향+힘 기반 밀림
- **Mark System**: 0-3+ 스택, 시각적 알파 피드백

### 3.4 Chaser (추격자)
- **HP**: 2, **Speed**: 75
- **States**: advance → line_hold (FLAG 380px 내 도달 시)
- **Cohesion**: 140px 내 다른 Chaser 방향 20% 블렌드
- **Line Hold**: FLAG 전방 350px, 9슬롯 포메이션

### 3.5 Dasher (돌진자)
- **HP**: 2, **Speed**: 55
- **States**: seek_gap → dash_in → disrupt → egress → (반복)
- **Telegraph**: 450ms (windupMultiplier 조정 가능)
- **Dash**: 550px/s, 280ms
- **Disrupt**: 0ms + 450ms 2회 타격 콜백
- **Gap Finding**: 5개 샘플 포인트, 선봉대 밀도 최소 지점

### 3.6 BufferEnemy (버퍼)
- **HP**: 3, **Speed**: 40-55 (랜덤)
- **Aura**: 120px 범위 내 아군(적) 속도 ×1.4

---

## 4. Squad Policy (분대 정책)

### 4.1 Vanguard Policy
- **Slots**: 2열 포메이션 (160px/100px), 60px 간격 (E2 정지 시 35px)
- **A1**: FLAG-Commander 수직선 기준 정렬
- **Targeting**: 마크 > 오라 내 > 플레이어 기준 최근접
- **A6**: FLAG 260px 내 고정 방진
- **kitingVow**: 오라 밖 추격 금지
- **Target Lock**: 0.8s 바디블록

### 4.2 Archer Policy
- **Slots**: 앵커 후방 260px/320px, 70px 간격
- **Targeting**: B3 마크 > D4 우선순위 > Buffer > Dasher(텔레그래프) > 최근접
- **Dead Zone**: 리더 기준 120px 내 사격 불가
- **B2**: 180px 내 사격 금지
- **Volley**: 900ms 주기, 120ms 윈도우
- **B6**: 마크 대상 추가 볼리

### 4.3 Cavalry Policy
- **Slots**: 양익 포메이션 (±210px), E3 정지 시 FLAG 순찰 (120px 원)
- **C1**: 텔레그래프 중 Dasher 강제 요격 (1.3x 속도)
- **Targeting**: Dasher 우선 (요격 > 대싱 > 일반)
- **Reform Override**: C1 요격은 Reform 중에도 유지

### 4.4 Reform Movement
- 2.8x 속도, 유닛별 20ms 시차
- 18px 내 스냅, 70px 내 브레이크
- A3 후퇴 금지 적용

---

## 5. Game Scene (게임 씬)

### 5.1 Stage
- **Duration**: Core 60s / Repeat 90s
- **Victory**: 시간 생존
- **Defeat**: Commander HP ≤ 0

### 5.2 Spawn System
- **Platoon**: 리더 + 6 윙맨
- **Interval**: 5s
- **Max**: Core 3 / Repeat 5 동시 platoon
- **Types**: Chaser(7), Dasher(5), Buffer(5)
- **Channels**: Front, FlankL, FlankR, Back
- **Formations**: WEDGE, LINE, COLUMN

### 5.3 Volley System
- 900ms 주기, 120ms 발사 윈도우
- 키스톤별 발사 조건 (closePact: 근접, kitingVow: 원거리 등)

### 5.4 Committed Direction
- 35° 임계값 (F3: 25°), 180ms 홀드, 60% slerp
- Reform 중 동결

### 5.5 Aura System
- 키스톤별 활성 조건 (정지/이동/항상)
- 반경: closePact 200px, 기타 260px

### 5.6 Contract & Reinforcement
- Core: 15s, 35s / Repeat: 15s, 35s, 55s, 75s
- 분대별 버프 부여

### 5.7 Encounter/Situation
- Core: 32-42s 후열 노출 이벤트
- Repeat: 12s 주기 상황 카드

---

## 6. Build Scene (빌드 씬)

### 6.1 3-Tab UI
- **프리셋**: 6개 사전 빌드
- **빌드**: 키스톤 + 스킬 + 서포트(2) + 아이템 (2열 그리드)
- **트리**: 클러스터 + 노드 선택

### 6.2 Right Panel
- 빌드 요약 (선택 항목)
- 트리 할당 (노드 수)
- 태그 목록
- 선택 노드 상세

### 6.3 Validation
- 서포트 태그 요구사항 필터링
- 클러스터 태그 활성화 검증
- 노드 잠금 해제 검증
- 미니키스톤 3노드 요구사항
- 키스톤/스킬/아이템 변경 시 무효 클러스터/노드 정리

---

## 7. Result Scene (결과 씬)

- 스테이지 클리어 / 사망 표시
- 처치 수 표시
- 전투 효율 (kills/sec 비율)
- 재시작 (R) / 빌드 변경 (B) 버튼
- 키보드 단축키

---

## 8. Color Palette

| Entity | Color | Hex |
|--------|-------|-----|
| Commander | Cyan | 0x00ffcc |
| Vanguard | Blue | 0x4d88ff |
| Archer | Green | 0x66ff66 |
| Cavalry | Yellow | 0xffcc33 |
| Chaser | Red | 0xff4444 |
| Dasher | Orange | 0xff8844 |
| Buffer | Purple | 0xaa55ff |

---

## 9. Technical Details

### 9.1 Phaser 3.90 Quirk
`group.add()` resets velocity to 0 — velocity 설정은 반드시 `group.add()` 이후.

### 9.2 Texture Generation
모든 텍스처 런타임 생성 (`make.graphics()` + `generateTexture()`). 외부 에셋 없음.

### 9.3 Camera
앵커 평균 추적, lerp 0.08, 적 근접 시 줌 (0.9-1.3).

### 9.4 Resolution
1920×1080, Phaser.Scale.FIT, CENTER_BOTH.
