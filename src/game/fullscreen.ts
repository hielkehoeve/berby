/**
 * Best-effort fullscreen + landscape lock. iOS Safari supports neither for a web page, Android
 * Chrome supports both (the orientation lock needs fullscreen first). Failures are ignored.
 */
export async function enterLandscapeFullscreen(): Promise<void> {
  const root = document.documentElement;
  try {
    if (!document.fullscreenElement && typeof root.requestFullscreen === 'function') {
      await root.requestFullscreen({ navigationUI: 'hide' });
    }
  } catch {
    /* not supported or denied */
  }
  try {
    const orientation = screen.orientation as ScreenOrientation & { lock?: (type: string) => Promise<void> };
    if (orientation && typeof orientation.lock === 'function') {
      await orientation.lock('landscape');
    }
  } catch {
    /* not supported, not fullscreen, or denied */
  }
}
