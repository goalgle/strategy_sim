import { describe, expect, it } from 'vitest';
import { makeRng, nextInt, nextU32 } from './rng';

describe('seeded rng (결정론 위생)', () => {
  it('같은 시드 → 같은 수열', () => {
    const seqOf = (seed: number) => {
      let s = makeRng(seed);
      const out: number[] = [];
      for (let i = 0; i < 5; i++) {
        const r = nextU32(s);
        out.push(r.value);
        s = r.state;
      }
      return out;
    };
    expect(seqOf(42)).toEqual(seqOf(42));
  });

  it('다른 시드 → 다른 수열', () => {
    expect(nextU32(makeRng(1)).value).not.toBe(nextU32(makeRng(2)).value);
  });

  it('순수 함수 — 입력 상태를 변경하지 않음', () => {
    const s = makeRng(7);
    nextU32(s);
    expect(s).toEqual({ seed: 7, counter: 0 });
  });

  it('nextInt는 [0, n) 범위', () => {
    let s = makeRng(123);
    for (let i = 0; i < 50; i++) {
      const r = nextInt(s, 9);
      expect(r.value).toBeGreaterThanOrEqual(0);
      expect(r.value).toBeLessThan(9);
      s = r.state;
    }
  });
});
