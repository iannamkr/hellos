import type { KeystoneDef, SkillDef, SupportDef, ItemDef, PresetDef, KeystoneId, SkillId, SupportId, ItemId } from '../types';

export const KEYSTONES: KeystoneDef[] = [
  { id: 'closePact', label: '근접 서약', tags: ['close', 'posture'], penalty: '근접 밖 딜 0', benefit: '근접 자동조준', armyRule: '선봉대 밀집 전방 대형' },
  { id: 'kitingVow', label: '카이팅 서약', tags: ['far', 'kite'], penalty: '근접 공격쿨 2배', benefit: '원거리 대시쿨 -30%', armyRule: '아군 지휘관 후방 유지' },
  { id: 'stillnessStance', label: '정지 태세', tags: ['still', 'commit'], penalty: '이동 중 공격 불가', benefit: '정지 무적 +800ms', armyRule: '정지 시 밀집 방진' },
  { id: 'momentumMode', label: '기동 모드', tags: ['move', 'rhythm'], penalty: '정지 중 공격 불가', benefit: '이동 자동조준+텔레 -20%', armyRule: '이동 중 아군 속도 +50%' },
  { id: 'singleTargetOath', label: '단일 서약', tags: ['priority', 'execute'], penalty: '타겟변경 딜0.3x+마크초기화', benefit: '3연속 처형', armyRule: '모든 아군 동일 타겟 집중' },
  { id: 'fragilePower', label: '취약한 힘', tags: ['risk', 'sustain'], penalty: 'HP최대 -2', benefit: '4적중 HP+1, 대시무적+0.1s', armyRule: '아군 HP-1, 사기 회복 2배' },
];

export const SKILLS: SkillDef[] = [
  { id: 'slash', label: '베기', tags: ['melee', 'attack'], desc: '90° 80px 부채꼴', arcDeg: 90, arcRange: 80 },
  { id: 'lunge', label: '돌진', tags: ['melee', 'movement', 'attack'], desc: '60px 돌진 + 60° 100px', arcDeg: 60, arcRange: 100, special: 'lunge' },
  { id: 'cleave', label: '휩쓸기', tags: ['melee', 'aoe', 'attack'], desc: '180° 60px 광역', arcDeg: 180, arcRange: 60 },
  { id: 'thrust', label: '찌르기', tags: ['melee', 'line', 'attack'], desc: '15° 200px 직선', arcDeg: 15, arcRange: 200 },
  { id: 'guardBreak', label: '파쇄', tags: ['charge', 'burst', 'attack'], desc: '0.6s충전 120° 120px 3배', arcDeg: 120, arcRange: 120, special: 'charge' },
  { id: 'orbitCut', label: '회전참', tags: ['melee', 'control', 'attack'], desc: '360° 50px 회전', arcDeg: 360, arcRange: 50 },
];

export const SUPPORTS: SupportDef[] = [
  { id: 'dashPrime', label: '대시 프라임', tags: ['dash', 'prime'], requiredTags: ['dash'], desc: '대시후 1초 넉백부여', armyRule: '대시 후 아군 이속+50% 1초' },
  { id: 'markStack', label: '마크 축적', tags: ['mark', 'execute'], requiredTags: ['mark', 'priority'], desc: '마크3스택 폭발', armyRule: '아군 공격 시 마크 1스택' },
  { id: 'zoneAnchor', label: '존 앵커', tags: ['zone', 'posture'], requiredTags: ['zone', 'still'], desc: '공격시 존, 존안 쿨감', armyRule: '존 안 아군 공격쿨 -30%' },
  { id: 'rhythmWindow', label: '리듬 창', tags: ['rhythm', 'timing'], requiredTags: ['rhythm', 'charge'], desc: '3초마다 0.7초 강화창', armyRule: '파워윈도우 중 아군 딜+1' },
  { id: 'finisherRule', label: '마무리 법칙', tags: ['execute'], requiredTags: ['execute'], desc: '저HP 추가피해', armyRule: '아군도 저HP 적 딜+1' },
  { id: 'bufferHunter', label: '버퍼 사냥꾼', tags: ['priority', 'counter'], requiredTags: ['priority'], desc: 'Buffer 추가딜, 타적 약화', armyRule: '궁병대 Buffer 우선 타격' },
  { id: 'dashTax', label: '대시 세금', tags: ['dash', 'risk'], requiredTags: ['dash'], desc: '대시HP-1, 공격강화', armyRule: '대시 시 아군 HP-1, 공격+1' },
  { id: 'closeShock', label: '근접 충격', tags: ['close', 'control'], requiredTags: ['close'], desc: '근접 스턴, 공격쿨+', armyRule: '선봉대 공격 0.3초 스턴' },
  { id: 'farSnare', label: '원거리 올가미', tags: ['far', 'control'], requiredTags: ['far'], desc: '원거리 슬로우, 근접딜-', armyRule: '궁병대 공격 40% 슬로우 1초' },
  { id: 'commitmentLock', label: '각오 잠금', tags: ['still', 'commit'], requiredTags: ['still'], desc: '정지 강타, 이동 약화', armyRule: '지휘관 정지 시 아군 딜+1' },
];

