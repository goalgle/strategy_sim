// 능동 잡기(이동해 들어가 적 말 제거). 하강 충돌·맨아래 우선 등은 이후 단계(tick)에서.
// 설계 근거: doc/architecture.md "이동 해소 — 능동 잡기는 이동측 승".
import { eq, pieceAt } from './board';
import { hasBuff } from './buffs';
import { chariotPierceMoves, elephantTramplePath } from './pieces/janggi';
import { legalMoves } from './pieces/registry';
import type { Coord, GameState, Piece } from './types';

/** piece가 to로 가는 것이 합법인가(합법수 목록에 포함되는가). */
export function canMoveTo(piece: Piece, to: Coord, state: GameState): boolean {
  return legalMoves(piece, state).some((c) => eq(c, to));
}

export interface MoveResult {
  state: GameState;
  /** 도착칸에서 잡힌 말(있으면). 기존 소비처 호환용 = captures의 도착칸 항목. */
  captured?: Piece;
  /** 이 이동으로 잡힌 모든 적 말(도착칸 + 버프 부가 잡기). 없으면 빈 배열. */
  captures: Piece[];
  /** 버프로 희생된 아군 1기(#5 차 관통). 잡기와 달리 점수 없음. */
  sacrifice?: Piece;
}

interface Removals {
  /** 잡힌 적(점수 대상) */
  captures: Piece[];
  /** 희생된 아군(점수 없음) */
  sacrifice?: Piece;
}

/** 이 이동이 제거하는 말들 — 적(captures)과 아군 희생(sacrifice)을 구분. 버프 분기의 단일 소스. */
function resolveRemovals(state: GameState, mover: Piece, to: Coord): Removals {
  const primary = pieceAt(to, state);
  const enemiesOf = (ps: (Piece | undefined)[]) =>
    ps.filter((x): x is Piece => x !== undefined && x.side !== mover.side);

  // #3 상 짓밟기: 경로 중간칸 + 도착칸의 적.
  if (mover.kind === 'elephant' && hasBuff(mover, 'elephantTrample')) {
    const path = elephantTramplePath(mover.at, to).map((c) => pieceAt(c, state));
    return { captures: enemiesOf([primary, ...path]) };
  }
  // #5 차 관통: 도착칸 적 + 가로막은 아군 1기 희생.
  if (mover.kind === 'chariot' && hasBuff(mover, 'chariotPierce')) {
    const pierce = chariotPierceMoves(mover, state).find((m) => eq(m.to, to));
    if (pierce !== undefined) {
      return { captures: enemiesOf([primary]), sacrifice: state.pieces.find((p) => p.id === pierce.sacrificeId) };
    }
  }
  return { captures: enemiesOf([primary]) };
}

/** to로 이동 시 잡히는 모든 적 말(적용하지 않음 — 미리보기·UI 표시용). */
export function capturesIfMoved(state: GameState, pieceId: string, to: Coord): Piece[] {
  const mover = state.pieces.find((p) => p.id === pieceId);
  if (mover === undefined) return [];
  return resolveRemovals(state, mover, to).captures;
}

/** to로 이동 시 희생되는 아군(있으면) — 미리보기·UI 경고용. */
export function sacrificeIfMoved(state: GameState, pieceId: string, to: Coord): Piece | undefined {
  const mover = state.pieces.find((p) => p.id === pieceId);
  if (mover === undefined) return undefined;
  return resolveRemovals(state, mover, to).sacrifice;
}

/**
 * pieceId를 to로 이동. to에 상대 말이 있으면 제거(능동 잡기).
 * 버프가 있으면 경로상 적(captures)·희생 아군(sacrifice)도 함께 제거. 합법성은 호출 측 책임.
 */
export function applyMove(state: GameState, pieceId: string, to: Coord): MoveResult {
  const mover = state.pieces.find((p) => p.id === pieceId);
  if (mover === undefined) return { state, captures: [] };

  const primary = pieceAt(to, state);
  const { captures, sacrifice } = resolveRemovals(state, mover, to);
  const removed = sacrifice !== undefined ? [...captures, sacrifice] : captures;

  const pieces = state.pieces
    .filter((p) => !removed.includes(p))
    .map((p) => (p.id === pieceId ? { ...p, at: { col: to.col, row: to.row } } : p));

  const result: MoveResult = { state: { ...state, pieces }, captures };
  if (primary !== undefined) result.captured = primary;
  if (sacrifice !== undefined) result.sacrifice = sacrifice;
  return result;
}
