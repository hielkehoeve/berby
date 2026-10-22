/**
 * The tide model: pure functions of race time and the player's distance, so every rule of the
 * mode (the speed ramp, the gap, the catch, the warning, the lap message, the best) is tested in
 * node. No Three.js, no DOM.
 *
 * The tide is a point on the track centerline in the same monotonic progress units as
 * RaceProgress.progress. It starts `startGap` meters behind the player's grid progress and moves
 * at tideSpeedAt(t); gap = player progress − tide progress, and the run is over when gap ≤ 0.
 */
import type { ModeHud } from '../types';
import { formatLapTime } from '../../ui/format';
import { TIDE_TUNING, type TideTuning } from './tuning';

/** Tide speed at race time t: startSpeed, plus speedStep every rampInterval, capped at maxSpeed. */
export function tideSpeedAt(t: number, tuning: TideTuning = TIDE_TUNING): number {
  const { startSpeed, speedStep, rampInterval, maxSpeed } = tuning;
  if (t <= 0) return Math.min(startSpeed, maxSpeed);
  const steps = Math.floor(t / rampInterval);
  return Math.min(maxSpeed, startSpeed + steps * speedStep);
}

/** Meters the tide has travelled since GO: the integral of tideSpeedAt(), in closed form. */
export function tideTravelled(t: number, tuning: TideTuning = TIDE_TUNING): number {
  const { startSpeed, speedStep, rampInterval, maxSpeed } = tuning;
  if (t <= 0) return 0;
  const n = Math.floor(t / rampInterval);
  // Number of ramp steps after which the cap applies.
  const capSteps = speedStep > 0 ? Math.max(0, Math.ceil((maxSpeed - startSpeed) / speedStep)) : Infinity;
  const m = Math.min(n, capSteps);
  let d = (startSpeed * m + (speedStep * m * (m - 1)) / 2) * rampInterval;
  if (n > capSteps) d += maxSpeed * (n - capSteps) * rampInterval;
  return d + tideSpeedAt(t, tuning) * (t - n * rampInterval);
}

/** Meters between the player and the tide at race time t, given the player's distance since the grid. */
export function tideGap(t: number, distance: number, tuning: TideTuning = TIDE_TUNING): number {
  return tuning.startGap + distance - tideTravelled(t, tuning);
}

/** The tide's progress (RaceProgress.progress units) at race time t, for a player who started at startProgress. */
export function tideProgressAt(t: number, startProgress: number, tuning: TideTuning = TIDE_TUNING): number {
  return startProgress - tuning.startGap + tideTravelled(t, tuning);
}

/**
 * A kart's grid progress from its centerline distance in [0, length): the grid sits a few meters
 * before the start line, which RaceProgress reports as a small negative progress.
 */
export function unwrapGridDistance(distance: number, length: number): number {
  return distance > length / 2 ? distance - length : distance;
}

/** What a step of the run reported; combine the flags with |. */
export const TIDE_EVENT = {
  none: 0,
  /** The gap just dropped under warnGap. */
  warn: 1,
  /** A new lap started. */
  lap: 2,
  /** The tide caught the player: the run is over. */
  caught: 4,
} as const;

/** The state of one run, updated every fixed step; frozen once the tide has caught the player. */
export interface TideRun {
  /** Race time of the last update. */
  time: number;
  /** Meters covered since the grid. */
  distance: number;
  gap: number;
  /** Highest lap reached. */
  lap: number;
  /** Race time until which the lap message shows. */
  lapMessageUntil: number;
  inWarning: boolean;
  caught: boolean;
  /** Race time at which the tide caught the player. */
  caughtAt: number;
}

export function createTideRun(tuning: TideTuning = TIDE_TUNING): TideRun {
  const run = {} as TideRun;
  resetTideRun(run, tuning);
  return run;
}

export function resetTideRun(run: TideRun, tuning: TideTuning = TIDE_TUNING): void {
  run.time = 0;
  run.distance = 0;
  run.gap = tuning.startGap;
  run.lap = 1;
  run.lapMessageUntil = -1;
  run.inWarning = false;
  run.caught = false;
  run.caughtAt = 0;
}

/**
 * One fixed step: the race time, the player's distance since the grid and the current lap.
 * Returns TIDE_EVENT flags. Does nothing once the tide has caught the player.
 */
export function updateTideRun(
  run: TideRun,
  time: number,
  distance: number,
  lap: number,
  tuning: TideTuning = TIDE_TUNING,
): number {
  if (run.caught) return TIDE_EVENT.none;
  let events: number = TIDE_EVENT.none;
  run.time = time;
  run.distance = distance;
  run.gap = tideGap(time, distance, tuning);
  // The highest lap seen: reversing over the line and crossing it again is not a new lap.
  if (lap > run.lap) {
    run.lap = lap;
    run.lapMessageUntil = time + tuning.lapMessageSeconds;
    events |= TIDE_EVENT.lap;
  }
  const warning = run.gap < tuning.warnGap;
  if (warning && !run.inWarning) events |= TIDE_EVENT.warn;
  run.inWarning = warning;
  if (run.gap <= 0) {
    run.caught = true;
    run.caughtAt = time;
    events |= TIDE_EVENT.caught;
  }
  return events;
}

/** The gap pill: '🌊 24 m', or '⚠️ 8 m' inside the warning zone. Never negative. */
export function formatGap(gap: number, tuning: TideTuning = TIDE_TUNING): string {
  const m = Math.max(0, Math.round(gap));
  return gap < tuning.warnGap ? `⚠️ ${m} m` : `🌊 ${m} m`;
}

/** The distance pill, rounded to distanceRounding meters. Never negative. */
export function formatDistance(distance: number, tuning: TideTuning = TIDE_TUNING): string {
  const r = tuning.distanceRounding;
  return `${Math.max(0, Math.round(distance / r) * r)} m`;
}

/** The status line under the pills; '' hides it. The warning beats the lap message. */
export function tideStatus(run: TideRun, tuning: TideTuning = TIDE_TUNING): string {
  if (run.caught) return 'Washed out!';
  if (run.time < tuning.introSeconds) return 'The tide is rising…';
  if (run.inWarning) return 'Faster!';
  if (run.time < run.lapMessageUntil) return `Lap ${run.lap}!`;
  return '';
}

/** The three pills and the status; the center keeps the default timer. */
export function tideHud(run: TideRun, tuning: TideTuning = TIDE_TUNING): ModeHud {
  return {
    left: formatGap(run.gap, tuning),
    right: formatDistance(run.distance, tuning),
    status: tideStatus(run, tuning),
  };
}

export interface TideResult {
  headline: string;
  won: true | null;
  rows: [string, string][];
  /** True when the distance beats previousBest; `best` is then the distance to save. */
  newBest: boolean;
  /** Best distance after this run, whole meters. */
  best: number;
}

/** The results card from the run's distance, the time survived and the saved best (0 when none). */
export function tideResults(distance: number, timeSurvived: number, previousBest: number): TideResult {
  const d = Math.max(0, Math.round(distance));
  const newBest = d > previousBest;
  const best = Math.max(d, previousBest);
  return {
    headline: newBest ? 'New best!' : 'Washed out!',
    won: newBest ? true : null,
    rows: [
      ['Distance', `${d} m`],
      ['Time survived', formatLapTime(timeSurvived)],
      ['Best distance', `${best} m`],
    ],
    newBest,
    best,
  };
}
