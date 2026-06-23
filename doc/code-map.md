# 코드맵 — 파일별 정리

> 짝 문서: [concept.md](./concept.md)(기획) · [architecture.md](./architecture.md)(설계).
> 이 문서는 **구현된 파일이 무엇을 하는가**를 추적한다. 빌드 단계가 진행될 때마다 갱신.

## 현황 (플레이 가능 + 배포) ✅
빌드 1~5 + 리듬/점수/사운드/메뉴/체크정지까지 구현. 플레이어 vs AI로 굴러가며 GitHub Pages 배포 설정 완료.
- **코어**: 보드·12종 합법수·잡기 / 모래시계·하강·스폰·충돌 / 입력 3단계·턴·selection 재조정 / 리듬 판정·점수 / 왕 위협(체크) 시 모래시계 강제 정지. 순수·결정론.
- **AI**: 가중 평가(잡기·전진·하강예측·위험회피·잡음) + 난이도 노브 + 연출(미끼→commit).
- **프레젠테이션**: PixiJS 렌더(그리드↔교차 토글·하이라이트·HUD·박자 펄스·판정 팝업) + WebAudio SFX + 난이도 선택 메뉴.
- **배포**: `vite base=/strategy_sim/` + GitHub Actions → `goalgle.github.io/strategy_sim/`.
- **테스트 69개**, 타입체크·빌드 클린.
- 다음 후보: BGM, 빌드 6 스크립트/스테이지 로드, 데일리/리더보드, 밸런싱.

### AI
```
src/ai/
  heuristic.ts        가중 평가 + aiChooseMove/aiRankedMoves(난이도 노브). 위험회피는 threats 공유
  performer.ts        AI 연출 — 미끼(가상이동→취소) 후 'commit' 신호, 반박자 페이스
```

### 설정
```
src/config/
  difficulty.ts       난이도 프리셋(유속·HP·도달피해·AI생각시간 [wired],
                      리듬판정·AI노브 [pending]). 추후 StageScript.rules로 흡수.
```

### 웹 진입 / 렌더
```
index.html            Vite 엔트리
vite.config.ts        Vite 설정(target es2022)
src/
  main.ts             시작 메뉴(난이도 선택) → 게임(입력→Intent + rAF 루프) → 게임오버 → 메뉴
  render/
    pixiBoard.ts      PixiJS 보드 렌더러(토글·하이라이트·HUD·모래시계 바·박자 펄스·판정 팝업)
  audio/
    sfx.ts            WebAudio 합성 SFX(선택/이동/잡기/취소/판정/피해/스폰/게임오버)
  replay/
    replay.ts           리플레이 — Recorder(입력열 기록)·runReplay·splitForPlayback·localStorage 저장
.github/workflows/
  deploy.yml          main push 시 빌드→GitHub Pages 자동 배포
```
- 실행: `npm run dev`(개발 서버) · `npm run build`(프로덕션 빌드).
- 시작 시 **난이도 선택 메뉴**(쉬움/보통/어려움 — `DIFFICULTIES`에서 데이터 드리븐). 게임오버 시 점수 표시 + 메뉴 복귀.
- 입력: 클릭=선택/가상이동, 재클릭=확정, 우클릭=취소, F=바닥 토글, Space=정지.
- 적 차례는 난이도별 `ai.thinkMs` 뒤 **연출(미끼)→commit**으로 1수. commit은 `tick(dt:0)`로 fresh 적용(이중 이동 방지).
- **리플레이**: 모든 tick 입력을 `Recorder`로 기록 → 게임오버 시 `(초기설정 + (dt,intents) 스트림)`을 localStorage 저장(최근 5개) + JSON 다운로드. 메뉴/게임오버에서 재생(입력 없이 기록 재시뮬). tick이 순수해 **bit-exact 재현**.

