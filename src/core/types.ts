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

/**
 * 보상카드 버프 — 말 강화. 개별 부여·개별 테스트.
 * 이동 생성 확장: guardStride·horseLeap·cannonCreep·palaceWard.
 * 이동 해소 변경: elephantTrample·chariotPierce.
 */
export type BuffKind =
  | 'guardStride' // #1 사: 궁성 안 2칸 직선 이동
  | 'horseLeap' // #2 마: 멱 무시(나이트 점프)
  | 'elephantTrample' // #3 상: 경로상 적 전부 밀어 잡기
  | 'cannonCreep' // #4 포: 인접 1칸 평이동(잡기 불가)
  | 'chariotPierce' // #5 차: 가로막은 아군1 희생해 적 관통 잡기
  | 'palaceWard'; // #6 궁성: 적 말 진입 차단

export interface Piece {
  /** 안정 식별자(애니메이션·리플레이 추적용) */
  id: string;
  kind: PieceKind;
  family: Family;
  side: Side;
  at: Coord;
  /** king/general → 잡히면 즉사(패배 ②) */
  isRoyal: boolean;
  /** 보상카드 버프(없으면 기본 규칙). */
  buffs?: BuffKind[];
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
  /** 수동 정지(Space) 시 true */
  paused: boolean;
  /** 특수기능 #2 정지 남은 시간 ms(>0이면 하강 멈춤, tick마다 감소) */
  freezeMs: number;
}

export type GameStatus = 'playing' | 'over';
export type OverReason = 'hp' | 'royal';

/** 입력 박자 판정(플레이어 전용). AI는 항상 perfect로 취급, 판정 계산 안 함. */
export type RhythmJudge = 'perfect' | 'good' | 'bad' | 'miss';

/** 리듬 설정. bpm은 음악, 판정 윈도우(ms)는 난이도. perfect < good < bad ≤ 이내, 그 밖은 miss. */
export interface RhythmConfig {
  bpm: number;
  perfectMs: number;
  goodMs: number;
  badMs: number;
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
  | { t: 'comboTo'; to: Coord } // 콤보: 같은 말로 추가 잡기(티켓 소모)
  | { t: 'comboEnd' } // 콤보 종료(턴 넘김)
  | { t: 'special'; action: number; payload?: unknown } // 특수기능(#2~#5, 이후 단계)
  | { t: 'pickReward'; index: number }; // 보상 카드 2장 중 선택

/** 미션 — 5턴마다 발생, 완료 시 티켓. 종류는 생각날 때마다 추가. */
export type MissionKind = 'moveKind' | 'captureKind';
export interface Mission {
  kind: MissionKind;
  /** 대상 말 종류(moveKind=움직일 내 말, captureKind=잡을 적 말) */
  target: PieceKind;
  done: boolean;
}

/** 콤보(연속 잡기) 진행 상태. 잡기 후 추가 잡기 대상이 있으면 활성. */
export interface Combo {
  pieceId: string; // 연속 잡기를 잇는 말
  targets: Coord[]; // 추가로 잡을 수 있는 칸(적이 있는 합법수)
  count: number; // 지금까지 잡은 횟수(첫 잡기 포함)
}

/** 시작 시점 플레이어 말의 원위치 명부(리젠 대상·원위치 추적). 게임 중 불변. */
export interface RosterEntry {
  id: string;
  kind: PieceKind;
  col: number;
  row: number;
}

/** 보상 카드 한 장 — 버프(말 종류 강화) 또는 리젠(잃은 특정 말 부활). */
export type RewardCard =
  | { type: 'buff'; buff: BuffKind }
  | { type: 'regen'; pieceId: string; label: string }; // label 예: '좌측 마'

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
  /** 플레이어 왕이 적 사정권(체크)인가 → true면 모래시계 강제 정지. */
  checked: boolean;
  /** 누적 턴 수(플레이어 1수 = 1턴). 5턴마다 미션. */
  turnCount: number;
  /** 보유 티켓(누적). 콤보 잡기에 소모. */
  tickets: number;
  /** 현재 미션(없으면 undefined). */
  mission?: Mission;
  /** 진행 중인 콤보(연속 잡기). 없으면 일반 상태. */
  combo?: Combo;
  /**
   * 모드. 'defense'=본 게임(적 왕 잡아도 안 끝남·보상·미션·하강).
   * 'janggi'=장기 튜토리얼(1:1, 어느 쪽 장이든 잡히면 끝, 보상·미션 없음).
   */
  mode: 'defense' | 'janggi';
  /** 시작 시점 플레이어 말 명부(원위치) — 리젠 카드의 부활 위치. */
  roster: RosterEntry[];
  /** 지급한 보상 카드 수(누적) — 다음 임계 계산. */
  rewardCount: number;
  /** 제시 중인 보상 카드(있으면 선택 대기 → 하강 정지). 2장 중 1장 pickReward. */
  reward?: { options: RewardCard[] };
}

/** 말 종류별 합법 도착 좌표 생성 함수 */
export type MoveGen = (piece: Piece, state: GameState) => Coord[];
