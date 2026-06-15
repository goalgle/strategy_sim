// 말 종류 → 합법수 생성 함수 매핑. "혼종"은 여기서 종류별 분기일 뿐.
import type { GameState, MoveGen, Piece, PieceKind } from '../types';
import { bishop, king, knight, pawn, queen, rook } from './chess';
import { cannon, chariot, elephant, general, guard, horse, soldier } from './janggi';

export const RULES: Record<PieceKind, MoveGen> = {
  // 체스
  king,
  queen,
  rook,
  bishop,
  knight,
  pawn,
  // 장기
  general,
  chariot,
  cannon,
  horse,
  elephant,
  guard,
  soldier,
};

export function legalMoves(piece: Piece, state: GameState) {
  return RULES[piece.kind](piece, state);
}
