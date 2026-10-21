/** A tiny wall clock in seconds, built on performance.now(). */
export interface Clock {
  /** Seconds since the clock was created (not counting nothing; it is wall time). */
  now(): number;
  /**
   * Seconds since the previous tick(), clamped to maxDelta so a long pause (tab switch,
   * debugger) never turns into a giant simulation step.
   */
  tick(): number;
  /** Forget the previous tick so the next one reports ~0. Call when resuming from a pause. */
  reset(): void;
}

export function createClock(maxDelta = 0.25): Clock {
  const origin = performance.now();
  let last = origin;
  return {
    now: () => (performance.now() - origin) / 1000,
    tick() {
      const t = performance.now();
      const dt = (t - last) / 1000;
      last = t;
      return dt < 0 ? 0 : dt > maxDelta ? maxDelta : dt;
    },
    reset() {
      last = performance.now();
    },
  };
}
