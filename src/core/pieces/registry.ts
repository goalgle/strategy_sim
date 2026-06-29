// 말 종류 → 합법수 생성 함수 매핑. "혼종"은 여기서 종류별 분기일 뿐.
import { eq, wardedCellsAgainst } from '../board';
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
  const moves = RULES[piece.kind](piece, state);
  // #6 궁성 결계: 상대 궁성에 결계가 활성이면 그 칸으로 못 들어감(보통 결계 없음 → 그대로 반환).
  const warded = wardedCellsAgainst(piece.side, state);
  if (warded.length === 0) return moves;
  return moves.filter((c) => !warded.some((w) => eq(w, c)));
}
