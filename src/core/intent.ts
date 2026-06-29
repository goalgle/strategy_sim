// 인텐트(이동 3단계 + 콤보) 처리. 플레이어·AI 공용 단일 통로.
// 설계 근거: doc/architecture.md "tick 파이프라인 → 이동 해소", doc/concept.md "미션/티켓/콤보".
import { eq } from './board';
import { grantPlayerBuffs } from './buffs';
import { captureTargets, COMBO_MAX_MOVES } from './combo';
import {
  ABILITY_AUTO3,
  ABILITY_AUTO3_COST,
  ABILITY_FORCE,
  ABILITY_FORCE_COST,
  ABILITY_FREEZE,
  ABILITY_FREEZE_COST,
  ABILITY_FREEZE_MS,
  ABILITY_PUSH,
  ABILITY_PUSH_COST_HP,
} from './constants';
import { pushEnemiesUp } from './descent';
import type { GameEvent } from './events';
import { MISSION_INTERVAL, rollMission, TICKET_PER_MISSION } from './missions';
import { legalMoves } from './pieces/registry';
import { applyRegen } from './rewards';
import { judgeAt, RHYTHM_SCORE } from './rhythm';
import { applyMove } from './rules';
import { captureScore } from './scoring';
import type { Coord, GameState, GameStatus, Intent, Mission, OverReason, PieceKind, Side } from './types';

const other = (s: Side): Side => (s === 'player' ? 'enemy' : 'player');

interface MissionEv {
  movedKind?: PieceKind;
  capturedKind?: PieceKind;
  /** 한 수로 여러 말을 잡을 때(상 짓밟기 등) — 하나라도 대상이면 충족. */
  capturedKinds?: PieceKind[];
}

function satisfies(m: Mission, ev: MissionEv): boolean {
  if (m.kind === 'moveKind') return ev.movedKind === m.target;
  return ev.capturedKind === m.target || (ev.capturedKinds?.includes(m.target) ?? false);
}

