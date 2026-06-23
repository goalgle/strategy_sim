// 사운드 — WebAudio로 짧은 톤을 합성(에셋 파일 없음). 이벤트에 맞춰 재생.
// 브라우저 자동재생 정책 때문에 사용자 제스처에서 unlock() 필요.
import type { RhythmJudge } from '../core/types';

export class SoundFx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  enabled = true;

  // ── BGM(BPM 동기 룩어헤드 스케줄러) ──
  private musicGain: GainNode | null = null;
  private musicTimer: number | null = null;
  private nextNoteTime = 0;
  private step16 = 0;
  private bpm = 120;
  musicOn = true;

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
    // 음악은 SFX보다 낮게 깔아 효과음이 묻히지 않게.
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.09;
    this.musicGain.connect(this.ctx.destination);
  }

  // ── BGM ────────────────────────────────────────────────
  private static BASS: Record<number, number> = { 0: 110, 4: 110, 8: 87.31, 12: 98 }; // A2·A2·F2·G2 (Am→F→G 느낌)
  private static LEAD: Record<number, number> = { 0: 220, 4: 261.63, 8: 174.61, 12: 196 }; // A3·C4·F3·G3

  /** 특정 시각(time, audio clock)에 한 음 예약. */
  private noteAt(freq: number, time: number, durMs: number, type: OscillatorType, vol: number): void {
    if (!this.ctx || !this.musicGain) return;
    const dur = durMs / 1000;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, time);
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(vol, time + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    osc.connect(g);
    g.connect(this.musicGain);
    osc.start(time);
    osc.stop(time + dur + 0.02);
  }

  private scheduleStep(step: number, time: number): void {
    const b = SoundFx.BASS[step];
    if (b) this.noteAt(b, time, 200, 'triangle', 0.9);
    const l = SoundFx.LEAD[step];
    if (l) this.noteAt(l, time, 130, 'square', 0.32);
    if (step % 2 === 1) this.noteAt(7800, time, 18, 'square', 0.05); // 오프비트 하이햇 틱
  }

  private scheduler(): void {
    if (!this.ctx) return;
    const sec16 = 60 / this.bpm / 4; // 16분음표 간격
    while (this.nextNoteTime < this.ctx.currentTime + 0.2) {
      if (this.musicOn) this.scheduleStep(this.step16, this.nextNoteTime);
      this.nextNoteTime += sec16;
      this.step16 = (this.step16 + 1) % 16;
    }
  }

  startMusic(bpm: number): void {
    if (!this.ctx || this.musicTimer !== null) return;
    this.bpm = bpm;
    this.step16 = 0;
    this.nextNoteTime = this.ctx.currentTime + 0.1;
    this.musicTimer = window.setInterval(() => this.scheduler(), 25);
  }

  stopMusic(): void {
    if (this.musicTimer !== null) {
      clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
  }

  /** 음악 켜고/끄기 토글. 현재 상태 반환. */
  toggleMusic(): boolean {
    this.musicOn = !this.musicOn;
    return this.musicOn;
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
  check(): void {
    // 왕 위협 경보 — 높고 날카롭게
    this.tone(1320, 220, 'square', 0.6);
  }
  combo(): void {
    this.tone(880, 90, 'square', 0.6, 1320); // 상승 — 콤보 고조
  }
  ticket(): void {
    this.tone(1050, 130, 'sine', 0.6, 1570); // 미션 완료 보상음
  }
  judge(j: RhythmJudge): void {
    const freq: Record<RhythmJudge, number> = { perfect: 1320, good: 990, bad: 620, miss: 200 };
    this.tone(freq[j], j === 'miss' ? 170 : 110, j === 'miss' ? 'sawtooth' : 'sine', j === 'miss' ? 0.5 : 0.7);
  }
}
