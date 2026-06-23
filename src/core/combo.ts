// 콤보(연속 잡기) — 잡은 직후 같은 말로 또 잡을 적이 있으면 티켓으로 이어감.
// 최대 3번 이동(기본 1 + 티켓 추가 2). doc/concept.md "티켓 사용처 T1".
import { pieceAt } from './board';
import { legalMoves } from './pieces/registry';
import type { Coord, GameState } from './types';

export const COMBO_MAX_MOVES = 3; // 기본 1 + 추가 2

/** piece의 합법수 중 '적 말이 있는 칸'(=잡을 수 있는 칸)만. */
export function captureTargets(pieceId: string, state: GameState): Coord[] {
  const piece = state.pieces.find((p) => p.id === pieceId);
  if (piece === undefined) return [];
  return legalMoves(piece, state).filter((to) => {
    const t = pieceAt(to, state);
    return t !== undefined && t.side !== piece.side;
  });
}