/** 플레이어 행동에 미션 진행 반영 — 충족되면 티켓 +1, 미션 해제. */
function progressMission(
  state: GameState,
  ev: MissionEv,
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
  if (state.mode !== 'janggi' && mission === undefined && turnCount % MISSION_INTERVAL === 0) {
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

  for (const c of res.captures) {
    events.push({ t: 'captured', by: pieceId, targetId: c.id, targetKind: c.kind, at: { col: c.at.col, row: c.at.row }, mode: 'active' });
    score += captureScore(c.kind);
    events.push({ t: 'scored', total: score, delta: captureScore(c.kind), reason: 'capture' });
    if (c.isRoyal && (c.side === 'player' || state.mode === 'janggi')) {
      // 디펜스 게임 — 내 왕(장)이 잡혀야 패배. 적 왕 잡기는 점수만, 종료 없음.
      // 장기 튜토리얼('janggi')에서는 어느 장이든 잡히면 종료.
      status = 'over';
      overReason = 'royal';
      events.push({ t: 'gameOver', reason: 'royal' });
    }
  }
  if (res.sacrifice !== undefined) {
    events.push({ t: 'sacrificed', pieceId: res.sacrifice.id, kind: res.sacrifice.kind, at: { ...res.sacrifice.at } });
  }
  if (status !== 'over') {
    const pm = progressMission({ ...state, tickets, mission }, { movedKind: mover.kind, capturedKinds: res.captures.map((c) => c.kind) });
    tickets = pm.tickets;
    mission = pm.mission;
    events.push(...pm.events);
  }
  return { state: { ...res.state, score, tickets, mission, status, overReason }, events };
}

/** 한 개의 인텐트를 적용(순수). 차례(turn)·선택·콤보 상태를 검사한다. */
export function applyIntent(state: GameState, intent: Intent): { state: GameState; events: GameEvent[] } {
  if (state.status === 'over') return { state, events: [] };
  // 보상 카드 제시 중에는 선택(pickReward)만 받는다 — 그 외 입력은 무시(게임 대기).
  if (state.reward !== undefined && intent.t !== 'pickReward') return { state, events: [] };

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

      // 잡기(도착칸 + 버프 부가 잡기 모두). 짓밟기는 한 수로 여러 말을 잡는다.
      for (const c of res.captures) {
        events.push({
          t: 'captured',
          by: sel.pieceId,
          targetId: c.id,
          targetKind: c.kind,
          at: { col: c.at.col, row: c.at.row },
          mode: 'active',
        });
        if (isPlayer) {
          const cScore = captureScore(c.kind);
          score += cScore;
          events.push({ t: 'scored', total: score, delta: cScore, reason: 'capture' });
        }
        if (c.isRoyal && (c.side === 'player' || state.mode === 'janggi')) {
          status = 'over';
          overReason = 'royal';
          events.push({ t: 'gameOver', reason: 'royal' });
        }
      }

      if (res.sacrifice !== undefined) {
        events.push({ t: 'sacrificed', pieceId: res.sacrifice.id, kind: res.sacrifice.kind, at: { ...res.sacrifice.at } });
      }

      // 미션 진행(플레이어): 이동한 말 종류 / 잡은 적 종류(여럿 가능).
      if (isPlayer && status !== 'over') {
        const pm = progressMission(
          { ...state, tickets, mission },
          { movedKind: mover.kind, capturedKinds: res.captures.map((c) => c.kind) },
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

      for (const c of res.captures) {
        events.push({
          t: 'captured',
          by: combo.pieceId,
          targetId: c.id,
          targetKind: c.kind,
          at: { col: c.at.col, row: c.at.row },
          mode: 'active',
        });
        score += captureScore(c.kind);
        events.push({ t: 'scored', total: score, delta: captureScore(c.kind), reason: 'capture' });
        if (c.isRoyal && (c.side === 'player' || state.mode === 'janggi')) {
          status = 'over';
          overReason = 'royal';
          events.push({ t: 'gameOver', reason: 'royal' });
        }
      }

      if (res.sacrifice !== undefined) {
        events.push({ t: 'sacrificed', pieceId: res.sacrifice.id, kind: res.sacrifice.kind, at: { ...res.sacrifice.at } });
      }

      // 미션(잡은 적 종류, 여럿 가능)
      let tk = tickets;
      let mission = state.mission;
      if (status !== 'over') {
        const pm = progressMission({ ...state, tickets: tk, mission }, { capturedKinds: res.captures.map((c) => c.kind) });
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
      // #3 밀어내기 — HP 소모. 적 전체 한 칸 위로. 콤보 중 불가, HP는 최소 1 남김.
      if (intent.action === ABILITY_PUSH) {
        if (state.combo !== undefined || state.hp - ABILITY_PUSH_COST_HP < 1) return { state, events: [] };
        const push = pushEnemiesUp(state);
        const hp = state.hp - ABILITY_PUSH_COST_HP;
        return {
          state: { ...push.state, hp },
          events: [{ t: 'hpChanged', hp, delta: -ABILITY_PUSH_COST_HP }, ...push.events],
        };
      }
      // #5 적 말 강제이동 — 티켓 소모. 적 말 하나를 그 말의 합법수 내로(main이 payload 전달).
      if (intent.action === ABILITY_FORCE) {
        if (state.turn !== 'player' || state.combo !== undefined || state.tickets < ABILITY_FORCE_COST) {
          return { state, events: [] };
        }
        const p = intent.payload as { pieceId: string; to: Coord } | undefined;
        if (p === undefined) return { state, events: [] };
        const piece = state.pieces.find((x) => x.id === p.pieceId && x.side === 'enemy');
        if (piece === undefined || !legalMoves(piece, state).some((c) => eq(c, p.to))) {
          return { state, events: [] };
        }
        const tickets = state.tickets - ABILITY_FORCE_COST;
        const from = { ...piece.at };
        const res = applyMove(state, p.pieceId, p.to);
        const events: GameEvent[] = [
          { t: 'forced', pieceId: p.pieceId, to: p.to, tickets },
          { t: 'moved', pieceId: p.pieceId, from, to: p.to },
        ];
        let status: GameStatus = state.status;
        let overReason: OverReason | undefined = state.overReason;
        if (res.captured !== undefined) {
          events.push({ t: 'captured', by: p.pieceId, targetId: res.captured.id, targetKind: res.captured.kind, at: p.to, mode: 'active' });
          if (res.captured.isRoyal && (res.captured.side === 'player' || state.mode === 'janggi')) {
            status = 'over';
            overReason = 'royal';
            events.push({ t: 'gameOver', reason: 'royal' });
          }
        }
        return { state: { ...res.state, tickets, status, overReason }, events };
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

    case 'pickReward': {
      const reward = state.reward;
      if (reward === undefined) return { state, events: [] };
      const card = reward.options[intent.index];
      if (card === undefined) return { state, events: [] };
      // 버프 = 말 종류 전체 강화 / 리젠 = 잃은 말 원위치 부활. 보상 해제·카운트 증가(임계 상승).
      const applied =
        card.type === 'buff'
          ? { ...state, pieces: grantPlayerBuffs(state.pieces, [card.buff]) }
          : applyRegen(state, card.pieceId);
      return {
        state: { ...applied, reward: undefined, rewardCount: state.rewardCount + 1 },
        events: [{ t: 'rewardPicked', card }],
      };
    }
  }
}
