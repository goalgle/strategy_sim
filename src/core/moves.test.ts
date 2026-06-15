import { describe, expect, it } from 'vitest';
import { makePalace, pieceAt } from './board';
import { legalMoves } from './pieces/registry';
import { applyMove, canMoveTo } from './rules';
import { createStandardGame, Placer } from './setup';
import type { Coord, GameState, PieceKind, Side } from './types';

type Spec = [PieceKind, Side, number, number]; // kind, side, col, row

function makeGame(
  cols: number,
  rows: number,
  palaces: GameState['board']['palaces'],
  specs: Spec[],
): GameState {
  const placer = new Placer();
  for (const [k, s, c, r] of specs) placer.place(k, s, c, r);
  return { board: { cols, rows, palaces }, pieces: placer.build() };
}

function movesAt(g: GameState, col: number, row: number): Coord[] {
  const p = pieceAt({ col, row }, g);
  if (!p) throw new Error(`no piece at ${col},${row}`);
  return legalMoves(p, g);
}

function has(moves: Coord[], col: number, row: number): boolean {
  return moves.some((c) => c.col === col && c.row === row);
}

describe('체스 합법수', () => {
  it('룩: 직교 레이, 아군서 멈춤, 적은 잡고 멈춤', () => {
    // 룩(2,2), 아군 (2,4), 적 (4,2)
    const g = makeGame(5, 5, [], [
      ['rook', 'player', 2, 2],
      ['soldier', 'player', 2, 4],
      ['pawn', 'enemy', 4, 2],
    ]);
    const m = movesAt(g, 2, 2);
    expect(has(m, 2, 1)).toBe(true); // 위로
    expect(has(m, 2, 0)).toBe(true);
    expect(has(m, 2, 3)).toBe(true); // 아래로, 아군 직전까지
    expect(has(m, 2, 4)).toBe(false); // 아군 칸 불가
    expect(has(m, 3, 2)).toBe(true);
    expect(has(m, 4, 2)).toBe(true); // 적 잡기
    expect(has(m, 4, 2 + 0)).toBe(true);
    expect(has(m, 0, 2)).toBe(true);
  });

  it('나이트: 8방향 점프(중간 무시)', () => {
    const g = makeGame(5, 5, [], [['knight', 'player', 2, 2]]);
    const m = movesAt(g, 2, 2);
    expect(m).toHaveLength(8);
    expect(has(m, 0, 1)).toBe(true);
    expect(has(m, 3, 0)).toBe(true);
  });

  it('폰: 전진 1 + 대각 잡기, 전진으로는 못 잡고 후진 불가', () => {
    // enemy 폰(4,1): 전진=아래(row+1). 적(=player) 말 (3,2) 대각, (4,2) 정면.
    const g = makeGame(9, 6, [], [
      ['pawn', 'enemy', 4, 1],
      ['soldier', 'player', 3, 2], // 대각 → 잡기 가능
      ['soldier', 'player', 4, 2], // 정면 → 차단(잡기 불가)
    ]);
    const m = movesAt(g, 4, 1);
    expect(has(m, 3, 2)).toBe(true); // 대각 잡기
    expect(has(m, 4, 2)).toBe(false); // 정면 잡기 불가
    expect(has(m, 5, 2)).toBe(false); // 적 없는 대각 불가
    expect(has(m, 4, 0)).toBe(false); // 후진 불가
  });
});

describe('장기 합법수 — 까다로운 규칙', () => {
  it('포: 다리 하나를 넘어야 하고, 다리·대상이 포면 불가', () => {
    // 가로줄. 포(0,0), 다리 pawn(3,0), 그 너머 적 rook(6,0).
    const g = makeGame(9, 1, [], [
      ['cannon', 'player', 0, 0],
      ['pawn', 'enemy', 3, 0],
      ['rook', 'enemy', 6, 0],
    ]);
    const m = movesAt(g, 0, 0);
    expect(has(m, 1, 0)).toBe(false); // 다리 이전 불가
    expect(has(m, 3, 0)).toBe(false); // 다리 자체 불가
    expect(has(m, 4, 0)).toBe(true); // 다리 너머 빈 칸
    expect(has(m, 5, 0)).toBe(true);
    expect(has(m, 6, 0)).toBe(true); // 적 잡기(포 아님)
  });

  it('포: 다리가 없으면 못 감', () => {
    const g = makeGame(9, 1, [], [['cannon', 'player', 0, 0]]);
    expect(movesAt(g, 0, 0)).toHaveLength(0);
  });

  it('포: 포는 넘지도 잡지도 못함', () => {
    // 다리가 포 → 불가
    const g1 = makeGame(9, 1, [], [
      ['cannon', 'player', 0, 0],
      ['cannon', 'enemy', 3, 0],
      ['rook', 'enemy', 6, 0],
    ]);
    expect(movesAt(g1, 0, 0)).toHaveLength(0);
    // 다리는 pawn, 대상이 포 → 그 포는 못 잡음(직전 빈 칸까지만)
    const g2 = makeGame(9, 1, [], [
      ['cannon', 'player', 0, 0],
      ['pawn', 'enemy', 3, 0],
      ['cannon', 'enemy', 5, 0],
    ]);
    const m = movesAt(g2, 0, 0);
    expect(has(m, 4, 0)).toBe(true);
    expect(has(m, 5, 0)).toBe(false); // 포는 못 잡음
  });

  it('마: 멱(직교 1보 칸)이 막히면 그 방향 불가', () => {
    const g = makeGame(5, 5, [], [
      ['horse', 'player', 2, 2],
      ['pawn', 'player', 2, 1], // 위쪽 멱 차단
    ]);
    const m = movesAt(g, 2, 2);
    expect(has(m, 1, 0)).toBe(false); // 위 멱 경유 목적지 차단
    expect(has(m, 3, 0)).toBe(false);
    expect(has(m, 0, 1)).toBe(true); // 다른 방향은 정상
    expect(has(m, 4, 3)).toBe(true);
  });

  it('상: 멱 2지점 중 하나라도 막히면 불가', () => {
    const g = makeGame(9, 9, [], [
      ['elephant', 'player', 4, 4],
      ['pawn', 'player', 4, 3], // 첫 멱(직교) 차단 → 위쪽 두 목적지 제거
    ]);
    const m = movesAt(g, 4, 4);
    expect(has(m, 2, 1)).toBe(false);
    expect(has(m, 6, 1)).toBe(false);
    expect(has(m, 7, 2)).toBe(true); // 옆 방향은 정상
  });
});

