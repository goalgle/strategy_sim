import { describe, expect, it } from 'vitest';
import { emptyGame, Placer } from '../core/setup';
import type { GameState, PieceKind, Side } from '../core/types';
import { aiChooseMove, aiTakeTurn, type AiConfig } from './heuristic';

type Spec = [PieceKind, Side, number, number];

function game(cols: number, rows: number, specs: Spec[], turn: Side = 'enemy'): GameState {
  const placer = new Placer();
  for (const [k, s, c, r] of specs) placer.place(k, s, c, r);
  return { ...emptyGame(cols, rows, []), pieces: placer.build(), turn };
}

describe('AI 휴리스틱 (MVP)', () => {
  it('잡기를 포지셔닝보다 우선', () => {
    // 적 룩(2,2), 잡을 수 있는 내 폰(2,4). 전진보다 잡기 선택.
    const g = game(5, 6, [
      ['rook', 'enemy', 2, 2],
      ['pawn', 'player', 2, 4],
    ]);
    const move = aiChooseMove(g, 'enemy');
    expect(move?.to).toEqual({ col: 2, row: 4 });
  });

  it('여러 잡기 중 가치 높은 대상 선호(퀸 > 폰)', () => {
    const g = game(5, 5, [
      ['rook', 'enemy', 0, 0],
      ['queen', 'player', 0, 3],
      ['pawn', 'player', 3, 0],
    ]);
    const move = aiChooseMove(g, 'enemy');
    expect(move?.to).toEqual({ col: 0, row: 3 }); // 퀸 잡기
  });

  it('잡기 없으면 코어 쪽(아래)으로 전진', () => {
    // 적 룩(2,1), 빈 보드. 가장 아래 칸으로.
    const g = game(5, 6, [['rook', 'enemy', 2, 1]]);
    const move = aiChooseMove(g, 'enemy');
    expect(move?.to.col).toBe(2);
    expect(move?.to.row).toBe(5); // 맨 아래까지 전진
  });

  it('aiTakeTurn: 1수 두고 턴 전환', () => {
    const g = game(5, 6, [['rook', 'enemy', 2, 1]]);
    const r = aiTakeTurn(g);
    expect(r.state.turn).toBe('player');
    expect(r.state.pieces.find((p) => p.kind === 'rook')!.at).toEqual({ col: 2, row: 5 });
  });

  it('aiTakeTurn: royal 잡으면 게임오버(AI 승)', () => {
    const g = game(5, 5, [
      ['rook', 'enemy', 2, 2],
      ['general', 'player', 2, 4],
    ]);
    const r = aiTakeTurn(g);
    expect(r.state.status).toBe('over');
    expect(r.state.overReason).toBe('royal');
  });

  it('aiTakeTurn: 둘 수 없으면 패스(턴만 넘김)', () => {
    // 궁성 없는 보드의 장(general)은 합법수 0 → 패스.
    const g = game(5, 5, [['general', 'enemy', 0, 0]]);
    const r = aiTakeTurn(g);
    expect(r.state.turn).toBe('player');
    expect(r.state.pieces).toHaveLength(1); // 이동 없음
  });

  it('avoidDanger: 되잡히는 손해 잡기를 피함(난이도↑)', () => {
    // 적 룩(2,2)이 폰(2,3)을 잡으면, 내 룩(2,5)에게 되잡힘 → 룩-폰 손해 트레이드.
    const g = game(5, 6, [
      ['rook', 'enemy', 2, 2],
      ['pawn', 'player', 2, 3],
      ['rook', 'player', 2, 5],
    ]);
    const greedy: AiConfig = { lookaheadDescents: 0, avoidDanger: false, noise: 0 };
    const cautious: AiConfig = { lookaheadDescents: 0, avoidDanger: true, noise: 0 };
    expect(aiChooseMove(g, 'enemy', greedy)?.to).toEqual({ col: 2, row: 3 }); // 욕심: 잡음
    expect(aiChooseMove(g, 'enemy', cautious)?.to).not.toEqual({ col: 2, row: 3 }); // 신중: 회피
  });

  it('lookahead: 하강해 내 말을 깔아뭉갤 자리에 배치(난이도↑)', () => {
    // 적 나이트(0,0)는 퀸(2,3)을 직접 못 잡음. 예측 켜면 (2,1)에 놓아 2칸 하강 후 깔아뭉갬.
    const g = game(5, 6, [
      ['knight', 'enemy', 0, 0],
      ['queen', 'player', 2, 3],
    ]);
    const predict: AiConfig = { lookaheadDescents: 2, avoidDanger: false, noise: 0 };
    const blind: AiConfig = { lookaheadDescents: 0, avoidDanger: false, noise: 0 };
    expect(aiChooseMove(g, 'enemy', predict)?.to).toEqual({ col: 2, row: 1 }); // 퀸 위로
    expect(aiChooseMove(g, 'enemy', blind)?.to).toEqual({ col: 1, row: 2 }); // 그냥 더 깊이 전진
  });

  it('결정론: 같은 상태 → 같은 수', () => {
    const mk = () =>
      game(5, 5, [
        ['rook', 'enemy', 0, 0],
        ['queen', 'player', 0, 3],
        ['pawn', 'player', 3, 0],
      ]);
    expect(aiChooseMove(mk(), 'enemy')).toEqual(aiChooseMove(mk(), 'enemy'));
  });

  it('huntRoyal: 작은 잡기보다 상대 왕 위협(장군)을 우선', () => {
    // 적 차(5,5). 내려가며 폰(5,6) 잡기 vs (0,5)로 가서 장(0,0) 장군.
    const g = () =>
      game(9, 10, [
        ['chariot', 'enemy', 5, 5],
        ['pawn', 'player', 5, 6],
        ['general', 'player', 0, 0],
      ]);
    const base: AiConfig = { lookaheadDescents: 0, avoidDanger: false, noise: 0 };
    expect(aiChooseMove(g(), 'enemy', base)?.to).toEqual({ col: 5, row: 6 }); // 기본: 폰 잡기
    expect(aiChooseMove(g(), 'enemy', { ...base, huntRoyal: true })?.to).toEqual({ col: 0, row: 5 }); // 사냥: 장군
  });
});
