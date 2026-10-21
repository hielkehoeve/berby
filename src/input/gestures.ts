/**
 * Turn the page into a game surface: no double-tap zoom, no pinch zoom, no text selection,
 * no context menu on long press, no pull-to-refresh or overscroll bounce.
 * CSS does most of the work (touch-action: none, user-select: none, overscroll-behavior);
 * these listeners cover what CSS cannot on iOS Safari.
 */
export function suppressBrowserGestures(target: HTMLElement = document.documentElement): () => void {
  const prevent = (e: Event) => {
    if (e.cancelable) e.preventDefault();
  };
  // Pull-to-refresh / rubber band scrolling.
  const onTouchMove = (e: TouchEvent) => {
    if (e.cancelable) e.preventDefault();
  };
  // Double-tap zoom on older iOS: block a second touchstart within 300 ms.
  let lastTouchEnd = 0;
  const onTouchEnd = (e: TouchEvent) => {
    const now = performance.now();
    if (now - lastTouchEnd < 300 && e.cancelable) e.preventDefault();
    lastTouchEnd = now;
  };
  // Keyboard shortcuts that scroll or zoom the page during desktop play.
  const onKeyDown = (e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && (e.key === '+' || e.key === '-' || e.key === '=' || e.key === '0')) {
      e.preventDefault();
    }
  };

  const opts: AddEventListenerOptions = { passive: false };
  target.addEventListener('touchmove', onTouchMove, opts);
  target.addEventListener('touchend', onTouchEnd, opts);
  target.addEventListener('contextmenu', prevent);
  target.addEventListener('selectstart', prevent);
  target.addEventListener('dragstart', prevent);
  target.addEventListener('dblclick', prevent);
  target.addEventListener('wheel', (e) => (e.ctrlKey ? prevent(e) : undefined), opts);
  // iOS Safari pinch gestures (non-standard events; harmless elsewhere).
  target.addEventListener('gesturestart', prevent, opts);
  target.addEventListener('gesturechange', prevent, opts);
  target.addEventListener('gestureend', prevent, opts);
  window.addEventListener('keydown', onKeyDown);

  return () => {
    target.removeEventListener('touchmove', onTouchMove);
    target.removeEventListener('touchend', onTouchEnd);
    target.removeEventListener('contextmenu', prevent);
    target.removeEventListener('selectstart', prevent);
    target.removeEventListener('dragstart', prevent);
    target.removeEventListener('dblclick', prevent);
    target.removeEventListener('gesturestart', prevent);
    target.removeEventListener('gesturechange', prevent);
    target.removeEventListener('gestureend', prevent);
    window.removeEventListener('keydown', onKeyDown);
  };
}
