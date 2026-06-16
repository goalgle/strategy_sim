// 코어 단일 진입점(2단계 범위: 모래시계 전진 → 하강 → 스폰).
// 인텐트(이동)·게임오버(royal by 능동잡기)·리듬·점수는 이후 단계에서 합류.
// 설계 근거: doc/architecture.md "tick 파이프라인", "엔진 루프".
import { applyDescent } from './descent';
import type { GameEvent } from './events';
import { applyIntent } from './intent';
import { reconcileSelection } from './selection';
import { spawnWave } from './spawn';
import type { GameState, Intent } from './types';

export interface TickInput {
  /** 경과 ms (고정 STEP). 모래시계 progress 전진에 쓰임. */
  dt: number;
  /** 이 프레임의 입력(플레이어/AI). 없으면 빈 배열. */
  intents?: Intent[];
}

/**
 * 순수 함수: 같은 (state, input) → 같은 (state', events).
 * 파이프라인 순서(doc/architecture.md): 모래시계→하강→스폰→selection 재조정→인텐트.
 * dt가 커서 한 프레임에 모래시계가 여러 번 넘칠 수 있음 → while로 하강 누적(결정론).
 */
export function tick(state: GameState, input: TickInput): { state: GameState; events: GameEvent[] } {
  if (state.status === 'over') return { state, events: [] };

  const events: GameEvent[] = [];
  // 리듬 시계 전진(모래시계 정지와 무관하게 흐름).
  let s: GameState = { ...state, timeMs: state.timeMs + input.dt };

  // 2~4. 모래시계 전진 → 하강 → 스폰
  let descended = false;
  if (!s.hourglass.paused && s.hourglass.capacity > 0) {
    let { progress, cycle } = s.hourglass;
    progress += input.dt;

    while (progress >= s.hourglass.capacity) {
      progress -= s.hourglass.capacity;
      cycle += 1;
      descended = true;
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

  // 5. selection 재조정 — 하강으로 보드가 바뀐 경우만
  if (descended && s.selection !== undefined && s.status !== 'over') {
    const r = reconcileSelection(s);
    s = r.state;
    events.push(...r.events);
  }

  // 6. 인텐트(이동) 처리 — 순서대로
  for (const intent of input.intents ?? []) {
    if (s.status === 'over') break;
    const r = applyIntent(s, intent);
    s = r.state;
    events.push(...r.events);
  }

  return { state: s, events };
}
