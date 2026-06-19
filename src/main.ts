// 브라우저 엔트리: 시작 메뉴(난이도 선택) → 게임(PixiJS 렌더 + 입력 + rAF 루프가 tick 구동) → 게임오버 → 메뉴.
import { aiChooseMove } from './ai/heuristic';
import { AiPerformer } from './ai/performer';
import { SoundFx } from './audio/sfx';
import { DIFFICULTIES, type DifficultyLevel } from './config/difficulty';
import { eq } from './core/board';
import { STEP_MS } from './core/constants';
import { createStandardGame } from './core/setup';
import { tick } from './core/tick';
import type { GameState, Intent } from './core/types';
import { BoardView } from './render/pixiBoard';

const mount = document.getElementById('app')!;
const menuEl = document.getElementById('menu')!;

const DIFF_NAME: Record<DifficultyLevel, string> = { easy: '쉬움', normal: '보통', hard: '어려움' };
const DIFF_ORDER: DifficultyLevel[] = ['easy', 'normal', 'hard'];
const sfx = new SoundFx();

// ── 시작 메뉴: 난이도 선택 ───────────────────────────
function showMenu(): void {
  menuEl.replaceChildren();

  const title = document.createElement('h2');
  title.textContent = '난이도 선택';
  menuEl.appendChild(title);

  for (const level of DIFF_ORDER) {
    const d = DIFFICULTIES[level];
    const btn = document.createElement('button');
    btn.className = 'diff-btn';
    const name = document.createElement('b');
    name.textContent = DIFF_NAME[level];
    const info = document.createElement('span');
    info.innerHTML =
      `유속 ${d.hourglassCapacityMs / 1000}s · HP ${d.maxHp} · 도달피해 ${d.damagePerReach}<br>` +
      `판정 perfect ±${d.rhythm.perfectMs}ms · 적 사고 ${d.ai.thinkMs}ms`;
    btn.append(name, info);
    btn.addEventListener('click', () => {
      sfx.unlock(); // 사용자 제스처에서 오디오 활성화
      menuEl.style.display = 'none';
      void startGame(level);
    });
    menuEl.appendChild(btn);
  }
  menuEl.style.display = 'flex';
}

// ── 게임오버 오버레이 ────────────────────────────────
function showGameOver(state: GameState, onRestart: () => void): void {
  const overlay = document.createElement('div');
  overlay.id = 'overlay';

  const title = document.createElement('h2');
  title.textContent = state.overReason === 'royal' ? '왕이 잡혔습니다' : 'HP 소진';
  const score = document.createElement('div');
  score.className = 'score';
  score.textContent = `점수 ${state.score}`;
  const btn = document.createElement('button');
  btn.textContent = '다시 (메뉴로)';
  btn.addEventListener('click', () => {
    overlay.remove();
    onRestart();
  });

  overlay.append(title, score, btn);
  document.body.appendChild(overlay);
}

