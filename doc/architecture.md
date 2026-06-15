# 구현 설계서 — Architecture (초안)

> 짝 문서: [concept.md](./concept.md) (게임 기획). 이 문서는 **어떻게 만들 것인가**.
> 한 줄: **순수·결정론적 시뮬레이션 코어** 위에 렌더/입력/리듬을 얹고, 모든 콘텐츠를 **스크립트(데이터)로 구동**하는 웹 게임.

---

## 스택 (확정)
- **언어/빌드**: **TypeScript + Vite**. 12종 말 규칙·판정 엔진의 버그를 타입으로 줄이고, **시뮬 코어를 클라(브라우저) ↔ 서버(Node, 리플레이 검증)가 그대로 공유**.
- **렌더링**: **PixiJS (WebGL 2D Canvas)**. 리듬 연출·하강 애니메이션·다수 말 이동에 적합. 바닥 **그리드↔교차 토글**은 뷰 레이어에서 처리.
- **백엔드**: **MVP는 로컬 전용**(localStorage로 점수/시드). 리더보드·UGC 서버는 게임플레이 완성 후 추가. → 결정론 코어를 미리 만들어 두면 나중에 서버 검증을 그 위에 얹기만 하면 됨.

## 핵심 설계 원칙
1. **독립된 3개의 시계**: 턴 / 모래시계 / 리듬은 서로 기다리지 않는다. → **고정 타임스텝 루프 + 이벤트 버스**로 각 시계를 tick, 이벤트를 버스로 전파.
2. **결정론적 코어**: 시뮬 코어는 **렌더 의존 0, 시드 RNG**. 같은 (날짜 시드 + 입력열) → 같은 결과. 이게 **데일리 공정성 + 점수 검증(리플레이 재시뮬)** 의 토대.
3. **데이터 드리븐**: 스테이지·튜토리얼·컷신·UGC는 전부 **스크립트(데이터)**. 엔진 = "스크립트 실행기". 데일리 미션과 유저 스테이지가 동일 포맷·동일 파이프라인.
4. **렌더/입력 분리**: 입력은 의도(intent)를 코어에 전달, 코어가 상태를 갱신, 렌더는 상태를 그림. 단방향 흐름.

## 3개의 시계 (game loop)
| 시계 | 구동 | 책임 | 비고 |
|---|---|---|---|
| **턴 시계** | 이벤트 (플레이어 1수 ↔ AI 1수) | 말 교환·AI 응수 | 시간이 아니라 행동으로 진행 |
| **모래시계** | 실시간 타이머 (충전→이벤트→리셋) | 일제 하강·스폰, **사이클 카운터** | 리듬과 **무관**, 턴 안 넘겨도 흐름 |
| **리듬 시계** | BPM 그리드 (고정 박자) | 입력 판정(Just/근접), AI 박자, SFX | 차트 기반, 오디오는 동기 재생만 |

## 4층 아키텍처
```
┌─ script        스크립트 인터프리터 — 스테이지/튜토리얼/컷신 = 데이터 (척추, 후순위 구현)
├─ core          시뮬레이션 코어 — 순수 TS, 시드 RNG, 보드·말·하강·점수 (클라/서버 공용)
├─ render/input/rhythm   PixiJS 렌더 + 3단계 입력 + 박자 판정
└─ state         데일리 시드, 로컬 리더보드 (MVP: localStorage)
```

## 모듈 구조 (제안)
```
src/
  core/                # 순수 시뮬레이션 (렌더 의존 0)
    types.ts           # Coord, Piece, Side, GameState ...
    rng.ts             # 시드 RNG (결정론)
    board.ts           # 9열 × N행 통합 좌표 그리드
    pieces/
      chess.ts         # 킹/퀸/룩/비숍/나이트/폰 합법수
      janggi.ts        # 궁/차/포/마/상/사/졸 합법수 (궁성·다리 규칙)
      registry.ts      # 말 타입 → 이동 생성 함수 매핑
    rules.ts           # 잡기, 하강 충돌(위쪽 승), 맨아래 도달 우선
    hourglass.ts       # 모래시계 사이클 + 카운터
    spawn.ts           # 시드 기반 웨이브 스폰
    scoring.ts         # 처치(폰1/일반3/퀸5/킹6) + 리듬(Just3/근접2) 합산
    sim.ts             # 코어 오케스트레이터: tick(state, intents) → state'
  engine/
    loop.ts            # 고정 타임스텝 루프
    clock.ts           # 3개 시계 tick
    events.ts          # 이벤트 버스
  rhythm/
    bpm.ts             # BPM 그리드(박자 타임라인)
    judge.ts           # Just / 근접 / 빗나감 판정
  render/
    boardView.ts       # 보드 그리기
    pieceView.ts       # 말 스프라이트·애니메이션
    floorToggle.ts     # 그리드형 ↔ 교차형
  input/
    moveInput.ts       # 선택 → 가상이동 → 확정/취소 (3단계)
  ai/
    heuristic.ts       # horde 휴리스틱 (코어와 엔진 공유)
  state/
    daily.ts           # 날짜 → 시드
    leaderboard.ts     # localStorage 개인 최고점
  script/              # (후순위) 스크립트 인터프리터
    interpreter.ts
  main.ts              # 부트스트랩
```

## 코어 데이터 모델 (타입 스케치)
> 아직 코드가 아니라 **합의용 스케치**. 모든 모듈이 이 타입을 공유한다. (`src/core/types.ts`)

### 좌표계
```ts
// 9열 × N행 통합 그리드. 장기 "교차점"도 같은 (col,row)로 표현 — 렌더만 다름(그리드↔교차 토글).
// row 0 = 최상단(적 스폰), row 증가 = 아래로(플레이어 쪽). 하강 = row+1.
// 최하단 행(row === rows-1) 도달 = 코어 침범 → HP 감소(잡기보다 우선).
interface Coord { col: number; row: number; }   // col: 0..cols-1, row: 0..rows-1
```

