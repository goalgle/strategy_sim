// 코어 데이터 모델 (구현 1단계: 보드·말·합법수·잡기에 필요한 최소 집합)
// 자세한 설계 근거: doc/architecture.md "코어 데이터 모델"

/** 9열 × N행 통합 그리드 좌표. row 0 = 최상단(적), row 증가 = 아래로(플레이어 쪽). */
export interface Coord {
  col: number;
  row: number;
}

/** player = 하단 디펜스, enemy = 상단 공격(하강) */
export type Side = 'player' | 'enemy';

/** 규칙 계열 + 점수 분류 */
export type Family = 'chess' | 'janggi';

export type PieceKind =
  // 체스
  | 'king'
  | 'queen'
  | 'rook'
  | 'bishop'
  | 'knight'
  | 'pawn'
  // 장기
  | 'general'
  | 'chariot'
  | 'cannon'
  | 'horse'
  | 'elephant'
  | 'guard'
  | 'soldier';

export interface Piece {
  /** 안정 식별자(애니메이션·리플레이 추적용) */
  id: string;
  kind: PieceKind;
  family: Family;
  side: Side;
  at: Coord;
  /** king/general → 잡히면 즉사(패배 ②) */
  isRoyal: boolean;
}

/**
 * 궁성(palace) — 보드 메타데이터.
 * cells: 3×3 = 9개 점. diagonalLines: X자 대각선 라인(각 라인은 동일 직선 위 점들의 정렬 리스트).
 * 대각 이동은 이 라인 위에서만 허용된다.
 */
export interface PalaceDef {
  side: Side;
  cells: Coord[];
  diagonalLines: Coord[][];
}

export interface Board {
  cols: number;
  rows: number;
  palaces: PalaceDef[];
}

/** 씨드 RNG 상태(결정론 위생). rng.ts가 이 타입으로 동작. */
export interface RngState {
  seed: number;
  counter: number;
}

/** 모래시계 — 실시간 압박. 충전→이벤트(하강)→리셋 사이클. 리듬과 무관. */
export interface Hourglass {
  /** 가득 차는 데 필요한 양(ms 기준) */
  capacity: number;
  /** 0..capacity */
  progress: number;
  /** 몇 번째 뒤집힘 — 사이클 카운터(난이도·스폰 구동) */
  cycle: number;
  /** 정지 기능(액션 #2) 발동 시 true */
  paused: boolean;
}

export type GameStatus = 'playing' | 'over';
export type OverReason = 'hp' | 'royal';

/** 입력 박자 판정(플레이어 전용). AI는 항상 just로 취급, 판정 계산 안 함. */
export type RhythmJudge = 'just' | 'near' | 'miss';

/** 리듬 설정. bpm은 음악, 판정 윈도우는 난이도. */
export interface RhythmConfig {
  bpm: number;
  justWindowMs: number;
  nearWindowMs: number;
}

/** 진행 중인 한 번의 이동(선택 → 가상이동 → 확정/취소). 확정 전까지 보드 불변. */
export interface Selection {
  pieceId: string;
  /** 합법 도착 후보지 */
  legal: Coord[];
  /** 가상 이동 위치(미확정). 없으면 '선택만 된' 상태. */
  preview?: Coord;
}

/** 코어로 들어가는 단일 입력 통로(플레이어·AI 공용). */
export type Intent =
  | { t: 'select'; pieceId: string }
  | { t: 'preview'; to: Coord } // 가상 이동
  | { t: 'confirm' } // 확정
  | { t: 'cancel' } // 우클릭 취소
  | { t: 'special'; action: number; payload?: unknown }; // 특수기능(#2~#5, 이후 단계)

/** 게임 상태. 3단계에서 turn·selection 추가(이후 rhythm·score 등 확장). */
export interface GameState {
  board: Board;
  pieces: Piece[];
  hp: number;
  maxHp: number;
  hourglass: Hourglass;
  rng: RngState;
  status: GameStatus;
  overReason?: OverReason;
  /** 적이 맨 아래 도달 1회당 HP 감소량(난이도) */
  damagePerReach: number;
  /** 현재 수를 둘 차례 */
  turn: Side;
  /** 진행 중인 이동(없으면 대기) */
  selection?: Selection;
  /** 누적 사용된 sim 시간 ms — 리듬 시계(모래시계와 별개). */
  timeMs: number;
  /** 플레이어 점수(처치 + 리듬). */
  score: number;
  /** 리듬 설정. */
  rhythm: RhythmConfig;
}

/** 말 종류별 합법 도착 좌표 생성 함수 */
export type MoveGen = (piece: Piece, state: GameState) => Coord[];
