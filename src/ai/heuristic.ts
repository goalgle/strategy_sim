// AI 휴리스틱 (MVP). 매 턴 1수: 잡을 수 있으면 잡고(가치 높은 쪽 우선), 아니면 코어 쪽으로 전진.
// 플레이어와 같은 Intent 통로(select→preview→confirm)로 둔다 — 공용 엔진.
// 하강 예측·danger 회피·후보 탐색/취소 연출·난이도 노브는 이후 확장.
// 설계 근거: doc/architecture.md "AI 휴리스틱".
import { pieceAt } from '../core/board';
import type { GameEvent } from '../core/events';
import { applyIntent } from '../core/intent';
import { legalMoves } from '../core/pieces/registry';
import type { Coord, GameState, Intent, PieceKind, Side } from '../core/types';

/** 잡기 선호용 말 가치(플레이어 점수와는 별개의 AI 내부 평가). royal은 압도적. */
function pieceValue(kind: PieceKind): number {
  switch (kind) {
    case 'king':
    case 'general':
      return 1000;
    case 'queen':
      return 9;
    case 'rook':
    case 'chariot':
      return 5;
    case 'bishop':
    case 'knight':
    case 'horse':
    case 'elephant':
    case 'cannon':
      return 3;
    case 'guard':
      return 2;
    case 'pawn':
    case 'soldier':
      return 1;
  }
}

function scoreMove(to: Coord, state: GameState, side: Side): number {
  const target = pieceAt(to, state);
  // 잡기는 어떤 포지셔닝보다 항상 우선(+가치 높은 대상 선호).
  if (target !== undefined) return 10_000 + pieceValue(target.kind);
  // 비-잡기: 상대 진영 쪽으로 전진할수록 +. enemy=아래(row 큼), player=위(row 작음).
  const rows = state.board.rows;
  return side === 'enemy' ? to.row : rows - 1 - to.row;
}

export interface AiMove {
  pieceId: string;
  to: Coord;
}

/** 현재 side의 최선 1수(결정론: 안정 순서에서 첫 최대). 둘 수 없으면 null. */
export function aiChooseMove(state: GameState, side: Side): AiMove | null {
  let best: AiMove | null = null;
  let bestScore = -Infinity;
  for (const p of state.pieces) {
    if (p.side !== side) continue;
    for (const to of legalMoves(p, state)) {
      const s = scoreMove(to, state, side);
      if (s > bestScore) {
        bestScore = s;
        best = { pieceId: p.id, to };
      }
    }
  }
  return best;
}

/** 현재 차례(state.turn)를 AI가 처리: 1수 두거나, 둘 수 없으면 패스(턴만 넘김). */
export function aiTakeTurn(state: GameState): { state: GameState; events: GameEvent[] } {
  if (state.status !== 'playing') return { state, events: [] };
  const side = state.turn;
  const move = aiChooseMove(state, side);

  if (move === null) {
    const next: Side = side === 'player' ? 'enemy' : 'player';
    return {
      state: { ...state, turn: next, selection: undefined },
      events: [{ t: 'turnChanged', turn: next }],
    };
  }

  const intents: Intent[] = [
    { t: 'select', pieceId: move.pieceId },
    { t: 'preview', to: move.to },
    { t: 'confirm' },
  ];
  const events: GameEvent[] = [];
  let s = state;
  for (const intent of intents) {
    const r = applyIntent(s, intent);
    s = r.state;
    events.push(...r.events);
  }
  return { state: s, events };
}
