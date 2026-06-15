// 하강 데모: 작은 보드에서 모래시계를 굴려 적이 내려오며
// 하강 충돌(위쪽 승) → 맨아래 도달(HP 감소) → 스폰이 일어나는 걸 사이클별로 출력.
// 실행: npm run demo:descent
import type { GameEvent } from '../core/events';
import { emptyGame, Placer } from '../core/setup';
import { tick } from '../core/tick';
import type { GameState } from '../core/types';
import { renderBoard } from './render';

function narrate(events: GameEvent[]): string[] {
  const lines: string[] = [];
  for (const e of events) {
    if (e.t === 'captured' && e.mode === 'descent')
      lines.push(`  · 하강 충돌: 적이 (${e.at.col},${e.at.row})의 ${e.targetKind} 제거 (위쪽 승)`);
    if (e.t === 'bottomReached') lines.push(`  · 맨아래 도달 → 코어 침범, HP -${e.damage}`);
    if (e.t === 'spawned') lines.push(`  · 스폰: ${e.pieceIds.join(', ')}`);
    if (e.t === 'gameOver') lines.push(`  · ★ 게임오버 (${e.reason})`);
  }
  return lines;
}

function status(s: GameState): string {
  return `cycle ${s.hourglass.cycle} | HP ${s.hp}/${s.maxHp} | ${s.status}`;
}

// ── 시나리오 구성 (7×7, HP 3) ──
const placer = new Placer();
placer.place('pawn', 'enemy', 3, 1); // 내려와 충돌·도달할 적
placer.place('soldier', 'player', 3, 4); // 중간 — 하강 충돌로 잡힐 내 말
placer.place('soldier', 'player', 3, 6); // 맨아래 — 도달해도 코어 침범(잡기 아님)
placer.place('cannon', 'player', 1, 6);
placer.place('elephant', 'player', 5, 6);

let s: GameState = {
  ...emptyGame(7, 7, [], { maxHp: 3, capacityMs: 1000 }),
  pieces: placer.build(),
};

console.log('=== 하강 데모 (7×7, HP 3) ===');
console.log('소문자=장기(플레이어)  대문자=체스(적)  ·=빈칸\n');
console.log(status(s));
console.log(renderBoard(s));

for (let i = 1; i <= 7 && s.status === 'playing'; i++) {
  const r = tick(s, { dt: s.hourglass.capacity }); // 한 사이클
  s = r.state;
  console.log(`\n${status(s)}`);
  for (const line of narrate(r.events)) console.log(line);
  console.log(renderBoard(s));
}