### 진영 · 말
```ts
type Side   = 'player' | 'enemy';     // player=하단 디펜스, enemy=상단 공격(하강)
type Family = 'chess'  | 'janggi';    // 규칙 계열 + 점수 분류(폰/일반 구분 등)

type PieceKind =
  // 체스
  | 'king' | 'queen' | 'rook' | 'bishop' | 'knight' | 'pawn'
  // 장기
  | 'general' | 'chariot' | 'cannon' | 'horse' | 'elephant' | 'guard' | 'soldier';

interface Piece {
  id: string;        // 안정적 식별자(애니메이션·리플레이 추적용)
  kind: PieceKind;
  family: Family;     // kind에서 파생되나 명시 보관
  side: Side;
  at: Coord;
  isRoyal: boolean;   // king/general → 잡히면 즉사(패배 ②)
}
```

### 모래시계 · 리듬
```ts
interface Hourglass {
  capacity: number;   // 가득 차는 데 필요한 양(ms 기준, 단위는 [미정])
  progress: number;   // 0..capacity
  cycle: number;      // 몇 번째 뒤집힘 — 사이클 카운터(난이도·스폰 구동)
  paused: boolean;    // 정지 기능(액션 #2) 발동 시 true
}

type RhythmJudge = 'just' | 'near' | 'miss';   // 입력 박자 판정
interface Rhythm {
  bpm: number;
  originMs: number;        // 박자 기준 시각(t=0 정렬)
  justWindowMs: number;    // Just 허용 오차
  nearWindowMs: number;    // 근접 허용 오차
}
```

### 이동 3단계(선택 상태) · 턴
```ts
type Turn = 'player' | 'enemy';

interface Selection {        // 진행 중인 한 번의 이동(선택→가상이동→확정/취소)
  pieceId: string;
  legal: Coord[];            // 합법 후보지
  preview?: Coord;           // 가상 이동 위치(미확정). 확정 전까지 보드 상태 불변
}
```

### 점수 · 상태 · RNG
```ts
interface Score { total: number; captures: number; }

interface RngState { seed: number; counter: number; }   // 순수 함수형 진행(결정론)

interface GameState {
  cols: number; rows: number;
  pieces: Piece[];           // (대안: Map<id,Piece> — 조회 빈도 보고 결정)
  hp: number; maxHp: number;
  turn: Turn;
  selection?: Selection;     // 없으면 대기 상태
  hourglass: Hourglass;
  rhythm: Rhythm;
  score: Score;
  rng: RngState;
  status: 'playing' | 'over';
  overReason?: 'hp' | 'royal';
}
```

### 입력(Intent) — 코어로 들어가는 단일 통로
```ts
// 플레이어와 AI가 같은 Intent 스트림으로 코어에 입력된다(연출 차이는 렌더에서).
type Intent =
  | { t: 'select';  pieceId: string; rhythm: RhythmJudge }
  | { t: 'preview'; to: Coord;       rhythm: RhythmJudge }   // 가상 이동
  | { t: 'confirm';                  rhythm: RhythmJudge }   // 확정(점수 정산)
  | { t: 'cancel' }                                          // 우클릭 취소
  | { t: 'special'; action: number; payload?: unknown };     // 특수기능(액션 #2~#5)
```

### 이동 생성 · 점수 규칙(인터페이스)
```ts
// 말 종류별 합법수 생성을 한 패턴으로 등록 — "혼종"이라도 종류별 분기일 뿐.
type MoveGen = (piece: Piece, state: GameState) => Coord[];
const RULES: Record<PieceKind, MoveGen>;          // src/core/pieces/registry.ts

function captureScore(kind: PieceKind): number;   // pawn=1, queen=5, royal(king/general)=6, 그 외=3
const RHYTHM_SCORE: Record<RhythmJudge, number>;  // just=3, near=2, miss=0
```

### tick 계약 — 코어의 단일 진입점
```ts
// 순수 함수: 같은 (state, input) → 같은 (state', events). 부수효과·렌더 의존 0.
// → 클라(플레이)와 서버(리플레이 재시뮬 검증)가 동일 함수를 호출.
function tick(state: GameState, input: {
  dt: number;          // 경과 ms (모래시계 progress 전진)
  intents: Intent[];   // 이 프레임의 입력(플레이어/AI)
}): { state: GameState; events: GameEvent[] };   // events는 렌더/SFX용(하강·잡기·HP감소·게임오버…)
```

### 스케치 단계 미결
- **`Hourglass.capacity` 단위**: ms vs 박자 수(리듬과 무관하므로 ms 유력).
- **`pieces` 컨테이너**: 배열 vs `Map<id,Piece>` (좌표 조회 빈도 측정 후).
- **불변/가변**: `tick`을 순수(불변 갱신)로 둘지, 성능 위해 내부 가변+외부 불변 계약으로 둘지.
- **AI Intent 주입 시점**: 턴 시계가 AI 차례를 열 때 `intents`에 합성.

## 이동 생성 (RULES 레지스트리)
혼종이라도 **말 종류별 순수 함수**로 분기할 뿐. 각 함수는 `(piece, state) → 합법 도착 좌표[]`. (`src/core/pieces/`)

### 인터페이스 + 보드 헬퍼
```ts
type MoveGen = (piece: Piece, state: GameState) => Coord[];
const RULES: Record<PieceKind, MoveGen>;     // pieces/registry.ts

// 보드 질의 (core/board.ts) — 모든 MoveGen이 공유
inBounds(c, state): boolean
pieceAt(c, state): Piece | undefined
isEmpty(c, state): boolean
isEnemyOf(c, side, state): boolean           // c에 상대 말이 있는가
isAllyOf(c, side, state): boolean
forward(side): -1 | 1                          // player= -1(위로, 적진 향함), enemy= +1(아래로, 하강 방향)
```

