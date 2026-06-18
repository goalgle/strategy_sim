// 초기 배치 — 표준 진형(하단 장기 / 상단 체스 2줄) + 빈 보드/배치 헬퍼(테스트·이후 단계용).
// 설계 근거: doc/concept.md "초기 배치 / 진형", doc/architecture.md "스크립트 → setup".
import { makePalace } from './board';
import {
  DAMAGE_PER_REACH,
  DEFAULT_BPM,
  DEFAULT_HOURGLASS_CAPACITY_MS,
  DEFAULT_MAX_HP,
  DEFAULT_SEED,
  RHYTHM_BAD_MS,
  RHYTHM_GOOD_MS,
  RHYTHM_PERFECT_MS,
} from './constants';
import { makeRng } from './rng';
import type { Board, Family, GameState, Piece, PieceKind, Side } from './types';

const CHESS_KINDS = new Set<PieceKind>([
  'king',
  'queen',
  'rook',
  'bishop',
  'knight',
  'pawn',
]);

function familyOf(kind: PieceKind): Family {
  return CHESS_KINDS.has(kind) ? 'chess' : 'janggi';
}

function isRoyalKind(kind: PieceKind): boolean {
  return kind === 'king' || kind === 'general';
}

/** 말 배치 빌더 — 안정 id를 자동 부여한다. */
export class Placer {
  private pieces: Piece[] = [];
  private counters = new Map<string, number>();

  place(kind: PieceKind, side: Side, col: number, row: number): this {
    const key = `${side}-${kind}`;
    const n = this.counters.get(key) ?? 0;
    this.counters.set(key, n + 1);
    this.pieces.push({
      id: `${side[0]}-${kind}-${n}`,
      kind,
      family: familyOf(kind),
      side,
      at: { col, row },
      isRoyal: isRoyalKind(kind),
    });
    return this;
  }

  build(): Piece[] {
    return this.pieces;
  }
}

export interface GameInit {
  /** 결정론 시드(기본 DEFAULT_SEED). */
  seed?: number;
  /** 최대 HP(기본 DEFAULT_MAX_HP). */
  maxHp?: number;
  /** 모래시계 1회 충전 시간 ms(기본 DEFAULT_HOURGLASS_CAPACITY_MS). */
  capacityMs?: number;
  /** 맨 아래 도달 1회당 HP 감소량(기본 DAMAGE_PER_REACH). */
  damagePerReach?: number;
  /** 리듬: BPM(기본 DEFAULT_BPM). */
  bpm?: number;
  /** 리듬 판정 임계 ms(기본 상수). */
  perfectMs?: number;
  goodMs?: number;
  badMs?: number;
}

/** 공통 시간·HP·RNG·상태 기본값으로 빈 GameState 골격을 만든다. */
function baseState(board: Board, init: GameInit): GameState {
  const maxHp = init.maxHp ?? DEFAULT_MAX_HP;
  return {
    board,
    pieces: [],
    hp: maxHp,
    maxHp,
    hourglass: {
      capacity: init.capacityMs ?? DEFAULT_HOURGLASS_CAPACITY_MS,
      progress: 0,
      cycle: 0,
      paused: false,
    },
    rng: makeRng(init.seed ?? DEFAULT_SEED),
    status: 'playing',
    damagePerReach: init.damagePerReach ?? DAMAGE_PER_REACH,
    turn: 'player', // 플레이어 선공
    timeMs: 0,
    score: 0,
    rhythm: {
      bpm: init.bpm ?? DEFAULT_BPM,
      perfectMs: init.perfectMs ?? RHYTHM_PERFECT_MS,
      goodMs: init.goodMs ?? RHYTHM_GOOD_MS,
      badMs: init.badMs ?? RHYTHM_BAD_MS,
    },
  };
}

/** 궁성 없는(또는 지정 궁성) 빈 게임 — 테스트·실험용. */
export function emptyGame(
  cols: number,
  rows: number,
  palaces: Board['palaces'] = [],
  init: GameInit = {},
): GameState {
  return baseState({ cols, rows, palaces }, init);
}

export interface StandardOptions extends GameInit {
  /** 두 진영 사이 완충 행 수(기본 10). */
  gap?: number;
  /** 보드 열 수(기본 9 = 장기판). */
  cols?: number;
}

/**
 * 표준 데일리 진형: 하단 장기 vs 상단 체스 2줄.
 * 전체 세로 = 체스 2줄 + 완충 gap + 장기 4줄.
 */
export function createStandardGame(opts: StandardOptions = {}): GameState {
  const cols = opts.cols ?? 9;
  const gap = opts.gap ?? 10;
  const janggiRows = 4;
  const chessRows = 2;
  const rows = chessRows + gap + janggiRows;

  // 적(체스)은 궁성 없음 — 플레이어 궁성만 보드 메타데이터에 포함.
  const board: Board = { cols, rows, palaces: [makePalace('player', cols, rows)] };
  const base = baseState(board, opts);

  const placer = new Placer();
  const back = rows - 1; // 장기 맨 뒷줄

  // ── 하단: 장기(player) ──
  const janggiBack: PieceKind[] = [
    'chariot',
    'horse',
    'elephant',
    'guard',
    'general', // 자리표시 — 실제로는 비우고 궁성 중앙에 배치(아래에서 덮어쓰지 않음)
    'guard',
    'elephant',
    'horse',
    'chariot',
  ];
  janggiBack.forEach((kind, col) => {
    if (kind === 'general') return; // 뒷줄 가운데는 비움
    placer.place(kind, 'player', col, back);
  });
  placer.place('general', 'player', 4, back - 1); // 궁성 중앙
  placer.place('cannon', 'player', 1, back - 2);
  placer.place('cannon', 'player', 7, back - 2);
  for (const col of [0, 2, 4, 6, 8]) placer.place('soldier', 'player', col, back - 3);

  // ── 상단: 체스(enemy) 2줄, 킹을 가운데 열(4)에 맞춤(col 8은 비움) ──
  const chessBack: PieceKind[] = [
    'rook',
    'knight',
    'bishop',
    'queen',
    'king',
    'bishop',
    'knight',
    'rook',
  ];
  chessBack.forEach((kind, col) => placer.place(kind, 'enemy', col, 0));
  for (let col = 0; col < 8; col++) placer.place('pawn', 'enemy', col, 1);

  return { ...base, pieces: placer.build() };
}
