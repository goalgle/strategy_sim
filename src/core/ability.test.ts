import { describe, expect, it } from 'vitest';
import { ABILITY_AUTO3, ABILITY_FORCE, ABILITY_FREEZE, ABILITY_FREEZE_MS, ABILITY_PUSH } from './constants';
import { pieceAt } from './board';
import { applyIntent } from './intent';
import { emptyGame, Placer } from './setup';
import { tick } from './tick';
import type { GameState, PieceKind, Side } from './types';

type Spec = [PieceKind, Side, number, number];

function game(cols: number, rows: number, specs: Spec[], extra: Partial<GameState> = {}): GameState {
  const placer = new Placer();
  for (const [k, s, c, r] of specs) placer.place(k, s, c, r);
  return { ...emptyGame(cols, rows, [], { capacityMs: 1000 }), pieces: placer.build(), turn: 'player', ...extra };
}

describe('#2 모래시계 정지', () => {
  it('티켓 1 소모 + freezeMs 설정 + 하강 멈춤', () => {
    const g = game(5, 6, [['pawn', 'enemy', 2, 0]], { tickets: 1 });
    const r = applyIntent(g, { t: 'special', action: ABILITY_FREEZE });
    expect(r.state.tickets).toBe(0);
    expect(r.state.hourglass.freezeMs).toBe(ABILITY_FREEZE_MS);
    expect(r.events.some((e) => e.t === 'frozen')).toBe(true);

    // 정지 동안 시간이 흘러도 하강 없음
    const after = tick(r.state, { dt: 1000 });
    expect(after.state.hourglass.cycle).toBe(0);
    expect(after.state.hourglass.freezeMs).toBe(ABILITY_FREEZE_MS - 1000);
  });

  it('정지 끝나면 다시 하강', () => {
    const g = game(5, 6, [['pawn', 'enemy', 2, 0]], { tickets: 1 });
    let s = applyIntent(g, { t: 'special', action: ABILITY_FREEZE }).state;
    s = tick(s, { dt: ABILITY_FREEZE_MS }).state; // 정지 소진
    expect(s.hourglass.freezeMs).toBe(0);
    const r = tick(s, { dt: 1000 }); // 이제 하강
    expect(r.state.hourglass.cycle).toBe(1);
  });

  it('티켓 없으면 발동 안 함', () => {
    const g = game(5, 6, [['pawn', 'enemy', 2, 0]], { tickets: 0 });
    const r = applyIntent(g, { t: 'special', action: ABILITY_FREEZE });
    expect(r.state.hourglass.freezeMs).toBe(0);
    expect(r.events).toHaveLength(0);
  });
});

describe('#4 자동 3수', () => {
  it('티켓 2 소모 + 전달된 수 적용 + 턴 전환', () => {
    // 룩 3개로 적 폰 3개를 잡는 수 목록을 직접 전달.
    const g = game(5, 5, [
      ['rook', 'player', 0, 4],
      ['rook', 'player', 1, 4],
      ['rook', 'player', 2, 4],
      ['pawn', 'enemy', 0, 0],
      ['pawn', 'enemy', 1, 0],
      ['pawn', 'enemy', 2, 0],
    ], { tickets: 2 });
    const moves = [
      { pieceId: 'p-rook-0', to: { col: 0, row: 0 } },
      { pieceId: 'p-rook-1', to: { col: 1, row: 0 } },
      { pieceId: 'p-rook-2', to: { col: 2, row: 0 } },
    ];
    const r = applyIntent(g, { t: 'special', action: ABILITY_AUTO3, payload: moves });
    expect(r.state.tickets).toBe(0); // 2장 소모
    expect(r.state.pieces.filter((p) => p.kind === 'pawn')).toHaveLength(0); // 3개 다 잡힘
    expect(r.state.score).toBe(3); // 폰 3개 × 1 (리듬 없음)
    expect(r.state.turn).toBe('enemy');
    expect(r.events.some((e) => e.t === 'auto3' && e.moves === 3)).toBe(true);
  });

  it('티켓 부족하면 발동 안 함', () => {
    const g = game(5, 5, [['rook', 'player', 0, 4], ['pawn', 'enemy', 0, 0]], { tickets: 1 });
    const r = applyIntent(g, {
      t: 'special',
      action: ABILITY_AUTO3,
      payload: [{ pieceId: 'p-rook-0', to: { col: 0, row: 0 } }],
    });
    expect(r.state.tickets).toBe(1);
    expect(r.events).toHaveLength(0);
  });

  it('royal 잡으면 게임오버(턴 안 넘김)', () => {
    const g = game(5, 5, [['rook', 'player', 0, 4], ['king', 'enemy', 0, 0]], { tickets: 2 });
    const r = applyIntent(g, {
      t: 'special',
      action: ABILITY_AUTO3,
      payload: [{ pieceId: 'p-rook-0', to: { col: 0, row: 0 } }],
    });
    expect(r.state.status).toBe('over');
    expect(r.state.overReason).toBe('royal');
  });
});

