// 코어 단일 진입점(2단계 범위: 모래시계 전진 → 하강 → 스폰).
// 인텐트(이동)·게임오버(royal by 능동잡기)·리듬·점수는 이후 단계에서 합류.
// 설계 근거: doc/architecture.md "tick 파이프라인", "엔진 루프".
import { applyDescent } from './descent';
import type { GameEvent } from './events';
import { spawnWave } from './spawn';
import type { GameState } from './types';

export interface TickInput {
  /** 경과 ms (고정 STEP). 모래시계 progress 전진에 쓰임. */
  dt: number;
}

/**
 * 순수 함수: 같은 (state, input) → 같은 (state', events).
 * dt가 커서 한 프레임에 모래시계가 여러 번 넘칠 수 있음 → while로 하강 누적(결정론).
 */
export function tick(state: GameState, input: TickInput): { state: GameState; events: GameEvent[] } {
  if (state.status === 'over') return { state, events: [] };

  const events: GameEvent[] = [];
  let s = state;

  if (!s.hourglass.paused && s.hourglass.capacity > 0) {
    let { progress, cycle } = s.hourglass;
    progress += input.dt;

    while (progress >= s.hourglass.capacity) {
      progress -= s.hourglass.capacity;
      cycle += 1;
      s = { ...s, hourglass: { ...s.hourglass, progress, cycle } };
      events.push({ t: 'cycle', cycle });

      const d = applyDescent(s);
      s = d.state;
      events.push(...d.events);
      if (s.status === 'over') break;

      const sp = spawnWave(s, cycle);
      s = sp.state;
      events.push(...sp.events);
    }

    s = { ...s, hourglass: { ...s.hourglass, progress, cycle } };
  }

  return { state: s, events };
}
