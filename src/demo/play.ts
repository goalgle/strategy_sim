// 플레이 데모(헤드리스): 이동 3단계 인텐트 + 능동 잡기 + 턴 교대 + 실시간 하강 섞임.
// 적 수는 AI(5단계) 대신 스크립트로 직접 둔다. 실행: npm run demo:play
import type { GameEvent } from '../core/events';
import { emptyGame, Placer } from '../core/setup';
import { tick } from '../core/tick';
import type { Coord, GameState, Intent } from '../core/types';
import { renderBoard } from './render';

function narrate(events: GameEvent[]): void {
  for (const e of events) {
    if (e.t === 'selected') console.log(`  · 선택: ${e.pieceId} (합법수 ${e.legal.length})`);
    if (e.t === 'previewed') console.log(`  · 가상이동: → (${e.to.col},${e.to.row})`);
    if (e.t === 'moved') console.log(`  · 이동 확정: ${e.pieceId} (${e.from.col},${e.from.row})→(${e.to.col},${e.to.row})`);
    if (e.t === 'captured') console.log(`  · 잡기(${e.mode}): ${e.targetKind} 제거 @(${e.at.col},${e.at.row})`);
    if (e.t === 'turnChanged') console.log(`  · 턴 → ${e.turn}`);
    if (e.t === 'bottomReached') console.log(`  · 맨아래 도달 → HP -${e.damage}`);
    if (e.t === 'reconciled') console.log(`  · selection 재조정 (preview 폐기=${e.previewDropped})`);
    if (e.t === 'spawned') console.log(`  · 스폰: ${e.pieceIds.join(', ')}`);
    if (e.t === 'gameOver') console.log(`  · ★ 게임오버 (${e.reason})`);
  }
}

function status(s: GameState): string {
  return `cycle ${s.hourglass.cycle} | HP ${s.hp}/${s.maxHp} | turn ${s.turn} | ${s.status}`;
}

let s: GameState;
function step(label: string, dt: number, intents: Intent[], highlight: Coord[] = []): void {
  const r = tick(s, { dt, intents });
  s = r.state;
  console.log(`\n▶ ${label}`);
  console.log(`  ${status(s)}`);
  narrate(r.events);
  console.log(renderBoard(s, s.selection?.legal ?? highlight));
}

// ── 시나리오 (7×8, HP 5) ──
const placer = new Placer();
placer.place('chariot', 'player', 0, 7); // 내가 움직일 차
placer.place('soldier', 'player', 3, 6);
placer.place('rook', 'enemy', 0, 2); // 차로 잡을 대상(같은 열)
placer.place('pawn', 'enemy', 3, 3); // 내려올 적

s = { ...emptyGame(7, 8, [], { maxHp: 5, capacityMs: 1000 }), pieces: placer.build() };

console.log('=== 플레이 데모 (7×8, HP 5) ===');
console.log('소문자=장기(플레이어)  대문자=체스(적)  *=합법수  x=잡기 대상\n');
console.log(status(s));
console.log(renderBoard(s));

// 플레이어: 차 선택 → 적 룩까지 가상이동 → 확정(능동 잡기)
step('플레이어: 차 선택', 0, [{ t: 'select', pieceId: 'p-chariot-0' }]);
step('플레이어: (0,2) 적 룩으로 가상이동', 0, [{ t: 'preview', to: { col: 0, row: 2 } }]);
step('플레이어: 확정 → 능동 잡기', 0, [{ t: 'confirm' }]);

// 적 차례(스크립트로 직접): 폰 전진
step('적: 폰 선택 → 전진 → 확정', 0, [
  { t: 'select', pieceId: 'e-pawn-0' },
  { t: 'preview', to: { col: 3, row: 4 } },
  { t: 'confirm' },
]);

// 실시간: 모래시계 한 사이클 → 하강 + 스폰
step('모래시계 1사이클 (하강·스폰)', s.hourglass.capacity, []);
step('모래시계 또 1사이클', s.hourglass.capacity, []);
