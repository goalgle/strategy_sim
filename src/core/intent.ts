// 인텐트(이동 3단계) 처리. 플레이어·AI 공용 단일 통로.
// 설계 근거: doc/architecture.md "tick 파이프라인 → 이동 해소".
// 점수·리듬은 이후 단계. 능동 잡기 = 이동측 승, royal 잡으면 즉시 게임오버.
import { eq } from './board';
import type { GameEvent } from './events';
import { legalMoves } from './pieces/registry';
import { judgeAt, RHYTHM_SCORE } from './rhythm';
import { applyMove } from './rules';
import { captureScore } from './scoring';
import type { GameState, GameStatus, Intent, OverReason, Side } from './types';

const other = (s: Side): Side => (s === 'player' ? 'enemy' : 'player');

/** 한 개의 인텐트를 적용(순수). 차례(turn)·선택 상태를 검사한다. */
export function applyIntent(state: GameState, intent: Intent): { state: GameState; events: GameEvent[] } {
  if (state.status === 'over') return { state, events: [] };

  switch (intent.t) {
    case 'select': {
      const piece = state.pieces.find((p) => p.id === intent.pieceId);
      if (piece === undefined || piece.side !== state.turn) return { state, events: [] };
      const legal = legalMoves(piece, state);
      return {
        state: { ...state, selection: { pieceId: piece.id, legal } },
        events: [{ t: 'selected', pieceId: piece.id, legal }],
      };
    }

    case 'preview': {
      const sel = state.selection;
      if (sel === undefined) return { state, events: [] };
      if (!sel.legal.some((c) => eq(c, intent.to))) return { state, events: [] }; // 불법
      return {
        state: { ...state, selection: { ...sel, preview: intent.to } },
        events: [{ t: 'previewed', pieceId: sel.pieceId, to: intent.to }],
      };
    }

    case 'confirm': {
      const sel = state.selection;
      if (sel === undefined || sel.preview === undefined) return { state, events: [] };
      const mover = state.pieces.find((p) => p.id === sel.pieceId);
      if (mover === undefined) return { state, events: [] };

      const from = { ...mover.at };
      const to = sel.preview;
      const isPlayer = mover.side === 'player';
      const res = applyMove(state, sel.pieceId, to);
      const events: GameEvent[] = [{ t: 'moved', pieceId: sel.pieceId, from, to }];

      let status: GameStatus = state.status;
      let overReason: OverReason | undefined = state.overReason;
      let score = state.score;

      // 점수·리듬은 플레이어 전용. AI는 항상 just 취급·무점수(판정 계산 안 함).
      if (isPlayer) {
        const j = judgeAt(state.timeMs, state.rhythm);
        events.push({ t: 'rhythm', judge: j });
        const rScore = RHYTHM_SCORE[j];
        if (rScore > 0) {
          score += rScore;
          events.push({ t: 'scored', total: score, delta: rScore, reason: 'rhythm' });
        }
      }

      if (res.captured !== undefined) {
        events.push({
          t: 'captured',
          by: sel.pieceId,
          targetId: res.captured.id,
          targetKind: res.captured.kind,
          at: to,
          mode: 'active',
        });
        if (isPlayer) {
          const cScore = captureScore(res.captured.kind);
          score += cScore;
          events.push({ t: 'scored', total: score, delta: cScore, reason: 'capture' });
        }
        if (res.captured.isRoyal) {
          status = 'over';
          overReason = 'royal';
          events.push({ t: 'gameOver', reason: 'royal' });
        }
      }

      const nextTurn = status === 'over' ? state.turn : other(state.turn);
      if (status !== 'over') events.push({ t: 'turnChanged', turn: nextTurn });

      return {
        state: { ...res.state, selection: undefined, turn: nextTurn, status, overReason, score },
        events,
      };
    }

    case 'cancel': {
      const sel = state.selection;
      if (sel === undefined) return { state, events: [] };
      // preview가 있으면 가상이동만 되돌림(선택 유지), 없으면 선택 자체 해제.
      const selection = sel.preview !== undefined ? { ...sel, preview: undefined } : undefined;
      return {
        state: { ...state, selection },
        events: [{ t: 'canceled', pieceId: sel.pieceId }],
      };
    }

    case 'special':
      // 특수기능(#2 정지 · #3 HP · #4 자동 · #5 적 말 강제이동)은 이후 단계.
      return { state, events: [] };
  }
}