### 공통 패턴
- **슬라이딩 레이(ray)** — 룩·비숍·퀸·차: 한 방향으로 빈 칸을 누적하다 **첫 상대 말이면 그 칸까지(잡기) 포함하고 멈춤**, 아군 말이면 직전까지.
  ```ts
  ray(from, dir, side, state): Coord[]   // dir ∈ {상하좌우 / 대각}
  ```
- **다리(screen) 점프** — 장기 포 전용: 경로상 **정확히 하나의 '다리'(넘을 말)** 필요.
- **멱(leg block)** — 장기 마·상: 중간 칸이 막히면 불가.

### 체스 6종
| kind | 규칙 | 비고 |
|---|---|---|
| `rook` | 직교 4방향 레이 | |
| `bishop` | 대각 4방향 레이 | |
| `queen` | 룩+비숍 | |
| `knight` | 8개 L자 점프(중간 무시) | |
| `king` | 인접 8칸 1보 | `isRoyal` — 잡히면 즉사. 캐슬링 없음 |
| `pawn` | `forward(side)` 1칸 전진(빈 칸), 전진 대각 잡기 | 더블스텝·앙파상·승급 **MVP 생략** → [미정] |

### 장기 7종
| kind | 규칙 | 까다로운 점 |
|---|---|---|
| `chariot`(차) | 직교 레이(룩과 동일) | 궁성 안에선 **대각선 라인** 따라도 이동 |
| `cannon`(포) | 직교로 **다리 하나를 넘어** 그 너머 빈 칸(이동)/상대 말(잡기) | **다리도 잡을 대상도 '포'면 불가** — 포는 포를 넘거나 잡지 못함. 궁성 대각도 다리 있으면 가능 |
| `horse`(마) | 직교 1보 + 바깥 대각 1보(체스 나이트형) | **멱**: 직교 1보 칸이 막히면 불가(점프 아님) |
| `elephant`(상) | 직교 1보 + 대각 2보 | **멱 2지점**: 중간 두 칸 중 하나라도 막히면 불가 |
| `guard`(사) | 궁성 안 1보(라인 따라, 대각 포함) | **궁성 3×3 밖으로 못 나감** |
| `general`(장/궁) | 궁성 안 1보(라인 따라, 대각 포함) | `isRoyal` — 즉사 대상. **궁성 밖 금지** |
| `soldier`(졸/병) | `forward` 1칸 또는 옆 1칸(후진 없음) | 궁성 안에선 대각 라인도 가능 |

### 궁성(palace) 모델
- 궁성은 **보드 메타데이터**: `palaces: { side: Side; cells: Coord[9]; diagonals: [Coord,Coord][] }[]`.
  - `cells` = 3×3 9점, `diagonals` = X자 라인(중앙 ↔ 네 귀퉁이) — **대각 이동은 이 라인 위에서만** 허용.
- 표준 데일리: **플레이어 궁성 = 하단**, 적(체스)은 궁성 없음. (혼종/UGC에서 적 장기말·상단 궁성도 가능 → 데이터로 기술)
- `general`·`guard`는 `cells` 밖 좌표를 합법수에서 제외. `chariot`/`cannon`/`soldier`의 대각 이동은 현재 칸+목표 칸이 같은 `diagonals` 라인일 때만.

### 방향(forward) 처리
- `pawn`·`soldier`의 전진 방향은 `side`로 결정: **player = 위로(row-1)**, **enemy = 아래로(row+1)**.
- 주의: 이건 **이동 규칙상의 전진**이고, 모래시계 **하강(적 일제 row+1)** 과는 별개 메커니즘.

### 생략 / [미정]
- 체스: 캐슬링·앙파상·폰 더블스텝·승급 — **MVP 생략**(필요 시 추가).
- **체크/체크메이트 미모델링**: 왕은 그냥 "잡히면 즉사". 합법수는 자기 왕 노출 여부를 따지지 않음(요격 게임 특성).
- 9열 보드의 **체스 2줄 8칸 정렬**(가운데/끝 열 처리)은 초기 배치 데이터에서 결정.

## tick 파이프라인 (한 프레임의 처리 순서)
`tick`은 한 프레임에서 **정해진 순서**로 단계를 밟는다. 순서가 곧 규칙 — "맨 아래 도달 우선", "하강 충돌은 위쪽 승"이 어느 단계에서 적용되는지가 핵심.

```
tick(state, {dt, intents}):
  1. 특수기능/정지 반영      ── 'special' 인텐트 먼저(정지=hourglass.paused, 적 말 강제이동 등)
  2. 모래시계 전진           ── !paused면 progress += dt
                               progress >= capacity 인 동안 반복(렉 스파이크 대비):
                                 cycle++ ; progress -= capacity ; 하강이벤트 큐잉
  3. 하강 적용 (이벤트 시)    ── 아래 "하강 해소" 순서대로
  4. 스폰                    ── 시드 RNG로 cycle에 맞는 웨이브를 상단에 생성
  5. selection 재조정         ── 하강/스폰으로 보드가 바뀌었으면 진행 중 selection 보정(아래 "재조정")
  6. 인텐트 처리(이동)        ── select / preview / confirm / cancel (아래 "이동 해소")
  7. 게임오버 판정            ── royal 피격→즉시 over(royal) ; hp<=0→over(hp)
  8. events 반환             ── 렌더/SFX용(하강·잡기·HP감소·스폰·게임오버)
```

### 하강 해소 (3단계) — "맨 아래 우선"이 사는 곳
적 말을 **아래쪽 행부터** 처리(겹침 모호성 제거). 각 적 말 `row → row+1` 시도 시:

```
도착 행이 최하단(row === rows-1)에 닿음?
  └─ 예 → ★맨 아래 도달(최우선): hp -= DAMAGE_PER_REACH ; 해당 적 제거
          (그 칸에 내 말이 있어도 '잡기'가 아니라 '코어 침범'으로 처리)
  └─ 아니오 → 도착 칸에 내 말이 있나?
        └─ 예 → 하강 충돌: ★위쪽(적) 승 — 내 말 제거, 적이 그 칸 차지
        └─ 아니오 → 그냥 한 칸 내려감
```
- 적-적 충돌은 진형이 통째로 내려가므로 기본적으로 없음(스폰 타이밍만 주의).
- `DAMAGE_PER_REACH`는 밸런싱 상수 → [미정].

### 이동 해소 (인텐트) — "능동 잡기는 이동측 승"
```
select  : selection = { pieceId, legal: RULES[kind](piece, state) }   (보드 불변)
preview : selection.preview = to   (합법일 때만, 보드 여전히 불변 — '가상 이동')
confirm : 말을 preview로 이동
          └─ 도착 칸에 상대 말? → ★능동 잡기: 이동측 승, 상대 제거
                                 score += captureScore(targetKind) + RHYTHM_SCORE[judge]
          └─ 빈 칸?            → 이동만, score += RHYTHM_SCORE[judge]
          selection = undefined ; 턴 전환(player↔enemy)
cancel  : selection.preview = undefined  (되돌림, 점수·턴 변화 없음)
```
- **핵심 비대칭**: 같은 칸의 충돌이라도 **능동 잡기(이동측 승)** vs **하강 충돌(위쪽 승)** 이 갈린다 → "내려오기 전에 먼저 잡아라"가 규칙으로 구현됨.
- AI도 동일 경로: 턴 시계가 적 차례를 열면 휴리스틱이 `select→preview→(필요시 cancel)→confirm` 인텐트를 흘림.

### 하강 ↔ 진행 중 이동(selection) 재조정
모래시계는 턴과 무관하게 흐르므로 **`select`~`confirm` 사이에 하강이 발생**할 수 있다. 그러면 진행 중인 `selection`(후보지·가상이동)이 옛 보드를 가리키게 되어 보정이 필요하다. (하강은 **적(공격측) 말에만** 적용 — 플레이어 말은 하강하지 않음을 전제)

**두 경우로 갈린다:**
- **적(AI)이 이동 중**: 선택한 적 말 자신이 `row+1`로 내려간다. `selection.pieceId`(안정 id)는 유효하나 **위치가 바뀜** → 후보지·preview를 새 위치 기준으로 다시 봐야 함. ※ 그 적 말이 하강 충돌/맨아래 도달로 **제거**될 수도 있음.
- **플레이어가 이동 중**: 선택한 내 말은 제자리(하강 안 함). 그러나 **주변 적이 내려와 보드가 변함** → 후보지가 달라지거나, preview 칸이 새로 적에게 점유될 수 있음(비잡기→잡기로 바뀌거나, 경로 차단).

**재조정 정책(제안):** 하강/스폰 직후 활성 `selection`이 있으면 —
```
1) 선택한 말이 아직 보드에 존재? ── 아니오(제거됨) → selection 폐기
2) legal = RULES[kind](piece, state)  ── 새 보드·새 위치로 재계산
3) preview가 새 legal에 포함? ── 예: 유지 / 아니오: preview만 폐기(말 선택은 유지, 재지정 유도)
```
- 점수·턴 정산은 **`confirm` 시점에만** 일어나므로, 중간 하강이 끼어도 최종 결과는 일관.
- **대안(추종 모드)**: 적 말이 한 칸 내려갈 때 preview 목표도 한 칸 따라 내리는 방식 — 부드럽지만 의도와 어긋날 수 있어 [미정], 플레이로 검증.
- **연출**: 재조정으로 preview가 깨지면 "취소음" 또는 별도 피드백으로 사용자에게 알림(특히 사람 플레이어).

### 순서에 대한 설계 노트
- **하강(3·4)을 인텐트(5)보다 먼저** 처리 → "고민하는 사이 닥쳐오는 압박"이 내 수보다 우선 반영(기획 의도와 일치).
- 단, 이 순서는 **게임 필(feel)을 좌우**하므로 플레이로 검증 후 조정 가능 → [미정].
- `dt`가 커서 한 프레임에 모래시계가 여러 번 넘칠 수 있음 → 2단계 while로 **하강 누적 적용**(결정론 유지).

## 이벤트 목록 (GameEvent)
`tick`은 상태를 갱신하면서 **무슨 일이 일어났는지**를 `GameEvent[]`로 반환한다(직접 emit하지 않음 → 순수성·결정론 유지). 루프가 이를 버스로 흘려 **렌더·SFX·UI**가 구독한다. 검증(서버 리플레이)은 이벤트가 필요 없다 — 최종 점수만 비교.

```ts
type GameEvent =
  // 입력/이동 3단계
  | { t: 'selected';   pieceId: string; legal: Coord[] }
  | { t: 'previewed';  pieceId: string; to: Coord }
  | { t: 'canceled';   pieceId: string }
  | { t: 'moved';      pieceId: string; from: Coord; to: Coord }
  // 전투
  | { t: 'captured';   by: string; targetKind: PieceKind; at: Coord;
                       mode: 'active' | 'descent'; gained: number }   // active=이동측 승, descent=위쪽 승
  // 모래시계/하강/스폰
  | { t: 'cycle';      cycle: number }                                 // 모래시계 뒤집힘
  | { t: 'descended';  movedIds: string[] }                            // 적 일제 하강
  | { t: 'bottomReached'; pieceId: string; damage: number }           // 코어 침범(최우선)
  | { t: 'spawned';    pieceIds: string[]; cycle: number }
  // 자원/점수
  | { t: 'hpChanged';  hp: number; delta: number }
  | { t: 'scored';     total: number; delta: number; reason: 'capture' | 'rhythm' }
  | { t: 'rhythm';     judge: RhythmJudge }                            // SFX·이펙트용
  // 진행
  | { t: 'reconciled'; pieceId?: string; previewDropped: boolean }     // 하강으로 selection 보정
  | { t: 'special';    action: number }
  | { t: 'gameOver';   reason: 'hp' | 'royal'; score: number };
```
- **순서**: 한 tick 안에서 파이프라인 단계 순으로 events가 쌓여 그 순서대로 반환된다.
- **렌더는 이벤트로 트윈을 재생**한다(예: `moved` → 스프라이트 from→to 애니메이션). 즉 sim 상태가 진실, 렌더는 이벤트에 반응하는 시각 레이어.

