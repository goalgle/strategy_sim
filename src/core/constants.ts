// 게임 상수. 밸런싱 값은 [미정] — 이후 단계/스크립트에서 조정.
export const STEP_MS = 1000 / 30; // sim 고정 틱 레이트(30Hz)
export const DEFAULT_HOURGLASS_CAPACITY_MS = 3000; // 모래시계 1회 충전 시간
export const DAMAGE_PER_REACH = 1; // 적이 맨 아래 도달 1회당 HP 감소
export const DEFAULT_MAX_HP = 10;
export const DEFAULT_SEED = 1; // 개발용 기본 시드

// 리듬(빌드4) 기본값 — 가장 가까운 박자와의 거리(ms) 임계
export const DEFAULT_BPM = 120;
export const RHYTHM_PERFECT_MS = 55;
export const RHYTHM_GOOD_MS = 110;
export const RHYTHM_BAD_MS = 180;

// 특수기능
export const ABILITY_FREEZE = 2; // #2 모래시계 정지
export const ABILITY_AUTO3 = 4; // #4 자동 3수
export const ABILITY_FREEZE_MS = 5000; // 정지 지속
export const ABILITY_FREEZE_COST = 1; // 티켓
export const ABILITY_AUTO3_COST = 2; // 티켓
export const ABILITY_AUTO3_MOVES = 3;
