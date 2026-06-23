// 미션 — 5턴마다 발생, 완료 시 티켓 1장. 종류는 생각날 때마다 추가(doc/concept.md).
// 결정론: 미션 생성은 시드 RNG로.
import { nextInt } from './rng';
import type { GameState, Mission, MissionKind, PieceKind, RngState } from './types';

export const MISSION_INTERVAL = 5; // 5턴마다
export const TICKET_PER_MISSION = 1;

// 미션 대상이 될 수 있는 말 종류(내 진영=장기, 적=체스 기준 풀).
const MOVE_POOL: PieceKind[] = ['chariot', 'cannon', 'horse', 'elephant', 'soldier'];
const CAPTURE_POOL: PieceKind[] = ['pawn', 'knight', 'bishop', 'rook'];

/** 시드 RNG로 새 미션 생성. */
export function rollMission(rng: RngState): { mission: Mission; rng: RngState } {
  const k = nextInt(rng, 2);
  const kind: MissionKind = k.value === 0 ? 'moveKind' : 'captureKind';
  const pool = kind === 'moveKind' ? MOVE_POOL : CAPTURE_POOL;
  const p = nextInt(k.state, pool.length);
  return {
    mission: { kind, target: pool[p.value]!, done: false },
    rng: p.state,
  };
}

/** 사람이 읽을 미션 설명(UI용). */
export function missionLabel(m: Mission): string {
  const NAME: Partial<Record<PieceKind, string>> = {
    chariot: '차', cannon: '포', horse: '마', elephant: '상', soldier: '졸',
    pawn: '폰', knight: '나이트', bishop: '비숍', rook: '룩', queen: '퀸', king: '킹',
    general: '장', guard: '사',
  };
  const t = NAME[m.target] ?? m.target;
  return m.kind === 'moveKind' ? `${t}를 움직이세요` : `적 ${t}을(를) 잡으세요`;
}
