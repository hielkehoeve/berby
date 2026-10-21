import * as THREE from 'three';

export interface GameRenderer {
  renderer: THREE.WebGLRenderer;
  canvas: HTMLCanvasElement;
  /** Current drawing-buffer aspect ratio (width / height). */
  aspect(): number;
  /** Re-read the viewport size and resize the drawing buffer. */
  resize(): void;
  /** Subscribe to size changes (also fires once on subscribe). Returns an unsubscribe. */
  onResize(listener: (width: number, height: number) => void): () => void;
  dispose(): void;
}

/** Phones get a lower pixel-ratio cap: the fill rate on a 3x screen is the usual bottleneck. */
export function isPhoneLike(): boolean {
  const ua = navigator.userAgent;
  if (/Android|iPhone|iPad|iPod|Mobile/i.test(ua)) return true;
  // iPadOS reports itself as a Mac; a coarse pointer with multi-touch gives it away.
  return navigator.maxTouchPoints > 1 && window.matchMedia('(pointer: coarse)').matches;
}

export function createRenderer(container: HTMLElement): GameRenderer {
  const canvas = document.createElement('canvas');
  canvas.id = 'game';
  canvas.className = 'game-canvas';
  container.appendChild(canvas);

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: 'high-performance',
    alpha: false,
    stencil: false,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isPhoneLike() ? 1.5 : 2));
  renderer.shadowMap.enabled = true;
  // PCFSoftShadowMap was removed in three 0.186; PCF with the world's normalBias looks soft enough.
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const listeners = new Set<(w: number, h: number) => void>();
  let width = 1;
  let height = 1;

  const measure = () => {
    // visualViewport follows the real visible area on phones (URL bar, fullscreen transitions).
    const vv = window.visualViewport;
    const w = Math.round(vv?.width ?? window.innerWidth) || window.innerWidth;
    const h = Math.round(vv?.height ?? window.innerHeight) || window.innerHeight;
    return { w: Math.max(1, w), h: Math.max(1, h) };
  };

  const resize = () => {
    const { w, h } = measure();
    if (w === width && h === height) return;
    width = w;
    height = h;
    // updateStyle=false: CSS keeps the canvas at 100% of the viewport.
    renderer.setSize(w, h, false);
    for (const l of listeners) l(w, h);
  };

  // Orientation changes report the old size for a frame or two on some browsers; re-measure
  // again shortly after.
  let settleTimer = 0;
  const onOrientation = () => {
    resize();
    clearTimeout(settleTimer);
    settleTimer = window.setTimeout(resize, 250);
    window.setTimeout(resize, 600);
  };

  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', onOrientation);
  window.visualViewport?.addEventListener('resize', resize);
  document.addEventListener('fullscreenchange', onOrientation);
  screen.orientation?.addEventListener?.('change', onOrientation);

  // Force the first measurement.
  width = 0;
  resize();

  return {
    renderer,
    canvas,
    aspect: () => width / height,
    resize,
    onResize(listener) {
      listeners.add(listener);
      listener(width, height);
      return () => listeners.delete(listener);
    },
    dispose() {
      window.removeEventListener('resize', resize);
      window.removeEventListener('orientationchange', onOrientation);
      window.visualViewport?.removeEventListener('resize', resize);
      document.removeEventListener('fullscreenchange', onOrientation);
      screen.orientation?.removeEventListener?.('change', onOrientation);
      listeners.clear();
      renderer.dispose();
      canvas.remove();
    },
  };
}
