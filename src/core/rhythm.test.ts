import { describe, expect, it } from 'vitest';
import { beatPeriodMs, judgeAt, RHYTHM_SCORE } from './rhythm';
import { captureScore } from './scoring';
import type { RhythmConfig } from './types';

const R: RhythmConfig = { bpm: 120, perfectMs: 55, goodMs: 110, badMs: 180 }; // period 500ms

describe('리듬 판정 (judgeAt)', () => {
  it('박자 주기 = 60000/bpm', () => {
    expect(beatPeriodMs(120)).toBe(500);
  });

  it('정각·perfect 안이면 perfect', () => {
    expect(judgeAt(0, R)).toBe('perfect');
    expect(judgeAt(50, R)).toBe('perfect');
    expect(judgeAt(500, R)).toBe('perfect'); // 다음 박자 정각
    expect(judgeAt(450, R)).toBe('perfect'); // 다음 박자에 근접(거리 50)
  });

  it('good / bad / miss 단계', () => {
    expect(judgeAt(80, R)).toBe('good'); // 55<80≤110
    expect(judgeAt(150, R)).toBe('bad'); // 110<150≤180
    expect(judgeAt(220, R)).toBe('miss'); // >180
    expect(judgeAt(250, R)).toBe('miss'); // 박자 사이 정중앙
  });

  it('점수: perfect=3 good=2 bad=1 miss=0', () => {
    expect(RHYTHM_SCORE).toEqual({ perfect: 3, good: 2, bad: 1, miss: 0 });
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
