/**
 * Kart run recordings: the player's run sampled at a fixed rate, replayed later as a ghost
 * (Ghost Lap, Hot Seat). Pure: no Three.js, no DOM, so it is tested in node.
 *
 * A recording stores position, heading and the race progress (monotonic, from RaceProgress) per
 * sample, so a ghost can be placed at any race time and the time it needed to reach any progress
 * can be looked up for a live delta. Storage: ~20 numbers per second of driving; a lap is around
 * 5000 numbers, 30 KB of JSON once quantized.
 */
import type { KartState, Vec2 } from '../../shared/types';
import { wrapAngle } from '../../shared/math';

export interface Recording {
  /** Samples per second. */
  hz: number;
  x: number[];
  z: number[];
  /** Heading per sample, radians. */
  h: number[];
  /** Race progress per sample, meters, non-decreasing. */
  p: number[];
  /** Duration of the run in seconds (the last sample may be slightly before it). */
  time: number;
}

export interface Recorder {
  /** Call every fixed step with the race time, the kart and its progress; samples itself at `hz`. */
  record(time: number, kart: KartState, progress: number): void;
  /** Finish the recording at `time` (the finish time) and return it. The recorder can be reused after reset(). */
  finish(time: number): Recording;
  reset(): void;
  /** Samples so far. */
  readonly length: number;
}

export const DEFAULT_RECORD_HZ = 20;

export function createRecorder(hz = DEFAULT_RECORD_HZ): Recorder {
  let x: number[] = [];
  let z: number[] = [];
  let h: number[] = [];
  let p: number[] = [];
  let next = 0;
  return {
    get length() {
      return x.length;
    },
    record(time, kart, progress) {
      // A sample at every 1/hz; a long step may be worth several samples, but we only keep one.
      if (time + 1e-9 < next) return;
      next = Math.floor(time * hz + 1e-6) / hz + 1 / hz;
      x.push(kart.position.x);
      z.push(kart.position.z);
      h.push(kart.heading);
      p.push(p.length ? Math.max(p[p.length - 1], progress) : progress);
    },
    finish(time) {
      return { hz, x, z, h, p, time };
    },
    reset() {
      x = [];
      z = [];
      h = [];
      p = [];
      next = 0;
    },
  };
}

/** Round every value to `decimals` places (2 ≈ centimeters) so the JSON stays small. */
export function quantize(rec: Recording, decimals = 2): Recording {
  const f = 10 ** decimals;
  const q = (v: number) => Math.round(v * f) / f;
  return {
    hz: rec.hz,
    x: rec.x.map(q),
    z: rec.z.map(q),
    h: rec.h.map((v) => q(v)),
    p: rec.p.map(q),
    time: q(rec.time),
  };
}

/** True when the value looks like a recording we can replay (storage may hold anything). */
export function isRecording(value: unknown): value is Recording {
  if (!value || typeof value !== 'object') return false;
  const r = value as Partial<Recording>;
  return (
    typeof r.hz === 'number' &&
    r.hz > 0 &&
    typeof r.time === 'number' &&
    Array.isArray(r.x) &&
    Array.isArray(r.z) &&
    Array.isArray(r.h) &&
    Array.isArray(r.p) &&
    r.x.length > 1 &&
    r.x.length === r.z.length &&
    r.x.length === r.h.length &&
    r.x.length === r.p.length
  );
}

/** A KartState to fill from a recording; make one per ghost and reuse it every frame. */
export function createGhostState(): KartState {
  return { position: { x: 0, z: 0 }, heading: 0, speed: 0, steerAngle: 0, onRoad: true };
}

/**
 * Place `out` where the recording was at race time `t` (clamped to the run), interpolating
 * between samples; the heading takes the short way round and the speed is the sample velocity,
 * which animates the ghost's wheels. Returns `out`.
 */
export function sampleRecording(rec: Recording, t: number, out: KartState): KartState {
  const n = rec.x.length;
  const s = Math.max(0, t * rec.hz);
  const i = Math.min(n - 1, Math.floor(s));
  const j = Math.min(n - 1, i + 1);
  const u = i === j ? 0 : Math.min(1, s - i);
  out.position.x = rec.x[i] + (rec.x[j] - rec.x[i]) * u;
  out.position.z = rec.z[i] + (rec.z[j] - rec.z[i]) * u;
  out.heading = rec.h[i] + wrapAngle(rec.h[j] - rec.h[i]) * u;
  out.speed = i === j ? 0 : Math.hypot(rec.x[j] - rec.x[i], rec.z[j] - rec.z[i]) * rec.hz;
  out.steerAngle = 0;
  out.onRoad = true;
  return out;
}

/** The position of the recording at time `t` (for distance checks); fills and returns `out`. */
export function positionAt(rec: Recording, t: number, out: Vec2): Vec2 {
  const n = rec.x.length;
  const s = Math.max(0, t * rec.hz);
  const i = Math.min(n - 1, Math.floor(s));
  const j = Math.min(n - 1, i + 1);
  const u = i === j ? 0 : Math.min(1, s - i);
  out.x = rec.x[i] + (rec.x[j] - rec.x[i]) * u;
  out.z = rec.z[i] + (rec.z[j] - rec.z[i]) * u;
  return out;
}

/**
 * The race time at which the recording reached `progress` (interpolated), for a live delta:
 * `timeAtProgress(best, race.playerProgress.progress) - race.time` is positive when the player
 * is ahead of the ghost. Before the first sample it is 0; past the last it is the run time.
 */
export function timeAtProgress(rec: Recording, progress: number): number {
  const p = rec.p;
  const n = p.length;
  if (n === 0) return 0;
  if (progress <= p[0]) return 0;
  if (progress >= p[n - 1]) return rec.time;
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (p[mid] <= progress) lo = mid;
    else hi = mid;
  }
  const span = p[hi] - p[lo];
  const u = span > 0 ? (progress - p[lo]) / span : 0;
  return (lo + u) / rec.hz;
}
