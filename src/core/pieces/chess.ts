// 체스 6종 합법수. 캐슬링·앙파상·폰 더블스텝·승급은 MVP 생략(doc/architecture.md).
import { forward, inBounds, isAllyOf, isEmpty, isEnemyOf } from '../board';
import type { Coord, MoveGen } from '../types';
import { ALL8, DIAG, KNIGHT_JUMPS, ORTHO, ray, step } from './common';

export const rook: MoveGen = (p, s) => ORTHO.flatMap((d) => ray(p.at, d, p.side, s));

export const bishop: MoveGen = (p, s) => DIAG.flatMap((d) => ray(p.at, d, p.side, s));

export const queen: MoveGen = (p, s) => ALL8.flatMap((d) => ray(p.at, d, p.side, s));

export const knight: MoveGen = (p, s) =>
  KNIGHT_JUMPS.map((d) => step(p.at, d)).filter(
    (c) => inBounds(c, s.board) && !isAllyOf(c, p.side, s),
  );

export const king: MoveGen = (p, s) =>
  ALL8.map((d) => step(p.at, d)).filter(
    (c) => inBounds(c, s.board) && !isAllyOf(c, p.side, s),
  );

export const pawn: MoveGen = (p, s) => {
  const f = forward(p.side);
  const out: Coord[] = [];
  const ahead = { col: p.at.col, row: p.at.row + f };
  if (inBounds(ahead, s.board) && isEmpty(ahead, s)) out.push(ahead);
  for (const dc of [-1, 1]) {
    const cap = { col: p.at.col + dc, row: p.at.row + f };
    if (inBounds(cap, s.board) && isEnemyOf(cap, p.side, s)) out.push(cap);
  }
  return out;
};