describe('궁성 제약', () => {
  // cols 9 → 궁성 cols {3,4,5}. rows 6 → player 궁성 rows {3,4,5}.
  const palace = [makePalace('player', 9, 6)];

  it('장(general): 궁성 안 1보, 대각은 X라인 위에서만', () => {
    const g = makeGame(9, 6, palace, [['general', 'player', 4, 4]]); // 중앙
    const m = movesAt(g, 4, 4);
    // 직교 4 + 대각 4(X라인) = 8, 모두 궁성 내
    expect(m).toHaveLength(8);
    expect(has(m, 3, 3)).toBe(true);
    expect(has(m, 5, 5)).toBe(true);
  });

  it('장: 궁성 밖으로 못 나감', () => {
    const g = makeGame(9, 6, palace, [['general', 'player', 4, 3]]); // 궁성 윗변 중앙
    const m = movesAt(g, 4, 3);
    expect(has(m, 4, 2)).toBe(false); // 궁성 밖(위) 불가
    expect(has(m, 3, 3)).toBe(true);
    expect(has(m, 4, 4)).toBe(true);
    expect(has(m, 3, 2)).toBe(false); // X라인 아닌 대각 불가
  });

  it('사(guard): 모서리에선 대각 1개만(중앙 방향)', () => {
    const g = makeGame(9, 6, palace, [['guard', 'player', 3, 3]]); // 좌상 모서리
    const m = movesAt(g, 3, 3);
    expect(has(m, 4, 4)).toBe(true); // 중앙으로 대각
    expect(has(m, 4, 3)).toBe(true); // 직교
    expect(has(m, 3, 4)).toBe(true);
    expect(has(m, 5, 5)).toBe(false); // 건너뛰기 불가
  });

  it('차: 궁성 대각선 라인을 따라 슬라이드', () => {
    const g = makeGame(9, 6, palace, [['chariot', 'player', 3, 3]]);
    const m = movesAt(g, 3, 3);
    expect(has(m, 4, 4)).toBe(true); // 대각 라인 슬라이드
    expect(has(m, 5, 5)).toBe(true);
  });

  it('졸: 전진/옆 1, 후진 불가, 궁성 대각은 전진만', () => {
    // player 졸 전진 = 위(row-1). 궁성 라인 위 (5,5).
    const g = makeGame(9, 6, palace, [['soldier', 'player', 5, 5]]);
    const m = movesAt(g, 5, 5);
    expect(has(m, 5, 4)).toBe(true); // 전진
    expect(has(m, 4, 5)).toBe(true); // 옆
    expect(has(m, 6, 5)).toBe(true); // 옆
    expect(has(m, 4, 4)).toBe(true); // 궁성 대각 전진
    expect(has(m, 5, 6)).toBe(false); // 후진(보드 밖이기도)
  });
});

describe('잡기(applyMove)', () => {
  it('능동 잡기: 대상 제거 + 이동측 이동', () => {
    const g = makeGame(5, 5, [], [
      ['rook', 'player', 2, 2],
      ['pawn', 'enemy', 2, 0],
    ]);
    const rook = pieceAt({ col: 2, row: 2 }, g)!;
    expect(canMoveTo(rook, { col: 2, row: 0 }, g)).toBe(true);
    const res = applyMove(g, rook.id, { col: 2, row: 0 });
    expect(res.captured?.kind).toBe('pawn');
    expect(res.state.pieces).toHaveLength(1);
    expect(pieceAt({ col: 2, row: 0 }, res.state)?.id).toBe(rook.id);
  });

  it('빈 칸 이동: 잡힌 말 없음', () => {
    const g = makeGame(5, 5, [], [['rook', 'player', 2, 2]]);
    const res = applyMove(g, pieceAt({ col: 2, row: 2 }, g)!.id, { col: 2, row: 1 });
    expect(res.captured).toBeUndefined();
    expect(res.state.pieces).toHaveLength(1);
  });
});

describe('표준 진형(createStandardGame)', () => {
  const g = createStandardGame();

  it('양 진영 16개씩, 총 32개', () => {
    expect(g.pieces.filter((p) => p.side === 'player')).toHaveLength(16);
    expect(g.pieces.filter((p) => p.side === 'enemy')).toHaveLength(16);
  });

  it('장(general)은 궁성 중앙, 적 킹은 royal', () => {
    const general = g.pieces.find((p) => p.kind === 'general')!;
    expect(general.at).toEqual({ col: 4, row: g.board.rows - 2 });
    expect(general.isRoyal).toBe(true);
    const king = g.pieces.find((p) => p.kind === 'king')!;
    expect(king.side).toBe('enemy');
    expect(king.isRoyal).toBe(true);
  });

  it('모든 말의 합법수 생성이 예외 없이 동작', () => {
    for (const p of g.pieces) {
      expect(() => legalMoves(p, g)).not.toThrow();
    }
  });
});