## 엔진 루프 (고정 타임스텝)
**왜 고정 타임스텝인가**: 가변 프레임타임으로 sim을 굴리면 같은 입력이 기기마다 다른 결과를 낳는다. **결정론(리플레이·데일리 공정성)** 을 위해 sim은 **고정 STEP(ms)** 단위로만 전진한다. 렌더는 그와 별개로 rAF에서 부드럽게.

```ts
const STEP = 1000 / 30;          // sim 틱 레이트(예: 30Hz 고정) — 렌더 fps와 무관
let acc = 0, prev = now();
let step = 0;                     // 진행된 sim 스텝 수(리듬·리플레이 기준 시계)

function frame(now) {
  acc += now - prev; prev = now;
  while (acc >= STEP) {
    const intents = inputQueue.drainFor(step);     // 이 스텝에 귀속된 입력(아래 '리듬·결정론')
    const r = tick(state, { dt: STEP, intents });
    state = r.state;
    bus.emitAll(r.events);                          // 렌더/SFX/UI로 전파
    if (state.status === 'over') { /* 점수 등록 흐름 */ }
    acc -= STEP; step++;
  }
  render(state, acc / STEP);     // 보간 알파(트윈 진행도). 그리드/교차 토글도 여기서
  requestAnimationFrame(frame);
}
```

### 두 개의 시계 — sim vs 렌더
| | sim 루프 | 렌더 루프 |
|---|---|---|
| 구동 | 고정 STEP(예 30Hz) | rAF(디스플레이 주사율) |
| 역할 | 권위 상태·결정론 | 이벤트 기반 트윈·보간·토글 |
| 진실 | `GameState` | 없음(상태의 시각 표현일 뿐) |

- 그리드 게임이라 픽셀 보간보다 **이벤트 트윈**(moved/descended/captured)이 주된 애니메이션. 보간 알파는 진행 중 트윈을 매끄럽게 하는 보조.