describe('#3 밀어내기(HP 소모)', () => {
  it('HP 2 소모 + 적 전체 한 칸 위로', () => {
    const g = game(5, 6, [
      ['pawn', 'enemy', 1, 3],
      ['pawn', 'enemy', 3, 4],
    ], { hp: 10 });
    const r = applyIntent(g, { t: 'special', action: ABILITY_PUSH });
    expect(r.state.hp).toBe(8);
    expect(pieceAt({ col: 1, row: 2 }, r.state)?.kind).toBe('pawn'); // 3→2
    expect(pieceAt({ col: 3, row: 3 }, r.state)?.kind).toBe('pawn'); // 4→3
    expect(r.events.some((e) => e.t === 'pushed')).toBe(true);
  });

  it('천장(row 0)·막힌 적은 그대로', () => {
    const g = game(5, 6, [
      ['pawn', 'enemy', 1, 0], // 천장
      ['rook', 'enemy', 2, 1],
      ['rook', 'enemy', 2, 2], // 위가 막힘(2,1)
    ], { hp: 10 });
    const r = applyIntent(g, { t: 'special', action: ABILITY_PUSH });
    expect(pieceAt({ col: 1, row: 0 }, r.state)).toBeDefined(); // 천장 그대로
    expect(pieceAt({ col: 2, row: 0 }, r.state)?.kind).toBe('rook'); // 1→0
    expect(pieceAt({ col: 2, row: 1 }, r.state)?.kind).toBe('rook'); // 2→1 (앞이 비켜서)
  });

  it('HP가 부족하면(소모 후 1 미만) 발동 안 함', () => {
    const g = game(5, 6, [['pawn', 'enemy', 1, 3]], { hp: 2 });
    const r = applyIntent(g, { t: 'special', action: ABILITY_PUSH });
    expect(r.state.hp).toBe(2);
    expect(r.events).toHaveLength(0);
  });
});

describe('#5 적 말 강제이동', () => {
  it('티켓 1 소모 + 적 말을 합법수로 이동', () => {
    const g = game(5, 6, [['rook', 'enemy', 2, 0]], { tickets: 1 });
    const r = applyIntent(g, {
      t: 'special',
      action: ABILITY_FORCE,
      payload: { pieceId: 'e-rook-0', to: { col: 2, row: 3 } },
    });
    expect(r.state.tickets).toBe(0);
    expect(pieceAt({ col: 2, row: 3 }, r.state)?.id).toBe('e-rook-0');
    expect(r.state.turn).toBe('player'); // 턴 안 넘어감
    expect(r.events.some((e) => e.t === 'forced')).toBe(true);
  });

  it('불법 이동이면 발동 안 함', () => {
    const g = game(5, 6, [['rook', 'enemy', 2, 0]], { tickets: 1 });
    const r = applyIntent(g, {
      t: 'special',
      action: ABILITY_FORCE,
      payload: { pieceId: 'e-rook-0', to: { col: 3, row: 1 } }, // 룩 대각 = 불법
    });
    expect(r.state.tickets).toBe(1);
    expect(r.events).toHaveLength(0);
  });

  it('티켓 없으면 발동 안 함', () => {
    const g = game(5, 6, [['rook', 'enemy', 2, 0]], { tickets: 0 });
    const r = applyIntent(g, {
      t: 'special',
      action: ABILITY_FORCE,
      payload: { pieceId: 'e-rook-0', to: { col: 2, row: 3 } },
    });
    expect(r.events).toHaveLength(0);
  });
});
