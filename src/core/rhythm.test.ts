import { describe, expect, it } from 'vitest';
import { beatPeriodMs, judgeAt, RHYTHM_SCORE } from './rhythm';
import { captureScore } from './scoring';
import type { RhythmConfig } from './types';

const R: RhythmConfig = { bpm: 120, justWindowMs: 80, nearWindowMs: 180 }; // period 500ms

describe('리듬 판정 (judgeAt)', () => {
  it('박자 주기 = 60000/bpm', () => {
    expect(beatPeriodMs(120)).toBe(500);
  });

  it('정각·허용오차 안이면 just', () => {
    expect(judgeAt(0, R)).toBe('just');
    expect(judgeAt(50, R)).toBe('just');
    expect(judgeAt(500, R)).toBe('just'); // 다음 박자 정각
    expect(judgeAt(450, R)).toBe('just'); // 다음 박자에 근접(거리 50)
  });

  it('근접 윈도우면 near', () => {
    expect(judgeAt(100, R)).toBe('near'); // 거리 100 (80<x≤180)
    expect(judgeAt(180, R)).toBe('near');
  });

  it('멀면 miss', () => {
    expect(judgeAt(200, R)).toBe('miss');
    expect(judgeAt(250, R)).toBe('miss'); // 박자 사이 정중앙
  });

  it('점수: just=3 near=2 miss=0', () => {
    expect(RHYTHM_SCORE).toEqual({ just: 3, near: 2, miss: 0 });
  });
});

describe('처치 점수 (captureScore)', () => {
  it('폰 1 · 퀸 5 · 킹/장 6 · 그 외 3', () => {
    expect(captureScore('pawn')).toBe(1);
    expect(captureScore('queen')).toBe(5);
    expect(captureScore('king')).toBe(6);
    expect(captureScore('general')).toBe(6);
    expect(captureScore('rook')).toBe(3);
    expect(captureScore('soldier')).toBe(3);
  });
});
