// 사운드 — WebAudio로 짧은 톤을 합성(에셋 파일 없음). 이벤트에 맞춰 재생.
// 브라우저 자동재생 정책 때문에 사용자 제스처에서 unlock() 필요.
import type { RhythmJudge } from '../core/types';

export class SoundFx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  enabled = true;

  // ── BGM(sim 박자 격자에 앵커된 룩어헤드 스케줄러) ──
  private musicGain: GainNode | null = null;
  private musicTimer: number | null = null;
  private originAudio = 0; // startMusic 시점의 audio clock
  private originSimMs = 0; // 그 시점의 sim timeMs(보통 0)
  private step16abs = 0; // sim 원점부터의 절대 16분음표 인덱스
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

  /** 절대 16분 스텝 s가 떨어질 audio clock 시각 — sim 격자에 앵커. */
  private audioAt(s: number): number {
    const sec16 = 60 / this.bpm / 4;
    return this.originAudio + s * sec16 - this.originSimMs / 1000;
  }

  private scheduler(): void {
    if (!this.ctx) return;
    while (this.audioAt(this.step16abs) < this.ctx.currentTime + 0.2) {
      if (this.musicOn) this.scheduleStep(this.step16abs % 16, this.audioAt(this.step16abs));
      this.step16abs += 1;
    }
  }

  /** originSimMs = 호출 시점의 sim timeMs(보통 0). 음악 비트를 판정/펄스 격자에 정렬. */
  startMusic(bpm: number, originSimMs = 0): void {
    if (!this.ctx || this.musicTimer !== null) return;
    this.bpm = bpm;
    this.originAudio = this.ctx.currentTime;
    this.originSimMs = originSimMs;
    const sec16 = 60 / bpm / 4;
    // 현재 시각 직후의 첫 16분 격자 스텝부터 스케줄(과거 스텝은 건너뜀, 격자 유지).
    this.step16abs = Math.max(0, Math.ceil((this.ctx.currentTime + 0.05 - this.audioAt(0)) / sec16));
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
    this.toneAt(freq, 0, durMs, type, vol, slideTo);
  }

  /** tone과 같되 currentTime + startMs에서 시작 — 아르페지오(시간차) 연주용. */
  private toneAt(freq: number, startMs: number, durMs: number, type: OscillatorType, vol: number, slideTo?: number): void {
    if (!this.ctx || !this.master || !this.enabled) return;
    const t0 = this.ctx.currentTime + startMs / 1000;
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
  mission(): void {
    // 새 미션 알림 — 2음 종소리(주의 환기)
    this.tone(784, 120, 'triangle', 0.7); // G5
    this.tone(1175, 220, 'triangle', 0.7); // D6
  }
  freeze(): void {
    this.tone(440, 320, 'sine', 0.6, 110); // 하강 글리산도 — 얼어붙는 느낌
  }
  auto(): void {
    this.tone(660, 70, 'square', 0.5);
    this.tone(990, 70, 'square', 0.5);
    this.tone(1320, 130, 'square', 0.5); // 상승 3음 — 자동 처리
  }
  push(): void {
    this.tone(300, 200, 'sawtooth', 0.7, 700); // 위로 솟는 — 밀어내기
  }
  force(): void {
    this.tone(520, 120, 'triangle', 0.6, 360); // 끌어당김
  }
  rewardOffer(): void {
    // 보상 등장 — 밝은 상승 아르페지오(C-E-G-C) 팡파르.
    this.toneAt(523, 0, 120, 'triangle', 0.6); // C5
    this.toneAt(659, 90, 120, 'triangle', 0.6); // E5
    this.toneAt(784, 180, 120, 'triangle', 0.65); // G5
    this.toneAt(1047, 270, 240, 'triangle', 0.7); // C6
  }
  rewardPick(): void {
    // 선택 확정 — 짧은 상승 2음 + 슬라이드 반짝.
    this.toneAt(784, 0, 90, 'sine', 0.6); // G5
    this.toneAt(1047, 70, 180, 'sine', 0.7, 1568); // C6 → 슬라이드 업
  }
  judge(j: RhythmJudge): void {
    const freq: Record<RhythmJudge, number> = { perfect: 1320, good: 990, bad: 620, miss: 200 };
    this.tone(freq[j], j === 'miss' ? 170 : 110, j === 'miss' ? 'sawtooth' : 'sine', j === 'miss' ? 0.5 : 0.7);
  }
}
