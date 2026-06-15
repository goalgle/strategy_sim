// tick이 반환하는 이벤트(직접 emit 안 함 → 순수성 유지). 렌더·SFX·UI가 구독.
// 2단계 범위의 이벤트만 정의 — 이후 단계(이동/리듬/점수)에서 확장.
// 설계 근거: doc/architecture.md "이벤트 목록 (GameEvent)".
import type { Coord, OverReason, PieceKind } from './types';

export type GameEvent =
  | { t: 'cycle'; cycle: number } // 모래시계 뒤집힘
  | { t: 'descended'; movedIds: string[] } // 적 일제 하강
  | {
      t: 'captured';
      by: string;
      targetId: string;
      targetKind: PieceKind;
      at: Coord;
      mode: 'active' | 'descent'; // active=이동측 승, descent=위쪽 승
    }
  | { t: 'bottomReached'; pieceId: string; damage: number } // 코어 침범(최우선)
  | { t: 'spawned'; pieceIds: string[]; cycle: number }
  | { t: 'hpChanged'; hp: number; delta: number }
  | { t: 'gameOver'; reason: OverReason };
