import type { ClusterDef, TreeNodeDef, ClusterId, NodeId, Tag, BuildConfig } from '../types';
import { getKeystone, getSkill, getSupport, getItem } from './buildData';

// ═══════════════════════════════════════════════════════════════
// CLUSTER DEFINITIONS
// ═══════════════════════════════════════════════════════════════

export const CLUSTERS: ClusterDef[] = [
  { id: 'A', label: '전열', labelEn: 'Frontline', nodes: ['A1','A2','A3','A4','A5','A6'], activationTags: ['close','posture','commit'] },
  { id: 'B', label: '후열', labelEn: 'Backline',  nodes: ['B1','B2','B3','B4','B5','B6'], activationTags: ['far','kite','control'] },
  { id: 'C', label: '요격', labelEn: 'Intercept', nodes: ['C1','C2','C3','C4','C5','C6'], activationTags: ['dash','counter','movement'] },
  { id: 'D', label: '표식', labelEn: 'Priority',  nodes: ['D1','D2','D3','D4','D5','D6'], activationTags: ['priority','execute','mark'] },
  { id: 'E', label: '정지', labelEn: 'Still',     nodes: ['E1','E2','E3','E4','E5','E6'], activationTags: ['still','commit','zone'] },
  { id: 'F', label: '이동', labelEn: 'Move',      nodes: ['F1','F2','F3','F4','F5','F6'], activationTags: ['move','dash','rhythm'] },
];

// ═══════════════════════════════════════════════════════════════
// 36 TREE NODES
// ═══════════════════════════════════════════════════════════════

