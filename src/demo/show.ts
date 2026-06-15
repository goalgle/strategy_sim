// 실행 데모: 표준 진형 + 특정 말의 합법수 시연.  실행: node src/demo/show.ts
import { pieceAt } from '../core/board';
import { legalMoves } from '../core/pieces/registry';
import { applyMove } from '../core/rules';
import { createStandardGame } from '../core/setup';
import type { Coord, GameState } from '../core/types';
import { renderBoard } from './render';

function showMoves(state: GameState, at: Coord, label: string): void {
  const p = pieceAt(at, state);
  if (!p) {
    console.log(`\n(${at.col},${at.row})에 말이 없음`);
    return;
  }
  const moves = legalMoves(p, state);
  console.log(`\n■ ${label}: ${p.side} ${p.kind} @(${at.col},${at.row}) — 합법수 ${moves.length}개`);
  console.log(renderBoard(state, moves));
}

const g = createStandardGame();

console.log('=== 표준 진형 (하단 장기 / 상단 체스 2줄, 9×16) ===');
console.log('코드: 소문자=장기(플레이어)  대문자=체스(적)  ·=빈칸  *=이동 가능  x=잡기 대상\n');
console.log(renderBoard(g));

const back = g.board.rows - 1;

// 1) 졸(soldier): 전진/옆 가능
showMoves(g, { col: 0, row: back - 3 }, '졸');

// 2) 차(chariot): 긴 직교 레이(완충 지대를 따라)
showMoves(g, { col: 0, row: back }, '차');

// 3) 포(cannon): 초기엔 세로로 넘을 다리가 있어야 — 가로는 다리 없음
showMoves(g, { col: 1, row: back - 2 }, '포(초기 — 넘을 다리 확인)');

// 4) 마(horse): 멱 확인
showMoves(g, { col: 1, row: back }, '마');

// 5) 잡기 시연: 적 폰을 코앞까지 끌어와 능동 잡기
//    데모를 위해 적 폰 하나를 장기 진영 근처로 이동시킨 가상 상태 구성
const moved = applyMove(g, g.pieces.find((p) => p.kind === 'pawn')!.id, {
  col: 0,
  row: back - 4,
});
showMoves(moved.state, { col: 0, row: back - 3 }, '졸(앞에 적 폰 등장 → 전진 잡기 가능)');
