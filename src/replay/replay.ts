// 리플레이 — 순수·결정론 코어 위에서 (초기설정 + (dt, intents) 스트림)만 저장하면 한 판을 100% 재현.
// tick이 순수하므로 같은 입력열을 같은 초기상태에 먹이면 AI 수·스폰·하강·점수·판정까지 동일.
// 설계 근거: doc/architecture.md "데일리 시드 + 리플레이".
import { STEP_MS } from '../core/constants';
import { createStandardGame, type StandardOptions } from '../core/setup';
import { tick } from '../core/tick';
import type { GameState, Intent } from '../core/types';

export const REPLAY_VERSION = 1;

/** 한 번의 tick 호출에 먹인 입력(경과시간 + 그 틱의 인텐트). */
export interface ReplayEntry {
  dt: number;
  intents: Intent[];
}

export interface Replay {
  version: number;
  init: StandardOptions; // createStandardGame 인자(시드·유속·HP·리듬 등) — 전부 직렬화 가능
  entries: ReplayEntry[];
  finalScore: number;
  difficulty?: string;
  createdAt: string; // ISO (UI에서 주입)
}

/** 라이브 플레이 중 모든 tick 입력을 기록. 입력 없는(빈 인텐트) 틱은 dt를 합쳐 압축. */
export class Recorder {
  private entries: ReplayEntry[] = [];

  record(dt: number, intents: Intent[]): void {
    if (intents.length === 0) {
      const last = this.entries[this.entries.length - 1];
      if (last && last.intents.length === 0) {
        last.dt += dt; // 연속 빈 틱 병합(최종 상태 동일, 데이터 축소)
        return;
      }
    }
    this.entries.push({ dt, intents: intents.map((i) => ({ ...i })) });
  }

  build(init: StandardOptions, meta: { finalScore: number; difficulty?: string; createdAt: string }): Replay {
    return { version: REPLAY_VERSION, init, entries: this.entries, ...meta };
  }
}

/** 리플레이를 끝까지 재시뮬해 최종 상태 반환(검증·테스트용, 렌더 없음). */
export function runReplay(replay: Replay): GameState {
  let s = createStandardGame(replay.init);
  for (const e of replay.entries) s = tick(s, { dt: e.dt, intents: e.intents }).state;
  return s;
}

/**
 * 부드러운 재생용: 큰 빈(dt only) 엔트리를 STEP_MS 조각으로 쪼갠다.
 * 인텐트 사이 누적 dt가 보존되므로 최종 상태·판정은 병합본과 동일(하강만 한 칸씩 애니메이션됨).
 */
export function splitForPlayback(entries: ReplayEntry[]): ReplayEntry[] {
  const out: ReplayEntry[] = [];
  for (const e of entries) {
    if (e.intents.length === 0 && e.dt > STEP_MS) {
      let left = e.dt;
      while (left > 0) {
        const d = Math.min(STEP_MS, left);
        out.push({ dt: d, intents: [] });
        left -= d;
      }
    } else {
      out.push(e);
    }
  }
  return out;
}

// ── localStorage 저장(최근 N개) ─────────────────────────
const KEY = 'strategy_sim.replays';
const MAX = 5;

export function saveReplay(r: Replay): void {
  const list = [r, ...loadReplays()].slice(0, MAX);
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* 용량 초과 등 무시 */
  }
}

export function loadReplays(): Replay[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Replay[]) : [];
  } catch {
    return [];
  }
}
