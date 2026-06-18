import { describe, expect, it } from 'vitest';
import { pieceAt } from './board';
import { applyIntent } from './intent';
import { emptyGame, Placer } from './setup';
import { tick } from './tick';
import type { GameState, Intent, PieceKind, Side } from './types';

type Spec = [PieceKind, Side, number, number];

function game(cols: number, rows: number, specs: Spec[], turn: Side = 'player'): GameState {
  const placer = new Placer();
  for (const [k, s, c, r] of specs) placer.place(k, s, c, r);
  const base = emptyGame(cols, rows, [], { capacityMs: 1000 });
  return { ...base, pieces: placer.build(), turn };
}

function run(s: GameState, intents: Intent[]): GameState {
  return tick(s, { dt: 0, intents }).state; // dt=0 → 하강 없이 인텐트만
}

describe('이동 3단계 인텐트', () => {
  it('select: 현재 차례 말만 선택, 합법수 계산', () => {
    const g = game(5, 5, [['rook', 'player', 2, 2]]);
    const r = applyIntent(g, { t: 'select', pieceId: 'p-rook-0' });
    expect(r.state.selection?.pieceId).toBe('p-rook-0');
    expect(r.state.selection!.legal.length).toBeGreaterThan(0);
    expect(r.events.some((e) => e.t === 'selected')).toBe(true);
  });

  it('select: 상대 차례 말은 무시', () => {
    const g = game(5, 5, [['pawn', 'enemy', 2, 0]], 'player');
    const r = applyIntent(g, { t: 'select', pieceId: 'e-pawn-0' });
    expect(r.state.selection).toBeUndefined();
  });

  it('preview: 합법 칸만, 불법은 무시', () => {
    const g = game(5, 5, [['rook', 'player', 2, 2]]);
    const sel = run(g, [{ t: 'select', pieceId: 'p-rook-0' }]);
    const ok = applyIntent(sel, { t: 'preview', to: { col: 2, row: 0 } });
    expect(ok.state.selection?.preview).toEqual({ col: 2, row: 0 });
    const bad = applyIntent(sel, { t: 'preview', to: { col: 1, row: 1 } }); // 대각 불법
    expect(bad.state.selection?.preview).toBeUndefined();
  });

  it('confirm: 가상이동 확정 → 이동 + 턴 전환', () => {
    const g = game(5, 5, [['rook', 'player', 2, 2]]);
    const s = run(g, [
      { t: 'select', pieceId: 'p-rook-0' },
      { t: 'preview', to: { col: 2, row: 0 } },
      { t: 'confirm' },
    ]);
    expect(pieceAt({ col: 2, row: 0 }, s)?.id).toBe('p-rook-0');
    expect(s.selection).toBeUndefined();
    expect(s.turn).toBe('enemy');
  });

  it('confirm 없이 preview만으론 보드 불변(확정 전까지)', () => {
    const g = game(5, 5, [['rook', 'player', 2, 2]]);
    const s = run(g, [
      { t: 'select', pieceId: 'p-rook-0' },
      { t: 'preview', to: { col: 2, row: 0 } },
    ]);
    expect(pieceAt({ col: 2, row: 2 }, s)?.id).toBe('p-rook-0'); // 아직 원위치
    expect(s.turn).toBe('player');
  });

  it('confirm + 능동 잡기: 대상 제거, captured(active)', () => {
    const g = game(5, 5, [
      ['rook', 'player', 2, 2],
      ['pawn', 'enemy', 2, 0],
    ]);
    const res = tick(g, {
      dt: 0,
      intents: [
        { t: 'select', pieceId: 'p-rook-0' },
        { t: 'preview', to: { col: 2, row: 0 } },
        { t: 'confirm' },
      ],
    });
    expect(res.state.pieces.some((p) => p.kind === 'pawn')).toBe(false);
    expect(res.events.some((e) => e.t === 'captured' && e.mode === 'active')).toBe(true);
  });

  it('confirm으로 royal 잡으면 즉시 게임오버, 턴 안 넘어감', () => {
    const g = game(5, 5, [
      ['rook', 'player', 2, 2],
      ['king', 'enemy', 2, 0],
    ]);
    const s = run(g, [
      { t: 'select', pieceId: 'p-rook-0' },
      { t: 'preview', to: { col: 2, row: 0 } },
      { t: 'confirm' },
    ]);
    expect(s.status).toBe('over');
    expect(s.overReason).toBe('royal');
    expect(s.turn).toBe('player');
  });

  it('cancel: preview 있으면 가상이동만 되돌림(선택 유지)', () => {
    const g = game(5, 5, [['rook', 'player', 2, 2]]);
    const s = run(g, [
      { t: 'select', pieceId: 'p-rook-0' },
      { t: 'preview', to: { col: 2, row: 0 } },
      { t: 'cancel' },
    ]);
    expect(s.selection?.pieceId).toBe('p-rook-0');
    expect(s.selection?.preview).toBeUndefined();
  });

  it('cancel: preview 없으면 선택 해제', () => {
    const g = game(5, 5, [['rook', 'player', 2, 2]]);
    const s = run(g, [{ t: 'select', pieceId: 'p-rook-0' }, { t: 'cancel' }]);
    expect(s.selection).toBeUndefined();
  });

  it('턴 교대: 플레이어 확정 후 적 차례', () => {
    const g = game(5, 5, [
      ['rook', 'player', 0, 0],
      ['pawn', 'enemy', 4, 4],
    ]);
    const afterPlayer = run(g, [
      { t: 'select', pieceId: 'p-rook-0' },
      { t: 'preview', to: { col: 0, row: 1 } },
      { t: 'confirm' },
    ]);
    expect(afterPlayer.turn).toBe('enemy');
    // 이제 적 말 선택 가능, 내 말은 무시
    expect(applyIntent(afterPlayer, { t: 'select', pieceId: 'p-rook-0' }).state.selection).toBeUndefined();
    expect(applyIntent(afterPlayer, { t: 'select', pieceId: 'e-pawn-0' }).state.selection?.pieceId).toBe(
      'e-pawn-0',
    );
  });
});