// ── 한 판 진행 ───────────────────────────────────────
async function startGame(level: DifficultyLevel): Promise<void> {
  const diff = DIFFICULTIES[level];
  const aiThinkMs = diff.ai.thinkMs;

  let state: GameState = createStandardGame({
    gap: 6,
    capacityMs: diff.hourglassCapacityMs,
    maxHp: diff.maxHp,
    damagePerReach: diff.damagePerReach,
    perfectMs: diff.rhythm.perfectMs,
    goodMs: diff.rhythm.goodMs,
    badMs: diff.rhythm.badMs,
  });

  const view = new BoardView();
  await view.init(mount, state);
  view.draw(state);

  const ac = new AbortController();
  const { signal } = ac;
  const queue: Intent[] = [];
  const canvas = view.app.canvas;

  canvas.addEventListener('contextmenu', (e) => e.preventDefault(), { signal });

  canvas.addEventListener(
    'pointerdown',
    (e: PointerEvent) => {
      if (state.turn !== 'player') return; // 적 차례(AI 연출 중)엔 입력 무시
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
        if (sel.preview && eq(sel.preview, cell)) queue.push({ t: 'confirm' });
        else if (sel.legal.some((c) => eq(c, cell))) queue.push({ t: 'preview', to: cell });
        else if (piece && piece.side === state.turn) queue.push({ t: 'select', pieceId: piece.id });
        else queue.push({ t: 'cancel' });
      } else if (piece && piece.side === state.turn) {
        queue.push({ t: 'select', pieceId: piece.id });
      }
    },
    { signal },
  );

  window.addEventListener(
    'keydown',
    (e: KeyboardEvent) => {
      if (e.key === 'f' || e.key === 'F') {
        view.floorMode = view.floorMode === 'grid' ? 'intersection' : 'grid';
      } else if (e.code === 'Space' || e.key === ' ') {
        e.preventDefault();
        state = { ...state, hourglass: { ...state.hourglass, paused: !state.hourglass.paused } };
      }
    },
    { signal },
  );

  // 이벤트 → 사운드 + 판정 팝업.
  const handleEvents = (events: ReturnType<typeof tick>['events']): void => {
    let lastMovedTo: { col: number; row: number } | null = null;
    for (const e of events) {
      switch (e.t) {
        case 'selected': sfx.select(); break;
        case 'previewed': sfx.preview(); break; // 가상이동 — 가운데 박자
        case 'moved': lastMovedTo = e.to; sfx.move(); break;
        case 'captured': sfx.capture(); break;
        case 'canceled': sfx.cancel(); break;
        case 'rhythm': // 플레이어 전용: HUD + 말 위치 판정 팝업 + 사운드
          view.lastJudge = e.judge;
          if (lastMovedTo) view.popJudge(e.judge, lastMovedTo);
          sfx.judge(e.judge);
          break;
        case 'bottomReached': sfx.damage(); break;
        case 'spawned': sfx.spawn(); break;
        case 'check': if (e.checked) sfx.check(); break; // 왕 위협 시작 시 경보
        case 'gameOver': sfx.gameOver(); break;
        default: break;
      }
    }
  };

  /** 적의 본 수를 현재 상태로 새로 계산해 한 번만 적용(dt:0 → 하강 끼어듦·stale 방지, 체크 재판정). */
  const aiCommit = (): void => {
    const move = aiChooseMove(state, state.turn, diff.ai);
    if (move === null) {
      state = { ...state, turn: 'player', selection: undefined }; // 둘 수 없으면 패스
      return;
    }
    const r = tick(state, {
      dt: 0,
      intents: [
        { t: 'select', pieceId: move.pieceId },
        { t: 'preview', to: move.to },
        { t: 'confirm' },
      ],
    });
    state = r.state;
    handleEvents(r.events);
  };

  let acc = 0;
  let aiWait = 0;
  let ended = false;
  let aiTurnHandled = false; // 적 턴당 1회만 두도록 가드(이중 이동 방지)
  const performer = new AiPerformer();

  view.app.ticker.add((ticker) => {
    acc += ticker.deltaMS;
    let dt = 0;
    while (acc >= STEP_MS) {
      dt += STEP_MS;
      acc -= STEP_MS;
    }
    const intents = queue.splice(0, queue.length);
    if (dt > 0 || intents.length > 0) {
      const r = tick(state, { dt, intents });
      state = r.state;
      handleEvents(r.events);
    }

    // 적 차례: 잠깐 생각 후 연출(미끼) → 'commit'에서 본 수 1회.
    if (state.status === 'playing' && state.turn === 'enemy') {
      if (performer.active) {
        for (const action of performer.update(ticker.deltaMS)) {
          if (action === 'commit') aiCommit();
          else queue.push(action); // 미끼 인텐트(연출)
        }
      } else if (!aiTurnHandled && queue.length === 0) {
        aiWait += ticker.deltaMS;
        if (aiWait >= aiThinkMs) {
          aiWait = 0;
          aiTurnHandled = true; // 이 적 턴은 한 번만 처리
          if (!performer.plan(state, diff.ai)) aiCommit(); // 둘 수 없으면(=패스) 처리
        }
      }
    } else {
      aiWait = 0;
      aiTurnHandled = false; // 플레이어 턴 → 다음 적 턴을 위해 리셋
    }

    view.draw(state);

    if (state.status === 'over' && !ended) {
      ended = true;
      showGameOver(state, () => {
        ac.abort(); // 입력 리스너 해제
        view.app.destroy(true); // 캔버스·티커 제거
        mount.replaceChildren();
        showMenu();
      });
    }
  });
}

showMenu();
