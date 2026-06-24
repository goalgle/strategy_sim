// 도움말(A: 항상 보기) + 첫 플레이 안내(C: 처음 한 번). 순수 DOM, 게임 로직과 무관.

const SEEN_KEY = 'strategy_sim.seenIntro';

function overlay(card: HTMLElement, closeLabel: string, onClose: () => void): void {
  const ov = document.createElement('div');
  ov.className = 'info-overlay';
  ov.appendChild(card);
  const btn = document.createElement('button');
  btn.className = 'info-close';
  btn.textContent = closeLabel;
  btn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    ov.remove();
    onClose();
  });
  ov.appendChild(btn);
  document.body.appendChild(ov);
}

/** A — 전체 도움말(메뉴에서 언제든). */
export function showHelp(): void {
  const card = document.createElement('div');
  card.className = 'info-card';
  card.innerHTML = `
    <h2>도움말</h2>
    <h3>🎯 목표</h3>
    <p>위에서 내려오는 적을 막아내며 <b>점수</b>를 쌓는다. 끝은 없고 <b>죽기 전까지 최대 점수</b>가 목표.</p>
    <h3>🕹️ 조작</h3>
    <ul>
      <li><b>탭</b> = 말 선택 → 갈 곳 <b>탭</b>(가상이동) → <b>재탭</b>으로 확정</li>
      <li><b>빈 곳 탭</b> 또는 하단 <b>취소</b> 버튼 = 무르기</li>
    </ul>
    <h3>🏔️ 보드 & 하강</h3>
    <ul>
      <li>아래 = 내 <b>장기</b>, 위 = 적 <b>체스</b>. 둘 다 원래 규칙대로 움직인다.</li>
      <li>모래시계(상단 바)가 차면 적이 <b>한 칸 내려온다</b>. 가만히 막으면 내 말이 진다 → <b>내려오기 전에 먼저 잡아라</b>.</li>
      <li>적이 <b>맨 아래</b>에 닿으면 <b>HP 감소</b>. HP 0 = 게임오버.</li>
    </ul>
    <h3>🎵 리듬 & 점수</h3>
    <ul>
      <li>우상단 점이 <b>박자</b>. 박자에 맞춰 두면 보너스: PERFECT 3 · GOOD 2 · BAD 1 · MISS 0.</li>
      <li>처치 점수: 폰 1 · 일반 3 · 퀸 5 · 킹 6. (처치 + 리듬 합산)</li>
    </ul>
    <h3>🎫 미션 & 콤보</h3>
    <ul>
      <li><b>5턴마다 미션</b>(중앙 배너) → 완료하면 <b>티켓</b> 획득.</li>
      <li><b>콤보</b>: 잡은 직후 또 잡을 적이 있고 티켓이 있으면 <b>빨간 칸</b>이 뜬다 → 탭해서 연속 잡기(최대 3번, 티켓 2장).</li>
    </ul>
    <h3>✨ 특수기능 (티켓 소모)</h3>
    <ul>
      <li><b>⏸ 정지</b>(티켓 1): 5초간 하강을 멈춘다.</li>
      <li><b>🤖 자동3수</b>(티켓 2): 자동으로 내 말 3개를 최선으로 움직인다.</li>
    </ul>
    <h3>👑 왕 위협</h3>
    <p>적이 내 <b>왕(將)</b>을 잡을 수 있는 위치에 오면 <b>시간이 멈춘다</b>. 직접 수를 둬서 막아야 함(왕이 잡히면 즉시 패배).</p>
    <h3>⌨️ 단축키</h3>
    <p><b>F</b> 바닥 토글 · <b>Space</b> 모래시계 정지 · <b>M</b> 음악</p>
  `;
  overlay(card, '닫기', () => {});
}

/** C — 첫 플레이 핵심 안내(처음 한 번). onStart로 게임 시작. */
export function showIntroIfFirst(onStart: () => void): void {
  if (localStorage.getItem(SEEN_KEY)) {
    onStart();
    return;
  }
  const card = document.createElement('div');
  card.className = 'info-card';
  card.innerHTML = `
    <h2>처음이신가요? 핵심만!</h2>
    <h3>1. 막아내기</h3>
    <p>위에서 적(체스)이 <b>한 칸씩 내려온다</b>. 맨 아래 닿으면 HP가 깎여요. <b>내려오기 전에 먼저 잡으세요.</b></p>
    <h3>2. 말 옮기기</h3>
    <p><b>탭</b>으로 내 말 선택 → 갈 곳 <b>탭</b> → 같은 곳 <b>재탭</b>으로 확정. (무르기는 빈 곳 탭/취소 버튼)</p>
    <h3>3. 박자 타기</h3>
    <p>우상단 점이 <b>박자</b>. 박자에 맞춰 두면 <b>점수 보너스</b>가 붙어요(PERFECT!).</p>
    <h3>4. 미션·콤보</h3>
    <p>5턴마다 <b>미션</b>(중앙 배너) → <b>티켓</b> 획득. 티켓으로 <b>콤보(연속 잡기)</b>와 <b>특수기능</b>을 쓸 수 있어요.</p>
    <p style="margin-top:14px; opacity:0.7;">더 자세한 건 메뉴의 <b>도움말</b>에서 언제든 볼 수 있어요.</p>
  `;
  overlay(card, '시작!', () => {
    localStorage.setItem(SEEN_KEY, '1');
    onStart();
  });
}
