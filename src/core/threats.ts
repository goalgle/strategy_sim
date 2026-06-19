// 위협 판정 — 어떤 칸이 특정 측의 다음 능동 잡기 사정권인가(역질의).
// 코어(왕 체크 → 시간 정지)와 AI(danger 회피)가 공유.
import { eq } from './board';
import { legalMoves } from './pieces/registry';
import type { Coord, GameState, Piece, Side } from './types';

/** cell이 bySide의 합법수로 닿을 수 있는가(= 잡힐 수 있는가). */
export function isAttackedBy(cell: Coord, bySide: Side, state: GameState): boolean {
  for (const p of state.pieces) {
    if (p.side !== bySide) continue;
    for (const to of legalMoves(p, state)) {
      if (eq(to, cell)) return true;
    }
  }
  return false;
}

export function playerRoyal(state: GameState): Piece | undefined {
  return state.pieces.find((p) => p.side === 'player' && p.isRoyal);
}

/** 플레이어 왕이 적의 사정권(체크)인가. */
export function isPlayerInCheck(state: GameState): boolean {
  const king = playerRoyal(state);
  return king !== undefined && isAttackedBy(king.at, 'enemy', state);
}
