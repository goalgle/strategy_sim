// AI 휴리스틱. 가중 평가로 매 턴 1수 — 잡기·전진·하강예측·위험회피·잡음.
// 난이도 노브(AiConfig)로 강약 조절. 플레이어와 같은 Intent 통로로 둔다(공용 엔진).
// 설계 근거: doc/architecture.md "AI 휴리스틱".
import { pieceAt } from '../core/board';
import type { GameEvent } from '../core/events';
import { applyIntent } from '../core/intent';
import { legalMoves } from '../core/pieces/registry';
import { applyMove } from '../core/rules';
import { isAttackedBy } from '../core/threats';
import type { Coord, GameState, Intent, PieceKind, Side } from '../core/types';

/** 난이도 노브(difficulty.ts의 ai에서 옴). */
export interface AiConfig {
  /** 하강 예측 깊이: 적이 N칸 내려가 내 말을 깔아뭉갤 자리를 노림(0=예측 안 함). */
  lookaheadDescents: number;
  /** 되잡히는 자리(손해)를 피함. */
  avoidDanger: boolean;
  /** 수 선택 잡음 0~1(클수록 약함·랜덤). */
  noise: number;
  /** 상대 왕(장)을 적극 노린다 — 위협(장군)·접근 보너스. 장기 1:1 등에서 켬. */
  huntRoyal?: boolean;
}

export const DEFAULT_AI_CONFIG: AiConfig = {
  lookaheadDescents: 1,
  avoidDanger: true,
  noise: 0,
};

// 평가 가중치
const W_CAPTURE = 10; // 처치 = 말 가치 × 10 (물질)
const W_ADVANCE = 1; // 전진(코어 쪽 행)
const W_FUTURE = 3; // 하강해 깔아뭉갤 자리 보너스
const W_DANGER = 10; // 되잡힘(손해) 패널티 = 내 말 가치 × 10
const NOISE_AMP = 8; // 잡음 진폭
const W_HUNT_CHECK = 40; // 상대 왕 위협(장군) 보너스 — 왕 사냥 유도(huntRoyal)
const W_HUNT_PROX = 0.5; // 상대 왕에 가까워질수록 보너스(huntRoyal)

/** 말 가치(AI 내부 평가용). royal은 압도적(=게임을 끝냄). */
function pieceValue(kind: PieceKind): number {
  switch (kind) {
    case 'king':
    case 'general':
      return 100;
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

/** 결정론 잡음 0~1 — rng 소비 없이 (수,상황)으로 해시. */
function noise01(seed: number): number {
  let x = seed >>> 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x21f0aaad) >>> 0;
  x ^= x >>> 15;
  x = Math.imul(x, 0xd35a2d97) >>> 0;
  x ^= x >>> 15;
  return (x >>> 0) / 4294967296;
}

function evaluateMove(piece: GameState['pieces'][number], to: Coord, state: GameState, side: Side, cfg: AiConfig): number {
  const rows = state.board.rows;
  let score = 0;

  // 1) 잡기(물질)
  const target = pieceAt(to, state);
  if (target !== undefined) score += pieceValue(target.kind) * W_CAPTURE;

  // 2) 전진(코어 쪽). enemy=아래(row 큼), player=위(row 작음).
  const advance = side === 'enemy' ? to.row : rows - 1 - to.row;
  score += advance * W_ADVANCE;

  // 3) 하강 예측(enemy 전용·비잡기): 아래로 N칸 내려가면 깔아뭉갤 내 말이 있는 자리 선호.
  if (side === 'enemy' && cfg.lookaheadDescents > 0 && target === undefined) {
    for (let k = 1; k <= cfg.lookaheadDescents; k++) {
      const below = pieceAt({ col: to.col, row: to.row + k }, state);
      if (below !== undefined && below.side === 'player') {
        score += (W_FUTURE * pieceValue(below.kind)) / k; // 가깝고 비쌀수록 +
        break;
      }
    }
  }

  // 4·6) 위험 회피 + 왕 사냥 — 둘 다 이동 후 상태가 필요하므로 한 번만 계산.
  if (cfg.avoidDanger || cfg.huntRoyal) {
    const after = applyMove(state, piece.id, to).state;
    const opp: Side = side === 'player' ? 'enemy' : 'player';
    // 4) 되잡힘(손해) 회피.
    if (cfg.avoidDanger && isAttackedBy(to, opp, after)) score -= pieceValue(piece.kind) * W_DANGER;
    // 6) 왕 사냥: 상대 장(將)을 위협하면 보너스 + 장에 가까워질수록 보너스.
    if (cfg.huntRoyal) {
      const royal = after.pieces.find((p) => p.side === opp && p.isRoyal);
      if (royal !== undefined) {
        if (isAttackedBy(royal.at, side, after)) score += W_HUNT_CHECK;
        const dist = Math.abs(to.col - royal.at.col) + Math.abs(to.row - royal.at.row);
        score += (state.board.cols + state.board.rows - dist) * W_HUNT_PROX;
      }
    }
  }

  // 5) 잡음(난이도): 약할수록 무작위로 흔들림.
  if (cfg.noise > 0) {
    const seed =
      (state.hourglass.cycle * 2654435761 +
        to.col * 40503 +
        to.row * 12289 +
        piece.at.col * 97 +
        piece.at.row * 193) >>>
      0;
    score += (noise01(seed) - 0.5) * 2 * cfg.noise * NOISE_AMP;
  }

  return score;
}

export interface AiMove {
  pieceId: string;
  to: Coord;
}

/** 점수 상위 N개 후보(best 우선). 연출(탐색·취소)·자동스킬용. 결정론(안정 정렬). */
export function aiRankedMoves(
  state: GameState,
  side: Side,
  cfg: AiConfig = DEFAULT_AI_CONFIG,
  limit = 3,
): AiMove[] {
  const scored: { m: AiMove; s: number }[] = [];
  for (const p of state.pieces) {
    if (p.side !== side) continue;
    for (const to of legalMoves(p, state)) {
      scored.push({ m: { pieceId: p.id, to }, s: evaluateMove(p, to, state, side, cfg) });
    }
  }
  scored.sort((a, b) => b.s - a.s); // V8 안정 정렬 → 동점은 생성 순서 유지(=결정론)
  return scored.slice(0, limit).map((x) => x.m);
}

/** 현재 side의 최선 1수(결정론: 안정 순서에서 첫 최대). 둘 수 없으면 null. */
export function aiChooseMove(state: GameState, side: Side, cfg: AiConfig = DEFAULT_AI_CONFIG): AiMove | null {
  let best: AiMove | null = null;
  let bestScore = -Infinity;
  for (const p of state.pieces) {
    if (p.side !== side) continue;
    for (const to of legalMoves(p, state)) {
      const s = evaluateMove(p, to, state, side, cfg);
      if (s > bestScore) {
        bestScore = s;
        best = { pieceId: p.id, to };
      }
    }
  }
  return best;
}

/** 현재 차례(state.turn)를 AI가 처리: 1수 두거나, 둘 수 없으면 패스(턴만 넘김). */
export function aiTakeTurn(state: GameState, cfg: AiConfig = DEFAULT_AI_CONFIG): { state: GameState; events: GameEvent[] } {
  if (state.status !== 'playing') return { state, events: [] };
  const side = state.turn;
  const move = aiChooseMove(state, side, cfg);

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
