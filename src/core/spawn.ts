// 시드 기반 웨이브 스폰. 2단계는 최소 구현(최상단 빈 열에 적 1개) — 구성·난이도는 [미정].
// 설계 근거: doc/architecture.md "tick 파이프라인 → 스폰".
import type { GameEvent } from './events';
import { nextInt } from './rng';
import type { GameState, Piece } from './types';

export function spawnWave(state: GameState, cycle: number): { state: GameState; events: GameEvent[] } {
  const topRow = 0;
  const emptyCols: number[] = [];
  for (let col = 0; col < state.board.cols; col++) {
    if (!state.pieces.some((p) => p.at.col === col && p.at.row === topRow)) emptyCols.push(col);
  }
  if (emptyCols.length === 0) return { state, events: [] };

  const pick = nextInt(state.rng, emptyCols.length);
  const col = emptyCols[pick.value]!;
  const id = `e-spawn-${cycle}-${col}`;
  const piece: Piece = {
    id,
    kind: 'pawn',
    family: 'chess',
    side: 'enemy',
    at: { col, row: topRow },
    isRoyal: false,
  };

  return {
    state: { ...state, rng: pick.state, pieces: [...state.pieces, piece] },
    events: [{ t: 'spawned', pieceIds: [id], cycle }],
  };
}
