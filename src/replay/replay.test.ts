import { describe, expect, it } from 'vitest';
import { legalMoves } from '../core/pieces/registry';
import { createStandardGame } from '../core/setup';
import { tick } from '../core/tick';
import type { GameState, Intent } from '../core/types';
import { Recorder, runReplay, splitForPlayback } from './replay';

const INIT = { gap: 3, capacityMs: 400, seed: 7, maxHp: 8 };

/** 초기 상태에서 스크립트대로 두며 기록 → (최종상태, recorder). */
function playScripted(): { final: GameState; rec: Recorder } {
  let s = createStandardGame(INIT);
  const rec = new Recorder();
  const feed = (dt: number, intents: Intent[] = []) => {
    s = tick(s, { dt, intents }).state;
    rec.record(dt, intents);
  };

  // 1) 시간 흐름(하강·스폰 발생)
  feed(400); // 1 사이클
  feed(400); // 2 사이클

  // 2) 플레이어 실제 한 수(현재 보드에서 합법 이동 하나 골라)
  const mover = s.pieces.find(
    (p) => p.side === 'player' && legalMoves(p, s).length > 0,
  )!;
  const to = legalMoves(mover, s)[0]!;
  feed(33, [{ t: 'select', pieceId: mover.id }]);
  feed(33, [{ t: 'preview', to }]);
  feed(33, [{ t: 'confirm' }]);

  // 3) 적 차례 한 수(스크립트로 직접) + 추가 시간
  const enemy = s.pieces.find(
    (p) => p.side === 'enemy' && legalMoves(p, s).length > 0,
  )!;
  const eto = legalMoves(enemy, s)[0]!;
  feed(0, [
    { t: 'select', pieceId: enemy.id },
    { t: 'preview', to: eto },
    { t: 'confirm' },
  ]);
  feed(400);
  feed(400);

  return { final: s, rec };
}

describe('리플레이 충실도', () => {
  it('기록한 입력열을 재생하면 최종 상태가 정확히 일치', () => {
    const { final, rec } = playScripted();
    const replay = rec.build(INIT, { finalScore: final.score, createdAt: 'test' });
    const replayed = runReplay(replay);
    expect(replayed).toEqual(final);
  });

  it('점수·사이클·HP도 동일하게 재현', () => {
    const { final, rec } = playScripted();
    const replayed = runReplay(rec.build(INIT, { finalScore: final.score, createdAt: 'test' }));
    expect(replayed.score).toBe(final.score);
    expect(replayed.hourglass.cycle).toBe(final.hourglass.cycle);
    expect(replayed.hp).toBe(final.hp);
  });

  it('연속 빈 틱은 병합되어 엔트리 수가 줄어든다', () => {
    let s = createStandardGame(INIT);
    const rec = new Recorder();
    for (let i = 0; i < 10; i++) {
      s = tick(s, { dt: 50, intents: [] }).state;
      rec.record(50, []);
    }
    const replay = rec.build(INIT, { finalScore: 0, createdAt: 'test' });
    expect(replay.entries.length).toBe(1); // 10개 빈 틱 → 1개
    expect(replay.entries[0]!.dt).toBe(500);
  });

  it('splitForPlayback(쪼갠 재생): 진행 결과 동일(말·사이클·점수·HP)', () => {
    // 빈 틱을 STEP 조각으로 쪼개면 timeMs만 float epsilon 차이날 뿐, 게임 진행은 같다.
    const { final, rec } = playScripted();
    const replay = rec.build(INIT, { finalScore: 0, createdAt: 'test' });
    let s = createStandardGame(replay.init);
    for (const e of splitForPlayback(replay.entries)) s = tick(s, { dt: e.dt, intents: e.intents }).state;
    expect(s.pieces).toEqual(final.pieces);
    expect(s.hourglass.cycle).toBe(final.hourglass.cycle);
    expect(s.score).toBe(final.score);
    expect(s.hp).toBe(final.hp);
    expect(Math.abs(s.timeMs - final.timeMs)).toBeLessThan(1); // timeMs는 1ms 미만 차이
  });
});
