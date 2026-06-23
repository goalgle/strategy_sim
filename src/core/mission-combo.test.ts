import { describe, expect, it } from 'vitest';
import { applyIntent } from './intent';
import { MISSION_INTERVAL } from './missions';
import { emptyGame, Placer } from './setup';
import type { GameState, Intent, PieceKind, Side } from './types';

type Spec = [PieceKind, Side, number, number];

function game(cols: number, rows: number, specs: Spec[], extra: Partial<GameState> = {}): GameState {
  const placer = new Placer();
  for (const [k, s, c, r] of specs) placer.place(k, s, c, r);
  return { ...emptyGame(cols, rows, []), pieces: placer.build(), turn: 'player', ...extra };
}

function run(s: GameState, intents: Intent[]): { state: GameState; events: ReturnType<typeof applyIntent>['events'] } {
  let st = s;
  const ev: ReturnType<typeof applyIntent>['events'] = [];
  for (const i of intents) {
    const r = applyIntent(st, i);
    st = r.state;
    ev.push(...r.events);
  }
  return { state: st, events: ev };
}

describe('미션 / 티켓', () => {
  it('플레이어 확정마다 turnCount 증가', () => {
    const g = game(5, 5, [['rook', 'player', 0, 0]]);
    const s = run(g, [
      { t: 'select', pieceId: 'p-rook-0' },
      { t: 'preview', to: { col: 0, row: 1 } },
      { t: 'confirm' },
    ]).state;
    expect(s.turnCount).toBe(1);
    expect(s.turn).toBe('enemy');
  });

  it('5턴째에 미션 발생', () => {
    // turnCount를 4로 시작 → 한 수 두면 5 → 미션.
    const g = game(5, 8, [['rook', 'player', 0, 7]], { turnCount: MISSION_INTERVAL - 1 });
    const r = run(g, [
      { t: 'select', pieceId: 'p-rook-0' },
      { t: 'preview', to: { col: 0, row: 6 } },
      { t: 'confirm' },
    ]);
    expect(r.state.turnCount).toBe(MISSION_INTERVAL);
    expect(r.state.mission).toBeDefined();
    expect(r.events.some((e) => e.t === 'missionNew')).toBe(true);
  });

  it('미션 완료 시 티켓 +1, 미션 해제', () => {
    // captureKind=pawn 미션을 들고 시작, 폰을 잡으면 완료.
    const g = game(5, 5, [
      ['rook', 'player', 0, 0],
      ['pawn', 'enemy', 0, 2],
    ], { mission: { kind: 'captureKind', target: 'pawn', done: false } });
    const r = run(g, [
      { t: 'select', pieceId: 'p-rook-0' },
      { t: 'preview', to: { col: 0, row: 2 } },
      { t: 'confirm' },
    ]);
    expect(r.state.tickets).toBe(1);
    expect(r.state.mission).toBeUndefined();
    expect(r.events.some((e) => e.t === 'missionDone')).toBe(true);
  });
});

describe('콤보(연속 잡기)', () => {
  // 룩(0,0)이 (0,2) 적 잡고, 그 자리에서 (2,2) 적을 또 잡을 수 있는 배치.
  const comboSetup = () =>
    game(5, 5, [
      ['rook', 'player', 0, 0],
      ['pawn', 'enemy', 0, 2],
      ['pawn', 'enemy', 2, 2],
    ], { tickets: 2 });

  it('잡은 뒤 추가 대상 있고 티켓 있으면 콤보 시작(턴 안 넘김)', () => {
    const r = run(comboSetup(), [
      { t: 'select', pieceId: 'p-rook-0' },
      { t: 'preview', to: { col: 0, row: 2 } },
      { t: 'confirm' },
    ]);
    expect(r.state.combo).toBeDefined();
    expect(r.state.combo!.count).toBe(1);
    expect(r.state.turn).toBe('player'); // 아직 내 차례
    expect(r.events.some((e) => e.t === 'comboStart')).toBe(true);
  });

  it('comboTo로 이어 잡기 → 티켓 1 소모, 점수 누적', () => {
    const started = run(comboSetup(), [
      { t: 'select', pieceId: 'p-rook-0' },
      { t: 'preview', to: { col: 0, row: 2 } },
      { t: 'confirm' },
    ]).state;
    expect(started.tickets).toBe(2);
    const r = applyIntent(started, { t: 'comboTo', to: { col: 2, row: 2 } });
    expect(r.state.tickets).toBe(1); // 1장 소모
    expect(r.state.pieces.some((p) => p.kind === 'pawn')).toBe(false); // 둘 다 잡힘
    expect(r.events.some((e) => e.t === 'comboContinue')).toBe(true);
    // 더 잡을 게 없으니 콤보 종료 + 턴 넘김
    expect(r.state.combo).toBeUndefined();
    expect(r.state.turn).toBe('enemy');
  });

  it('티켓 0이면 콤보 시작 안 함(바로 턴 종료)', () => {
    const g = game(5, 5, [
      ['rook', 'player', 0, 0],
      ['pawn', 'enemy', 0, 2],
      ['pawn', 'enemy', 2, 2],
    ], { tickets: 0 });
    const r = run(g, [
      { t: 'select', pieceId: 'p-rook-0' },
      { t: 'preview', to: { col: 0, row: 2 } },
      { t: 'confirm' },
    ]);
    expect(r.state.combo).toBeUndefined();
    expect(r.state.turn).toBe('enemy');
  });

  it('comboEnd로 콤보 포기 → 턴 넘김', () => {
    const started = run(comboSetup(), [
      { t: 'select', pieceId: 'p-rook-0' },
      { t: 'preview', to: { col: 0, row: 2 } },
      { t: 'confirm' },
    ]).state;
    const r = applyIntent(started, { t: 'comboEnd' });
    expect(r.state.combo).toBeUndefined();
    expect(r.state.turn).toBe('enemy');
    expect(r.state.tickets).toBe(2); // 포기는 티켓 소모 없음
  });
});
