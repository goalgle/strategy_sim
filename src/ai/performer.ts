// AI 연출: 최선수를 즉답하지 않고, 후보를 하나씩 가상이동→취소로 시연하다 'commit' 신호로 마무리.
// 실제 수는 commit 시점에 메인이 "현재 상태로 새로" 계산해 한 번만 둔다(pre-baked 수의 stale 방지 → 이중 이동 버그 해결).
// 반박자마다 한 동작(박자 탐). AI는 항상 perfect, 판정 없음.
// 설계 근거: doc/architecture.md "후보 3개 + 연출(ritual) 인텐트 생성".
import { beatPeriodMs } from '../core/rhythm';
import type { GameState, Intent } from '../core/types';
import { aiRankedMoves, type AiConfig } from './heuristic';

/** 연출 동작: 미끼 인텐트(연출용) 또는 본 수를 두라는 commit 신호. */
export type RitualAction = Intent | 'commit';

export class AiPerformer {
  private steps: RitualAction[] = [];
  private idx = 0;
  private half = 250; // 반박자(ms)
  private nextAt = 0; // 다음 동작을 낼 sim timeMs 경계
  active = false;

  /** 이번 차례의 연출 시퀀스를 계획. 둘 수 있으면 true, 없으면 false(호출측이 패스). */
  plan(state: GameState, cfg: AiConfig): boolean {
    const ranked = aiRankedMoves(state, state.turn, cfg, 3);
    if (ranked.length === 0) {
      this.steps = [];
      this.active = false;
      return false;
    }

    const steps: RitualAction[] = [];
    // 후보(2·3등)를 미끼로 가상이동→취소 (탐색하는 척)
    for (const m of ranked.slice(1)) {
      steps.push({ t: 'select', pieceId: m.pieceId });
      steps.push({ t: 'preview', to: m.to });
      steps.push({ t: 'cancel' });
    }
    steps.push('commit'); // 본 수는 commit에서 fresh로 적용

    this.steps = steps;
    this.idx = 0;
    this.half = beatPeriodMs(state.rhythm.bpm) / 2; // 반박자마다 한 동작
    // 다음 반박자 경계부터 시작 — 음악/판정 격자에 스냅(벽시계 아님).
    this.nextAt = (Math.floor(state.timeMs / this.half) + 1) * this.half;
    this.active = true;
    return true;
  }

  /** 현재 sim timeMs를 받아, 반박자 격자 경계를 넘긴 동작들을 내보낸다(보통 0~1개). */
  update(timeMs: number): RitualAction[] {
    if (!this.active) return [];
    const out: RitualAction[] = [];
    while (this.idx < this.steps.length && timeMs >= this.nextAt) {
      out.push(this.steps[this.idx]!);
      this.idx += 1;
      this.nextAt += this.half;
    }
    if (this.idx >= this.steps.length) this.active = false;
    return out;
  }
}
