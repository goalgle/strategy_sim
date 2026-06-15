// 브라우저 엔트리: 코어 GameState를 PixiJS로 렌더 + 마우스 입력을 Intent로 변환 + rAF 루프가 tick 구동.
// 적 수는 AI(5단계) 전까지 핫시트(사람이 양측을 둠).
import { eq } from './core/board';
import { STEP_MS } from './core/constants';
import { createStandardGame } from './core/setup';
import { tick } from './core/tick';
import type { GameState, Intent } from './core/types';
import { BoardView } from './render/pixiBoard';

const mount = document.getElementById('app')!;

// 데모용: 완충 6행(rows=12), 모래시계 4초.
let state: GameState = createStandardGame({ gap: 6, capacityMs: 4000 });

const view = new BoardView();
await view.init(mount, state);
view.draw(state);

// ── 입력 → Intent 큐 ──────────────────────────────
const queue: Intent[] = [];
const canvas = view.app.canvas;

canvas.addEventListener('contextmenu', (e) => e.preventDefault());

canvas.addEventListener('pointerdown', (e: PointerEvent) => {
  const rect = canvas.getBoundingClientRect();
  const cell = view.cellFromPixel(e.clientX - rect.left, e.clientY - rect.top);
  if (!cell) return;

  if (e.button === 2) {
    queue.push({ t: 'cancel' });
    return;
  }
  if (e.button !== 0) return;

  const sel = state.selection;
  const piece = state.pieces.find((p) => eq(p.at, cell));

  if (sel) {
    if (sel.preview && eq(sel.preview, cell)) {
      queue.push({ t: 'confirm' }); // 같은 칸 재클릭 = 확정
    } else if (sel.legal.some((c) => eq(c, cell))) {
      queue.push({ t: 'preview', to: cell }); // 합법 칸 = 가상이동
    } else if (piece && piece.side === state.turn) {
      queue.push({ t: 'select', pieceId: piece.id }); // 다른 내 말 재선택
    } else {
      queue.push({ t: 'cancel' }); // 그 외 = 선택 해제
    }
  } else if (piece && piece.side === state.turn) {
    queue.push({ t: 'select', pieceId: piece.id });
  }
});

window.addEventListener('keydown', (e: KeyboardEvent) => {
  if (e.key === 'f' || e.key === 'F') {
    view.floorMode = view.floorMode === 'grid' ? 'intersection' : 'grid';
  } else if (e.code === 'Space') {
    e.preventDefault();
    state = { ...state, hourglass: { ...state.hourglass, paused: !state.hourglass.paused } };
  }
});

// ── 고정 STEP 누적 루프 ───────────────────────────
let acc = 0;
view.app.ticker.add((ticker) => {
  acc += ticker.deltaMS;
  let dt = 0;
  while (acc >= STEP_MS) {
    dt += STEP_MS;
    acc -= STEP_MS;
  }
  const intents = queue.splice(0, queue.length);
  if (dt > 0 || intents.length > 0) {
    state = tick(state, { dt, intents }).state;
  }
  view.draw(state);
});
