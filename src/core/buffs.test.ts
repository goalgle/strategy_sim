// 보상카드 토대 + #1 사 2칸 이동.
import { describe, expect, it } from 'vitest';
import { makePalace } from './board';
import { BUFFS, grantPlayerBuffs, hasBuff, parseBuffs, withBuff } from './buffs';
import { wardedCellsAgainst } from './board';
import { applyDescent } from './descent';
import { chariotPierceMoves, elephantTramplePath } from './pieces/janggi';
import { legalMoves } from './pieces/registry';
import { applyMove, capturesIfMoved, sacrificeIfMoved } from './rules';
import { emptyGame } from './setup';
import { isAttackedBy } from './threats';
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

function elephantAt(col: number, row: number, trample: boolean): Piece {
  const base: Piece = {
    id: 'p-eleph-0',
    kind: 'elephant',
    family: 'janggi',
    side: 'player',
    at: { col, row },
    isRoyal: false,
  };
  return trample ? withBuff(base, 'elephantTrample') : base;
}

function enemyAt(id: string, col: number, row: number): Piece {
  return { id, kind: 'pawn', family: 'chess', side: 'enemy', at: { col, row }, isRoyal: false };
}

describe('#3 상 짓밟기(elephantTrample)', () => {
  it('경로 헬퍼는 from→to의 중간 두 칸을 복원', () => {
    // (4,5)→(6,2): leg1(4,4), leg2(5,3)
    expect(elephantTramplePath({ col: 4, row: 5 }, { col: 6, row: 2 })).toEqual([
      { col: 4, row: 4 },
      { col: 5, row: 3 },
    ]);
  });

  it('버프 없으면 멱(경로)이 막히면 불가', () => {
    const e = elephantAt(4, 5, false);
    const block = enemyAt('blk', 4, 4); // leg1 막힘
    const moves = legalMoves(e, openGame([e, block]));
    expect(has(moves, 6, 2)).toBe(false);
    expect(has(moves, 2, 2)).toBe(false);
  });

  it('버프 있으면 경로에 적이 있어도 통과(아군은 차단)', () => {
    const e = elephantAt(4, 5, true);
    const onLeg1 = enemyAt('e1', 4, 4);
    const moves = legalMoves(e, openGame([e, onLeg1]));
    expect(has(moves, 6, 2)).toBe(true); // 적 멱은 통과
    // 아군이 leg2(5,3)에 있으면 그 도착지는 막힘
    const ally: Piece = { ...elephantAt(5, 3, false), id: 'ally' };
    const moves2 = legalMoves(e, openGame([e, onLeg1, ally]));
    expect(has(moves2, 6, 2)).toBe(false);
  });

  it('applyMove가 경로 + 도착칸의 적을 모두 잡는다', () => {
    const e = elephantAt(4, 5, true);
    const onLeg1 = enemyAt('e1', 4, 4);
    const onDest = enemyAt('e2', 6, 2);
    const res = applyMove(openGame([e, onLeg1, onDest]), e.id, { col: 6, row: 2 });
    expect(res.captures.map((c) => c.id).sort()).toEqual(['e1', 'e2']);
    expect(res.captured?.id).toBe('e2'); // 도착칸은 기존 호환 필드
    expect(res.state.pieces.find((p) => p.id === e.id)?.at).toEqual({ col: 6, row: 2 });
    expect(res.state.pieces.some((p) => p.id === 'e1' || p.id === 'e2')).toBe(false);
  });

  it('버프 없는 일반 이동은 captures 길이 1(하위호환)', () => {
    const e = elephantAt(4, 5, false);
    const onDest = enemyAt('e2', 6, 2);
    const res = applyMove(openGame([e, onDest]), e.id, { col: 6, row: 2 });
    expect(res.captures).toHaveLength(1);
    expect(res.captured?.id).toBe('e2');
  });

  it('capturesIfMoved는 잡힐 말 전부를 돌려주되 상태를 바꾸지 않음(UI 미리보기용)', () => {
    const e = elephantAt(4, 5, true);
    const state = openGame([e, enemyAt('e1', 4, 4), enemyAt('e2', 6, 2)]);
    const caps = capturesIfMoved(state, e.id, { col: 6, row: 2 });
    expect(caps.map((c) => c.id).sort()).toEqual(['e1', 'e2']);
    expect(state.pieces).toHaveLength(3); // 원본 불변
  });

  it('AI 위협판정이 짓밟기 경로 중간칸도 사정권으로 인식', () => {
    const e = elephantAt(4, 5, true);
    const onLeg1 = enemyAt('e1', 4, 4);
    const state = openGame([e, onLeg1]);
    expect(isAttackedBy({ col: 4, row: 4 }, 'player', state)).toBe(true); // 경로 중간칸
    expect(isAttackedBy({ col: 6, row: 2 }, 'player', state)).toBe(true); // 도착칸
    // 버프 없으면 경로 막혀 사정권 아님
    const plain = openGame([elephantAt(4, 5, false), onLeg1]);
    expect(isAttackedBy({ col: 4, row: 4 }, 'player', plain)).toBe(false);
  });
});

