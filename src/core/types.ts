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

/** 구현 1단계의 최소 게임 상태(이후 단계에서 hp·hourglass·rhythm 등이 추가됨) */
export interface GameState {
  board: Board;
  pieces: Piece[];
}

/** 말 종류별 합법 도착 좌표 생성 함수 */
export type MoveGen = (piece: Piece, state: GameState) => Coord[];
