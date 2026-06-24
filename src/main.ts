// 브라우저 엔트리: 시작 메뉴(난이도·리플레이) → 게임(렌더+입력+rAF 루프가 tick 구동, 기록) → 게임오버(리플레이 저장) → 메뉴.
import { aiChooseMove } from './ai/heuristic';
import { AiPerformer } from './ai/performer';
import { SoundFx } from './audio/sfx';
import { DIFFICULTIES, type DifficultyLevel } from './config/difficulty';
import { eq } from './core/board';
import {
  ABILITY_AUTO3,
  ABILITY_AUTO3_COST,
  ABILITY_AUTO3_MOVES,
  ABILITY_FREEZE,
  ABILITY_FREEZE_COST,
  STEP_MS,
} from './core/constants';
import { missionLabel } from './core/missions';
import { applyMove } from './core/rules';
import { createStandardGame, type StandardOptions } from './core/setup';
import { tick } from './core/tick';
import type { GameState, Intent } from './core/types';
import { BoardView } from './render/pixiBoard';
import {
  loadReplays,
  Recorder,
  saveReplay,
  splitForPlayback,
  type Replay,
} from './replay/replay';
import { showHelp, showIntroIfFirst } from './ui/help';

const mount = document.getElementById('app')!;
const menuEl = document.getElementById('menu')!;

const DIFF_NAME: Record<DifficultyLevel, string> = { easy: '쉬움', normal: '보통', hard: '어려움' };
const DIFF_ORDER: DifficultyLevel[] = ['easy', 'normal', 'hard'];
const sfx = new SoundFx();

// ── 이벤트 → 사운드 + 판정 팝업(플레이·리플레이 공용) ─────
function handleEvents(view: BoardView, events: ReturnType<typeof tick>['events']): void {
  let lastMovedTo: { col: number; row: number } | null = null;
  for (const e of events) {
    switch (e.t) {
      case 'selected': sfx.select(); break;
      case 'previewed': sfx.preview(); break;
      case 'moved': lastMovedTo = e.to; sfx.move(); break;
      case 'captured': sfx.capture(); break;
      case 'canceled': sfx.cancel(); break;
      case 'rhythm':
        view.lastJudge = e.judge;
        if (lastMovedTo) view.popJudge(e.judge, lastMovedTo);
        sfx.judge(e.judge);
        break;
      case 'bottomReached': sfx.damage(); break;
      case 'spawned': sfx.spawn(); break;
      case 'check': if (e.checked) sfx.check(); break;
      case 'comboStart':
        sfx.combo();
        view.flashCombo(e.tickets);
        break;
      case 'comboContinue': sfx.combo(); break;
      case 'missionNew':
        sfx.mission();
        view.flashMission(missionLabel({ kind: e.kind, target: e.target, done: false }));
        break;
      case 'missionDone': sfx.ticket(); break;
      case 'frozen': sfx.freeze(); break;
      case 'auto3': sfx.auto(); break;
      case 'gameOver': sfx.gameOver(); break;
      default: break;
    }
  }
}

// ── 시작 메뉴: 난이도 선택 + 최근 리플레이 ───────────────
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
      sfx.unlock();
      menuEl.style.display = 'none';
      // 첫 플레이면 핵심 안내(C) 먼저, 닫으면 시작.
      showIntroIfFirst(() => void startGame(level));
    });
    menuEl.appendChild(btn);
  }

  // 도움말(A) — 언제든.
  const helpBtn = document.createElement('button');
  helpBtn.className = 'diff-btn';
  helpBtn.style.textAlign = 'center';
  helpBtn.innerHTML = '<b>📖 도움말</b>';
  helpBtn.addEventListener('click', () => showHelp());
  menuEl.appendChild(helpBtn);

  const replays = loadReplays();
  if (replays.length > 0) {
    const rt = document.createElement('h2');
    rt.textContent = '최근 리플레이';
    menuEl.appendChild(rt);
    replays.forEach((r, idx) => {
      const btn = document.createElement('button');
      btn.className = 'diff-btn';
      const name = document.createElement('b');
      name.textContent = `▶ 점수 ${r.finalScore}`;
      const info = document.createElement('span');
      const when = r.createdAt.slice(0, 16).replace('T', ' ');
      info.textContent = `${DIFF_NAME[(r.difficulty as DifficultyLevel) ?? 'normal']} · ${when}`;
      btn.append(name, info);
      btn.addEventListener('click', () => {
        sfx.unlock();
        menuEl.style.display = 'none';
        void startReplay(r, idx);
      });
      menuEl.appendChild(btn);
    });
  }

  menuEl.style.display = 'flex';
}

