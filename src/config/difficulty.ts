// 난이도 튜닝 한곳 관리.
// 여기 값들은 추후 StageScript.rules(doc/architecture.md "스크립트 포맷")로 흡수될 예정 —
// 데일리/UGC가 곧 이 설정을 데이터로 싣는다. 지금은 코드 상수 프리셋.
//
// [wired]   = 현재 실제로 게임에 반영됨
// [pending] = 해당 빌드에서 소비 예정(자리만 선언)

export type DifficultyLevel = 'easy' | 'normal' | 'hard';

export interface DifficultyConfig {
  level: DifficultyLevel;

  // ── 실시간 압박 ──
  /** [wired] 모래시계 1회 충전 ms. 클수록 천천히 내려옴(=쉬움). */
  hourglassCapacityMs: number;

  // ── 디펜스 ──
  /** [wired] 최대 HP. */
  maxHp: number;
  /** [wired] 적이 맨 아래 도달 1회당 HP 감소량. */
  damagePerReach: number;

  // ── 리듬 판정(플레이어 전용) ──
  /** [wired] Just/근접 허용 오차 ms. 좁을수록 어려움. */
  rhythm: { justWindowMs: number; nearWindowMs: number };

  // ── AI ──
  ai: {
    /** [wired] 적 수 연출 지연 ms(생각하는 시간). */
    thinkMs: number;
    /** [pending: 빌드5] 하강 예측 깊이(0=예측 안 함). */
    lookaheadDescents: number;
    /** [pending: 빌드5] 위험한 자리 회피 여부. */
    avoidDanger: boolean;
    /** [pending: 빌드5] 수 선택 잡음(클수록 약함). 0~1. */
    noise: number;
  };
}

export const DIFFICULTIES: Record<DifficultyLevel, DifficultyConfig> = {
  easy: {
    level: 'easy',
    hourglassCapacityMs: 12000,
    maxHp: 15,
    damagePerReach: 1,
    rhythm: { justWindowMs: 130, nearWindowMs: 280 },
    ai: { thinkMs: 650, lookaheadDescents: 0, avoidDanger: false, noise: 0.4 },
  },
  normal: {
    level: 'normal',
    hourglassCapacityMs: 8000,
    maxHp: 10,
    damagePerReach: 1,
    rhythm: { justWindowMs: 80, nearWindowMs: 180 },
    ai: { thinkMs: 450, lookaheadDescents: 1, avoidDanger: true, noise: 0.15 },
  },
  hard: {
    level: 'hard',
    hourglassCapacityMs: 5000,
    maxHp: 7,
    damagePerReach: 2,
    rhythm: { justWindowMs: 50, nearWindowMs: 120 },
    ai: { thinkMs: 300, lookaheadDescents: 2, avoidDanger: true, noise: 0 },
  },
};

/** 현재 활성 난이도(브라우저 데모). 추후 데일리/스테이지가 지정. */
export const ACTIVE_DIFFICULTY: DifficultyLevel = 'normal';
