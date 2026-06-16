# 코드맵 — 파일별 정리

> 짝 문서: [concept.md](./concept.md)(기획) · [architecture.md](./architecture.md)(설계).
> 이 문서는 **구현된 파일이 무엇을 하는가**를 추적한다. 빌드 단계가 진행될 때마다 갱신.

## 현재 단계: 빌드 5 (AI MVP — 플레이어 vs AI) ✅
(빌드 1 보드+합법수+잡기 · 2 모래시계·하강 · 3a 입력/Intent · 3b PixiJS 렌더 ✅)
적이 휴리스틱으로 매 턴 1수(잡기 우선·아니면 전진). 브라우저는 이제 플레이어 vs AI.
다음: 빌드 4 — 리듬+점수.

### AI
```
src/ai/
  heuristic.ts        휴리스틱 평가 + aiTakeTurn(공용 Intent 통로로 적 수)
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
  main.ts             브라우저 부트스트랩: 입력→Intent + rAF 루프가 tick 구동(핫시트)
  render/
    pixiBoard.ts      PixiJS 보드 렌더러(그리드↔교차 토글·하이라이트·HUD·모래시계 바)
```
- 실행: `npm run dev`(개발 서버) · `npm run build`(프로덕션 빌드).
- 입력: 클릭=선택/가상이동, 재클릭=확정, 우클릭=취소, F=바닥 토글.
- 적 차례는 `AI_THINK_MS`(450ms) 뒤 `aiTakeTurn`이 자동 수행 → 플레이어 vs AI.
- ⚠ Space 정지 토글은 브라우저 동작 확인 필요(코어 pause는 단위테스트 통과).

```
src/
  core/
    types.ts            데이터 모델(+ Hourglass·RngState·HP·status)
    constants.ts        게임 상수(STEP·capacity·damage·hp·seed)
    rng.ts              씨드 RNG(결정론 위생)
    board.ts            보드 헬퍼 + 궁성 모델
    pieces/
      common.ts         방향 벡터 + 슬라이딩 레이
      chess.ts          체스 6종 합법수
      janggi.ts         장기 7종 합법수
      registry.ts       RULES 레지스트리(종류→합법수)
    rules.ts            능동 잡기(applyMove)
    events.ts           GameEvent 유니온(+ 입력/이동 이벤트)
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

### `src/core/events.ts`
- **역할**: `tick`이 반환하는 `GameEvent` 유니온.
- **이벤트**: `selected`/`previewed`/`canceled`/`moved`/`reconciled`/`turnChanged`, `captured`(active/descent), `cycle`/`descended`/`bottomReached`/`spawned`, `hpChanged`/`gameOver`.

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

### `src/core/tick.ts`
- **역할**: 코어 단일 진입점.
- **export**: `tick(state, { dt, intents? }) → { state, events }`.
- **파이프라인**: 모래시계 전진 → 하강 → 스폰 → (하강 시) selection 재조정 → 인텐트 처리. 순수·결정론, `dt` 크면 다중 하강 누적, 게임오버 후 무동작.
- **메모**: 리듬·점수는 이후 단계에서 합류.

### `src/core/setup.ts`
- **역할**: 초기 배치 + 시간·HP·RNG·상태 초기화.
- **export**: `Placer`(id 자동 부여 배치 빌더), `GameInit`(seed/maxHp/capacityMs), `emptyGame(cols, rows, palaces?, init?)`, `createStandardGame({ gap?, cols?, ...GameInit })`.
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
- **역할**: AI 휴리스틱(MVP). 매 턴 1수 — 잡기 우선(가치 높은 대상), 아니면 코어 쪽 전진. 공용 Intent 통로 사용.
- **export**: `aiChooseMove(state, side)`, `aiTakeTurn(state)`(1수 또는 패스). 결정론.
- **메모**: 하강 예측·danger 회피·후보 탐색/취소 연출·난이도 노브는 이후 확장.

### `src/config/difficulty.ts`
- **역할**: 난이도 튜닝 한곳 관리. 추후 `StageScript.rules`로 흡수될 값들의 코드 프리셋.
- **export**: `DifficultyConfig`, `DIFFICULTIES`(easy/normal/hard), `ACTIVE_DIFFICULTY`.
- **항목**: 유속(`hourglassCapacityMs`)·`maxHp`·`damagePerReach`·AI `thinkMs` = [wired], 리듬 판정 윈도우·AI 노브(lookahead/avoidDanger/noise) = [pending: 빌드4·5].

### `src/demo/ai.ts`
- **역할**: AI 데모 — 양측 AI + 하강을 섞어 한 판 진행(잡기·royal 종료 관찰). `npm run demo:ai`.

---

## 테스트
- `src/core/rng.test.ts` — RNG 결정론·순수성(4개).
- `src/core/moves.test.ts` — 합법수·잡기·표준 진형(18개). 까다로운 장기 규칙·궁성 제약 정조준.
- `src/core/tick.test.ts` — 모래시계·하강·충돌·맨아래 우선·HP·게임오버·스폰 결정론(12개).
- `src/core/intent.test.ts` — 이동 3단계·턴 교대·royal 즉사·selection 재조정(12개).
- `src/ai/heuristic.test.ts` — 잡기 우선·가치 선호·전진·턴/패스·royal·결정론(7개).
- 실행: `npm test` · 타입체크: `npm run typecheck` · 데모: `npm run demo`, `demo:descent`, `demo:play`, `demo:ai`.
