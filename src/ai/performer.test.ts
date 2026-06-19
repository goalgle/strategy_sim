import { describe, expect, it } from 'vitest';
import { emptyGame, Placer } from '../core/setup';
import { tick } from '../core/tick';
import type { GameState, PieceKind, Side } from '../core/types';
import { aiChooseMove, DEFAULT_AI_CONFIG } from './heuristic';
import { AiPerformer, type RitualAction } from './performer';

type Spec = [PieceKind, Side, number, number];

function game(cols: number, rows: number, specs: Spec[], turn: Side = 'enemy'): GameState {
  const placer = new Placer();
  for (const [k, s, c, r] of specs) placer.place(k, s, c, r);
  return { ...emptyGame(cols, rows, []), pieces: placer.build(), turn };
}

/** 연출 시퀀스를 전부 뽑아낸다(update는 호출당 0~1개 방출). */
function drain(perf: AiPerformer): RitualAction[] {
  const seq: RitualAction[] = [];
  for (let i = 0; i < 100 && perf.active; i++) seq.push(...perf.update(10_000));
  return seq;
}

describe('AI 연출(AiPerformer)', () => {
  it('미끼(취소) 후 commit 신호로 끝난다', () => {
    const g = game(7, 7, [
      ['rook', 'enemy', 1, 1],
      ['knight', 'enemy', 4, 1],
      ['pawn', 'enemy', 2, 1],
    ]);
    const perf = new AiPerformer();
    expect(perf.plan(g, DEFAULT_AI_CONFIG)).toBe(true);

    const seq = drain(perf);
    expect(seq[seq.length - 1]).toBe('commit'); // 마지막은 commit 신호
    expect(seq.some((a) => a !== 'commit' && a.t === 'cancel')).toBe(true); // 미끼 취소 있음
  });

  it('미끼 적용 + commit(fresh)으로 적이 1수 두고 턴 전환', () => {
    const g = game(7, 7, [
      ['rook', 'enemy', 1, 1],
      ['pawn', 'enemy', 4, 1],
    ]);
    const perf = new AiPerformer();
    perf.plan(g, DEFAULT_AI_CONFIG);

    // 메인 루프 동작 모사: 미끼 인텐트는 적용, commit은 현재 상태로 fresh 적용.
    let s = g;
    for (const action of drain(perf)) {
      if (action === 'commit') {
        const move = aiChooseMove(s, s.turn, DEFAULT_AI_CONFIG)!;
        s = tick(s, {
          dt: 0,
          intents: [
            { t: 'select', pieceId: move.pieceId },
            { t: 'preview', to: move.to },
            { t: 'confirm' },
          ],
        }).state;
      } else {
        s = tick(s, { dt: 0, intents: [action] }).state;
      }
    }
    expect(s.turn).toBe('player');
    expect(s.selection).toBeUndefined();
  });

  it('둘 수 없으면 plan은 false(호출측이 패스)', () => {
    const g = game(5, 5, [['general', 'enemy', 0, 0]]); // 궁성 없음 → 합법수 0
    const perf = new AiPerformer();
    expect(perf.plan(g, DEFAULT_AI_CONFIG)).toBe(false);
    expect(perf.active).toBe(false);
  });
});
