// 콤보/미션/티켓 데모(헤드리스): 티켓을 들고 연속 잡기 + 미션 완료 흐름 확인.
// 실행: npm run demo:combo
import { applyIntent } from '../core/intent';
import { emptyGame, Placer } from '../core/setup';
import type { GameEvent } from '../core/events';
import type { GameState, Intent } from '../core/types';
import { renderBoard } from './render';

function narrate(events: GameEvent[]): void {
  for (const e of events) {
    if (e.t === 'moved') console.log(`  · 이동: ${e.pieceId} → (${e.to.col},${e.to.row})`);
    if (e.t === 'captured') console.log(`  · 잡기: ${e.targetKind} @(${e.at.col},${e.at.row})`);
    if (e.t === 'comboStart') console.log(`  · 🔥 콤보 시작! 추가 대상 ${e.targets.length}개`);
    if (e.t === 'comboContinue') console.log(`  · 🔥 콤보 이어가기 x${e.count} (티켓 ${e.tickets})`);
    if (e.t === 'comboEnd') console.log(`  · 콤보 종료 (총 ${e.count}회)`);
    if (e.t === 'missionDone') console.log(`  · ✅ 미션 완료! 티켓 ${e.tickets}`);
    if (e.t === 'scored') console.log(`  · +${e.delta} (${e.reason}) → 점수 ${e.total}`);
    if (e.t === 'turnChanged') console.log(`  · 턴 → ${e.turn}`);
  }
}

function apply(s: GameState, intents: Intent[], label: string): GameState {
  let st = s;
  const ev: GameEvent[] = [];
  for (const i of intents) {
    const r = applyIntent(st, i);
    st = r.state;
    ev.push(...r.events);
  }
  console.log(`\n▶ ${label}`);
  narrate(ev);
  console.log(`  [점수 ${st.score} · 티켓 ${st.tickets} · 콤보 ${st.combo ? 'x' + st.combo.count : '-'} · 턴 ${st.turn}]`);
  console.log(renderBoard(st, st.combo?.targets ?? st.selection?.legal ?? []));
  return st;
}

// 룩(0,4)으로 (0,1)→(3,1)→(3,3) 적 폰 3개를 연속으로 잡는 배치. 티켓 2장.
const placer = new Placer();
placer.place('rook', 'player', 0, 4);
placer.place('pawn', 'enemy', 0, 1);
placer.place('pawn', 'enemy', 3, 1);
placer.place('pawn', 'enemy', 3, 3);
let s: GameState = {
  ...emptyGame(5, 5, [], { maxHp: 5 }),
  pieces: placer.build(),
  turn: 'player',
  tickets: 2,
  mission: { kind: 'captureKind', target: 'pawn', done: false },
};

console.log('=== 콤보/미션 데모 (5×5, 티켓 2, 미션=적 폰 잡기) ===');
console.log('소문자=장기  대문자=체스(적)  *=합법수  x/* =콤보대상\n');
console.log(renderBoard(s, []));

s = apply(s, [{ t: 'select', pieceId: 'p-rook-0' }, { t: 'preview', to: { col: 0, row: 1 } }, { t: 'confirm' }], '룩으로 첫 폰 잡기 → 콤보 시작 + 미션 완료');
s = apply(s, [{ t: 'comboTo', to: { col: 3, row: 1 } }], '콤보 이어 잡기 (티켓 -1)');
s = apply(s, [{ t: 'comboTo', to: { col: 3, row: 3 } }], '콤보 3번째 (최대 도달 → 종료)');
