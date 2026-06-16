// 처치 점수 — 잡은 적 말 종류별. (doc/concept.md "점수 규칙")
// 폰 1 · 퀸 5 · 킹/장(royal) 6 · 그 외 일반 3.
import type { PieceKind } from './types';

export function captureScore(kind: PieceKind): number {
  if (kind === 'pawn') return 1;
  if (kind === 'queen') return 5;
  if (kind === 'king' || kind === 'general') return 6;
  return 3;
}
