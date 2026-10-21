/**
 * Game audio, synthesized with Web Audio (no sample files exist yet). Everything hangs off one
 * AudioContext that is created and resumed on the first user gesture (mobile autoplay rules).
 * Sample playback for later lives in samples.ts.
 */

const STORAGE_KEY = 'berby.muted';

export interface EngineSound {
  start(): void;
  stop(): void;
  /** speedRatio: 0..1 of top speed. Off-road makes the hum rougher and duller. */
  set(speedRatio: number, onRoad: boolean): void;
}

export interface GameAudio {
  /** Create/resume the AudioContext. Call from a user gesture (also wired automatically). */
  unlock(): void;
  isMuted(): boolean;
  setMuted(muted: boolean): void;
  toggleMuted(): boolean;
  engine: EngineSound;
  /** step: 3, 2, 1. */
  countdownBeep(step: number): void;
  goTone(): void;
  resultsSting(won: boolean): void;
  /** Tab hidden / shown. */
  suspend(): void;
  resume(): void;
}

function loadMuted(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function saveMuted(muted: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, muted ? '1' : '0');
  } catch {
    /* private mode etc. */
  }
}

export function createAudio(): GameAudio {
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let muted = loadMuted();

  // Engine nodes, created with the context.
  let engineGain: GainNode | null = null;
  let engineFilter: BiquadFilterNode | null = null;
  let engineOscA: OscillatorNode | null = null;
  let engineOscB: OscillatorNode | null = null;
  let engineRunning = false;

  const ensure = (): AudioContext | null => {
    if (ctx) return ctx;
    const Ctor =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 1;
    master.connect(ctx.destination);

    engineGain = ctx.createGain();
    engineGain.gain.value = 0;
    engineFilter = ctx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 300;
    engineFilter.Q.value = 1.2;
    engineOscA = ctx.createOscillator();
    engineOscA.type = 'sawtooth';
    engineOscA.frequency.value = 50;
    engineOscB = ctx.createOscillator();
    engineOscB.type = 'square';
    engineOscB.frequency.value = 25;
    const oscBGain = ctx.createGain();
    oscBGain.gain.value = 0.35;
    // A slow wobble so the hum is not a flat tone.
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 11;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 1.5;
    lfo.connect(lfoGain);
    lfoGain.connect(engineOscA.frequency);
    engineOscA.connect(engineFilter);
    engineOscB.connect(oscBGain);
    oscBGain.connect(engineFilter);
    engineFilter.connect(engineGain);
    engineGain.connect(master);
    engineOscA.start();
    engineOscB.start();
    lfo.start();
    return ctx;
  };

  const unlock = () => {
    const c = ensure();
    if (!c) return;
    if (c.state !== 'running') {
      void c.resume().catch(() => {});
      // iOS wants an actual (silent) sound inside the gesture.
      try {
        const buffer = c.createBuffer(1, 1, 22050);
        const src = c.createBufferSource();
        src.buffer = buffer;
        src.connect(c.destination);
        src.start(0);
      } catch {
        /* ignore */
      }
    }
  };

  // Keep these listeners for the whole session: iOS may re-suspend the context after a tab
  // switch, and the next tap brings it back.
  for (const type of ['pointerdown', 'touchend', 'keydown', 'click'] as const) {
    window.addEventListener(type, unlock, { passive: true });
  }

  /** A short tone with a simple envelope. */
  const tone = (
    freq: number,
    duration: number,
    opts: { type?: OscillatorType; gain?: number; at?: number; slideTo?: number } = {},
  ) => {
    const c = ensure();
    if (!c || !master) return;
    const t0 = c.currentTime + (opts.at ?? 0);
    const osc = c.createOscillator();
    osc.type = opts.type ?? 'triangle';
    osc.frequency.setValueAtTime(freq, t0);
    if (opts.slideTo) osc.frequency.exponentialRampToValueAtTime(opts.slideTo, t0 + duration);
    const g = c.createGain();
    const peak = opts.gain ?? 0.25;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + 0.012);
    g.gain.setValueAtTime(peak, t0 + duration * 0.6);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(g);
    g.connect(master);
    osc.start(t0);
    osc.stop(t0 + duration + 0.05);
  };

  const engine: EngineSound = {
    start() {
      engineRunning = true;
      if (!ctx || !engineGain) return;
      engineGain.gain.setTargetAtTime(0.06, ctx.currentTime, 0.1);
    },
    stop() {
      engineRunning = false;
      if (!ctx || !engineGain) return;
      engineGain.gain.setTargetAtTime(0, ctx.currentTime, 0.15);
    },
    set(speedRatio, onRoad) {
      if (!engineRunning || !ctx || !engineOscA || !engineOscB || !engineFilter || !engineGain) return;
      const r = Math.max(0, Math.min(1, speedRatio));
      const t = ctx.currentTime;
      const base = 46 + r * 150;
      engineOscA.frequency.setTargetAtTime(base, t, 0.06);
      engineOscB.frequency.setTargetAtTime(base / 2, t, 0.06);
      engineFilter.frequency.setTargetAtTime(onRoad ? 260 + r * 1700 : 200 + r * 700, t, 0.08);
      engineGain.gain.setTargetAtTime((0.06 + r * 0.1) * (onRoad ? 1 : 0.85), t, 0.1);
    },
  };

  const setMuted = (m: boolean) => {
    muted = m;
    saveMuted(m);
    if (ctx && master) master.gain.setTargetAtTime(m ? 0 : 1, ctx.currentTime, 0.02);
  };

  return {
    unlock,
    engine,
    isMuted: () => muted,
    setMuted,
    toggleMuted() {
      setMuted(!muted);
      return muted;
    },
    countdownBeep(step) {
      tone(step === 1 ? 740 : 660, 0.16, { type: 'square', gain: 0.12 });
    },
    goTone() {
      tone(988, 0.55, { type: 'square', gain: 0.14 });
      tone(1319, 0.55, { type: 'triangle', gain: 0.12 });
    },
    resultsSting(won) {
      if (won) {
        const notes = [523, 659, 784, 1047];
        notes.forEach((f, i) => tone(f, 0.18, { at: i * 0.11, gain: 0.16 }));
        tone(1319, 0.7, { at: 0.46, gain: 0.14 });
        tone(784, 0.7, { at: 0.46, gain: 0.08, type: 'sine' });
      } else {
        const notes = [440, 392, 330];
        notes.forEach((f, i) => tone(f, 0.3, { at: i * 0.22, gain: 0.14, type: 'triangle' }));
        tone(262, 0.9, { at: 0.66, gain: 0.12, type: 'sawtooth', slideTo: 220 });
      }
    },
    suspend() {
      if (ctx && engineGain) engineGain.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
      void ctx?.suspend().catch(() => {});
    },
    resume() {
      if (!ctx) return;
      void ctx.resume().catch(() => {});
      if (engineRunning && engineGain) engineGain.gain.setTargetAtTime(0.06, ctx.currentTime, 0.1);
    },
  };
}
