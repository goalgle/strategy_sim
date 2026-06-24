// 인텐트(이동 3단계 + 콤보) 처리. 플레이어·AI 공용 단일 통로.
// 설계 근거: doc/architecture.md "tick 파이프라인 → 이동 해소", doc/concept.md "미션/티켓/콤보".
import { eq } from './board';
import { captureTargets, COMBO_MAX_MOVES } from './combo';
import {
  ABILITY_AUTO3,
  ABILITY_AUTO3_COST,
  ABILITY_FREEZE,
  ABILITY_FREEZE_COST,
  ABILITY_FREEZE_MS,
} from './constants';
import type { GameEvent } from './events';
import { MISSION_INTERVAL, rollMission, TICKET_PER_MISSION } from './missions';
import { legalMoves } from './pieces/registry';
import { judgeAt, RHYTHM_SCORE } from './rhythm';
import { applyMove } from './rules';
import { captureScore } from './scoring';
import type { Coord, GameState, GameStatus, Intent, Mission, OverReason, PieceKind, Side } from './types';

const other = (s: Side): Side => (s === 'player' ? 'enemy' : 'player');

function satisfies(m: Mission, ev: { movedKind?: PieceKind; capturedKind?: PieceKind }): boolean {
  return m.kind === 'moveKind' ? ev.movedKind === m.target : ev.capturedKind === m.target;
}

/** 플레이어 행동에 미션 진행 반영 — 충족되면 티켓 +1, 미션 해제. */
function progressMission(
  state: GameState,
  ev: { movedKind?: PieceKind; capturedKind?: PieceKind },
): { tickets: number; mission?: Mission; events: GameEvent[] } {
  if (state.mission === undefined || !satisfies(state.mission, ev)) {
    return { tickets: state.tickets, mission: state.mission, events: [] };
  }
  const tickets = state.tickets + TICKET_PER_MISSION;
  return { tickets, mission: undefined, events: [{ t: 'missionDone', tickets }] };
}

/** 플레이어 턴 종료: 턴 카운트+1, 5턴마다 미션 발생, 턴 전환, 선택·콤보 해제. */
function endPlayerTurn(state: GameState): { state: GameState; events: GameEvent[] } {
  const turnCount = state.turnCount + 1;
  let mission = state.mission;
  let rng = state.rng;
  const events: GameEvent[] = [];
  if (mission === undefined && turnCount % MISSION_INTERVAL === 0) {
    const r = rollMission(rng);
    mission = r.mission;
    rng = r.rng;
    events.push({ t: 'missionNew', kind: mission.kind, target: mission.target });
  }
  events.push({ t: 'turnChanged', turn: 'enemy' });
  return {
    state: { ...state, turnCount, mission, rng, turn: 'enemy', selection: undefined, combo: undefined },
    events,
  };
}

/** 자동 1수(자동 3수 스킬용) — 리듬 없음. 처치 점수·미션만 반영. */
function resolveAutoMove(state: GameState, pieceId: string, to: Coord): { state: GameState; events: GameEvent[] } {
  const mover = state.pieces.find((p) => p.id === pieceId);
  if (mover === undefined || mover.side !== 'player') return { state, events: [] };
  const from = { ...mover.at };
  const res = applyMove(state, pieceId, to);
  const events: GameEvent[] = [{ t: 'moved', pieceId, from, to }];
  let score = state.score;
  let tickets = state.tickets;
  let mission = state.mission;
  let status: GameStatus = state.status;
  let overReason: OverReason | undefined = state.overReason;

  if (res.captured !== undefined) {
    events.push({ t: 'captured', by: pieceId, targetId: res.captured.id, targetKind: res.captured.kind, at: to, mode: 'active' });
    score += captureScore(res.captured.kind);
    events.push({ t: 'scored', total: score, delta: captureScore(res.captured.kind), reason: 'capture' });
    if (res.captured.isRoyal) {
      status = 'over';
      overReason = 'royal';
      events.push({ t: 'gameOver', reason: 'royal' });
    }
  }
  if (status !== 'over') {
    const pm = progressMission({ ...state, tickets, mission }, { movedKind: mover.kind, capturedKind: res.captured?.kind });
    tickets = pm.tickets;
    mission = pm.mission;
    events.push(...pm.events);
  }
  return { state: { ...res.state, score, tickets, mission, status, overReason }, events };
}