function cannonAt(col: number, row: number, creep: boolean): Piece {
  const base: Piece = {
    id: 'p-cannon-0',
    kind: 'cannon',
    family: 'janggi',
    side: 'player',
    at: { col, row },
    isRoyal: false,
  };
  return creep ? withBuff(base, 'cannonCreep') : base;
}

describe('#4 포 보행(cannonCreep)', () => {
  it('버프 없으면 다리가 없을 때 움직일 수 없다', () => {
    const c = cannonAt(4, 5, false);
    expect(legalMoves(c, openGame([c]))).toHaveLength(0);
  });

  it('버프 있으면 인접 빈 4칸으로 평이동', () => {
    const c = cannonAt(4, 5, true);
    const moves = legalMoves(c, openGame([c]));
    expect(has(moves, 4, 4)).toBe(true);
    expect(has(moves, 4, 6)).toBe(true);
    expect(has(moves, 3, 5)).toBe(true);
    expect(has(moves, 5, 5)).toBe(true);
    expect(moves).toHaveLength(4);
  });

  it('보행으로는 인접 적을 잡지 못한다(빈 칸만)', () => {
    const c = cannonAt(4, 5, true);
    const enemy = enemyAt('e', 4, 4); // 위쪽 인접 적(동시에 포의 다리 역할)
    const moves = legalMoves(c, openGame([c, enemy]));
    expect(has(moves, 4, 4)).toBe(false); // 적 칸으로 보행/착지 ✗ (잡기 불가)
    // 나머지 인접 빈 칸은 보행 가능
    expect(has(moves, 4, 6)).toBe(true);
    expect(has(moves, 3, 5)).toBe(true);
    expect(has(moves, 5, 5)).toBe(true);
  });

  it('보행은 일반 다리 점프 잡기와 공존한다', () => {
    const c = cannonAt(4, 5, true);
    const screen = enemyAt('scr', 4, 3); // 다리
    const target = enemyAt('tgt', 4, 1); // 너머 적(잡기)
    const moves = legalMoves(c, openGame([c, screen, target]));
    expect(has(moves, 4, 1)).toBe(true); // 점프 잡기
    expect(has(moves, 4, 2)).toBe(true); // 점프 이동
    expect(has(moves, 4, 6)).toBe(true); // 보행
    expect(has(moves, 4, 4)).toBe(true); // 보행(다리 앞 빈 칸)
  });
});

function chariotAt(col: number, row: number, pierce: boolean): Piece {
  const base: Piece = {
    id: 'p-chariot-0',
    kind: 'chariot',
    family: 'janggi',
    side: 'player',
    at: { col, row },
    isRoyal: false,
  };
  return pierce ? withBuff(base, 'chariotPierce') : base;
}

function allyAt(id: string, col: number, row: number, kind: Piece['kind'] = 'soldier'): Piece {
  return { id, kind, family: 'janggi', side: 'player', at: { col, row }, isRoyal: kind === 'general' };
}

