// 사운드 — WebAudio로 짧은 톤을 합성(에셋 파일 없음). 이벤트에 맞춰 재생.
// 브라우저 자동재생 정책 때문에 사용자 제스처에서 unlock() 필요.
import type { RhythmJudge } from '../core/types';

export class SoundFx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  enabled = true;

  /** 사용자 제스처(메뉴 클릭 등)에서 호출. */
  unlock(): void {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const Ctx: typeof AudioContext =
      window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.22;
    this.master.connect(this.ctx.destination);
  }

  private tone(freq: number, durMs: number, type: OscillatorType, vol: number, slideTo?: number): void {
    if (!this.ctx || !this.master || !this.enabled) return;
    const t0 = this.ctx.currentTime;
    const dur = durMs / 1000;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  select(): void {
    this.tone(660, 55, 'square', 0.4);
  }
  preview(): void {
    this.tone(550, 55, 'sine', 0.45); // 가상이동(목표 클릭) — 빠졌던 가운데 박자
  }
  move(): void {
    this.tone(440, 70, 'triangle', 0.6);
  }
  cancel(): void {
    this.tone(320, 80, 'sawtooth', 0.35, 220);
  }
  capture(): void {
    this.tone(190, 150, 'sawtooth', 0.8, 90);
  }
  damage(): void {
    this.tone(120, 220, 'square', 0.7, 70);
  }
  spawn(): void {
    this.tone(900, 40, 'sine', 0.2);
  }
  gameOver(): void {
    this.tone(330, 650, 'sine', 0.7, 80);
  }
  judge(j: RhythmJudge): void {
    const freq: Record<RhythmJudge, number> = { perfect: 1320, good: 990, bad: 620, miss: 200 };
    this.tone(freq[j], j === 'miss' ? 170 : 110, j === 'miss' ? 'sawtooth' : 'sine', j === 'miss' ? 0.5 : 0.7);
  }
}
