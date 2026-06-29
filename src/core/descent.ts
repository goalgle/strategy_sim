// 일제 하강 해소: 적 말 전체 row+1. "맨 아래 도달 우선" + "하강 충돌은 위쪽 승".
// 설계 근거: doc/architecture.md "tick 파이프라인 → 하강 해소".
import { wardedCellsAgainst } from './board';
import type { GameEvent } from './events';
import type { GameState, GameStatus, OverReason, Piece } from './types';

export function applyDescent(state: GameState): { state: GameState; events: GameEvent[] } {
  const events: GameEvent[] = [];
  const rows = state.board.rows;
  const damage = state.damagePerReach;

  // #6 궁성 결계: 결계 칸으로는 하강 진입도 불가(그대로 멈춤). 보통 빈 배열.
  const warded = wardedCellsAgainst('enemy', state);
  const isWarded = (col: number, row: number): boolean =>
    warded.some((w) => w.col === col && w.row === row);

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

    // 0) 궁성 결계: 진입 차단 칸이면 하강하지 않고 그대로(맨 아래 도달보다 우선).
    if (isWarded(col, newRow)) continue;

    // 1) 맨 아래 칸 도달 — 최우선(잡기보다 먼저). 적 제거 + HP 감소.
    if (newRow >= rows - 1) {
      pieces = pieces.filter((p) => p.id !== id);
      hp -= damage;
      events.push({ t: 'bottomReached', pieceId: id, damage });
      events.push({ t: 'hpChanged', hp, delta: -damage });
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

/**
 * #3 밀어내기 — 적 말 전체를 한 칸 위로(row-1). 하강의 반대.
 * 위쪽부터 처리(topmost 먼저 비켜 공간 확보). 천장(row 0)·점유 칸이면 그대로.
 */
export function pushEnemiesUp(state: GameState): { state: GameState; events: GameEvent[] } {
  const pieces: Piece[] = state.pieces.map((p) => ({ ...p, at: { ...p.at } }));
  const occupied = (col: number, row: number): boolean =>
    pieces.some((p) => p.at.col === col && p.at.row === row);

  const order = pieces
    .filter((p) => p.side === 'enemy')
    .sort((a, b) => a.at.row - b.at.row || a.at.col - b.at.col)
    .map((p) => p.id);

  let count = 0;
  for (const id of order) {
    const e = pieces.find((p) => p.id === id)!;
    const newRow = e.at.row - 1;
    if (newRow < 0 || occupied(e.at.col, newRow)) continue; // 천장·막힘 → 그대로
    e.at = { col: e.at.col, row: newRow };
    count += 1;
  }
  return { state: { ...state, pieces }, events: [{ t: 'pushed', count }] };
}
