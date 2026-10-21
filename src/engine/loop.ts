import { createClock } from './clock';

export interface LoopCallbacks {
  /** Called at a fixed rate (default 60 Hz) with the fixed dt. Run the simulation here. */
  fixedStep(dt: number): void;
  /** Called once per animation frame. dt is the real frame time, elapsed the loop's run time. */
  render(dt: number, elapsed: number): void;
  /** The document was hidden; the loop stops ticking until it is visible again. */
  onPause?(): void;
  onResume?(): void;
}

export interface LoopOptions {
  /** Fixed simulation step in seconds. */
  step?: number;
  /** Cap on simulation steps per frame, so a slow frame never spirals into more slow frames. */
  maxSteps?: number;
}

export interface GameLoop {
  start(): void;
  stop(): void;
  readonly running: boolean;
}

/**
 * Fixed-timestep game loop: the simulation advances in constant steps from an accumulator,
 * rendering happens on every requestAnimationFrame, and everything pauses while the tab is
 * hidden (no simulation time passes in the background).
 */
export function createLoop(callbacks: LoopCallbacks, options: LoopOptions = {}): GameLoop {
  const step = options.step ?? 1 / 60;
  const maxSteps = options.maxSteps ?? 5;
  const clock = createClock(step * maxSteps);

  let running = false;
  let paused = false;
  let frameId = 0;
  let accumulator = 0;
  let elapsed = 0;

  const frame = () => {
    if (!running || paused) return;
    frameId = requestAnimationFrame(frame);

    const dt = clock.tick();
    elapsed += dt;
    accumulator += dt;

    let steps = 0;
    while (accumulator >= step && steps < maxSteps) {
      callbacks.fixedStep(step);
      accumulator -= step;
      steps++;
    }
    // If we hit the cap, drop the backlog instead of trying to catch up forever.
    if (steps === maxSteps && accumulator > step) accumulator = 0;

    callbacks.render(dt, elapsed);
  };

  const resume = () => {
    if (!running) return;
    paused = false;
    clock.reset();
    accumulator = 0;
    cancelAnimationFrame(frameId);
    frameId = requestAnimationFrame(frame);
    callbacks.onResume?.();
  };

  const pause = () => {
    if (!running || paused) return;
    paused = true;
    cancelAnimationFrame(frameId);
    callbacks.onPause?.();
  };

  const onVisibility = () => {
    if (document.hidden) pause();
    else resume();
  };

  return {
    get running() {
      return running;
    },
    start() {
      if (running) return;
      running = true;
      paused = false;
      document.addEventListener('visibilitychange', onVisibility);
      clock.reset();
      accumulator = 0;
      frameId = requestAnimationFrame(frame);
      if (document.hidden) pause();
    },
    stop() {
      if (!running) return;
      running = false;
      document.removeEventListener('visibilitychange', onVisibility);
      cancelAnimationFrame(frameId);
    },
  };
}
