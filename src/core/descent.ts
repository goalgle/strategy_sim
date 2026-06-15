// 일제 하강 해소: 적 말 전체 row+1. "맨 아래 도달 우선" + "하강 충돌은 위쪽 승".
// 설계 근거: doc/architecture.md "tick 파이프라인 → 하강 해소".
import { DAMAGE_PER_REACH } from './constants';
import type { GameEvent } from './events';
import type { GameState, GameStatus, OverReason, Piece } from './types';

export function applyDescent(state: GameState): { state: GameState; events: GameEvent[] } {
  const events: GameEvent[] = [];
  const rows = state.board.rows;

  // 작업 사본(위치 변경·제거를 안전하게)
  let pieces: Piece[] = state.pieces.map((p) => ({ ...p, at: { ...p.at } }));
  let hp = state.hp;
  let status: GameStatus = state.status;
  let overReason: OverReason | undefined = state.overReason;
  const movedIds: string[] = [];

  const occupantAt = (col: number, row: number): Piece | undefined =>
    pieces.find((p) => p.at.col === col && p.at.row === row);

  // 아래쪽 적부터 처리(겹침 모호성 제거), 동일 행은 열 순으로 — 결정론.
  const order = pieces
    .filter((p) => p.side === 'enemy')
    .sort((a, b) => b.at.row - a.at.row || a.at.col - b.at.col)
    .map((p) => p.id);

  for (const id of order) {
    if (status === 'over') break;
    const e = pieces.find((p) => p.id === id);
    if (e === undefined) continue; // 도중 제거됐을 수 있음

    const col = e.at.col;
    const newRow = e.at.row + 1;

    // 1) 맨 아래 칸 도달 — 최우선(잡기보다 먼저). 적 제거 + HP 감소.
    if (newRow >= rows - 1) {
      pieces = pieces.filter((p) => p.id !== id);
      hp -= DAMAGE_PER_REACH;
      events.push({ t: 'bottomReached', pieceId: id, damage: DAMAGE_PER_REACH });
      events.push({ t: 'hpChanged', hp, delta: -DAMAGE_PER_REACH });
      if (hp <= 0) {
        status = 'over';
        overReason = 'hp';
        events.push({ t: 'gameOver', reason: 'hp' });
      }
      continue;
    }

    const occ = occupantAt(col, newRow);
    if (occ === undefined) {
      // 2) 빈 칸 → 그냥 하강
      e.at = { col, row: newRow };
      movedIds.push(id);
    } else if (occ.side === 'player') {
      // 3) 하강 충돌 → 위쪽(적) 승: 내 말 제거, 적이 그 칸 차지
      const royal = occ.isRoyal;
      pieces = pieces.filter((p) => p.id !== occ.id);
      e.at = { col, row: newRow };
      movedIds.push(id);
      events.push({
        t: 'captured',
        by: id,
        targetId: occ.id,
        targetKind: occ.kind,
        at: { col, row: newRow },
        mode: 'descent',
      });
      if (royal) {
        status = 'over';
        overReason = 'royal';
        events.push({ t: 'gameOver', reason: 'royal' });
      }
    }
    // 적-적 충돌(occ.side === 'enemy')은 막힘 → 이동하지 않음(그대로)
  }

  events.push({ t: 'descended', movedIds });
  return {
    state: { ...state, pieces, hp, status, overReason },
    events,
  };
}
