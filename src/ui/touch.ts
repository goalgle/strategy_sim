// 모바일 브라우저 기본 줌 동작 차단(더블탭 줌·핀치 줌).
// iOS Safari는 viewport user-scalable=no·touch-action을 무시하므로 JS로 직접 막는다.
// 한 번만 호출(앱 시작 시).
export function preventMobileZoom(): void {
  // 1) 더블탭 줌 — 300ms 내 두 번째 touchend의 기본 동작 차단.
  let lastTouchEnd = 0;
  document.addEventListener(
    'touchend',
    (e) => {
      const now = Date.now();
      if (now - lastTouchEnd <= 300) e.preventDefault();
      lastTouchEnd = now;
    },
    { passive: false },
  );

  // 2) 더블클릭(데스크톱/일부 모바일) 줌 차단.
  document.addEventListener('dblclick', (e) => e.preventDefault(), { passive: false });

  // 3) 핀치 줌 — iOS Safari 제스처 이벤트 차단.
  for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
    document.addEventListener(type, (e) => e.preventDefault(), { passive: false });
  }
}
