import { describe, expect, it } from 'vitest';
import { pieceAt } from './board';
import type { GameEvent } from './events';
import { emptyGame, Placer } from './setup';
import { tick } from './tick';
import type { GameState, PieceKind, Side } from './types';

type Spec = [PieceKind, Side, number, number];

function game(
  cols: number,
  rows: number,
  specs: Spec[],
  init: { hp?: number; capacityMs?: number } = {},
): GameState {
  const placer = new Placer();
  for (const [k, s, c, r] of specs) placer.place(k, s, c, r);
  const base = emptyGame(cols, rows, [], {
    maxHp: init.hp ?? 10,
    capacityMs: init.capacityMs ?? 1000,
  });
  return { ...base, pieces: placer.build() };
}

/** dt=capacity로 한 사이클(한 번의 하강)만 진행. */
function oneCycle(s: GameState): { state: GameState; events: GameEvent[] } {
  return tick(s, { dt: s.hourglass.capacity });
}

describe('모래시계 → 하강', () => {
  it('진행바가 차면 cycle++ 하고 적이 한 칸 내려온다', () => {
    const g = game(5, 6, [['pawn', 'enemy', 2, 0]]);
    const r = oneCycle(g);
    expect(r.state.hourglass.cycle).toBe(1);
    expect(pieceAt({ col: 2, row: 1 }, r.state)?.kind).toBe('pawn');
    expect(r.events.some((e) => e.t === 'cycle')).toBe(true);
    expect(r.events.some((e) => e.t === 'descended')).toBe(true);
  });

  it('capacity 미만 dt면 하강하지 않는다', () => {
    const g = game(5, 6, [['pawn', 'enemy', 2, 0]], { capacityMs: 1000 });
    const r = tick(g, { dt: 400 });
    expect(r.state.hourglass.cycle).toBe(0);
    expect(pieceAt({ col: 2, row: 0 }, r.state)).toBeDefined();
  });

  it('paused면 시간이 흘러도 하강 없음', () => {
    const g0 = game(5, 6, [['pawn', 'enemy', 2, 0]]);
    const g = { ...g0, hourglass: { ...g0.hourglass, paused: true } };
    const r = tick(g, { dt: 99999 });
    expect(r.state.hourglass.cycle).toBe(0);
  });

  it('dt가 크면 여러 사이클 누적 하강', () => {
    const g = game(5, 8, [['pawn', 'enemy', 2, 0]], { capacityMs: 100 });
    const r = tick(g, { dt: 300 }); // 3 사이클
    expect(r.state.hourglass.cycle).toBe(3);
    expect(pieceAt({ col: 2, row: 3 }, r.state)?.kind).toBe('pawn');
  });
});

describe('하강 충돌 — 위쪽(적) 승', () => {
  it('적이 내 말 위로 내려오면 내 말이 제거된다', () => {
    // 적 폰(2,2), 내 졸(2,3). 한 사이클 → 적이 (2,3) 차지, 내 졸 제거.
    const g = game(5, 6, [
      ['pawn', 'enemy', 2, 2],
      ['soldier', 'player', 2, 3],
    ]);
    const r = oneCycle(g);
    const occ = pieceAt({ col: 2, row: 3 }, r.state);
    expect(occ?.side).toBe('enemy');
    expect(r.state.pieces.some((p) => p.kind === 'soldier')).toBe(false);
    expect(r.events.some((e) => e.t === 'captured' && e.mode === 'descent')).toBe(true);
  });

  it('royal(장)이 하강 충돌로 잡히면 즉시 게임오버', () => {
    const g = game(5, 6, [
      ['pawn', 'enemy', 2, 2],
      ['general', 'player', 2, 3],
    ]);
    const r = oneCycle(g);
    expect(r.state.status).toBe('over');
    expect(r.state.overReason).toBe('royal');
    expect(r.events.some((e) => e.t === 'gameOver' && e.reason === 'royal')).toBe(true);
  });
});

describe('맨 아래 도달 — 최우선(HP 감소)', () => {
  it('적이 맨 아래 칸에 도달하면 적 제거 + HP 감소', () => {
    // rows=4 → 맨 아래 row=3. 적 폰(2,2) → 다음 사이클 (2,3) 도달.
    const g = game(5, 4, [['pawn', 'enemy', 2, 2]], { hp: 3 });
    const r = oneCycle(g);
    expect(pieceAt({ col: 2, row: 3 }, r.state)).toBeUndefined(); // 적 제거됨
    expect(r.state.hp).toBe(2);
    expect(r.events.some((e) => e.t === 'bottomReached')).toBe(true);
    expect(r.events.some((e) => e.t === 'hpChanged' && e.delta === -1)).toBe(true);
  });

  it('맨 아래 도달은 잡기보다 우선 — 내 말이 있어도 코어 침범으로 처리', () => {
    // 맨 아래(row3)에 내 졸. 적이 도달 → 졸은 잡히지 않고, HP만 감소, 적 제거.
    const g = game(5, 4, [
      ['pawn', 'enemy', 2, 2],
      ['soldier', 'player', 2, 3],
    ], { hp: 3 });
    const r = oneCycle(g);
    expect(pieceAt({ col: 2, row: 3 }, r.state)?.kind).toBe('soldier'); // 내 말 생존
    expect(r.state.hp).toBe(2);
    expect(r.events.some((e) => e.t === 'captured')).toBe(false); // 잡기 아님
  });

  it('HP가 0이 되면 게임오버(hp)', () => {
    const g = game(5, 4, [['pawn', 'enemy', 2, 2]], { hp: 1 });
    const r = oneCycle(g);
    expect(r.state.status).toBe('over');
    expect(r.state.overReason).toBe('hp');
  });
});

describe('스폰 + 결정론', () => {
  it('사이클마다 최상단 빈 열에 적이 스폰된다', () => {
    const g = game(5, 8, [['pawn', 'enemy', 2, 0]]);
    const r = oneCycle(g);
    const spawned = r.state.pieces.filter((p) => p.id.startsWith('e-spawn-'));
    expect(spawned).toHaveLength(1);
    expect(spawned[0]!.at.row).toBe(0);
    expect(r.events.some((e) => e.t === 'spawned')).toBe(true);
  });

  it('같은 시드 → 같은 스폰 위치(결정론)', () => {
    const mk = () => game(9, 10, [['pawn', 'enemy', 0, 0]]);
    const run = (s: GameState) => tick(s, { dt: s.hourglass.capacity * 3 }).state;
    const a = run(mk());
    const b = run(mk());
    const cols = (s: GameState) =>
      s.pieces
        .filter((p) => p.id.startsWith('e-spawn-'))
        .map((p) => `${p.at.col},${p.at.row}`)
        .sort();
    expect(cols(a)).toEqual(cols(b));
    expect(cols(a).length).toBeGreaterThan(0);
  });

  it('게임오버 후 tick은 무동작', () => {
    const g = { ...game(5, 4, [['pawn', 'enemy', 2, 2]], { hp: 1 }) };
    const over = oneCycle(g).state;
    expect(over.status).toBe('over');
    const again = tick(over, { dt: 99999 });
    expect(again.events).toHaveLength(0);
    expect(again.state).toEqual(over);
  });
});