export const TREE_NODES: TreeNodeDef[] = [
  // ── Cluster A: 전열(Frontline) ──
  { id: 'A1', cluster: 'A', type: 'rule', label: '방패벽',
    ban: 'Vanguard 추격 약화', liberation: 'FLAG-Commander 선분 기준 라인 정렬',
    requiredTags: [], isMiniKeystone: false },
  { id: 'A2', cluster: 'A', type: 'convert', label: '어그로 전환',
    ban: 'Commander 어그로 감소', liberation: 'Chaser 1순위 = Vanguard',
    requiredTags: [], isMiniKeystone: false },
  { id: 'A3', cluster: 'A', type: 'ban', label: '후퇴 금지',
    ban: 'Vanguard anchorPos 뒤 이동 불가', liberation: '전선 고정 유지',
    requiredTags: [], isMiniKeystone: false },
  { id: 'A4', cluster: 'A', type: 'rule', label: '전열 붕괴 신호',
    ban: 'Vanguard 저HP 시 전진 불가', liberation: 'Archers 자동 후퇴',
    requiredTags: [], isMiniKeystone: false },
  { id: 'A5', cluster: 'A', type: 'convert', label: '붙잡기',
    ban: 'Vanguard 첫타 데미지 0', liberation: '첫타 1초 슬로우 부여',
    requiredTags: [], isMiniKeystone: false },
  { id: 'A6', cluster: 'A', type: 'rule', label: '철벽 교리',
    ban: 'FLAG 260px 밖 Commander 공격 불가', liberation: 'FLAG 안 Vanguard 고정 방진',
    requiredTags: [], isMiniKeystone: true },

  // ── Cluster B: 후열(Backline) ──
  { id: 'B1', cluster: 'B', type: 'rule', label: '일제사 교리',
    ban: 'Volley 외 발사 금지', liberation: 'Volley 강제 사격',
    requiredTags: [], isMiniKeystone: false },
  { id: 'B2', cluster: 'B', type: 'ban', label: '근접 사격 금지',
    ban: '적 180px 내 발사 불가', liberation: '후열 관리 강제',
    requiredTags: [], isMiniKeystone: false },
  { id: 'B3', cluster: 'B', type: 'convert', label: '표식-집중',
    ban: 'Mark 없으면 Buffer 우선', liberation: 'Mark 대상 최우선 사격',
    requiredTags: ['mark'], isMiniKeystone: false },
  { id: 'B4', cluster: 'B', type: 'rule', label: '후열 팬텀',
    ban: 'Archer 피격 시 2초 스폰 금지', liberation: 'Back 채널 2초 봉인',
    requiredTags: [], isMiniKeystone: false },
  { id: 'B5', cluster: 'B', type: 'convert', label: '화살=경로',
    ban: '화살 데미지 감소', liberation: '피격 적 1초 FLAG 방향 끌림',
    requiredTags: [], isMiniKeystone: false },
  { id: 'B6', cluster: 'B', type: 'rule', label: '사수 교리',
    ban: 'Commander 공격 딜 0', liberation: '표식 대상 Volley 1회 추가',
    requiredTags: [], isMiniKeystone: true },

  // ── Cluster C: 요격(Intercept) ──
  { id: 'C1', cluster: 'C', type: 'rule', label: '요격 우선권',
    ban: '텔레그래프 중 Cavalry 다른 행동 불가', liberation: 'Dasher 텔레그래프 즉시 요격',
    requiredTags: [], isMiniKeystone: false },
  { id: 'C2', cluster: 'C', type: 'ban', label: '요격 실패 금지',
    ban: 'Cavalry 없으면 Dasher 스폰 불가', liberation: 'Dasher→Chaser 치환',
    requiredTags: [], isMiniKeystone: false },
  { id: 'C3', cluster: 'C', type: 'convert', label: '돌진 경로 고정',
    ban: 'Dasher Commander 조준 불가', liberation: 'Dasher 돌진 목표 = FLAG',
    requiredTags: [], isMiniKeystone: false },
  { id: 'C4', cluster: 'C', type: 'rule', label: '요격 보상 규칙',
    ban: '요격 시 Cavalry 2초 행동불능', liberation: '요격 성공 시 분대 1초 정렬',
    requiredTags: [], isMiniKeystone: false },
  { id: 'C5', cluster: 'C', type: 'convert', label: '기병=벽',
    ban: '요격 시 Cavalry 소멸(1회성)', liberation: 'Dasher 즉시 종료+2초 경직',
    requiredTags: [], isMiniKeystone: false },
  { id: 'C6', cluster: 'C', type: 'rule', label: '돌격 교리',
    ban: 'Cavalry 요격 외 공격 불가', liberation: '요격 성공 시 Back 채널 2초 봉인',
    requiredTags: [], isMiniKeystone: true },

  // ── Cluster D: 표식/우선(Priority) ──
  { id: 'D1', cluster: 'D', type: 'rule', label: '표식 고정',
    ban: 'Mark 변경 시 2초 공격불가', liberation: '타겟 집중 강제',
    requiredTags: ['mark'], isMiniKeystone: false },
  { id: 'D2', cluster: 'D', type: 'convert', label: '표식=버프 차단',
    ban: 'Mark 없는 적 버프 차단 불가', liberation: 'Mark 적 Buffer 버프 무효',
    requiredTags: ['mark'], isMiniKeystone: false },
  { id: 'D3', cluster: 'D', type: 'ban', label: '분산 금지',
    ban: 'Mark 생존 중 타 처치 무효', liberation: '타겟 집중 보상',
    requiredTags: ['mark'], isMiniKeystone: false },
  { id: 'D4', cluster: 'D', type: 'rule', label: '처형 규칙',
    ban: 'Mark 처치 실패 시 3초 딜감소', liberation: 'Mark 처치 → Archer 우선순위 전환',
    requiredTags: ['execute'], isMiniKeystone: false },
  { id: 'D5', cluster: 'D', type: 'convert', label: '표식=미끼',
    ban: 'Mark 없으면 Chaser 분산', liberation: 'Mark 적에 Chaser 어그로 집중',
    requiredTags: ['mark'], isMiniKeystone: false },
  { id: 'D6', cluster: 'D', type: 'rule', label: '집행 교리',
    ban: 'Mark 없으면 전군 공격 불가', liberation: 'Mark 피격 후 2초 내 강제 퇴장',
    requiredTags: ['mark','execute'], isMiniKeystone: true },

  // ── Cluster E: 정지(Still) ──
  { id: 'E1', cluster: 'E', type: 'ban', label: '이동 전투 금지',
    ban: '이동 중 군단 공격 OFF', liberation: '정지 집중 전투',
    requiredTags: [], isMiniKeystone: false },
  { id: 'E2', cluster: 'E', type: 'rule', label: '방진 모드',
    ban: '정지 시 이동 대형 불가', liberation: '정지 시 Vanguard 촘촘 대형',
    requiredTags: ['still'], isMiniKeystone: false },
  { id: 'E3', cluster: 'E', type: 'convert', label: '정지=요격',
    ban: '정지 중 Cavalry 요격 불가', liberation: '정지 중 Cavalry FLAG 순찰',
    requiredTags: [], isMiniKeystone: false },
  { id: 'E4', cluster: 'E', type: 'rule', label: '정지 유도 보상',
    ban: '2초 정지 필요', liberation: '정지 2초 유지 → Flank 스폰 4초 약화',
    requiredTags: [], isMiniKeystone: false },
  { id: 'E5', cluster: 'E', type: 'ban', label: '정지 해제 페널티',
    ban: '정지 후 이동 시 1초 발사 금지', liberation: '자리잡기 강조',
    requiredTags: [], isMiniKeystone: false },
  { id: 'E6', cluster: 'E', type: 'rule', label: '성채 교리',
    ban: 'Dash 사용 불가', liberation: '정지 시 Back 채널 스폰 봉인',
    requiredTags: [], isMiniKeystone: true },

  // ── Cluster F: 이동(Move) ──
  { id: 'F1', cluster: 'F', type: 'ban', label: '정지 전투 금지',
    ban: '속도 <10px/s 시 군단 공격 OFF', liberation: '이동 집중 전투',
    requiredTags: [], isMiniKeystone: false },
  { id: 'F2', cluster: 'F', type: 'rule', label: '행군 교전',
    ban: '정지 중 Archers OFF', liberation: '이동 중 Archers ON',
    requiredTags: [], isMiniKeystone: false },
  { id: 'F3', cluster: 'F', type: 'convert', label: '이동=전열 회전',
    ban: '커밋 쿨다운 0.25→0.35s', liberation: '커밋 각도 35°→25°',
    requiredTags: [], isMiniKeystone: false },
  { id: 'F4', cluster: 'F', type: 'rule', label: '외곽 유도',
    ban: '정지 시 Flank 스폰 증가', liberation: '이동 시 Front 스폰 증가',
    requiredTags: [], isMiniKeystone: false },
  { id: 'F5', cluster: 'F', type: 'ban', label: '역주행 금지',
    ban: 'committedDir 반대 1초 이동 금지', liberation: '라인 유지 강제',
    requiredTags: [], isMiniKeystone: false },
  { id: 'F6', cluster: 'F', type: 'rule', label: '유격 교리',
    ban: 'FLAG 260px 안 공격 불가', liberation: 'FLAG 밖 Back 채널 스폰 금지',
    requiredTags: [], isMiniKeystone: true },
];

