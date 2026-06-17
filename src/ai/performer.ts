// AI 연출: 최선수를 즉답하지 않고, 후보를 하나씩 가상이동→취소로 시연하다 최선수를 확정.
// 반박자마다 한 동작씩 흘려 "박자를 타며 탐색하는" 모습을 보여준다(AI는 항상 just, 판정 없음).
// 설계 근거: doc/architecture.md "후보 3개 + 연출(ritual) 인텐트 생성".
import { beatPeriodMs } from '../core/rhythm';
import type { GameState, Intent } from '../core/types';
import { aiRankedMoves, type AiConfig } from './heuristic';

export class AiPerformer {
  private steps: Intent[] = [];
  private idx = 0;
  private timer = 0;
  private stepMs = 250;
  active = false;

  /** 이번 차례의 연출 시퀀스를 계획. 둘 수 있으면 true(연출 시작), 없으면 false(호출측이 패스). */
  plan(state: GameState, cfg: AiConfig): boolean {
    const ranked = aiRankedMoves(state, state.turn, cfg, 3);
    if (ranked.length === 0) {
      this.steps = [];
      this.active = false;
      return false;
    }

    const best = ranked[0]!;
    const steps: Intent[] = [];
    // 후보(2등·3등)를 미끼로 가상이동→취소 (탐색하는 척)
    for (const m of ranked.slice(1)) {
      steps.push({ t: 'select', pieceId: m.pieceId });
      steps.push({ t: 'preview', to: m.to });
      steps.push({ t: 'cancel' });
    }
    // 최선수 확정
    steps.push({ t: 'select', pieceId: best.pieceId });
    steps.push({ t: 'preview', to: best.to });
    steps.push({ t: 'confirm' });

    this.steps = steps;
    this.idx = 0;
    this.timer = 0;
    this.stepMs = beatPeriodMs(state.rhythm.bpm) / 2; // 반박자마다 한 동작
    this.active = true;
    return true;
  }

  /** dt 누적 후 이번 프레임에 흘릴 인텐트(0~1개). 마지막 동작을 내보내면 active=false. */
  update(dtMs: number): Intent[] {
    if (!this.active) return [];
    this.timer += dtMs;
    const out: Intent[] = [];
    if (this.timer >= this.stepMs && this.idx < this.steps.length) {
      this.timer -= this.stepMs;
      out.push(this.steps[this.idx]!);
      this.idx += 1;
    }
    if (this.idx >= this.steps.length) this.active = false;
    return out;
  }
}
