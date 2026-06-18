// 리듬 판정 — sim 시계(state.timeMs) 기준이라 결정론(벽시계 아님).
// BPM 그리드의 가장 가까운 박자와의 거리로 Just/근접/빗나감 판정.
// 설계 근거: doc/architecture.md "리듬·결정론과 입력 귀속".
import type { RhythmConfig, RhythmJudge } from './types';

export const RHYTHM_SCORE: Record<RhythmJudge, number> = {
  perfect: 3,
  good: 2,
  bad: 1,
  miss: 0,
};

export function beatPeriodMs(bpm: number): number {
  return 60_000 / bpm;
}

/** timeMs가 가장 가까운 박자에서 얼마나 떨어졌는지로 판정. */
export function judgeAt(timeMs: number, r: RhythmConfig): RhythmJudge {
  const period = beatPeriodMs(r.bpm);
  const phase = ((timeMs % period) + period) % period;
  const delta = Math.min(phase, period - phase); // 가장 가까운 박자까지의 거리
  if (delta <= r.perfectMs) return 'perfect';
  if (delta <= r.goodMs) return 'good';
  if (delta <= r.badMs) return 'bad';
  return 'miss';
}

/** 0=박자 정각, 1=박자 사이 최대로 어긋남 — 시각 표시용(박자 펄스). */
export function beatPhase01(timeMs: number, bpm: number): number {
  const period = beatPeriodMs(bpm);
  const phase = ((timeMs % period) + period) % period;
  return Math.min(phase, period - phase) / (period / 2);
}
