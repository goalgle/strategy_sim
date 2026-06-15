// 장기 7종 합법수. 까다로운 규칙: 포(다리), 마/상(멱), 궁성 제약, 궁성 대각선.
// 설계 근거: doc/architecture.md "이동 생성 → 장기 7종".
import {
  dedupeCoords,
  eq,
  forward,
  inBounds,
  isAllyOf,
  isEmpty,
  palaceLinesThrough,
  pieceAt,
} from '../board';
import type { Coord, GameState, MoveGen, Piece } from '../types';
import { ORTHO, ray, step, type Dir } from './common';

// ── 차(chariot): 룩 레이 + 궁성 대각선 슬라이드 ──────────
export const chariot: MoveGen = (p, s) => {
  const out = ORTHO.flatMap((d) => ray(p.at, d, p.side, s));
  out.push(...palaceDiagonalSlide(p, s));
  return dedupeCoords(out);
};

/** 궁성 대각선 라인 위에 있으면 그 라인을 따라 양방향 슬라이드(레이와 동일 규칙). */
function palaceDiagonalSlide(p: Piece, s: GameState): Coord[] {
  const out: Coord[] = [];
  for (const line of palaceLinesThrough(p.at, s.board)) {
    const idx = line.findIndex((c) => eq(c, p.at));
    for (const dir of [-1, 1]) {
      for (let i = idx + dir; i >= 0 && i < line.length; i += dir) {
        const c = line[i]!;
        const pc = pieceAt(c, s);
        if (pc === undefined) {
          out.push(c);
        } else {
          if (pc.side !== p.side) out.push(c);
          break;
        }
      }
    }
  }
  return out;
}

// ── 포(cannon): 다리 하나를 넘어 이동/잡기. 다리·대상이 포면 불가 ──
export const cannon: MoveGen = (p, s) => {
  const out: Coord[] = [];
  for (const d of ORTHO) out.push(...cannonRay(p, d, s));
  out.push(...cannonPalaceDiagonal(p, s));
  return dedupeCoords(out);
};

function cannonRay(p: Piece, d: Dir, s: GameState): Coord[] {
  const out: Coord[] = [];
  // 1) 다리(넘을 말) 찾기
  let c = step(p.at, d);
  let screen: Piece | undefined;
  while (inBounds(c, s.board)) {
    const pc = pieceAt(c, s);
    if (pc !== undefined) {
      screen = pc;
      break;
    }
    c = step(c, d);
  }
  if (screen === undefined || screen.kind === 'cannon') return out; // 다리 없거나 포면 불가
  // 2) 다리 너머로 진행
  c = step(c, d);
  while (inBounds(c, s.board)) {
    const pc = pieceAt(c, s);
    if (pc === undefined) {
      out.push(c);
    } else {
      if (pc.kind !== 'cannon' && pc.side !== p.side) out.push(c); // 포가 아닌 적만 잡기
      break;
    }
    c = step(c, d);
  }
  return out;
}

/** 궁성 대각선: 귀퉁이에서 중앙(다리, 비-포)을 넘어 반대 귀퉁이로. */
function cannonPalaceDiagonal(p: Piece, s: GameState): Coord[] {
  const out: Coord[] = [];
  for (const line of palaceLinesThrough(p.at, s.board)) {
    if (line.length !== 3) continue;
    const idx = line.findIndex((c) => eq(c, p.at));
    if (idx === 1) continue; // 중앙에선 반대 귀퉁이가 없음
    const center = line[1]!;
    const screen = pieceAt(center, s);
    if (screen === undefined || screen.kind === 'cannon') continue;
    const dest = line[idx === 0 ? 2 : 0]!;
    const pc = pieceAt(dest, s);
    if (pc === undefined) out.push(dest);
    else if (pc.kind !== 'cannon' && pc.side !== p.side) out.push(dest);
  }
  return out;
}

