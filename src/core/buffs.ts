// 보상카드 — 말 강화 버프의 메타데이터·헬퍼. 규칙 자체는 각 MoveGen / applyMove에서 분기.
// 버프 종류(BuffKind)는 순환참조 방지를 위해 types.ts에 둔다.
import type { BuffKind, Piece, PieceKind } from './types';

export interface BuffMeta {
  kind: BuffKind;
  /** 부여 대상 말 종류 */
  appliesTo: PieceKind;
  /** 보드 위 배지 글자 */
  badge: string;
  /** 한국어 짧은 이름 */
  label: string;
  desc: string;
}

export const BUFFS: Record<BuffKind, BuffMeta> = {
  guardStride: {
    kind: 'guardStride',
    appliesTo: 'guard',
    badge: '２',
    label: '사 2칸',
    desc: '사(士)가 궁성 안에서 직선으로 2칸까지 이동(중간칸이 비어야 함).',
  },
  horseLeap: {
    kind: 'horseLeap',
    appliesTo: 'horse',
    badge: 'Ｎ',
    label: '마 점프',
    desc: '마(馬)가 멱을 무시하고 나이트처럼 건너뛴다.',
  },
  elephantTrample: {
    kind: 'elephantTrample',
    appliesTo: 'elephant',
    badge: '✸',
    label: '상 짓밟기',
    desc: '상(象)이 이동 경로상의 적을 모두 잡는다.',
  },
  cannonCreep: {
    kind: 'cannonCreep',
    appliesTo: 'cannon',
    badge: '•',
    label: '포 보행',
    desc: '포(包)가 인접 1칸으로 평이동(잡기 불가).',
  },
  chariotPierce: {
    kind: 'chariotPierce',
    appliesTo: 'chariot',
    badge: '⤞',
    label: '차 관통',
    desc: '차(車)가 가로막은 아군 1기를 희생해 그 너머 적을 잡는다.',
  },
  palaceWard: {
    kind: 'palaceWard',
    appliesTo: 'general',
    badge: '⊕',
    label: '궁성 결계',
    desc: '아군 궁성에 적 말이 진입할 수 없다.',
  },
};

export const ALL_BUFFS = Object.keys(BUFFS) as BuffKind[];

export function hasBuff(p: Piece, k: BuffKind): boolean {
  return p.buffs?.includes(k) ?? false;
}

/** 불변 부여(이미 있으면 그대로). */
export function withBuff(p: Piece, k: BuffKind): Piece {
  if (hasBuff(p, k)) return p;
  return { ...p, buffs: [...(p.buffs ?? []), k] };
}

/** 문자열을 BuffKind 목록으로(미지의 값은 버림). 'guardStride,horseLeap' 형태. */
export function parseBuffs(raw: string | null | undefined): BuffKind[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s): s is BuffKind => s in BUFFS);
}

/** 플레이어 말 중 각 버프의 대상 종류에 버프를 부여한 새 배열. */
export function grantPlayerBuffs(pieces: Piece[], buffs: BuffKind[]): Piece[] {
  if (buffs.length === 0) return pieces;
  return pieces.map((p) => {
    if (p.side !== 'player') return p;
    let np = p;
    for (const b of buffs) if (p.kind === BUFFS[b].appliesTo) np = withBuff(np, b);
    return np;
  });
}