export const ITEMS: ItemDef[] = [
  { id: 'bloodOath', label: '피의 서약', tags: ['sustain', 'risk'], penalty: '대시 HP-1', benefit: '4적중 HP+1', armyRule: '아군 4킬 시 유닛 1 복구' },
  { id: 'ironSkin', label: '강철 피부', tags: ['tank', 'still'], penalty: '이속 -20%', benefit: '정지 무적+500ms', armyRule: '정지 시 아군 피해 -1' },
  { id: 'sprintBoots', label: '질주 장화', tags: ['move', 'dash'], penalty: 'HP최대 -1', benefit: '이속+20%, 대시쿨-200ms', armyRule: '아군 이속 +20%' },
  { id: 'heavyBlade', label: '중검', tags: ['commit', 'control'], penalty: '공격쿨 +200ms', benefit: '넉백+범위+20%', armyRule: '선봉대 공격 넉백' },
  { id: 'calmMind', label: '평정심', tags: ['still', 'timing'], penalty: '대시쿨 +300ms', benefit: '공격쿨 -100ms', armyRule: '아군 공격쿨 -20%' },
  { id: 'hunterCharm', label: '사냥꾼 부적', tags: ['counter', 'risk'], penalty: 'Chaser피해 2배', benefit: 'Chaser딜+1,슬로우', armyRule: '아군 Chaser 딜+1' },
  { id: 'antiDashPlate', label: '대시방어판', tags: ['tank', 'tradeoff'], penalty: '대시무적 제거', benefit: '무적 2000ms', armyRule: '기병 차단 시 생존' },
  { id: 'zoneCore', label: '존 핵심', tags: ['zone', 'posture'], penalty: '존밖 공격쿨+200ms', benefit: '존+50%,존안 대시쿨-400ms', armyRule: '존 안 아군 공격쿨 -30%' },
];

export const PRESETS: PresetDef[] = [
  { label: '근접 제어', desc: '선봉대 밀착 + 스턴 + 마크', build: { keystone: 'closePact', skill: 'slash', supports: ['closeShock', 'markStack'], item: 'heavyBlade', clusters: [], nodes: [] } },
  { label: '카이팅', desc: '후방 유지 + 궁병 슬로우', build: { keystone: 'kitingVow', skill: 'thrust', supports: ['farSnare', 'dashPrime'], item: 'sprintBoots', clusters: [], nodes: [] } },
  { label: '정지 탱커', desc: '밀집 방진 + 아군 보호', build: { keystone: 'stillnessStance', skill: 'guardBreak', supports: ['commitmentLock', 'finisherRule'], item: 'ironSkin', clusters: [], nodes: [] } },
  { label: '이동 리듬', desc: '행군 + 대시 연계', build: { keystone: 'momentumMode', skill: 'lunge', supports: ['dashPrime', 'rhythmWindow'], item: 'sprintBoots', clusters: [], nodes: [] } },
  { label: '단일 처형', desc: '집중 사격 + 처형 마크', build: { keystone: 'singleTargetOath', skill: 'thrust', supports: ['markStack', 'finisherRule'], item: 'calmMind', clusters: [], nodes: [] } },
  { label: '하이리스크', desc: '취약 회복 + 리스크 보상', build: { keystone: 'fragilePower', skill: 'orbitCut', supports: ['dashTax', 'markStack'], item: 'bloodOath', clusters: [], nodes: [] } },
];

const KEYSTONE_MAP = new Map<KeystoneId, KeystoneDef>(KEYSTONES.map(k => [k.id, k]));
const SKILL_MAP = new Map<SkillId, SkillDef>(SKILLS.map(s => [s.id, s]));
const SUPPORT_MAP = new Map<SupportId, SupportDef>(SUPPORTS.map(s => [s.id, s]));
const ITEM_MAP = new Map<ItemId, ItemDef>(ITEMS.map(i => [i.id, i]));

export function getKeystone(id: KeystoneId): KeystoneDef { return KEYSTONE_MAP.get(id)!; }
export function getSkill(id: SkillId): SkillDef { return SKILL_MAP.get(id)!; }
export function getSupport(id: SupportId): SupportDef { return SUPPORT_MAP.get(id)!; }
export function getItem(id: ItemId): ItemDef { return ITEM_MAP.get(id)!; }