// ── 오버레이(게임오버 / 리플레이 종료) ───────────────────
interface OverlayBtn { label: string; onClick: () => void }
function showOverlay(title: string, sub: string, buttons: OverlayBtn[]): HTMLElement {
  const overlay = document.createElement('div');
  overlay.id = 'overlay';
  const h = document.createElement('h2');
  h.textContent = title;
  const s = document.createElement('div');
  s.className = 'score';
  s.textContent = sub;
  overlay.append(h, s);
  for (const b of buttons) {
    const btn = document.createElement('button');
    btn.textContent = b.label;
    btn.addEventListener('click', () => {
      overlay.remove();
      b.onClick();
    });
    overlay.appendChild(btn);
  }
  document.body.appendChild(overlay);
  return overlay;
}

function downloadReplay(r: Replay): void {
  const blob = new Blob([JSON.stringify(r)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `replay-${r.finalScore}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── 한 판 진행(기록 포함) ────────────────────────────────
async function startGame(level: DifficultyLevel): Promise<void> {
  const diff = DIFFICULTIES[level];
  const aiThinkMs = diff.ai.thinkMs;

  const initConfig: StandardOptions = {
    gap: 6,
    capacityMs: diff.hourglassCapacityMs,
    maxHp: diff.maxHp,
    damagePerReach: diff.damagePerReach,
    perfectMs: diff.rhythm.perfectMs,
    goodMs: diff.rhythm.goodMs,
    badMs: diff.rhythm.badMs,
  };
  let state: GameState = createStandardGame(initConfig);
  const recorder = new Recorder();

  const view = new BoardView();
  await view.init(mount, state);
  view.draw(state);
  sfx.startMusic(state.rhythm.bpm, state.timeMs); // 음악을 sim 박자 격자에 정렬

  const ac = new AbortController();
  const { signal } = ac;
  const queue: Intent[] = [];
  const canvas = view.app.canvas;

  // 모바일 컨텍스트 버튼: 선택 중=취소 / 콤보 중=콤보 종료 (터치엔 우클릭이 없음).
  const actionBtn = document.createElement('button');
  actionBtn.id = 'action-btn';
  actionBtn.addEventListener(
    'pointerdown',
    (e) => {
      e.preventDefault();
      if (state.combo) queue.push({ t: 'comboEnd' });
      else if (state.selection) queue.push({ t: 'cancel' });
    },
    { signal },
  );
  document.body.appendChild(actionBtn);

  // 특수기능 버튼(#2 정지, #4 자동3수) — 티켓 소모. 하단 양쪽.
  const freezeBtn = document.createElement('button');
  freezeBtn.className = 'ability-btn';
  freezeBtn.style.left = '12px';
  freezeBtn.textContent = `⏸ 정지 🎫${ABILITY_FREEZE_COST}`;
  freezeBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); queue.push({ t: 'special', action: ABILITY_FREEZE }); }, { signal });

  const auto3Btn = document.createElement('button');
  auto3Btn.className = 'ability-btn';
  auto3Btn.style.right = '12px';
  auto3Btn.textContent = `🤖 자동3수 🎫${ABILITY_AUTO3_COST}`;
  auto3Btn.addEventListener(
    'pointerdown',
    (e) => {
      e.preventDefault();
      if (state.turn !== 'player' || state.combo || state.tickets < ABILITY_AUTO3_COST) return;
      // 휴리스틱으로 최선 수를 시뮬해 목록 산출(코어는 데이터로 받아 실행).
      let sim = state;
      const moves: { pieceId: string; to: { col: number; row: number } }[] = [];
      for (let i = 0; i < ABILITY_AUTO3_MOVES; i++) {
        const m = aiChooseMove(sim, 'player', diff.ai);
        if (!m) break;
        moves.push(m);
        const res = applyMove(sim, m.pieceId, m.to);
        sim = res.state;
        if (res.captured?.isRoyal) break;
      }
      if (moves.length > 0) queue.push({ t: 'special', action: ABILITY_AUTO3, payload: moves });
    },
    { signal },
  );
  document.body.append(freezeBtn, auto3Btn);

  // 모든 tick을 한 곳에서: 적용 + 기록 + 이벤트 처리.
  const applyTick = (input: { dt: number; intents?: Intent[] }): void => {
    const r = tick(state, input);
    state = r.state;
    recorder.record(input.dt, input.intents ?? []);
    handleEvents(view, r.events);
  };

  canvas.addEventListener('contextmenu', (e) => e.preventDefault(), { signal });
  canvas.addEventListener(
    'pointerdown',
    (e: PointerEvent) => {
      if (state.turn !== 'player') return;
      const rect = canvas.getBoundingClientRect();
      const cell = view.cellFromPixel(e.clientX - rect.left, e.clientY - rect.top);
      if (!cell) return;

      // 콤보 중: 대상 클릭=이어 잡기, 그 외/우클릭=콤보 종료.
      if (state.combo) {
        if (e.button === 2) { queue.push({ t: 'comboEnd' }); return; }
        if (e.button !== 0) return;
        if (state.combo.targets.some((c) => eq(c, cell))) queue.push({ t: 'comboTo', to: cell });
        else queue.push({ t: 'comboEnd' });
        return;
      }

      if (e.button === 2) { queue.push({ t: 'cancel' }); return; }
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
      } else if (e.key === 'm' || e.key === 'M') {
        sfx.toggleMusic();
      } else if (e.code === 'Space' || e.key === ' ') {
        e.preventDefault();
        state = { ...state, hourglass: { ...state.hourglass, paused: !state.hourglass.paused } };
      }
    },
    { signal },
  );

  const aiCommit = (): void => {
    const move = aiChooseMove(state, state.turn, diff.ai);
    if (move === null) {
      state = { ...state, turn: 'player', selection: undefined };
      return;
    }
    applyTick({
      dt: 0,
      intents: [
        { t: 'select', pieceId: move.pieceId },
        { t: 'preview', to: move.to },
        { t: 'confirm' },
      ],
    });
  };

  let acc = 0;
  let aiWait = 0;
  let ended = false;
  let aiTurnHandled = false;
  const performer = new AiPerformer();

  view.app.ticker.add((ticker) => {
    acc += ticker.deltaMS;
    let dt = 0;
    while (acc >= STEP_MS) { dt += STEP_MS; acc -= STEP_MS; }
    const intents = queue.splice(0, queue.length);
    if (dt > 0 || intents.length > 0) applyTick({ dt, intents });

    if (state.status === 'playing' && state.turn === 'enemy') {
      if (performer.active) {
        for (const action of performer.update(state.timeMs)) {
          if (action === 'commit') aiCommit();
          else queue.push(action);
        }
      } else if (!aiTurnHandled && queue.length === 0) {
        aiWait += ticker.deltaMS;
        if (aiWait >= aiThinkMs) {
          aiWait = 0;
          aiTurnHandled = true;
          if (!performer.plan(state, diff.ai)) aiCommit();
        }
      }
    } else {
      aiWait = 0;
      aiTurnHandled = false;
    }

    view.draw(state);

    // 컨텍스트 버튼 토글(플레이어 차례에 선택/콤보가 있을 때만).
    if (state.status === 'playing' && state.turn === 'player' && state.combo) {
      actionBtn.textContent = '🔥 콤보 종료';
      actionBtn.style.display = 'block';
    } else if (state.status === 'playing' && state.turn === 'player' && state.selection) {
      actionBtn.textContent = '✕ 취소';
      actionBtn.style.display = 'block';
    } else {
      actionBtn.style.display = 'none';
    }

    // 특수기능 버튼: 게임 중엔 항상 보이되 발동 가능 여부에 따라 흐림.
    const playable = state.status === 'playing';
    freezeBtn.style.display = playable ? 'block' : 'none';
    auto3Btn.style.display = playable ? 'block' : 'none';
    const canFreeze = playable && state.tickets >= ABILITY_FREEZE_COST && state.hourglass.freezeMs <= 0;
    const canAuto3 = playable && state.turn === 'player' && !state.combo && state.tickets >= ABILITY_AUTO3_COST;
    freezeBtn.style.opacity = canFreeze ? '1' : '0.4';
    auto3Btn.style.opacity = canAuto3 ? '1' : '0.4';
    freezeBtn.disabled = !canFreeze;
    auto3Btn.disabled = !canAuto3;

    if (state.status === 'over' && !ended) {
      ended = true;
      const replay = recorder.build(initConfig, {
        finalScore: state.score,
        difficulty: level,
        createdAt: new Date().toISOString(),
      });
      saveReplay(replay);
      const cleanup = () => {
        ac.abort();
        sfx.stopMusic();
        actionBtn.remove();
        freezeBtn.remove();
        auto3Btn.remove();
        view.app.destroy(true);
        mount.replaceChildren();
      };
      showOverlay(
        state.overReason === 'royal' ? '왕이 잡혔습니다' : 'HP 소진',
        `점수 ${state.score}`,
        [
          { label: '리플레이 보기', onClick: () => { cleanup(); void startReplay(replay); } },
          { label: 'JSON 저장', onClick: () => { downloadReplay(replay); cleanup(); showMenu(); } },
          { label: '메뉴로', onClick: () => { cleanup(); showMenu(); } },
        ],
      );
    }
  });
}

// ── 리플레이 재생(입력 없음, 기록된 입력열을 시간 페이스로 재생) ──
async function startReplay(replay: Replay, _idx?: number): Promise<void> {
  let state: GameState = createStandardGame(replay.init);
  const entries = splitForPlayback(replay.entries);

  const view = new BoardView();
  await view.init(mount, state);
  view.draw(state);
  sfx.startMusic(state.rhythm.bpm, state.timeMs);

  let i = 0;
  let budget = 0;
  let finished = false;
  const SPEED = 1;

  const cleanup = () => {
    sfx.stopMusic();
    view.app.destroy(true);
    mount.replaceChildren();
  };
  const skipBtn = showReplayBadge(() => {
    cleanup();
    showMenu();
  });

  view.app.ticker.add((ticker) => {
    budget += ticker.deltaMS * SPEED;
    let guard = 0;
    while (i < entries.length && budget >= entries[i]!.dt && guard < 2000) {
      const e = entries[i]!;
      budget -= e.dt;
      const r = tick(state, { dt: e.dt, intents: e.intents });
      state = r.state;
      handleEvents(view, r.events);
      i += 1;
      guard += 1;
    }
    view.draw(state);

    if (i >= entries.length && !finished) {
      finished = true;
      skipBtn.remove();
      showOverlay('리플레이 종료', `점수 ${state.score}`, [
        { label: '메뉴로', onClick: () => { cleanup(); showMenu(); } },
      ]);
    }
  });
}

/** 재생 중 우상단 "리플레이 ▶ / 메뉴로" 배지. */
function showReplayBadge(onExit: () => void): HTMLElement {
  const badge = document.createElement('div');
  badge.id = 'replay-badge';
  const label = document.createElement('span');
  label.textContent = '리플레이 ▶';
  const btn = document.createElement('button');
  btn.textContent = '메뉴로';
  btn.addEventListener('click', onExit);
  badge.append(label, btn);
  document.body.appendChild(badge);
  return badge;
}

showMenu();
