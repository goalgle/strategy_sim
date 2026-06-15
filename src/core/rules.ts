// 능동 잡기(이동해 들어가 적 말 제거). 하강 충돌·맨아래 우선 등은 이후 단계(tick)에서.
// 설계 근거: doc/architecture.md "이동 해소 — 능동 잡기는 이동측 승".
import { eq, pieceAt } from './board';
import { legalMoves } from './pieces/registry';
import type { Coord, GameState, Piece } from './types';

/** piece가 to로 가는 것이 합법인가(합법수 목록에 포함되는가). */
export function canMoveTo(piece: Piece, to: Coord, state: GameState): boolean {
  return legalMoves(piece, state).some((c) => eq(c, to));
}

export interface MoveResult {
  state: GameState;
  /** 잡힌 말(있으면). 능동 잡기 = 이동측 승. */
  captured?: Piece;
}

/**
 * pieceId를 to로 이동. to에 상대 말이 있으면 제거(능동 잡기).
 * 합법성은 검증하지 않는다(호출 측 책임) — 단, 이동할 말이 없으면 그대로 반환.
 */
export function applyMove(state: GameState, pieceId: string, to: Coord): MoveResult {
  const mover = state.pieces.find((p) => p.id === pieceId);
  if (mover === undefined) return { state };

  const captured = pieceAt(to, state);
  const pieces = state.pieces
    .filter((p) => p !== captured)
    .map((p) => (p.id === pieceId ? { ...p, at: { col: to.col, row: to.row } } : p));

  return captured === undefined
    ? { state: { ...state, pieces } }
    : { state: { ...state, pieces }, captured };
}