// ── 마(horse): 직교 1보(멱) + 바깥 대각 1보 ──────────────
export const horse: MoveGen = (p, s) => {
  const out: Coord[] = [];
  for (const o of ORTHO) {
    const leg = step(p.at, o);
    if (!inBounds(leg, s.board) || !isEmpty(leg, s)) continue; // 멱: 직교 칸 막히면 불가
    for (const d of outwardDiagonals(o)) {
      const dest = step(leg, d);
      if (inBounds(dest, s.board) && !isAllyOf(dest, p.side, s)) out.push(dest);
    }
  }
  return out;
};

// ── 상(elephant): 직교 1보 + 대각 2보, 멱 2지점 ──────────
export const elephant: MoveGen = (p, s) => {
  const out: Coord[] = [];
  for (const o of ORTHO) {
    const leg1 = step(p.at, o);
    if (!inBounds(leg1, s.board) || !isEmpty(leg1, s)) continue; // 멱 1
    for (const d of outwardDiagonals(o)) {
      const leg2 = step(leg1, d);
      if (!inBounds(leg2, s.board) || !isEmpty(leg2, s)) continue; // 멱 2
      const dest = step(leg2, d);
      if (inBounds(dest, s.board) && !isAllyOf(dest, p.side, s)) out.push(dest);
    }
  }
  return out;
};

/** 직교 방향 o에 대해 '바깥으로' 벌어지는 두 대각 방향. */
function outwardDiagonals(o: Dir): Dir[] {
  return o.c === 0
    ? [
        { c: -1, r: o.r },
        { c: 1, r: o.r },
      ]
    : [
        { c: o.c, r: -1 },
        { c: o.c, r: 1 },
      ];
}

// ── 사(guard)·장(general): 궁성 안 1보(라인 따라, 대각 포함) ──
const palaceStep: MoveGen = (p, s) => {
  const pal = s.board.palaces.find((x) => x.side === p.side);
  if (pal === undefined) return [];
  const out: Coord[] = [];
  // 직교: 인접한 궁성 칸으로
  for (const o of ORTHO) {
    const c = step(p.at, o);
    if (pal.cells.some((x) => eq(x, c)) && !isAllyOf(c, p.side, s)) out.push(c);
  }
  // 대각: X 라인 위 인접 점으로만
  for (const line of pal.diagonalLines) {
    const idx = line.findIndex((c) => eq(c, p.at));
    if (idx < 0) continue;
    for (const ni of [idx - 1, idx + 1]) {
      if (ni < 0 || ni >= line.length) continue;
      const c = line[ni]!;
      if (!isAllyOf(c, p.side, s)) out.push(c);
    }
  }
  return dedupeCoords(out);
};

export const guard: MoveGen = palaceStep;
export const general: MoveGen = palaceStep;

// ── 졸(soldier): 전진 1 또는 옆 1(후진 없음) + 궁성 대각 전진 ──
export const soldier: MoveGen = (p, s) => {
  const f = forward(p.side);
  const out: Coord[] = [];
  const cands: Coord[] = [
    { col: p.at.col, row: p.at.row + f }, // 전진
    { col: p.at.col - 1, row: p.at.row }, // 좌
    { col: p.at.col + 1, row: p.at.row }, // 우
  ];
  for (const c of cands) {
    if (inBounds(c, s.board) && !isAllyOf(c, p.side, s)) out.push(c);
  }
  // 궁성 대각선 위에서는 '전진 대각'도 가능
  for (const line of palaceLinesThrough(p.at, s.board)) {
    const idx = line.findIndex((c) => eq(c, p.at));
    if (idx < 0) continue;
    for (const ni of [idx - 1, idx + 1]) {
      if (ni < 0 || ni >= line.length) continue;
      const c = line[ni]!;
      if (Math.sign(c.row - p.at.row) === f && !isAllyOf(c, p.side, s)) out.push(c);
    }
  }
  return dedupeCoords(out);
};