### 리듬·결정론과 입력 귀속
- **리듬 판정은 sim 시계 기준**: 입력이 들어온 `step`을 BPM 그리드(`originMs`, `bpm`)에 비춰 `just/near/miss` 산정 → 벽시계가 아니라 step 기반이라 **재현 가능**.
- **입력 귀속**: 각 인텐트는 **어느 step에 적용됐는지**와 함께 기록된다. 리플레이 = `(seed, [(step, intent)…])` 만으로 동일 재생.
- **일시정지(모래시계 정지, 액션 #2)**: `tick` 내부에서 `progress`만 안 늘림(루프는 계속 돎 — 턴·입력은 살아있음). 전체 멈춤(메뉴)은 `tick` 호출 자체를 중단.

### 이벤트 버스
```ts
interface Bus {
  on<T extends GameEvent['t']>(t: T, fn: (e: Extract<GameEvent,{t:T}>) => void): () => void;
  emitAll(events: GameEvent[]): void;
}
```
- 구독자: `render`(트윈), `audio`(SFX/박자), `ui`(HP·점수·사이클·게임오버). `tick`은 버스를 모름 → 테스트·검증 시 순수 호출 가능.

## 스크립트 포맷 (데이터 드리븐의 척추)
**엔진 = 스크립트 실행기.** 데일리 미션·튜토리얼·컷신·UGC가 전부 **같은 포맷**이고 동일 파이프라인을 탄다. 포맷은 **JSON(선언형)** — DSL이 아니라.

> **왜 JSON인가**: (1) 작성·파싱·검증·직렬화 단순, (2) **URL 임베드**(압축+base64)로 공유 가능 → 웹/URL 접근성과 합치, (3) **코드 실행 없음 → UGC 보안** (임의 코드 eval 위험 제거). DSL은 추후 작성 편의용 상위 레이어로만 검토.

포맷은 두 층이다: **① 스테이지 정의(선언형 데이터)** + **② 시퀀스(시간·조건 기반 명령열)**.

### ① 스테이지 정의 — 무엇을 만들까(정적)
```ts
interface StageScript {
  version: number;
  meta: { id: string; title: string; author?: string; createdAt?: string };
  board: {
    cols: number; rows: number;            // 9 × N (완충 ~10행 포함)
    palaces?: PalaceDef[];                  // 궁성 위치(측별)
    floorDefault?: 'grid' | 'intersection';
  };
  setup: {
    preset?: 'standard-janggi-vs-chess';    // 표준 진형 단축(하단 장기 / 상단 체스 2줄)
    pieces?: PiecePlacement[];              // 또는 명시 배치 {kind, side, at, isRoyal?}
    handicaps?: Handicap[];                 // 차/마 떼기 등 {side, removeKind, count}
  };
  rules: {
    allowedActions: number[];               // 그날 허용 특수기능(액션 #2~#5)
    aiDifficulty: 'easy' | 'normal' | 'hard' | number;  // 연출 제약 강도
    hourglass: { capacityMs: number };      // 모래시계 유속(압박 속도)
    variants?: string[];                    // 특수/변형 규칙 플래그
    scoring?: Partial<ScoringRule>;          // 점수 변형(선택)
  };
  spawn: {
    seed?: number;                          // 없으면 날짜 시드(데일리). UGC는 명시 가능
    waves?: WaveDef[];                      // 사이클별 구성(없으면 절차적+시드)
  };
  intro?: Sequence;                          // 시작 컷신/나레이션(선택)
  triggers?: Trigger[];                      // 조건 → 시퀀스 (튜토리얼·이벤트·미션)
}
```

### ② 시퀀스 — 시간/조건에 따라 무엇을 할까(동적)
튜토리얼·컷신·나레이션·이벤트를 **명령 리스트**로 표현. 인터프리터가 위에서 순차 실행.
```ts
type Command =
  | { c: 'say'; speaker?: string; text: string }            // 나레이션/대사
  | { c: 'wait'; ms?: number; forAction?: Intent['t'] }      // 시간 또는 플레이어 행동 대기
  | { c: 'highlight'; cells?: Coord[]; pieceId?: string }    // 강조(튜토리얼)
  | { c: 'spawnPieces'; pieces: PiecePlacement[] }
  | { c: 'movePiece'; pieceId: string; to: Coord }           // 스크립트가 말 제어(컷신)
  | { c: 'setHourglass'; paused?: boolean; capacityMs?: number }
  | { c: 'allowActions'; actions: number[] }                 // 튜토리얼 단계별 허용 토글
  | { c: 'goal'; text: string; check: TriggerCond };          // 미니 목표 제시
type Sequence = Command[];

interface Trigger { when: TriggerCond; once?: boolean; run: Sequence }
type TriggerCond =
  | { on: 'cycle';    eq: number }
  | { on: 'turn';     every?: number; eq?: number }          // 5턴마다 미션 → {every:5}
  | { on: 'score';    gte: number }
  | { on: 'captured'; kind?: PieceKind; count?: number }
  | { on: 'bottomReached' };
```

### 인터프리터 ↔ sim 관계
- **셋업**: `board`+`setup`+`rules` → 초기 `GameState` 빌드(시드 포함).
- **런타임**: `triggers`는 **GameEvent를 구독**(cycle/turn/score/captured…) → 조건 충족 시 `Sequence` 실행.
- **시퀀스 명령 → 코어로**: `movePiece`는 인텐트로 주입(또는 컷신 한정 직접 적용), `setHourglass`는 정지/유속 변경, `wait.forAction`은 **플레이어가 X를 할 때까지 진행 차단**(튜토리얼 게이트), `say/highlight`는 표현 레이어.
- 인터프리터는 **코어 위(above)** 에 있다 — 코어는 스크립트를 모르고, 인터프리터가 인텐트/명령으로 코어를 운전.

### 기획 기능과의 매핑
| 기획 요소 | 스크립트 표현 |
|---|---|
| 데일리 미션 | `StageScript`(날짜 시드) 한 개 |
| 5턴마다 미션 | `Trigger { when:{on:'turn', every:5}, run:[…보상…] }` |
| 핸디캡(차 떼기) | `setup.handicaps` |
| 모래시계 유속 | `rules.hourglass.capacityMs` |
| 사용 가능 특수기능 | `rules.allowedActions` |
| 튜토리얼 | `intro` 또는 `triggers`의 `Sequence`(say/highlight/wait/goal) |
| 컷신 | `Sequence`(say/movePiece/spawnPieces) |
| **UGC 스테이지** | **유저가 작성한 `StageScript` JSON** (별도 시스템 아님) |

### 설계 노트 / [미정]
- **결정론 경계**: 점수에 영향 주는 부분(board/setup/rules/spawn, 그리고 scored 중 `movePiece`)은 **결정론 스트림 안**에 있어야 리플레이 검증 가능. 순수 연출(say/highlight)은 표현 레이어라 무관.
- **검증**: UGC는 JSON 스키마로 **로드 시 검증**(좌표 범위·말 수·왕 존재 등) → 깨진/악의적 입력 거부.
- **공유(웹)**: MVP는 JSON import/export(붙여넣기/파일). 이후 URL 임베드(압축+base64) 또는 서버 저장 후 id 공유.
- **버전**: `version` 필드로 포맷 진화 대비(구 스크립트 호환).
- DSL·비주얼 에디터는 후순위(이 JSON 위에 얹는 저작 도구).

## 데일리 시드 + 리플레이 (공정성·검증) — [후순위]
> **구현 시점**: 이 섹션의 **"기능"(Replay 기록·`verify`·`dailySeed`·리더보드·3판·localStorage·서버)은 게임이 재밌어진 뒤로 연기**한다. 시뮬 코어와 함께 짊어지면 덩치만 커지고 게임 집중을 방해.
> **단, 결정론은 "기능"이 아니라 "성질"** — 아래 *결정론 위생*(씨드 RNG·고정 STEP·순수 tick·정수 연산)은 **1단계부터 지킨다**. 거의 공짜이고, 나중에 retrofit하려면 코어 전체에서 `Math.random`/`Date.now`/float를 사냥해야 함.
>
> **지금 가져갈 최소(≈공짜)**: ① `rng.ts` 씨드 RNG를 `Math.random` 대신 사용(개발용 하드코딩 시드 OK) · ② 고정 STEP 루프 · ③ `tick` 순수(events 반환) · ④ 정수 연산.
> **연기**: `Replay`·`verify`·`dailySeed`·리더보드·3판 제한·localStorage·scriptHash·서버 — 위 4가지만 지켜두면 나중에 *얹기만* 하면 됨.

"같은 날 = 모두 같은 판"과 "점수 조작 방지"를 **결정론**으로 푼다. 핵심 원칙: **서버는 클라가 보낸 점수를 절대 믿지 않고, 입력열을 재시뮬해 점수를 스스로 산출**한다.

### 시드 유도 (날짜 → 시드)
```ts
// UTC 일(日) 경계로 전세계 동일 시드 → 데일리 공정성
function dailySeed(dateUTC: string /* 'YYYY-MM-DD' */, salt = GAME_SALT): number;
```
- **리셋 경계 = UTC 자정**(또는 고정 리셋 시각) → [미정, 단 전세계 단일 시드 보장이 목적].
- 같은 시드 → **같은 스폰·핸디캡·AI 행동**. 데일리 `StageScript`도 이 시드로 생성/고정.

### 시드 RNG — 단일 출처, 용도별 서브스트림
```ts
interface RngState { seed: number; counter: number }
function nextU32(s: RngState): { value: number; state: RngState }   // 순수·정수, Math.random 금지

// 용도별 분리 → 추론 단순(스폰 순서가 AI 결정에 안 엉킴)
function subStream(master: number, name: 'spawn' | 'ai' | 'stage'): RngState;
```
- 모든 무작위는 이 스트림에서만 추출. **추출 시점·순서가 결정론**이라 입력열만으로 재현.
- AI 타이브레이크도 `ai` 서브스트림에서 → **AI는 결정론** → 리플레이에 AI 수를 기록할 필요 없음(재생성).

### 리플레이 포맷 — 플레이어 입력만 기록
```ts
interface Replay {
  version: number;        // sim 버전(규칙 호환 핀)
  date: string;           // 'YYYY-MM-DD' — 시드 유도원
  scriptId: string;       // 플레이한 StageScript
  scriptHash: string;     // UGC 변조 방지: 스크립트 내용 해시
  stepMs: number;         // 고정 STEP — 검증 측과 동일해야 함
  inputs: InputRecord[];  // 플레이어 인텐트만 (AI·스폰은 결정론 재생성)
}
interface InputRecord { step: number; action: PlayerAction }   // 리듬 judge는 step+bpm으로 재계산
type PlayerAction =
  | { t: 'select'; pieceId: string } | { t: 'preview'; to: Coord }
  | { t: 'confirm' } | { t: 'cancel' }
  | { t: 'special'; action: number; payload?: unknown };
```
- **AI 수·스폰은 기록 안 함** — 시드로 재생성되므로. 리플레이는 보통 작다(플레이어 입력만).
- **judge도 기록 안 함** — `step`을 BPM 그리드에 비춰 재계산(단일 출처).

### 검증 프로토콜 (서버, 후순위 — 설계만)
```ts
function verify(replay: Replay): { score: number; ok: boolean } {
  // 1. scriptHash로 StageScript 무결성 확인
  // 2. dailySeed(replay.date)로 시드 복원 → 빈 GameState 빌드
  // 3. inputs를 step에 맞춰 tick 재생(dt=stepMs 고정), AI/스폰 결정론 재생성
  // 4. 산출 점수를 '진짜 점수'로 사용 — 클라 주장 점수는 무시
  // 5. 불법 인텐트·비정상 입력률·게임오버 미도달 → ok=false
}
```
- **클라 점수 = 즉시 표시용일 뿐**, 권위는 재시뮬 결과.
- 동일 sim 번들을 클라/서버가 공유(데이터 모델의 "코어 공용" 전제) → 결과 일치 보장.

### 결정론 주의사항
- **정수 연산 우선**: 좌표·`hourglass.progress`(ms)·점수는 정수. **float·`Math.random`·`Date.now` 금지**(시드만 사용).
- **고정 STEP**: 가변 프레임타임이 sim에 새지 않게(루프 섹션 참조).
- **버전 핀**: 규칙 변경 시 `version`↑ → 옛 리플레이는 옛 sim으로만 검증.

### MVP (로컬 전용)
```ts
// state/daily.ts
todaySeed(): number;                       // dailySeed(오늘 UTC)
// state/leaderboard.ts  (localStorage)
interface DailyRecord { date: string; bestScore: number; playsUsed: number; replays: Replay[] }
canPlayToday(): boolean;                    // playsUsed < 3 (하루 3판)
submitLocal(score: number, replay: Replay): void;  // 개인 최고점 갱신 + 리플레이 보관(후일 업로드용)
```
- 로컬에선 검증이 무의미(자기 기기) — 그러나 **리플레이를 지금부터 쌓아두면** 서버 도입 시 그대로 업로드·검증 가능.
- 하루 3판 제한·개인 최고점 갱신은 `DailyRecord`로.

### [미정]
- 리셋 시각(UTC 자정 vs 고정 시각), 서브스트림 분리 범위, 입력률 상한·이상탐지 규칙, 리플레이 압축·URL 임베드 방식, 부정 클라이언트(서버 권위 도입 시점).

## AI 휴리스틱 (horde)
풀스펙 엔진 불필요. **가중 평가로 수를 고르는** 휴리스틱. 같은 엔진을 **플레이어 자동 제안 스킬(액션 #4)** 도 호출(아래 "엔진 공유"). (`src/ai/heuristic.ts`)

### 역할 정리
- AI = 적(공격측). **매 턴 1수**(턴 시계)를 둔다 — 이건 모래시계의 **일제 하강(자동·전체)** 과 **별개**.
- 즉 AI의 한 수 = 적 말 하나를 RULES대로 이동(잡기 또는 포지셔닝). 하강 압박은 그 위에 자동으로 더해짐.

### 평가 함수 (move scoring)
```ts
// side로 매개변수화 → 플레이어 자동스킬도 재사용
function evaluateMove(move: Move, state: GameState, side: Side, cfg: AiConfig): number;

// 가중 합산 요인
//  + 잡기 가치   captureScore(targetKind) × W_CAPTURE     (royal 잡기 = 거대 가중)
//  + 전진 이득   advanceTowardCore(move) × W_ADVANCE       (적은 아래로 = 코어/HP 위협에 가까워짐)
//  - 위험        danger(move.to, state, side) × W_DANGER    (다음 상대 수에 잡힐 자리인가)
//  + 미래 가치   positionalValue(predictDescent(move.to, n), state) × W_FUTURE  (★하강 예측)
//  + 지원/제어   supportsOtherAttackers(...) × W_SUPPORT
//  + noise(cfg)                                            (난이도 잡음)
```

### danger & 하강 예측 — 진짜 난점
```ts
// 위험: 도착 칸이 '상대의 다음 능동 잡기' 사정권인가 (상대 RULES로 역질의)
function danger(cell: Coord, state: GameState, side: Side): number;

// ★ 하강 예측: 포지셔닝(비-잡기) 수의 가치는 '지금'이 아니라 '하강 후'에 있다.
//   적 말은 모래시계마다 row+1 → n번 하강 후 위치를 평가.
function predictDescent(at: Coord, n: number): Coord;   // { col, row + n } (경계·도달 처리)
```
- **잡기 수**: 즉시 효과 → 단순(`danger`만 보면 됨).
- **포지셔닝 수**: `predictDescent`로 **미래 칸에서의 위협·도달·정렬**을 평가해 선배치. (예: 룩을 어떤 열에 둬서 2회 하강 후 내 말과 정렬되게)
- 예측 깊이 `n`: 모래시계 유속 ÷ 턴 페이스에 연동, 보통 1~2 → [미정].
- 상대 응수까지 깊게 보지 않음(1-ply 근사) — horde답게 얕고 빠르게.

### 후보 3개 + 연출(ritual) 인텐트 생성
AI는 내부적으로 답을 알아도 **즉답 금지** — 사람처럼 시연(기획). 동일 Intent 통로로 흘린다.
```
plan(state):
  cands = top-3 moves by evaluateMove(...)          // 후보 ~3개
  for m in cands (best→worst):
     emit select(m.pieceId)                          // (리듬 박자에 스냅)
     emit preview(m.to)
     if danger(m.to) 높음 OR score < 임계:           // 죽음뿐 아니라 '수의 질'도 취소 사유
        emit cancel ; continue                        // 다음 후보로
     emit confirm ; return                            // 안전·이득 수 확정
```
- **박자 강제**: 각 intent는 BPM 그리드의 박자 step에 스냅(AI는 리듬 준수 의무).
- **연출 중 하강 끼어듦**: 선택한 적 말이 하강으로 이동/제거될 수 있음 → tick의 **selection 재조정**이 처리, 필요 시 재계획.
- 취소는 일부 연출이지만 **실제 점수(danger·score)에 근거** → "알지만 보여주며 두는" 일관성.

### 난이도 노브 (AiConfig)
난이도 = **계산력이 아니라 연출 제약·평가 정확도**(기획).
| 난이도 | W_FUTURE(하강예측) | noise | danger 깊이 | 취소-후-개선 |
|---|---|---|---|---|
| easy | ~0 (예측 안 함) | 큼 | 얕음 | 자주 생략(나쁜 수 통과) |
| normal | 보통 | 보통 | 보통 | 가끔 |
| hard | 큼 (풀 예측) | ~0 | 깊음 | 항상 최선 |
- `aiDifficulty`(스크립트 `rules`)가 이 노브로 매핑.

### 엔진 공유 — 플레이어 자동 제안 스킬(#4)
- 같은 `evaluateMove`/`plan`을 **`side='player'`** 로 호출 → 액션 #4가 추천 수·자동 3수 처리.
- **비대칭 주의**: 플레이어 말은 **하강 안 함** → 플레이어용 `predictDescent`는 *자기 말 이동*이 아니라 **적 하강으로 바뀌는 보드**를 반영(전진 방향도 위로). danger는 적 능동 잡기 + 하강 충돌 둘 다.

### [미정]
- 가중치 `W_*` 초기값·튜닝, 예측 깊이 `n` 산정식, 후보 수(3 고정 vs 가변), 취소 연출 빈도 곡선, 평가 캐싱(성능).

## 빌드 순서 — 수직 슬라이스 (각 단계가 플레이 가능)
> **전제 — 결정론 위생은 1단계부터**: 씨드 RNG(`rng.ts`, 개발용 하드코딩 시드)·고정 STEP 루프·순수 `tick`·정수 연산을 처음부터 지킨다. **데일리/리플레이 "시스템"은 게임이 재밌어진 뒤로 연기**(위 [후순위] 섹션 참조). 둘을 분리하는 게 핵심.

1. **코어 기초**: 보드 모델 + 말별 합법수(체스/장기) + 잡기 규칙. *(씨드 RNG·순수 tick 토대 마련)*
2. **모래시계·하강**: 하강·스폰·충돌 판정(위쪽 승, 맨아래 우선). *(고정 STEP 루프)*
3. **렌더+입력**: 보드 그리기(그리드↔교차) + 3단계 이동. → **첫 플레이어블**.
4. **리듬+점수**: 박자 판정 + 처치·리듬 점수 합산.
5. **턴+AI**: 휴리스틱 horde(연출·취소 연기). → **상대가 응수**. ← *여기까지가 "게임 자체"*
6. **스크립트 포맷 + 스테이지 로드**: 선언형 StageScript로 셋업 구동(미션/핸디캡).
--- 이하 후순위(게임이 재밌어진 뒤) ---
7. **데일리 시드 + 로컬 리더보드**: `dailySeed`·3판·개인 최고점(localStorage).
8. **리플레이 기록 + UGC 공유** → (이후) 백엔드 재시뮬 검증.

## 미정 / 다음 결정거리 (구현)
- **스크립트 포맷**: JSON vs DSL. 무엇을 노출할지(배치·규칙·이벤트·컷신·모래시계 유속).
- **결정론 보장 범위**: 부동소수점·애니메이션 타이밍과 시뮬 tick의 분리 방식.
- **리플레이 포맷**: 입력열 인코딩, 서버 재시뮬 검증 프로토콜.
- **에셋**: 말 스프라이트(체스/장기 12종), 사운드(선택/이동/확정/취소·박자), BGM 차트.
- **9열 보드의 체스 2줄 배치**(8칸 정렬 처리).
