// 보상카드 토대 + #1 사 2칸 이동.
import { describe, expect, it } from 'vitest';
import { makePalace } from './board';
import { BUFFS, grantPlayerBuffs, hasBuff, parseBuffs, withBuff } from './buffs';
import { legalMoves } from './pieces/registry';
import { emptyGame } from './setup';
import type { GameState, Piece } from './types';

function guardAt(col: number, row: number, withGuardStride: boolean): Piece {
  const base: Piece = {
    id: 'p-guard-0',
    kind: 'guard',
    family: 'janggi',
    side: 'player',
    at: { col, row },
    isRoyal: false,
  };
  return withGuardStride ? withBuff(base, 'guardStride') : base;
}

/** 9×10 보드 + 플레이어 궁성. 궁성: cols 3..5, rows 7..9. */
function palaceGame(pieces: Piece[]): GameState {
  const g = emptyGame(9, 10, [makePalace('player', 9, 10)]);
  return { ...g, pieces };
}

function has(moves: { col: number; row: number }[], col: number, row: number): boolean {
  return moves.some((m) => m.col === col && m.row === row);
}

describe('버프 헬퍼', () => {
  it('hasBuff/withBuff는 불변이며 중복을 막는다', () => {
    const p = guardAt(4, 8, false);
    expect(hasBuff(p, 'guardStride')).toBe(false);
    const p2 = withBuff(p, 'guardStride');
    expect(hasBuff(p2, 'guardStride')).toBe(true);
    expect(p.buffs).toBeUndefined(); // 원본 불변
    expect(withBuff(p2, 'guardStride')).toBe(p2); // 중복 부여 시 동일 참조
  });

  it('parseBuffs는 미지 값을 버린다', () => {
    expect(parseBuffs('guardStride,bogus,horseLeap')).toEqual(['guardStride', 'horseLeap']);
    expect(parseBuffs(null)).toEqual([]);
    expect(parseBuffs('')).toEqual([]);
  });

  it('grantPlayerBuffs는 대상 종류의 플레이어 말에만 부여', () => {
    const guard = guardAt(3, 7, false);
    const enemyGuard: Piece = { ...guard, id: 'e', side: 'enemy' };
    const horse: Piece = { ...guard, id: 'h', kind: 'horse' };
    const [g, e, h] = grantPlayerBuffs([guard, enemyGuard, horse], ['guardStride']);
    expect(hasBuff(g!, 'guardStride')).toBe(true);
    expect(hasBuff(e!, 'guardStride')).toBe(false); // 적
    expect(hasBuff(h!, 'guardStride')).toBe(false); // 종류 불일치
  });

  it('BUFFS 메타는 6종을 모두 정의', () => {
    expect(Object.keys(BUFFS)).toHaveLength(6);
    expect(BUFFS.guardStride.appliesTo).toBe('guard');
  });
});

describe('#1 사 2칸(guardStride)', () => {
  it('버프 없으면 궁성 1보만(2칸 도착지는 합법수 아님)', () => {
    const moves = legalMoves(guardAt(3, 7, false), palaceGame([guardAt(3, 7, false)]));
    expect(has(moves, 3, 8)).toBe(true); // 직교 1보
    expect(has(moves, 4, 8)).toBe(true); // 대각 라인 1보
    expect(has(moves, 3, 9)).toBe(false); // 직교 2보 ✗
    expect(has(moves, 5, 9)).toBe(false); // 대각 2보 ✗
  });

  it('버프 있으면 중간칸이 비었을 때 직선 2칸까지', () => {
    const g = guardAt(3, 7, true);
    const moves = legalMoves(g, palaceGame([g]));
    expect(has(moves, 3, 9)).toBe(true); // 직교 2보(3,8 경유)
    expect(has(moves, 5, 7)).toBe(true); // 직교 2보(4,7 경유)
    expect(has(moves, 5, 9)).toBe(true); // 대각 2보(4,8 경유)
  });

  it('중간칸이 막히면 2칸 불가', () => {
    const g = guardAt(3, 7, true);
    const blocker: Piece = { ...guardAt(4, 8, false), id: 'blk' };
    const moves = legalMoves(g, palaceGame([g, blocker]));
    expect(has(moves, 5, 9)).toBe(false); // 대각 중앙(4,8) 막힘
  });

  it('2칸 도착지는 궁성을 벗어나지 않는다', () => {
    const g = guardAt(4, 8, true); // 중앙
    const moves = legalMoves(g, palaceGame([g]));
    // 중앙에서 직교 2보는 궁성 밖(예: row 6) → 없어야 함
    expect(has(moves, 4, 6)).toBe(false);
    expect(has(moves, 4, 10)).toBe(false);
  });
});

function horseAt(col: number, row: number, leap: boolean): Piece {
  const base: Piece = {
    id: 'p-horse-0',
    kind: 'horse',
    family: 'janggi',
    side: 'player',
    at: { col, row },
    isRoyal: false,
  };
  return leap ? withBuff(base, 'horseLeap') : base;
}

/** 9×10 빈 보드(궁성 없음). */
function openGame(pieces: Piece[]): GameState {
  return { ...emptyGame(9, 10, []), pieces };
}

describe('#2 마 점프(horseLeap)', () => {
  it('버프 없으면 멱이 막힌 방향은 갈 수 없다', () => {
    const h = horseAt(4, 4, false);
    const blocker: Piece = { ...h, id: 'blk', at: { col: 4, row: 3 } }; // 위쪽 멱
    const moves = legalMoves(h, openGame([h, blocker]));
    expect(has(moves, 3, 2)).toBe(false); // 위 멱 막힘 → 두 도착지 ✗
    expect(has(moves, 5, 2)).toBe(false);
    expect(has(moves, 6, 5)).toBe(true); // 오른쪽 멱은 비어 있어 정상
  });

  it('버프 있으면 멱을 무시하고 8방 점프', () => {
    const h = horseAt(4, 4, true);
    const blocker: Piece = { ...h, id: 'blk', at: { col: 4, row: 3 } }; // 막혀 있어도
    const moves = legalMoves(h, openGame([h, blocker]));
    const eight = [
      [5, 6], [6, 5], [6, 3], [5, 2],
      [3, 2], [2, 3], [2, 5], [3, 6],
    ];
    for (const [c, r] of eight) expect(has(moves, c!, r!)).toBe(true);
    expect(moves).toHaveLength(8);
  });

  it('점프 도착이 아군이면 제외', () => {
    const h = horseAt(4, 4, true);
    const ally: Piece = { ...h, id: 'ally', at: { col: 5, row: 2 } };
    const moves = legalMoves(h, openGame([h, ally]));
    expect(has(moves, 5, 2)).toBe(false); // 아군 위 ✗
    expect(moves).toHaveLength(7);
  });

  it('적이 있는 점프 도착지는 잡기 가능(합법수)', () => {
    const h = horseAt(4, 4, true);
    const enemy: Piece = { ...h, id: 'enm', side: 'enemy', at: { col: 5, row: 2 } };
    const moves = legalMoves(h, openGame([h, enemy]));
    expect(has(moves, 5, 2)).toBe(true);
  });
});
