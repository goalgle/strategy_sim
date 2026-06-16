// AI 데모(헤드리스): 양측을 AI가 두고 중간에 모래시계 하강을 섞어 한 판을 진행.
// AI가 실제로 잡기/전진 수를 두고, 하강 압박 속에 게임이 끝나는 걸 본다.
// 실행: npm run demo:ai
import { aiTakeTurn } from '../ai/heuristic';
import type { GameEvent } from '../core/events';
import { createStandardGame } from '../core/setup';
import { tick } from '../core/tick';
import type { GameState } from '../core/types';
import { renderBoard } from './render';

function narrate(events: GameEvent[]): void {
  for (const e of events) {
    if (e.t === 'moved') console.log(`  · 이동: ${e.pieceId} (${e.from.col},${e.from.row})→(${e.to.col},${e.to.row})`);
    if (e.t === 'captured') console.log(`  · 잡기(${e.mode}): ${e.targetKind} @(${e.at.col},${e.at.row})`);
    if (e.t === 'bottomReached') console.log(`  · 맨아래 도달 → HP -${e.damage}`);
    if (e.t === 'gameOver') console.log(`  · ★ 게임오버 (${e.reason})`);
  }
}

function status(s: GameState): string {
  return `round 진행 | cycle ${s.hourglass.cycle} | HP ${s.hp}/${s.maxHp} | turn ${s.turn} | ${s.status}`;
}

let s: GameState = createStandardGame({ gap: 3, maxHp: 5 });

console.log('=== AI 데모 (양측 AI, 9×9, HP 5) ===');
console.log('소문자=장기(플레이어 AI)  대문자=체스(적 AI)  ·=빈칸\n');
console.log(renderBoard(s));

const apply = (label: string, r: { state: GameState; events: GameEvent[] }) => {
  s = r.state;
  console.log(`\n▶ ${label}`);
  narrate(r.events);
};

for (let round = 1; round <= 30 && s.status === 'playing'; round++) {
  apply(`R${round} 플레이어 AI`, aiTakeTurn(s));
  if (s.status !== 'playing') break;
  apply(`R${round} 적 AI`, aiTakeTurn(s));
  if (s.status !== 'playing') break;
  if (round % 2 === 0) apply(`R${round} 모래시계(하강)`, tick(s, { dt: s.hourglass.capacity }));

  if (round % 3 === 0 || s.status !== 'playing') {
    console.log(`  ${status(s)}`);
    console.log(renderBoard(s));
  }
}

console.log(`\n=== 종료: ${status(s)} ===`);
console.log(renderBoard(s));