/** 한 개의 인텐트를 적용(순수). 차례(turn)·선택·콤보 상태를 검사한다. */
export function applyIntent(state: GameState, intent: Intent): { state: GameState; events: GameEvent[] } {
  if (state.status === 'over') return { state, events: [] };

  switch (intent.t) {
    case 'select': {
      if (state.combo !== undefined) return { state, events: [] }; // 콤보 중엔 일반 선택 불가
      const piece = state.pieces.find((p) => p.id === intent.pieceId);
      if (piece === undefined || piece.side !== state.turn) return { state, events: [] };
      const legal = legalMoves(piece, state);
      return {
        state: { ...state, selection: { pieceId: piece.id, legal } },
        events: [{ t: 'selected', pieceId: piece.id, legal }],
      };
    }

    case 'preview': {
      const sel = state.selection;
      if (sel === undefined) return { state, events: [] };
      if (!sel.legal.some((c) => eq(c, intent.to))) return { state, events: [] };
      return {
        state: { ...state, selection: { ...sel, preview: intent.to } },
        events: [{ t: 'previewed', pieceId: sel.pieceId, to: intent.to }],
      };
    }

    case 'confirm': {
      const sel = state.selection;
      if (sel === undefined || sel.preview === undefined) return { state, events: [] };
      const mover = state.pieces.find((p) => p.id === sel.pieceId);
      if (mover === undefined) return { state, events: [] };

      const from = { ...mover.at };
      const to = sel.preview;
      const isPlayer = mover.side === 'player';
      const res = applyMove(state, sel.pieceId, to);
      const events: GameEvent[] = [{ t: 'moved', pieceId: sel.pieceId, from, to }];

      let status: GameStatus = state.status;
      let overReason: OverReason | undefined = state.overReason;
      let score = state.score;
      let tickets = state.tickets;
      let mission = state.mission;

      if (isPlayer) {
        const j = judgeAt(state.timeMs, state.rhythm);
        events.push({ t: 'rhythm', judge: j });
        const rScore = RHYTHM_SCORE[j];
        if (rScore > 0) {
          score += rScore;
          events.push({ t: 'scored', total: score, delta: rScore, reason: 'rhythm' });
        }
      }

      if (res.captured !== undefined) {
        events.push({
          t: 'captured',
          by: sel.pieceId,
          targetId: res.captured.id,
          targetKind: res.captured.kind,
          at: to,
          mode: 'active',
        });
        if (isPlayer) {
          const cScore = captureScore(res.captured.kind);
          score += cScore;
          events.push({ t: 'scored', total: score, delta: cScore, reason: 'capture' });
        }
        if (res.captured.isRoyal) {
          status = 'over';
          overReason = 'royal';
          events.push({ t: 'gameOver', reason: 'royal' });
        }
      }

      // 미션 진행(플레이어): 이동한 말 종류 / 잡은 적 종류.
      if (isPlayer && status !== 'over') {
        const pm = progressMission(
          { ...state, tickets, mission },
          { movedKind: mover.kind, capturedKind: res.captured?.kind },
        );
        tickets = pm.tickets;
        mission = pm.mission;
        events.push(...pm.events);
      }

      const baseState: GameState = { ...res.state, score, tickets, mission, status, overReason };

      if (status === 'over') {
        return { state: { ...baseState, selection: undefined }, events };
      }

      // 콤보 판정(플레이어 + 잡기 성공 + 티켓 보유 + 추가 잡기 대상 있음).
      if (isPlayer && res.captured !== undefined) {
        const targets = captureTargets(sel.pieceId, baseState);
        if (targets.length > 0 && tickets > 0 && COMBO_MAX_MOVES > 1) {
          events.push({ t: 'comboStart', pieceId: sel.pieceId, targets, tickets });
          return {
            state: { ...baseState, selection: undefined, combo: { pieceId: sel.pieceId, targets, count: 1 } },
            events,
          };
        }
      }

      // 콤보 없음 → 턴 종료.
      if (isPlayer) {
        const end = endPlayerTurn(baseState);
        return { state: end.state, events: [...events, ...end.events] };
      }
      // 적(AI): 단순 턴 전환.
      events.push({ t: 'turnChanged', turn: 'player' });
      return { state: { ...baseState, selection: undefined, turn: 'player' }, events };
    }

    case 'comboTo': {
      const combo = state.combo;
      if (combo === undefined || state.tickets <= 0) return { state, events: [] };
      if (!combo.targets.some((c) => eq(c, intent.to))) return { state, events: [] };
      const mover = state.pieces.find((p) => p.id === combo.pieceId);
      if (mover === undefined) return { state, events: [] };

      const from = { ...mover.at };
      const res = applyMove(state, combo.pieceId, intent.to);
      const events: GameEvent[] = [{ t: 'moved', pieceId: combo.pieceId, from, to: intent.to }];

      let status: GameStatus = state.status;
      let overReason: OverReason | undefined = state.overReason;
      let score = state.score;
      const tickets = state.tickets - 1; // 콤보 추가 이동 = 티켓 1장

      // 리듬 점수(콤보 이동도 타이밍 입력)
      const j = judgeAt(state.timeMs, state.rhythm);
      events.push({ t: 'rhythm', judge: j });
      if (RHYTHM_SCORE[j] > 0) {
        score += RHYTHM_SCORE[j];
        events.push({ t: 'scored', total: score, delta: RHYTHM_SCORE[j], reason: 'rhythm' });
      }

      if (res.captured !== undefined) {
        events.push({
          t: 'captured',
          by: combo.pieceId,
          targetId: res.captured.id,
          targetKind: res.captured.kind,
          at: intent.to,
          mode: 'active',
        });
        score += captureScore(res.captured.kind);
        events.push({ t: 'scored', total: score, delta: captureScore(res.captured.kind), reason: 'capture' });
        if (res.captured.isRoyal) {
          status = 'over';
          overReason = 'royal';
          events.push({ t: 'gameOver', reason: 'royal' });
        }
      }

      // 미션(잡은 적 종류)
      let tk = tickets;
      let mission = state.mission;
      if (status !== 'over') {
        const pm = progressMission({ ...state, tickets: tk, mission }, { capturedKind: res.captured?.kind });
        tk = pm.tickets;
        mission = pm.mission;
        events.push(...pm.events);
      }

      const count = combo.count + 1;
      events.push({ t: 'comboContinue', count, tickets: tk });
      const baseState: GameState = { ...res.state, score, tickets: tk, mission, status, overReason };

      if (status === 'over') return { state: { ...baseState, combo: undefined }, events };

      // 더 이어갈 수 있나? (횟수·티켓·대상)
      const nextTargets = captureTargets(combo.pieceId, baseState);
      if (count < COMBO_MAX_MOVES && tk > 0 && nextTargets.length > 0) {
        return {
          state: { ...baseState, combo: { pieceId: combo.pieceId, targets: nextTargets, count } },
          events,
        };
      }
      // 콤보 종료 → 턴 넘김.
      events.push({ t: 'comboEnd', count });
      const end = endPlayerTurn(baseState);
      return { state: end.state, events: [...events, ...end.events] };
    }

    case 'comboEnd': {
      if (state.combo === undefined) return { state, events: [] };
      const events: GameEvent[] = [{ t: 'comboEnd', count: state.combo.count }];
      const end = endPlayerTurn(state);
      return { state: end.state, events: [...events, ...end.events] };
    }

    case 'cancel': {
      const sel = state.selection;
      if (sel === undefined) return { state, events: [] };
      const selection = sel.preview !== undefined ? { ...sel, preview: undefined } : undefined;
      return {
        state: { ...state, selection },
        events: [{ t: 'canceled', pieceId: sel.pieceId }],
      };
    }

    case 'special': {
      // #2 모래시계 정지 — 언제든(실시간 압박 방어). 티켓 소모, 중복 불가.
      if (intent.action === ABILITY_FREEZE) {
        if (state.tickets < ABILITY_FREEZE_COST || state.hourglass.freezeMs > 0) return { state, events: [] };
        const tickets = state.tickets - ABILITY_FREEZE_COST;
        return {
          state: { ...state, tickets, hourglass: { ...state.hourglass, freezeMs: ABILITY_FREEZE_MS } },
          events: [{ t: 'frozen', ms: ABILITY_FREEZE_MS, tickets }],
        };
      }
      // #4 자동 3수 — 플레이어 차례, 콤보 아님. main이 휴리스틱으로 계산한 수 목록을 payload로.
      if (intent.action === ABILITY_AUTO3) {
        if (state.turn !== 'player' || state.combo !== undefined) return { state, events: [] };
        const moves = intent.payload as { pieceId: string; to: Coord }[] | undefined;
        if (moves === undefined || moves.length === 0 || state.tickets < ABILITY_AUTO3_COST) {
          return { state, events: [] };
        }
        let s: GameState = { ...state, tickets: state.tickets - ABILITY_AUTO3_COST, selection: undefined };
        const events: GameEvent[] = [];
        let applied = 0;
        for (const m of moves) {
          if (s.status === 'over') break;
          const r = resolveAutoMove(s, m.pieceId, m.to);
          if (r.events.length === 0) continue; // 무효 수 건너뜀
          s = r.state;
          events.push(...r.events);
          applied += 1;
        }
        events.unshift({ t: 'auto3', moves: applied, tickets: s.tickets });
        if (s.status !== 'over') {
          const end = endPlayerTurn(s);
          s = end.state;
          events.push(...end.events);
        }
        return { state: s, events };
      }
      return { state, events: [] };
    }
  }
}
