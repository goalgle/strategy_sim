// PixiJS 보드 렌더러. 코어 GameState를 그린다(상태가 진실, 렌더는 시각 표현).
// 그리드↔교차 토글은 바닥 라인만 바꾼다(말 위치는 동일 좌표).
import { Application, Container, Graphics, Text } from 'pixi.js';
import { eq } from '../core/board';
import { missionLabel } from '../core/missions';
import { beatPhase01 } from '../core/rhythm';
import type { Coord, GameState, PieceKind, RhythmJudge } from '../core/types';

export type FloorMode = 'grid' | 'intersection';

const CELL = 40;
const BAR_H = 12; // 모래시계 진행바
const PAD = 6;
const HUD_H = 46;

const GLYPH: Record<PieceKind, string> = {
  general: '將',
  chariot: '車',
  cannon: '包',
  horse: '馬',
  elephant: '象',
  guard: '士',
  soldier: '卒',
  // 체스(적) — 유니코드 체스 기호(채워진 실루엣)
  king: '♚',
  queen: '♛',
  rook: '♜',
  bishop: '♝',
  knight: '♞',
  pawn: '♟',
};

const JUDGE_COLOR: Record<RhythmJudge, number> = {
  perfect: 0x66e0ff,
  good: 0x66e08a,
  bad: 0xffb86b,
  miss: 0xff6b6b,
};

const COL = {
  bg: 0x0b0e1a,
  board: 0x161a2e,
  line: 0x2a2f4a,
  palace: 0x6b5cff,
  player: 0x4aa3ff,
  enemy: 0xff5a5a,
  royal: 0xffd24a,
  legal: 0x57e08a,
  capture: 0xff7a7a,
  preview: 0xffe14a,
  bar: 0x6b8cff,
};

export class BoardView {
  readonly app = new Application();
  private floor = new Graphics();
  private highlights = new Graphics();
  private bar = new Graphics();
  private piecesLayer = new Container();
  private popupLayer = new Container();
  private popups: { text: Text; coord: Coord; life: number }[] = [];
  private hud = new Text({ text: '', style: { fill: 0xcdd6f4, fontSize: 14, fontFamily: 'monospace' } });
  private cols = 0;
  private rows = 0;
  floorMode: FloorMode = 'intersection';
  /** 마지막 리듬 판정(HUD 표시용). main이 이벤트로 갱신. */
  lastJudge: RhythmJudge | null = null;

  async init(mount: HTMLElement, state: GameState): Promise<void> {
    this.cols = state.board.cols;
    this.rows = state.board.rows;
    const width = this.cols * CELL;
    const height = BAR_H + PAD + this.rows * CELL + HUD_H;
    await this.app.init({ width, height, background: COL.bg, antialias: true });
    mount.appendChild(this.app.canvas);
    this.hud.y = BAR_H + PAD + this.rows * CELL + 6;
    this.hud.x = 4;
    this.app.stage.addChild(
      this.floor,
      this.highlights,
      this.bar,
      this.piecesLayer,
      this.popupLayer,
      this.hud,
    );
  }

  private boardTop(): number {
    return BAR_H + PAD;
  }

  center(c: number, r: number): { x: number; y: number } {
    return { x: (c + 0.5) * CELL, y: this.boardTop() + (r + 0.5) * CELL };
  }

  /** 픽셀 좌표 → 보드 칸(범위 밖이면 undefined). */
  cellFromPixel(x: number, y: number): Coord | undefined {
    const col = Math.floor(x / CELL);
    const row = Math.floor((y - this.boardTop()) / CELL);
    if (col < 0 || col >= this.cols || row < 0 || row >= this.rows) return undefined;
    return { col, row };
  }

  draw(state: GameState): void {
    this.drawFloor(state);
    this.drawHighlights(state);
    this.drawBar(state);
    this.drawPieces(state);
    this.updatePopups();
    this.drawHud(state);
  }

  /** 판정 텍스트(PERFECT/GOOD/BAD/MISS)를 말 이동 위치에 띄운다 — 떠오르며 사라짐. */
  popJudge(judge: RhythmJudge, coord: Coord): void {
    const t = new Text({
      text: judge.toUpperCase(),
      style: { fill: JUDGE_COLOR[judge], fontSize: 16, fontWeight: 'bold', fontFamily: 'system-ui' },
    });
    t.anchor.set(0.5);
    this.popupLayer.addChild(t);
    this.popups.push({ text: t, coord, life: 0 });
  }

  private updatePopups(): void {
    const dt = this.app.ticker.deltaMS;
    const POPUP_MS = 1000;
    this.popups = this.popups.filter((p) => {
      p.life += dt;
      const k = p.life / POPUP_MS;
      if (k >= 1) {
        p.text.destroy();
        return false;
      }
      const c = this.center(p.coord.col, p.coord.row);
      p.text.x = c.x;
      p.text.y = c.y - 8 - k * 26; // 위로 떠오름
      p.text.alpha = 1 - k; // 페이드아웃
      return true;
    });
  }