describe('#5 차 관통(chariotPierce)', () => {
  it('버프 없으면 가로막은 아군 너머로 갈 수 없다', () => {
    const c = chariotAt(4, 8, false);
    const ally = allyAt('a', 4, 5);
    const enemy = enemyAt('e', 4, 2);
    const moves = legalMoves(c, openGame([c, ally, enemy]));
    expect(has(moves, 4, 2)).toBe(false); // 아군에 막혀 너머 불가
    expect(has(moves, 4, 6)).toBe(true); // 아군 앞 빈 칸까지만
  });

  it('버프 있으면 아군1 너머 적으로 관통', () => {
    const c = chariotAt(4, 8, true);
    const ally = allyAt('a', 4, 5);
    const enemy = enemyAt('e', 4, 2);
    const state = openGame([c, ally, enemy]);
    expect(has(legalMoves(c, state), 4, 2)).toBe(true);
    expect(chariotPierceMoves(c, state)).toEqual([{ to: { col: 4, row: 2 }, sacrificeId: 'a' }]);
  });

  it('아군이 2기면(혹은 royal이면) 관통 불가', () => {
    const c = chariotAt(4, 8, true);
    const enemy = enemyAt('e', 4, 2);
    const two = openGame([c, allyAt('a', 4, 5), allyAt('b', 4, 4), enemy]);
    expect(has(legalMoves(c, two), 4, 2)).toBe(false); // 아군 2기
    const royal = openGame([c, allyAt('g', 4, 5, 'general'), enemy]);
    expect(has(legalMoves(c, royal), 4, 2)).toBe(false); // 내 궁 희생 불가
  });

  it('아군 너머가 적이 아니면(빈 칸/아군) 관통 없음', () => {
    const c = chariotAt(4, 8, true);
    const noTarget = openGame([c, allyAt('a', 4, 5)]); // 너머 적 없음
    expect(chariotPierceMoves(c, noTarget)).toEqual([]);
  });

  it('applyMove: 적 잡기 + 아군 희생, 둘 다 제거', () => {
    const c = chariotAt(4, 8, true);
    const ally = allyAt('a', 4, 5);
    const enemy = enemyAt('e', 4, 2);
    const res = applyMove(openGame([c, ally, enemy]), c.id, { col: 4, row: 2 });
    expect(res.captures.map((p) => p.id)).toEqual(['e']); // 적만 점수 대상
    expect(res.captured?.id).toBe('e');
    expect(res.sacrifice?.id).toBe('a'); // 아군 희생
    expect(res.state.pieces.map((p) => p.id).sort()).toEqual(['p-chariot-0']); // 차만 남음
    expect(res.state.pieces[0]!.at).toEqual({ col: 4, row: 2 });
  });

  it('미리보기 질의: captures=적, sacrifice=아군', () => {
    const c = chariotAt(4, 8, true);
    const state = openGame([c, allyAt('a', 4, 5), enemyAt('e', 4, 2)]);
    expect(capturesIfMoved(state, c.id, { col: 4, row: 2 }).map((p) => p.id)).toEqual(['e']);
    expect(sacrificeIfMoved(state, c.id, { col: 4, row: 2 })?.id).toBe('a');
  });

  it('버프가 있어도 일반 직접 잡기는 희생 없음', () => {
    const c = chariotAt(4, 8, true);
    const enemy = enemyAt('e', 4, 5); // 사이에 아군 없음
    const res = applyMove(openGame([c, enemy]), c.id, { col: 4, row: 5 });
    expect(res.captured?.id).toBe('e');
    expect(res.sacrifice).toBeUndefined();
  });

  it('AI 위협판정: 관통 도착(적 칸)을 사정권으로 인식', () => {
    const c = chariotAt(4, 8, true);
    const state = openGame([c, allyAt('a', 4, 5), enemyAt('e', 4, 2)]);
    expect(isAttackedBy({ col: 4, row: 2 }, 'player', state)).toBe(true);
  });
});

// 플레이어 궁성: cols 3..5, rows 7..9 (9×10 보드).
function general(ward: boolean): Piece {
  const g: Piece = { id: 'g', kind: 'general', family: 'janggi', side: 'player', at: { col: 3, row: 9 }, isRoyal: true };
  return ward ? withBuff(g, 'palaceWard') : g;
}
function enemyRook(col: number, row: number): Piece {
  return { id: 'r', kind: 'rook', family: 'chess', side: 'enemy', at: { col, row }, isRoyal: false };
}

