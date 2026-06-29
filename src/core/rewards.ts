// 보상 카드 — 점수 임계 도달 시 버프카드 1 + 리젠카드 1을 시드 RNG로 제시, 1장 선택.
// 결정론: 카드 뽑기는 state.rng로만, 선택은 pickReward 인텐트로 기록 → 리플레이 재현.
import { pieceAt } from './board';
import { ALL_BUFFS, grantPlayerBuffs } from './buffs';
import type { GameEvent } from './events';
import { nextInt } from './rng';
import type { BuffKind, GameState, Piece, PieceKind, RewardCard, RosterEntry } from './types';

/** 한 번에 제시하는 카드 수(이상적으로 버프1+리젠1, 한쪽이 비면 나머지로 채움). */
export const REWARD_CARD_COUNT = 2;

/** 장기 말 한글 약칭(리젠 카드 라벨용). */
const KIND_KR: Record<PieceKind, string> = {
  chariot: '차',
  horse: '마',
  elephant: '상',
  guard: '사',
  general: '장',
  cannon: '포',
  soldier: '졸',
  king: '킹',
  queen: '퀸',
  rook: '룩',
  bishop: '비숍',
  knight: '나이트',
  pawn: '폰',
};

/**
 * rewardCount장 지급한 뒤 '다음' 보상의 누적 점수 임계 — 점점 커진다.
 * 25·n·(n+1): 50, 150, 300, 500, 750, 1050 ...
 */
export function rewardThreshold(rewardCount: number): number {
  const n = rewardCount + 1;
  return 25 * n * (n + 1);
}

/** 플레이어가 이미 보유한 버프 종류. */
export function ownedBuffs(state: GameState): Set<BuffKind> {
  const owned = new Set<BuffKind>();
  for (const p of state.pieces) {
    if (p.side !== 'player' || p.buffs === undefined) continue;
    for (const b of p.buffs) owned.add(b);
  }
  return owned;
}

/** 명부 기준 같은 종류 좌→우로 '좌측/우측' 라벨 부여(2개면 좌·우, 1개면 약칭, 그 이상은 번호). */
function regenLabels(roster: RosterEntry[]): Map<string, string> {
  const byKind = new Map<PieceKind, RosterEntry[]>();
  for (const e of roster) {
    const list = byKind.get(e.kind) ?? [];
    list.push(e);
    byKind.set(e.kind, list);
  }
  const labels = new Map<string, string>();
  for (const [kind, list] of byKind) {
    const sorted = [...list].sort((a, b) => a.col - b.col);
    const kr = KIND_KR[kind];
    if (sorted.length === 1) {
      labels.set(sorted[0]!.id, kr);
    } else if (sorted.length === 2) {
      labels.set(sorted[0]!.id, `좌측 ${kr}`);
      labels.set(sorted[1]!.id, `우측 ${kr}`);
    } else {
      sorted.forEach((e, i) => labels.set(e.id, `${kr} ${i + 1}`));
    }
  }
  return labels;
}

/** 리젠 후보: 잃었고(현재 보드에 없음) 원위치가 비어 있는 말(장 제외). */
export function lostRegenCandidates(state: GameState): RewardCard[] {
  const labels = regenLabels(state.roster);
  const alive = new Set(state.pieces.map((p) => p.id));
  const out: RewardCard[] = [];
  for (const e of state.roster) {
    if (e.kind === 'general') continue; // 장이 잡히면 게임오버 → 리젠 대상 아님
    if (alive.has(e.id)) continue; // 살아 있음
    if (pieceAt({ col: e.col, row: e.row }, state) !== undefined) continue; // 원위치 점령 중
    out.push({ type: 'regen', pieceId: e.id, label: labels.get(e.id) ?? KIND_KR[e.kind] });
  }
  return out;
}

/** 버프카드 1 + 리젠카드 1을 시드 RNG로(한쪽이 비면 나머지로 채움). 둘 다 비면 빈 배열. */
export function rollReward(state: GameState): { options: RewardCard[]; rng: GameState['rng'] } {
  let rng = state.rng;
  const owned = ownedBuffs(state);
  const buffPool: RewardCard[] = ALL_BUFFS.filter((b) => !owned.has(b)).map((b) => ({ type: 'buff', buff: b }));
  const regenPool: RewardCard[] = lostRegenCandidates(state);

  const draw = (pool: RewardCard[]): RewardCard | undefined => {
    if (pool.length === 0) return undefined;
    const r = nextInt(rng, pool.length);
    rng = r.state;
    return pool.splice(r.value, 1)[0];
  };

  const options: RewardCard[] = [];
  const b = draw(buffPool); // 버프 1
  if (b) options.push(b);
  const g = draw(regenPool); // 리젠 1
  if (g) options.push(g);
  // 한쪽이 비어 2장이 안 되면 남은 풀에서 채움.
  while (options.length < REWARD_CARD_COUNT) {
    const next = draw(buffPool) ?? draw(regenPool);
    if (next === undefined) break;
    options.push(next);
  }
  return { options, rng };
}

/** 잃은 말을 원위치에 부활(보유 버프 자동 적용). 명부에 없거나 이미 살아있으면 그대로. */
export function applyRegen(state: GameState, pieceId: string): GameState {
  const e = state.roster.find((r) => r.id === pieceId);
  if (e === undefined || state.pieces.some((p) => p.id === pieceId)) return state;
  const piece: Piece = {
    id: e.id,
    kind: e.kind,
    family: 'janggi',
    side: 'player',
    at: { col: e.col, row: e.row },
    isRoyal: e.kind === 'general',
  };
  // 되살린 말에도 이미 보유한 버프(말 종류 매칭)를 적용.
  const pieces = grantPlayerBuffs([...state.pieces, piece], [...ownedBuffs(state)]);
  return { ...state, pieces };
}

/**
 * 점수가 임계에 도달했고 줄 카드가 남았으면 보상 제시(state.reward 세팅 → 하강 정지).
 * 이미 제시 중·종료·임계 미달이면 그대로. 줄 카드(버프·리젠)가 하나도 없으면 제시 안 함.
 */
export function maybeOfferReward(state: GameState): { state: GameState; events: GameEvent[] } {
  if (state.mode === 'janggi') return { state, events: [] }; // 장기 튜토리얼엔 보상 없음
  if (state.reward !== undefined || state.status !== 'playing') return { state, events: [] };
  if (state.score < rewardThreshold(state.rewardCount)) return { state, events: [] };

  const { options, rng } = rollReward(state);
  if (options.length === 0) return { state, events: [] };
  return {
    state: { ...state, reward: { options }, rng },
    events: [{ t: 'rewardOffered', options }],
  };
}
