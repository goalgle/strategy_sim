import { describe, expect, it } from 'vitest';
import { emptyGame, Placer } from '../core/setup';
import { tick } from '../core/tick';
import type { GameState, Intent, PieceKind, Side } from '../core/types';
import { DEFAULT_AI_CONFIG } from './heuristic';
import { AiPerformer } from './performer';

type Spec = [PieceKind, Side, number, number];

function game(cols: number, rows: number, specs: Spec[], turn: Side = 'enemy'): GameState {
  const placer = new Placer();
  for (const [k, s, c, r] of specs) placer.place(k, s, c, r);
  return { ...emptyGame(cols, rows, []), pieces: placer.build(), turn };
}

/** 연출 시퀀스를 전부 뽑아낸다(update는 호출당 0~1개 방출). */
function drain(perf: AiPerformer): Intent[] {
  const seq: Intent[] = [];
  for (let i = 0; i < 100 && perf.active; i++) seq.push(...perf.update(10_000));
  return seq;
}

describe('AI 연출(AiPerformer)', () => {
  it('탐색(취소) 후 최선수 확정으로 끝난다', () => {
    // 여러 적 말 → 후보 다수 → 미끼(취소) + 확정.
    const g = game(7, 7, [
      ['rook', 'enemy', 1, 1],
      ['knight', 'enemy', 4, 1],
      ['pawn', 'enemy', 2, 1],
    ]);
    const perf = new AiPerformer();
    expect(perf.plan(g, DEFAULT_AI_CONFIG)).toBe(true);

    const seq = drain(perf);
    expect(seq.length).toBeGreaterThanOrEqual(3);
    expect(seq[seq.length - 1]!.t).toBe('confirm'); // 마지막은 확정
    expect(seq.some((i) => i.t === 'cancel')).toBe(true); // 중간에 취소(미끼) 있음
    expect(seq.filter((i) => i.t === 'select').length).toBeGreaterThanOrEqual(2);
  });

  it('연출 시퀀스를 적용하면 적이 1수 두고 턴이 넘어간다', () => {
    const g = game(7, 7, [
      ['rook', 'enemy', 1, 1],
      ['pawn', 'enemy', 4, 1],
    ]);
    const perf = new AiPerformer();
    perf.plan(g, DEFAULT_AI_CONFIG);
    const seq = drain(perf);

    let s = g;
    for (const intent of seq) s = tick(s, { dt: 0, intents: [intent] }).state;
    expect(s.turn).toBe('player'); // 확정되어 턴 전환
    expect(s.selection).toBeUndefined();
  });

  it('둘 수 없으면 plan은 false(호출측이 패스)', () => {
    const g = game(5, 5, [['general', 'enemy', 0, 0]]); // 궁성 없음 → 합법수 0
    const perf = new AiPerformer();
    expect(perf.plan(g, DEFAULT_AI_CONFIG)).toBe(false);
    expect(perf.active).toBe(false);
  });
});
