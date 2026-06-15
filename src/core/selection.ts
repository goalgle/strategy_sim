// 진행 중 selection 재조정 — 하강/스폰으로 보드가 바뀐 뒤 호출.
// 설계 근거: doc/architecture.md "하강 ↔ 진행 중 이동(selection) 재조정".
import { eq } from './board';
import type { GameEvent } from './events';
import { legalMoves } from './pieces/registry';
import type { GameState } from './types';

export function reconcileSelection(state: GameState): { state: GameState; events: GameEvent[] } {
  const sel = state.selection;
  if (sel === undefined) return { state, events: [] };

  // 1) 선택한 말이 아직 보드에 있는가
  const piece = state.pieces.find((p) => p.id === sel.pieceId);
  if (piece === undefined) {
    return {
      state: { ...state, selection: undefined },
      events: [{ t: 'reconciled', previewDropped: sel.preview !== undefined }],
    };
  }

  // 2) 새 보드·새 위치로 합법수 재계산
  const legal = legalMoves(piece, state);

  // 3) preview가 여전히 합법인가
  let preview = sel.preview;
  let previewDropped = false;
  if (preview !== undefined && !legal.some((c) => eq(c, preview!))) {
    preview = undefined;
    previewDropped = true;
  }

  return {
    state: { ...state, selection: { pieceId: sel.pieceId, legal, preview } },
    events: [{ t: 'reconciled', pieceId: sel.pieceId, previewDropped }],
  };
}
