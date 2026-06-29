// 장기 튜토리얼 모드 — 셋업·승패(어느 장이든 잡히면 종료)·메타 없음.
import { describe, expect, it } from 'vitest';
import { applyIntent } from './intent';
import { createJanggiGame, emptyGame, Placer } from './setup';
import { tick } from './tick';
import type { GameState, Intent, Side } from './types';

describe('createJanggiGame 셋업', () => {
  const g = createJanggiGame();

  it('9×10, 양쪽 궁성, 모드 janggi, 모래시계 0(하강 없음)', () => {
    expect([g.board.cols, g.board.rows]).toEqual([9, 10]);
    expect(g.board.palaces.map((p) => p.side).sort()).toEqual(['enemy', 'player']);
    expect(g.mode).toBe('janggi');
    expect(g.hourglass.capacity).toBe(0);
  });

  it('양 진영 모두 장기말 16개 + 장(將) 각 1', () => {
    const player = g.pieces.filter((p) => p.side === 'player');
    const enemy = g.pieces.filter((p) => p.side === 'enemy');
    expect(player).toHaveLength(16);
    expect(enemy).toHaveLength(16);
    expect(g.pieces.filter((p) => p.isRoyal)).toHaveLength(2); // 양쪽 장
    expect(g.pieces.every((p) => p.family === 'janggi')).toBe(true);
  });

  it('capacity 0이라 큰 dt에도 하강 사이클이 없다', () => {
    const r = tick(g, { dt: 100000 });
    expect(r.state.hourglass.cycle).toBe(0);
  });
});

function janggiGame(specs: [import('./types').PieceKind, Side, number, number][], turn: Side = 'player'): GameState {
  const placer = new Placer();
  for (const [k, s, c, r] of specs) placer.place(k, s, c, r);
  const base = emptyGame(9, 10, [], { capacityMs: 0 });
  return { ...base, mode: 'janggi', pieces: placer.build(), turn };
}

function run(s: GameState, intents: Intent[]): GameState {
  return tick(s, { dt: 0, intents }).state;
}

describe('장기 모드 승패', () => {
  it('적 장(將)을 잡으면 게임 종료(승리)', () => {
    const g = janggiGame([
      ['chariot', 'player', 4, 4],
      ['general', 'enemy', 4, 0],
    ]);
    const s = run(g, [
      { t: 'select', pieceId: 'p-chariot-0' },
      { t: 'preview', to: { col: 4, row: 0 } },
      { t: 'confirm' },
    ]);
    expect(s.status).toBe('over');
    expect(s.overReason).toBe('royal');
    expect(s.pieces.some((p) => p.side === 'player' && p.isRoyal)).toBe(false); // 내 장 없음 → 승리 표기 근거
  });

  it('내 장(將)이 잡히면 게임 종료(패배)', () => {
    const g = janggiGame(
      [
        ['chariot', 'enemy', 4, 4],
        ['general', 'player', 4, 8],
      ],
      'enemy',
    );
    const s = run(g, [
      { t: 'select', pieceId: 'e-chariot-0' },
      { t: 'preview', to: { col: 4, row: 8 } },
      { t: 'confirm' },
    ]);
    expect(s.status).toBe('over');
    expect(s.pieces.some((p) => p.side === 'player' && p.isRoyal)).toBe(false);
  });

  it('5턴마다 미션이 생기지 않는다(메타 없음)', () => {
    // 졸을 좌우로 왔다갔다 시키며 플레이어 턴을 여러 번 — 미션이 떠선 안 됨.
    let s = janggiGame([
      ['soldier', 'player', 4, 5],
      ['general', 'player', 4, 8],
      ['general', 'enemy', 4, 1],
    ]);
    // 적은 장만 있어 거의 못 움직이지만, 턴은 교대된다. 플레이어가 졸을 옆으로 반복 이동.
    for (let i = 0; i < 6; i++) {
      const col = s.pieces.find((p) => p.kind === 'soldier')!.at.col;
      const to = { col: col === 4 ? 3 : 4, row: 5 };
      s = run(s, [
        { t: 'select', pieceId: 'p-soldier-0' },
        { t: 'preview', to },
        { t: 'confirm' },
      ]);
      if (s.turn === 'enemy') s = run(s, []); // 적 턴 스킵(엔진 외부 AI 없음)
    }
    expect(s.mission).toBeUndefined();
  });
});