```
src/
  core/
    types.ts            데이터 모델(+ Hourglass·HP·turn·selection·rhythm·score·checked)
    constants.ts        게임 상수(STEP·capacity·damage·hp·seed·리듬 윈도우)
    rng.ts              씨드 RNG(결정론 위생)
    board.ts            보드 헬퍼 + 궁성 모델
    pieces/
      common.ts         방향 벡터 + 슬라이딩 레이
      chess.ts          체스 6종 합법수
      janggi.ts         장기 7종 합법수
      registry.ts       RULES 레지스트리(종류→합법수)
    rules.ts            능동 잡기(applyMove)
    threats.ts          위협 판정(isPlayerInCheck·isAttackedBy) — 체크 정지 + AI danger 공유
    events.ts           GameEvent 유니온(입력/이동/리듬/점수/체크 등)
    rhythm.ts           BPM 4단계 판정(judgeAt) + RHYTHM_SCORE + 박자 펄스
    scoring.ts          처치 점수(captureScore)
    missions.ts         미션 생성(rollMission)·라벨 — 5턴마다·완료 시 티켓
    combo.ts            콤보 잡기 대상(captureTargets)·COMBO_MAX_MOVES
    descent.ts          일제 하강 해소(위쪽 승·맨아래 우선)
    spawn.ts            시드 기반 웨이브 스폰
    selection.ts        하강 후 진행 중 selection 재조정
    intent.ts           이동 3단계 인텐트 처리(select/preview/confirm/cancel)
    tick.ts             코어 진입점(모래시계→하강→스폰→재조정→인텐트)
    setup.ts            표준 진형 + 배치 헬퍼(+ HP·시드·턴 초기화)
    index.ts            코어 공개 API(배럴)
  demo/
    render.ts           ASCII 보드 렌더러(콘솔 확인용)
    show.ts             합법수 데모 (npm run demo)
    descent.ts          하강·충돌·HP 데모 (npm run demo:descent)
    play.ts             입력+턴+하강 통합 데모 (npm run demo:play)
    ai.ts               양측 AI 한 판 데모 (npm run demo:ai)
```

---

## 파일별 상세

### `src/core/types.ts`
- **역할**: 모든 모듈이 공유하는 데이터 모델.
- **주요 타입**: `Coord`, `Side`, `Family`, `PieceKind`(13종), `Piece`, `PalaceDef`, `Board`, `RngState`, `Hourglass`, `GameStatus`/`OverReason`, `Selection`, `Intent`, `GameState`, `MoveGen`.
- **메모**: `GameState`에 `hp`·`hourglass`·`rng`·`status`·`turn`·`selection` 포함. `rhythm`·`score`는 이후 단계.

### `src/core/constants.ts`
- **역할**: 게임 상수(밸런싱 값은 [미정]).
- **export**: `STEP_MS`, `DEFAULT_HOURGLASS_CAPACITY_MS`, `DAMAGE_PER_REACH`, `DEFAULT_MAX_HP`, `DEFAULT_SEED`.

### `src/core/rng.ts`
- **역할**: 결정론 위생 — `Math.random` 대신 쓰는 씨드 RNG.
- **주요 export**: `makeRng(seed)`, `nextU32(state)`, `nextInt(state, n)`.
- **성질**: 순수·정수 연산. 같은 `(seed, counter)` → 같은 값. 입력 상태 불변.

### `src/core/board.ts`
- **역할**: 좌표·점유 질의 헬퍼 + 궁성(palace) 구성.
- **헬퍼**: `eq`, `inBounds`, `pieceAt`, `isEmpty`, `isEnemyOf`, `isAllyOf`, `forward(side)`.
- **궁성**: `makePalace(side, cols, rows)`(가운데 3열 × 진영 3행 + X 대각선 라인), `inPalace`, `palaceLinesThrough`, `dedupeCoords`.

### `src/core/pieces/common.ts`
- **역할**: 이동 생성 공통 빌딩블록.
- **export**: 방향 벡터 `ORTHO`/`DIAG`/`ALL8`/`KNIGHT_JUMPS`, `step(from, dir)`, `ray(from, dir, side, state)`(슬라이딩: 빈 칸 누적 + 첫 적 잡고 멈춤).

### `src/core/pieces/chess.ts`
- **역할**: 체스 6종 `MoveGen`.
- **export**: `rook`, `bishop`, `queen`, `knight`, `king`, `pawn`.
- **메모**: 캐슬링·앙파상·더블스텝·승급 MVP 생략. 폰 전진 방향 = `forward(side)`.

### `src/core/pieces/janggi.ts`
- **역할**: 장기 7종 `MoveGen` — 규칙이 가장 빽빽한 파일.
- **export**: `chariot`, `cannon`, `horse`, `elephant`, `guard`, `general`, `soldier`.
- **까다로운 규칙**: 포(다리 하나 넘기, 포는 넘지·잡지 못함), 마/상(멱 차단), 장·사(궁성 이탈 금지, 대각은 X라인), 차·포·졸(궁성 대각선 라인 이용).

### `src/core/pieces/registry.ts`
- **역할**: `PieceKind → MoveGen` 매핑.
- **export**: `RULES`(레코드), `legalMoves(piece, state)`.

### `src/core/rules.ts`
- **역할**: 능동 잡기(이동해 들어가 적 제거 = 이동측 승).
- **export**: `canMoveTo(piece, to, state)`, `applyMove(state, pieceId, to) → { state, captured? }`.

