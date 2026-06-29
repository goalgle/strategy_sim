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
import { hasBuff } from '../buffs';
import type { Coord, GameState, MoveGen, Piece } from '../types';
import { KNIGHT_JUMPS, ORTHO, ray, step, type Dir } from './common';

// ── 차(chariot): 룩 레이 + 궁성 대각선 슬라이드. (버프 chariotPierce) 아군1 희생 관통 잡기 ──
export const chariot: MoveGen = (p, s) => {
  const out = ORTHO.flatMap((d) => ray(p.at, d, p.side, s));
  out.push(...palaceDiagonalSlide(p, s));
  for (const m of chariotPierceMoves(p, s)) out.push(m.to);
  return dedupeCoords(out);
};

/**
 * 차 관통(버프): 직교 레이에서 [빈칸…] 아군1 [빈칸…] 적 패턴이면, 그 적 칸으로 이동 가능.
 * 가로막은 아군(희생)은 royal이 아니어야 하고, 정확히 1기만 사이에 있을 때 성립.
 * 반환: 도착칸 + 희생될 아군 id(해소 시 둘 다 제거). 도착칸 외 잡기라 단일 진실 소스로 둔다.
 */
export function chariotPierceMoves(p: Piece, s: GameState): { to: Coord; sacrificeId: string }[] {
  if (!hasBuff(p, 'chariotPierce')) return [];
  const out: { to: Coord; sacrificeId: string }[] = [];
  for (const d of ORTHO) {
    let c = step(p.at, d);
    while (inBounds(c, s.board) && isEmpty(c, s)) c = step(c, d); // 첫 말까지
    if (!inBounds(c, s.board)) continue;
    const ally = pieceAt(c, s)!;
    if (ally.side !== p.side || ally.isRoyal) continue; // 가로막은게 아군(비-royal)이어야
    c = step(c, d);
    while (inBounds(c, s.board) && isEmpty(c, s)) c = step(c, d); // 아군 너머 다음 말까지
    if (!inBounds(c, s.board)) continue;
    const target = pieceAt(c, s)!;
    if (target.side !== p.side) out.push({ to: { col: c.col, row: c.row }, sacrificeId: ally.id });
  }
  return out;
}

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

// ── 포(cannon): 다리 하나를 넘어 이동/잡기. 다리·대상이 포면 불가. (버프 cannonCreep) 인접 1칸 평이동 ──
export const cannon: MoveGen = (p, s) => {
  const out: Coord[] = [];
  for (const d of ORTHO) out.push(...cannonRay(p, d, s));
  out.push(...cannonPalaceDiagonal(p, s));
  if (hasBuff(p, 'cannonCreep')) out.push(...cannonCreep(p, s));
  return dedupeCoords(out);
};

/** 인접 직교 1칸 평이동 — 빈 칸만(잡기 불가). 일반 포의 다리 점프와 별개로 추가. */
function cannonCreep(p: Piece, s: GameState): Coord[] {
  const out: Coord[] = [];
  for (const d of ORTHO) {
    const c = step(p.at, d);
    if (inBounds(c, s.board) && isEmpty(c, s)) out.push(c);
  }
  return out;
}

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

// ── 마(horse): 직교 1보(멱) + 바깥 대각 1보. (버프 horseLeap) 멱 무시 나이트 점프 ──
export const horse: MoveGen = (p, s) => {
  if (hasBuff(p, 'horseLeap')) return horseLeap(p, s);
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

/** 멱을 무시하고 8방 L자 점프(나이트). 도착이 보드 안·비아군이면 가능. */
function horseLeap(p: Piece, s: GameState): Coord[] {
  const out: Coord[] = [];
  for (const d of KNIGHT_JUMPS) {
    const dest = step(p.at, d);
    if (inBounds(dest, s.board) && !isAllyOf(dest, p.side, s)) out.push(dest);
  }
  return out;
}

// ── 상(elephant): 직교 1보 + 대각 2보, 멱 2지점. (버프 elephantTrample) 멱 무시·경로 적 짓밟기 ──
export const elephant: MoveGen = (p, s) => {
  const trample = hasBuff(p, 'elephantTrample');
  const out: Coord[] = [];
  for (const o of ORTHO) {
    const leg1 = step(p.at, o);
    if (!inBounds(leg1, s.board)) continue;
    if (trample ? isAllyOf(leg1, p.side, s) : !isEmpty(leg1, s)) continue; // 짓밟기:아군만 차단 / 일반:멱1
    for (const d of outwardDiagonals(o)) {
      const leg2 = step(leg1, d);
      if (!inBounds(leg2, s.board)) continue;
      if (trample ? isAllyOf(leg2, p.side, s) : !isEmpty(leg2, s)) continue; // 멱2 / 아군 차단
      const dest = step(leg2, d);
      if (inBounds(dest, s.board) && !isAllyOf(dest, p.side, s)) out.push(dest);
    }
  }
  return out;
};

/**
 * 상 짓밟기 경로의 중간 두 칸(leg1, leg2) 절대 좌표. 도착칸은 별도(일반 잡기).
 * from→to는 항상 유효한 상 변위(±2,±3 또는 ±3,±2)이므로 경로가 유일하게 복원된다.
 */
export function elephantTramplePath(from: Coord, to: Coord): Coord[] {
  const dc = to.col - from.col;
  const dr = to.row - from.row;
  const sc = Math.sign(dc);
  const sr = Math.sign(dr);
  const leg1 = { col: from.col + (dc - 2 * sc), row: from.row + (dr - 2 * sr) };
  const leg2 = { col: leg1.col + sc, row: leg1.row + sr };
  return [leg1, leg2];
}

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

export const general: MoveGen = palaceStep;

// 사(guard): 기본 궁성 1보 + (버프 guardStride) 궁성 안 직선 2보 ──
export const guard: MoveGen = (p, s) => {
  const out = palaceStep(p, s);
  if (hasBuff(p, 'guardStride')) out.push(...guardStride(p, s));
  return dedupeCoords(out);
};

/** 궁성 안 직선 2칸: 직교 또는 X 대각 라인을 따라, 중간칸이 비어 있고 도착이 궁성·비아군일 때. */
function guardStride(p: Piece, s: GameState): Coord[] {
  const pal = s.board.palaces.find((x) => x.side === p.side);
  if (pal === undefined) return [];
  const inPal = (c: Coord) => pal.cells.some((x) => eq(x, c));
  const out: Coord[] = [];
  // 직교 2보
  for (const o of ORTHO) {
    const mid = step(p.at, o);
    const dest = step(mid, o);
    if (inPal(mid) && isEmpty(mid, s) && inPal(dest) && !isAllyOf(dest, p.side, s)) out.push(dest);
  }
  // 대각 라인 2보(귀퉁이 ↔ 귀퉁이, 중앙 경유)
  for (const line of pal.diagonalLines) {
    const idx = line.findIndex((c) => eq(c, p.at));
    if (idx !== 0 && idx !== 2) continue;
    const mid = line[1]!;
    const dest = line[idx === 0 ? 2 : 0]!;
    if (isEmpty(mid, s) && !isAllyOf(dest, p.side, s)) out.push(dest);
  }
  return out;
}

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