// ═══════════════════════════════════════════════════════════════
// LOOKUP HELPERS
// ═══════════════════════════════════════════════════════════════

const NODE_MAP = new Map<NodeId, TreeNodeDef>(TREE_NODES.map(n => [n.id, n]));
const CLUSTER_MAP = new Map<ClusterId, ClusterDef>(CLUSTERS.map(c => [c.id, c]));

export function getNode(id: NodeId): TreeNodeDef { return NODE_MAP.get(id)!; }
export function getCluster(id: ClusterId): ClusterDef { return CLUSTER_MAP.get(id)!; }

/** Get all tags from a build config (keystone+skill+supports+item). */
export function getBuildTags(build: BuildConfig): Tag[] {
  const tags = new Set<Tag>();
  for (const t of getKeystone(build.keystone).tags) tags.add(t);
  for (const t of getSkill(build.skill).tags) tags.add(t);
  for (const t of getSupport(build.supports[0]).tags) tags.add(t);
  for (const t of getSupport(build.supports[1]).tags) tags.add(t);
  for (const t of getItem(build.item).tags) tags.add(t);
  return [...tags];
}

/** Check if a cluster is activatable given a set of build tags. Needs >= 1 matching tag. */
export function isClusterActive(clusterId: ClusterId, buildTags: Tag[]): boolean {
  const cluster = getCluster(clusterId);
  return cluster.activationTags.some(t => buildTags.includes(t));
}

/** Check if a specific node is unlockable given build tags. */
export function isNodeUnlocked(nodeId: NodeId, buildTags: Tag[]): boolean {
  const node = getNode(nodeId);
  if (node.requiredTags.length === 0) return true;
  return node.requiredTags.every(t => buildTags.includes(t));
}

/** Check if a mini-keystone is unlockable (needs 3+ non-keystone nodes selected in same cluster). */
export function isMiniKeystoneAvailable(nodeId: NodeId, selectedNodes: NodeId[]): boolean {
  const node = getNode(nodeId);
  if (!node.isMiniKeystone) return true; // not a keystone, always available
  const clusterNodes = selectedNodes.filter(n => getNode(n).cluster === node.cluster && !getNode(n).isMiniKeystone);
  return clusterNodes.length >= 3;
}

/** Validate full tree selection. Returns error string or null if valid. */
export function validateTreeSelection(clusters: ClusterId[], nodes: NodeId[], buildTags: Tag[]): string | null {
  if (clusters.length > 2) return '클러스터 최대 2개';
  for (const c of clusters) {
    if (!isClusterActive(c, buildTags)) return `${c} 클러스터 태그 불일치`;
    const clusterNodes = nodes.filter(n => getNode(n).cluster === c);
    if (clusterNodes.length > 4) return `${c} 클러스터 노드 최대 4개`;
  }
  // All nodes must belong to selected clusters
  for (const n of nodes) {
    const node = getNode(n);
    if (!clusters.includes(node.cluster)) return `${n}: 비활성 클러스터`;
    if (!isNodeUnlocked(n, buildTags)) return `${n}: 태그 잠금`;
    if (node.isMiniKeystone && !isMiniKeystoneAvailable(n, nodes)) return `${n}: 3노드 필요`;
  }
  return null;
}
