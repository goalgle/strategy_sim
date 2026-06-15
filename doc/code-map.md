# 코드맵 — 파일별 정리

> 짝 문서: [concept.md](./concept.md)(기획) · [architecture.md](./architecture.md)(설계).
> 이 문서는 **구현된 파일이 무엇을 하는가**를 추적한다. 빌드 단계가 진행될 때마다 갱신.

## 현재 단계: 빌드 1 (보드 + 합법수 + 잡기) ✅

```
src/
  core/
    types.ts            데이터 모델(타입)
    rng.ts              씨드 RNG(결정론 위생)
    board.ts            보드 헬퍼 + 궁성 모델
    pieces/
      common.ts         방향 벡터 + 슬라이딩 레이
      chess.ts          체스 6종 합법수
      janggi.ts         장기 7종 합법수
      registry.ts       RULES 레지스트리(종류→합법수)
    rules.ts            능동 잡기(applyMove)
    setup.ts            표준 진형 + 배치 헬퍼
    index.ts            코어 공개 API(배럴)
  demo/
    render.ts           ASCII 보드 렌더러(콘솔 확인용)
    show.ts             실행 데모 스크립트
```

---

## 파일별 상세

### `src/core/types.ts`
- **역할**: 모든 모듈이 공유하는 데이터 모델.
- **주요 타입**: `Coord`, `Side`(player/enemy), `Family`(chess/janggi), `PieceKind`(13종), `Piece`, `PalaceDef`, `Board`, `GameState`, `MoveGen`.
- **메모**: 1단계 최소 집합. `hp`·`hourglass`·`rhythm` 등은 이후 단계에서 `GameState`에 추가.

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
- **메모**: 하강 충돌·맨아래 우선 등은 이후 tick 파이프라인(2단계).

### `src/core/setup.ts`
- **역할**: 초기 배치.
- **export**: `Placer`(id 자동 부여 배치 빌더), `emptyGame(cols, rows, palaces?)`, `createStandardGame({ gap?, cols? })`.
- **표준 진형**: 하단 장기(차마상사·장·포·졸) / 상단 체스 2줄(킹을 가운데 열 4에 정렬). 적 궁성 없음.

### `src/core/index.ts`
- **역할**: 코어 공개 API 배럴(re-export).

### `src/demo/render.ts`
- **역할**: `GameState`를 콘솔 ASCII로 그린다(확인용, 게임 렌더러 아님).
- **export**: `renderBoard(state, highlights?)` → 문자열. 말은 1글자 코드(소문자=장기/플레이어, 대문자=체스/적), `*`=강조(합법수).

### `src/demo/show.ts`
- **역할**: 실행 데모 — 표준 진형과 특정 말의 합법수를 출력. `node src/demo/show.ts`로 실행.

---

## 테스트
- `src/core/rng.test.ts` — RNG 결정론·순수성(4개).
- `src/core/moves.test.ts` — 합법수·잡기·표준 진형(18개). 까다로운 장기 규칙·궁성 제약 정조준.
- 실행: `npm test` · 타입체크: `npm run typecheck`.
