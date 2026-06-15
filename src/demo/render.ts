// 콘솔 ASCII 보드 렌더러 — 개발 확인용(게임 렌더러 아님).
// 말 코드: 소문자=장기/플레이어, 대문자=체스/적. '*'=강조(합법수), '·'=빈 칸.
import { eq } from '../core/board';
import type { Coord, GameState, PieceKind } from '../core/types';

const GLYPH: Record<PieceKind, string> = {
  // 장기(플레이어) — 소문자
  general: 'G',
  chariot: 'c',
  cannon: 'o',
  horse: 'h',
  elephant: 'e',
  guard: 'a',
  soldier: 's',
  // 체스(적) — 대문자
  king: 'K',
  queen: 'Q',
  rook: 'R',
  bishop: 'B',
  knight: 'N',
  pawn: 'P',
};

function cellGlyph(c: Coord, state: GameState, highlights: Coord[]): string {
  const p = state.pieces.find((x) => eq(x.at, c));
  const hl = highlights.some((h) => eq(h, c));
  if (p && hl) return 'x'; // 합법수 + 적 점유 = 잡기 대상
  if (p) return GLYPH[p.kind];
  if (hl) return '*'; // 합법수 + 빈 칸
  return '·';
}

/** 보드를 문자열로 그린다. highlights는 합법수 등 강조 좌표. */
export function renderBoard(state: GameState, highlights: Coord[] = []): string {
  const { cols, rows } = state.board;
  const header = '    ' + Array.from({ length: cols }, (_, c) => String(c)).join(' ');
  const lines = [header];
  for (let row = 0; row < rows; row++) {
    const cells: string[] = [];
    for (let col = 0; col < cols; col++) {
      cells.push(cellGlyph({ col, row }, state, highlights));
    }
    lines.push(String(row).padStart(2, ' ') + ': ' + cells.join(' '));
  }
  return lines.join('\n');
}
