// 결정론 위생: 씨드 RNG. Math.random 대신 이것만 사용한다.
// 순수·정수 연산 — 같은 (seed, counter) → 같은 값. counter 진행으로 위치 주소화 가능.
// 설계 근거: doc/architecture.md "데일리 시드 + 리플레이 → 시드 RNG"

import type { RngState } from './types';

export type { RngState };

export function makeRng(seed: number): RngState {
  return { seed: seed >>> 0, counter: 0 };
}

/** 32비트 정수 해시(SplitMix 계열). 정수 연산만 사용해 플랫폼 간 재현 보장. */
function hash32(x: number): number {
  x = x >>> 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x21f0aaad) >>> 0;
  x ^= x >>> 15;
  x = Math.imul(x, 0xd35a2d97) >>> 0;
  x ^= x >>> 15;
  return x >>> 0;
}

/** 다음 32비트 부호없는 정수 + 진행된 상태 반환(순수). */
export function nextU32(s: RngState): { value: number; state: RngState } {
  const mixed = (s.seed ^ Math.imul(s.counter + 1, 0x9e3779b9)) >>> 0;
  return {
    value: hash32(mixed),
    state: { seed: s.seed, counter: s.counter + 1 },
  };
}

/** [0, n) 범위 정수. n은 양의 정수. */
export function nextInt(s: RngState, n: number): { value: number; state: RngState } {
  const { value, state } = nextU32(s);
  return { value: value % n, state };
}
