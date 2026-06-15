// tick이 반환하는 이벤트(직접 emit 안 함 → 순수성 유지). 렌더·SFX·UI가 구독.
// 2단계 범위의 이벤트만 정의 — 이후 단계(이동/리듬/점수)에서 확장.
// 설계 근거: doc/architecture.md "이벤트 목록 (GameEvent)".
import type { Coord, OverReason, PieceKind, Side } from './types';

export type GameEvent =
  // 입력/이동 3단계
  | { t: 'selected'; pieceId: string; legal: Coord[] }
  | { t: 'previewed'; pieceId: string; to: Coord }
  | { t: 'canceled'; pieceId: string }
  | { t: 'moved'; pieceId: string; from: Coord; to: Coord }
  | { t: 'reconciled'; pieceId?: string; previewDropped: boolean } // 하강으로 selection 보정
  | { t: 'turnChanged'; turn: Side }
  // 전투
  | {
      t: 'captured';
      by: string;
      targetId: string;
      targetKind: PieceKind;
      at: Coord;
      mode: 'active' | 'descent'; // active=이동측 승, descent=위쪽 승
    }
  // 모래시계/하강/스폰
  | { t: 'cycle'; cycle: number } // 모래시계 뒤집힘
  | { t: 'descended'; movedIds: string[] } // 적 일제 하강
  | { t: 'bottomReached'; pieceId: string; damage: number } // 코어 침범(최우선)
  | { t: 'spawned'; pieceIds: string[]; cycle: number }
  // 자원/진행
  | { t: 'hpChanged'; hp: number; delta: number }
  | { t: 'gameOver'; reason: OverReason };