describe('점수 (플레이어 전용, 리듬+처치)', () => {
  it('플레이어 확정: 리듬 점수(timeMs=0 → perfect=3)', () => {
    const g = game(5, 5, [['rook', 'player', 2, 2]]); // timeMs 0 = 정각 → perfect
    const s = run(g, [
      { t: 'select', pieceId: 'p-rook-0' },
      { t: 'preview', to: { col: 2, row: 0 } },
      { t: 'confirm' },
    ]);
    expect(s.score).toBe(3); // 리듬 perfect
  });

  it('플레이어 확정 + 잡기: 리듬 + 처치 합산(perfect3 + 폰1 = 4)', () => {
    const g = game(5, 5, [
      ['rook', 'player', 2, 2],
      ['pawn', 'enemy', 2, 0],
    ]);
    const res = tick(g, {
      dt: 0,
      intents: [
        { t: 'select', pieceId: 'p-rook-0' },
        { t: 'preview', to: { col: 2, row: 0 } },
        { t: 'confirm' },
      ],
    });
    expect(res.state.score).toBe(4);
    expect(res.events.some((e) => e.t === 'rhythm' && e.judge === 'perfect')).toBe(true);
    expect(res.events.some((e) => e.t === 'scored' && e.reason === 'capture')).toBe(true);
  });

  it('적(AI) 확정은 점수 없음', () => {
    const g = game(
      5,
      5,
      [
        ['rook', 'enemy', 2, 2],
        ['pawn', 'player', 2, 0],
      ],
      'enemy',
    );
    const s = run(g, [
      { t: 'select', pieceId: 'e-rook-0' },
      { t: 'preview', to: { col: 2, row: 0 } },
      { t: 'confirm' },
    ]);
    expect(s.score).toBe(0); // 적이 내 폰을 잡아도 내 점수는 그대로
  });
});

describe('하강 ↔ 진행 중 selection 재조정', () => {
  it('하강으로 preview가 불법이 되면 preview만 폐기', () => {
    // 룩(2,5), 적 폰(2,1). 룩이 (2,1) 잡기를 preview → 하강으로 폰이 (2,2)로,
    // (2,1)은 폰 뒤가 되어 도달 불가 → previewDropped.
    const g = game(7, 7, [
      ['rook', 'player', 2, 5],
      ['pawn', 'enemy', 2, 1],
    ]);
    const sel = run(g, [
      { t: 'select', pieceId: 'p-rook-0' },
      { t: 'preview', to: { col: 2, row: 1 } },
    ]);
    const r = tick(sel, { dt: sel.hourglass.capacity }); // 한 사이클 하강
    expect(r.state.selection?.pieceId).toBe('p-rook-0'); // 선택은 유지
    expect(r.state.selection?.preview).toBeUndefined(); // preview 폐기
    expect(r.events.some((e) => e.t === 'reconciled' && e.previewDropped)).toBe(true);
  });

  it('선택한 말이 하강 충돌로 제거되면 selection 해제', () => {
    // 내 졸(2,4) 선택, 적 폰(2,3)이 내려와 졸 제거.
    const g = game(7, 7, [
      ['soldier', 'player', 2, 4],
      ['pawn', 'enemy', 2, 3],
    ]);
    const sel = run(g, [{ t: 'select', pieceId: 'p-soldier-0' }]);
    const r = tick(sel, { dt: sel.hourglass.capacity });
    expect(r.state.pieces.some((p) => p.kind === 'soldier')).toBe(false);
    expect(r.state.selection).toBeUndefined();
  });
});
