// 보드 모델 + 모든 MoveGen이 공유하는 질의 헬퍼 + 궁성 구성.
// 설계 근거: doc/architecture.md "이동 생성 → 보드 헬퍼", "궁성(palace) 모델"

import type { Board, Coord, GameState, PalaceDef, Piece, Side } from './types';

export function eq(a: Coord, b: Coord): boolean {
  return a.col === b.col && a.row === b.row;
}

export function inBounds(c: Coord, b: Board): boolean {
  return c.col >= 0 && c.col < b.cols && c.row >= 0 && c.row < b.rows;
}

export function pieceAt(c: Coord, s: GameState): Piece | undefined {
  return s.pieces.find((p) => p.at.col === c.col && p.at.row === c.row);
}

export function isEmpty(c: Coord, s: GameState): boolean {
  return pieceAt(c, s) === undefined;
}

export function isEnemyOf(c: Coord, side: Side, s: GameState): boolean {
  const p = pieceAt(c, s);
  return p !== undefined && p.side !== side;
}

export function isAllyOf(c: Coord, side: Side, s: GameState): boolean {
  const p = pieceAt(c, s);
  return p !== undefined && p.side === side;
}

/** 이동 규칙상의 전진 방향: player=위로(row-1), enemy=아래로(row+1). */
export function forward(side: Side): -1 | 1 {
  return side === 'player' ? -1 : 1;
}

// ── 궁성 ────────────────────────────────────────────────

/** 지정 측의 표준 궁성(가운데 3열 × 진영 쪽 3행)을 만든다. */
export function makePalace(side: Side, cols: number, rows: number): PalaceDef {
  const colStart = Math.floor((cols - 3) / 2);
  const palCols = [colStart, colStart + 1, colStart + 2] as const;
  const palRows =
    side === 'enemy' ? [0, 1, 2] : [rows - 3, rows - 2, rows - 1];

  const cells: Coord[] = [];
  for (const row of palRows) for (const col of palCols) cells.push({ col, row });

  const [c0, c1, c2] = palCols;
  const [r0, r1, r2] = palRows as [number, number, number];
  // X자 두 대각선(각 라인은 3점 정렬). 중앙이 두 라인의 교점.
  const diagonalLines: Coord[][] = [
    [
      { col: c0, row: r0 },
      { col: c1, row: r1 },
      { col: c2, row: r2 },
    ],
    [
      { col: c2, row: r0 },
      { col: c1, row: r1 },
      { col: c0, row: r2 },
    ],
  ];
  return { side, cells, diagonalLines };
}

/** 좌표가 해당 측 궁성 칸인가. */
export function inPalace(c: Coord, side: Side, b: Board): boolean {
  const pal = b.palaces.find((p) => p.side === side);
  return pal !== undefined && pal.cells.some((x) => eq(x, c));
}

/** 좌표를 지나는 궁성 대각선 라인들(모든 궁성에 대해). */
export function palaceLinesThrough(c: Coord, b: Board): Coord[][] {
  const lines: Coord[][] = [];
  for (const pal of b.palaces)
    for (const line of pal.diagonalLines)
      if (line.some((x) => eq(x, c))) lines.push(line);
  return lines;
}

export function dedupeCoords(cs: Coord[]): Coord[] {
  const out: Coord[] = [];
  for (const c of cs) if (!out.some((x) => eq(x, c))) out.push(c);
  return out;
}