describe('#6 궁성 결계(palaceWard)', () => {
  it('결계 없으면 적이 궁성에 진입 가능', () => {
    const moves = legalMoves(enemyRook(4, 5), palaceGame([general(false), enemyRook(4, 5)]));
    expect(has(moves, 4, 6)).toBe(true); // 궁성 밖
    expect(has(moves, 4, 7)).toBe(true); // 궁성 칸
    expect(has(moves, 4, 8)).toBe(true);
    expect(has(moves, 4, 9)).toBe(true);
  });

  it('결계 있으면 적이 궁성 칸으로 못 들어간다', () => {
    const state = palaceGame([general(true), enemyRook(4, 5)]);
    const moves = legalMoves(enemyRook(4, 5), state);
    expect(has(moves, 4, 6)).toBe(true); // 궁성 밖은 가능
    expect(has(moves, 4, 7)).toBe(false); // 궁성 진입 ✗
    expect(has(moves, 4, 8)).toBe(false);
    expect(has(moves, 4, 9)).toBe(false);
  });

  it('결계는 궁성 안 아군 잡기도 막는다(진입 자체 불가)', () => {
    const victim: Piece = { id: 'v', kind: 'soldier', family: 'janggi', side: 'player', at: { col: 4, row: 8 }, isRoyal: false };
    const state = palaceGame([general(true), victim, enemyRook(4, 5)]);
    const moves = legalMoves(enemyRook(4, 5), state);
    expect(has(moves, 4, 8)).toBe(false); // 궁성 안 아군을 잡으러 진입 ✗
  });

  it('플레이어 말의 이동은 결계 영향 없음(자기 궁성)', () => {
    const g = general(true);
    const moves = legalMoves(g, palaceGame([g]));
    expect(moves.length).toBeGreaterThan(0); // 장은 자기 궁성 안에서 정상 이동
  });

  it('wardedCellsAgainst: 활성 시 궁성 9칸, 비활성 시 빈 배열', () => {
    expect(wardedCellsAgainst('enemy', palaceGame([general(true)]))).toHaveLength(9);
    expect(wardedCellsAgainst('enemy', palaceGame([general(false)]))).toHaveLength(0);
    expect(wardedCellsAgainst('player', palaceGame([general(true)]))).toHaveLength(0); // 내 궁성은 안 막음
  });

  it('AI 체크 판정: 궁성 안 왕은 결계로 위협받지 않음', () => {
    // 장을 궁성 칸(4,8)에 두고 적 룩이 겨냥 → 결계면 사정권 아님.
    const g = withBuff({ ...general(true), at: { col: 4, row: 8 } }, 'palaceWard');
    const state = palaceGame([g, enemyRook(4, 5)]);
    expect(isAttackedBy({ col: 4, row: 8 }, 'enemy', state)).toBe(false);
    const plain = palaceGame([{ ...g, buffs: undefined }, enemyRook(4, 5)]);
    expect(isAttackedBy({ col: 4, row: 8 }, 'enemy', plain)).toBe(true);
  });

  it('하강도 결계 칸으로 들어오지 못한다(그대로 멈춤)', () => {
    // 궁성 rows 7..9. 적이 (4,6)에서 하강하면 (4,7)=궁성 → 결계면 멈춤.
    const enemy: Piece = { ...enemyRook(4, 6), kind: 'pawn' };
    const warded = applyDescent(palaceGame([general(true), enemy]));
    expect(warded.state.pieces.find((p) => p.id === 'r')?.at).toEqual({ col: 4, row: 6 }); // 안 내려옴
    const open = applyDescent(palaceGame([general(false), { ...enemy }]));
    expect(open.state.pieces.find((p) => p.id === 'r')?.at).toEqual({ col: 4, row: 7 }); // 정상 하강
  });

  it('결계는 하강의 맨아래 도달(피해)보다 우선 — 궁성 바닥칸이면 피해 없음', () => {
    // (4,8)에서 하강하면 (4,9)=궁성 바닥칸(rows-1). 결계면 멈춤·HP 유지.
    const enemy: Piece = { ...enemyRook(4, 8), kind: 'pawn' };
    const warded = applyDescent(palaceGame([general(true), enemy]));
    expect(warded.state.hp).toBe(warded.state.maxHp); // 피해 없음
    expect(warded.state.pieces.some((p) => p.id === 'r')).toBe(true); // 제거 안 됨
    const open = applyDescent(palaceGame([general(false), { ...enemy }]));
    expect(open.state.hp).toBe(open.state.maxHp - open.state.damagePerReach); // 바닥 도달 피해
  });
});
