// 이동 생성 공통 빌딩블록: 방향 벡터 + 슬라이딩 레이.
import { inBounds, pieceAt } from '../board';
import type { Coord, GameState, Side } from '../types';

export interface Dir {
  c: number;
  r: number;
}

export const ORTHO: Dir[] = [
  { c: 0, r: -1 },
  { c: 0, r: 1 },
  { c: -1, r: 0 },
  { c: 1, r: 0 },
];

export const DIAG: Dir[] = [
  { c: -1, r: -1 },
  { c: 1, r: -1 },
  { c: -1, r: 1 },
  { c: 1, r: 1 },
];

export const ALL8: Dir[] = [...ORTHO, ...DIAG];

export const KNIGHT_JUMPS: Dir[] = [
  { c: 1, r: 2 },
  { c: 2, r: 1 },
  { c: 2, r: -1 },
  { c: 1, r: -2 },
  { c: -1, r: -2 },
  { c: -2, r: -1 },
  { c: -2, r: 1 },
  { c: -1, r: 2 },
];

export function step(from: Coord, d: Dir): Coord {
  return { col: from.col + d.c, row: from.row + d.r };
}

/**
 * 한 방향으로 빈 칸을 누적하다 첫 상대 말이면 그 칸까지(잡기) 포함하고 멈춤,
 * 아군 말이면 직전까지. (룩·비숍·퀸·차 공용)
 */
export function ray(from: Coord, d: Dir, side: Side, s: GameState): Coord[] {
  const out: Coord[] = [];
  let c = step(from, d);
  while (inBounds(c, s.board)) {
    const p = pieceAt(c, s);
    if (p === undefined) {
      out.push(c);
    } else {
      if (p.side !== side) out.push(c);
      break;
    }
    c = step(c, d);
  }
  return out;
}