### `src/core/threats.ts`
- **역할**: 위협 판정(코어 체크 + AI danger 공유).
- **export**: `isAttackedBy(cell, side, state)`, `playerRoyal(state)`, `isPlayerInCheck(state)`.
- **메모**: 왕 위협 시 tick이 모래시계를 강제 정지(꼼수 방지). `GameState.checked` + `check` 이벤트.

### `src/core/events.ts`
- **역할**: `tick`이 반환하는 `GameEvent` 유니온.
- **이벤트**: `selected`/`previewed`/`canceled`/`moved`/`reconciled`/`turnChanged`, `captured`(active/descent), `cycle`/`descended`/`bottomReached`/`spawned`, `rhythm`/`scored`, `hpChanged`/`check`/`gameOver`.

### `src/core/rhythm.ts`
- **역할**: 리듬 판정 — `state.timeMs`(sim 시계) 기준이라 결정론.
- **export**: `judgeAt(timeMs, rhythm)`(**perfect/good/bad/miss** 4단계), `RHYTHM_SCORE`(3/2/1/0), `beatPeriodMs`, `beatPhase01`(박자 펄스용).

### `src/core/scoring.ts`
- **역할**: 처치 점수 — 폰1·퀸5·킹/장6·그 외 3.
- **export**: `captureScore(kind)`.

### `src/core/descent.ts`
- **역할**: 일제 하강 해소 — 적 전체 `row+1`.
- **export**: `applyDescent(state) → { state, events }`.
- **규칙**: 아래쪽 적부터 결정론 처리. ① 맨아래 도달(최우선)=적 제거 + HP 감소, ② 하강 충돌=위쪽(적) 승(내 말 제거, royal이면 게임오버), ③ 빈 칸=하강, 적-적은 막힘.

### `src/core/spawn.ts`
- **역할**: 시드 기반 웨이브 스폰.
- **export**: `spawnWave(state, cycle) → { state, events }`.
- **메모**: 2단계 최소 구현(최상단 빈 열에 적 1개). 구성·난이도 [미정].

### `src/core/selection.ts`
- **역할**: 하강/스폰으로 보드가 바뀐 뒤 진행 중 `selection` 보정.
- **export**: `reconcileSelection(state) → { state, events }`.
- **규칙**: ① 선택 말 사라짐→해제, ② 합법수 재계산, ③ preview가 새 보드에서 불법이면 preview만 폐기.

### `src/core/intent.ts`
- **역할**: 이동 3단계 인텐트 처리(플레이어·AI 공용 통로).
- **export**: `applyIntent(state, intent) → { state, events }`.
- **규칙**: `select`(현재 차례 말만), `preview`(합법 칸만, 보드 불변), `confirm`(능동 잡기=이동측 승, royal 잡으면 게임오버, 턴 전환), `cancel`(preview 되돌림/선택 해제). `special`은 이후 단계.
- **점수**: `confirm`이 **플레이어**일 때만 리듬 판정(timeMs 기준)+처치 점수를 합산. AI는 항상 perfect 취급·무점수.
- **미션/티켓/콤보**: 플레이어 확정마다 `turnCount`+1, 5턴마다 미션 발생 → 충족 시 티켓+1. 잡기 후 추가 잡기 대상+티켓 있으면 콤보(`comboTo`로 잇기, 최대 3수=티켓 2장, `comboEnd`로 종료). 인텐트 `comboTo`/`comboEnd`.

### `src/core/tick.ts`
- **역할**: 코어 단일 진입점.
- **export**: `tick(state, { dt, intents? }) → { state, events }`.
- **파이프라인**: 리듬시계 전진 → 모래시계(하강·스폰) → (하강 시) selection 재조정 → 인텐트 처리 → 체크 재판정. 순수·결정론, `dt` 크면 다중 하강 누적, 게임오버 후 무동작.
- **체크 정지**: `state.checked`(왕 위협)면 모래시계 동결. 하강 중 체크되면 즉시 멈춤. 보드 변화 시 재판정 → `check` 이벤트.

### `src/core/setup.ts`
- **역할**: 초기 배치 + 시간·HP·RNG·상태 초기화.
- **export**: `Placer`(id 자동 부여 배치 빌더), `GameInit`(seed/maxHp/capacityMs/damagePerReach/리듬 윈도우), `emptyGame(cols, rows, palaces?, init?)`, `createStandardGame({ gap?, cols?, ...GameInit })`.
- **표준 진형**: 하단 장기(차마상사·장·포·졸) / 상단 체스 2줄(킹을 가운데 열 4에 정렬). 적 궁성 없음.