  private drawFloor(state: GameState): void {
    const g = this.floor;
    const top = this.boardTop();
    g.clear();
    g.rect(0, top, this.cols * CELL, this.rows * CELL).fill(COL.board);

    if (this.floorMode === 'grid') {
      for (let r = 0; r < this.rows; r++)
        for (let c = 0; c < this.cols; c++)
          g.rect(c * CELL, top + r * CELL, CELL, CELL).stroke({ width: 1, color: COL.line });
    } else {
      // 교차형: 칸 중심을 지나는 가로·세로 라인
      const x0 = this.center(0, 0).x;
      const x1 = this.center(this.cols - 1, 0).x;
      const y0 = this.center(0, 0).y;
      const y1 = this.center(0, this.rows - 1).y;
      for (let r = 0; r < this.rows; r++) {
        const y = this.center(0, r).y;
        g.moveTo(x0, y).lineTo(x1, y);
      }
      for (let c = 0; c < this.cols; c++) {
        const x = this.center(c, 0).x;
        g.moveTo(x, y0).lineTo(x, y1);
      }
      g.stroke({ width: 1, color: COL.line });
    }

    // 궁성 대각선(X)
    for (const pal of state.board.palaces) {
      for (const line of pal.diagonalLines) {
        const a = this.center(line[0]!.col, line[0]!.row);
        const b = this.center(line[line.length - 1]!.col, line[line.length - 1]!.row);
        g.moveTo(a.x, a.y).lineTo(b.x, b.y);
      }
    }
    g.stroke({ width: 1, color: COL.palace, alpha: 0.6 });
  }

  private drawHighlights(state: GameState): void {
    const g = this.highlights;
    g.clear();

    // 콤보 중: 추가 잡기 대상을 노란 펄스 링으로.
    if (state.combo) {
      for (const cell of state.combo.targets) {
        const { x, y } = this.center(cell.col, cell.row);
        g.circle(x, y, CELL * 0.46).stroke({ width: 3, color: COL.preview });
      }
      return;
    }

    const sel = state.selection;
    if (!sel) return;
    for (const cell of sel.legal) {
      const { x, y } = this.center(cell.col, cell.row);
      const occupied = state.pieces.some((p) => eq(p.at, cell));
      if (occupied) g.circle(x, y, CELL * 0.42).stroke({ width: 3, color: COL.capture });
      else g.circle(x, y, CELL * 0.16).fill({ color: COL.legal, alpha: 0.7 });
    }
    if (sel.preview) {
      const { x, y } = this.center(sel.preview.col, sel.preview.row);
      g.circle(x, y, CELL * 0.46).stroke({ width: 3, color: COL.preview });
    }
  }

  private drawBar(state: GameState): void {
    const g = this.bar;
    g.clear();
    const w = this.cols * CELL;
    // 모래시계 진행바
    g.rect(0, 0, w, BAR_H).fill(0x202544);
    const frac = Math.min(1, state.hourglass.progress / state.hourglass.capacity);
    const barColor = state.checked ? COL.capture : state.hourglass.paused ? 0x888888 : COL.bar;
    g.rect(0, 0, w * frac, BAR_H).fill({ color: barColor }); // 체크 시 빨강(정지)
    // 박자 펄스(우상단): 정각에 가장 크고 밝게 → 플레이어가 타이밍 맞추는 기준
    const phase = beatPhase01(state.timeMs, state.rhythm.bpm); // 0=정각
    const r = 3 + (1 - phase) * (BAR_H * 0.5);
    const alpha = 0.3 + (1 - phase) * 0.7;
    g.circle(w - BAR_H, BAR_H / 2, r).fill({ color: COL.preview, alpha });
  }

  private drawPieces(state: GameState): void {
    this.piecesLayer.removeChildren();
    for (const p of state.pieces) {
      const { x, y } = this.center(p.at.col, p.at.row);
      const c = new Graphics();
      c.circle(x, y, CELL * 0.38).fill(p.side === 'player' ? COL.player : COL.enemy);
      if (p.isRoyal) {
        // 위협받는 플레이어 왕은 빨간 경보 링
        const checkRing = p.side === 'player' && state.checked;
        c.circle(x, y, CELL * 0.44).stroke({ width: 3, color: checkRing ? COL.capture : COL.royal });
        if (checkRing) c.circle(x, y, CELL * 0.5).stroke({ width: 2, color: COL.capture });
      }
      this.piecesLayer.addChild(c);

      const t = new Text({
        text: GLYPH[p.kind],
        style: {
          fill: 0x0b0e1a,
          fontSize: p.family === 'chess' ? 26 : 18, // 체스 기호는 키워야 원에 꽉 참
          fontWeight: 'bold',
          fontFamily: 'serif',
        },
      });
      t.anchor.set(0.5);
      t.x = x;
      t.y = y;
      this.piecesLayer.addChild(t);
    }
  }

  private drawHud(state: GameState): void {
    const turn = state.turn === 'player' ? '플레이어' : '적';
    const paused = state.hourglass.paused ? ' ⏸' : '';
    const judge = this.lastJudge ? `  ·  ${this.lastJudge.toUpperCase()}` : '';
    const check = state.checked ? '  ·  ⚠ 왕 위협! 시간정지' : '';
    const combo = state.combo ? `  ·  🔥 콤보 x${state.combo.count} (티켓으로 잇기/우클릭 종료)` : '';
    const mission = state.mission ? `  ·  미션: ${missionLabel(state.mission)}` : '';
    this.hud.text =
      `점수 ${state.score}  ·  🎫 ${state.tickets}${judge}${check}${combo}\n` +
      `cycle ${state.hourglass.cycle}  ·  HP ${state.hp}/${state.maxHp}  ·  ` +
      `턴:${turn}${mission}${paused}`;
  }
}