### `src/core/index.ts`
- **역할**: 코어 공개 API 배럴(re-export).

### `src/demo/render.ts`
- **역할**: `GameState`를 콘솔 ASCII로 그린다(확인용, 게임 렌더러 아님).
- **export**: `renderBoard(state, highlights?)` → 문자열. 말은 1글자 코드(소문자=장기/플레이어, 대문자=체스/적), `*`=강조(합법수).

### `src/demo/show.ts`
- **역할**: 합법수 데모 — 표준 진형 + 졸/차/포/마 합법수·잡기. `npm run demo`.

### `src/demo/descent.ts`
- **역할**: 하강 데모 — 작은 보드에서 사이클별 하강·충돌·맨아래 도달·HP·스폰 출력. `npm run demo:descent`.

### `src/demo/play.ts`
- **역할**: 통합 데모 — 이동 3단계 인텐트 + 능동 잡기 + 턴 교대 + 실시간 하강 섞임(적 수는 스크립트). `npm run demo:play`.

### `src/ai/heuristic.ts`
- **역할**: AI 휴리스틱(가중 평가). 매 턴 1수. 공용 Intent 통로 사용. 결정론.
- **평가 요인**: ① 잡기(말 가치×10) ② 전진(코어 쪽) ③ **하강 예측**(아래로 N칸 내려가 깔아뭉갤 내 말 자리 선호) ④ **위험 회피**(되잡히는 손해 트레이드 감점) ⑤ **잡음**(난이도별 무작위).
- **난이도 노브 `AiConfig`**: `lookaheadDescents`·`avoidDanger`·`noise`(difficulty.ts에서 옴).
- **export**: `AiConfig`, `DEFAULT_AI_CONFIG`, `aiChooseMove`, `aiRankedMoves`, `aiTakeTurn`.
- **메모**: 위험 회피는 1-ply.

### `src/ai/performer.ts`
- **역할**: AI 연출 — 후보(2·3등)를 가상이동→취소로 시연(미끼)하다 마지막에 `'commit'` 신호. 반박자마다 한 동작(박자 탐).
- **export**: `RitualAction`(`Intent | 'commit'`), `AiPerformer` — `plan(state, cfg)→boolean`, `update(dtMs)→RitualAction[]`(프레임당 0~1개).
- **메모**: 본 수는 main이 `commit`에서 `aiChooseMove`로 **현재 상태에서 새로** 계산해 `tick(dt:0)`로 적용(stale·이중 이동 방지). AI 연출 중 플레이어 입력 차단.

### `src/config/difficulty.ts`
- **역할**: 난이도 튜닝 한곳 관리. 추후 `StageScript.rules`로 흡수될 값들의 코드 프리셋.
- **export**: `DifficultyConfig`, `DIFFICULTIES`(easy/normal/hard), `ACTIVE_DIFFICULTY`.
- **항목**: 유속(`hourglassCapacityMs`)·`maxHp`·`damagePerReach`·AI `thinkMs` = [wired], 리듬 판정 윈도우·AI 노브(lookahead/avoidDanger/noise) = [pending: 빌드4·5].

### `src/demo/ai.ts`
- **역할**: AI 데모 — 양측 AI + 하강을 섞어 한 판 진행(잡기·royal 종료 관찰). `npm run demo:ai`.

---

## 테스트
- `src/core/rng.test.ts` — RNG 결정론·순수성.
- `src/core/moves.test.ts` — 합법수·잡기·표준 진형(까다로운 장기 규칙·궁성 제약 정조준).
- `src/core/tick.test.ts` — 모래시계·하강·충돌·맨아래 우선·HP·게임오버·스폰·**체크 시 정지/해제**.
- `src/core/intent.test.ts` — 이동 3단계·턴 교대·royal 즉사·selection 재조정·**점수(리듬+처치)**.
- `src/core/rhythm.test.ts` — 4단계 박자 판정·점수·처치 점수.
- `src/ai/heuristic.test.ts` — 잡기 우선·가치·전진·위험회피·하강예측·턴/패스·결정론.
- `src/ai/performer.test.ts` — 연출 시퀀스(미끼→commit)·턴 전환·패스.
- `src/replay/replay.test.ts` — 입력열 기록→재생 bit-exact 충실도·빈 틱 병합·split 등가.
- `src/core/mission-combo.test.ts` — turnCount·5턴 미션 발생·미션 완료 티켓·콤보 시작/이어가기/종료/티켓0.
- 총 **80개** 통과. 실행: `npm test` · 타입체크: `npm run typecheck` · 데모: `npm run demo`, `demo:descent`, `demo:play`, `demo:ai`.
