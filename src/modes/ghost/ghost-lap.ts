/**
 * Ghost Lap logic, headless: the best run saved on the device, the live delta against it and the
 * status line. Pure functions tested in node; index.ts wires them into the ModeSession.
 */
import { loadJson, saveJson } from '../../game/storage';
import { DEFAULT_RECORD_HZ, isRecording, timeAtProgress, type Recording } from '../shared/recording';

/** Every Ghost Lap constant. */
export const GHOST_TUNING = {
  /** localStorage key of the best run, a BestRun as JSON. */
  storageKey: 'berby.ghost.best',
  /** Samples per second of the player's run; 20 is about 30 KB of JSON per lap. */
  recordHz: DEFAULT_RECORD_HZ,
  /** Decimals kept when the best run is saved (2 = centimeters, 0.01 rad). */
  decimals: 2,
  /**
   * Seconds the delta must reach, either way, before the status line names who is ahead. The
   * line only flips once the delta has crossed the band the other way, so it never flickers
   * around zero.
   */
  statusBand: 0.3,
} as const;

/** The best lap on this device: its time and the run that set it, replayed as the ghost. */
export interface BestRun {
  /** Lap time in seconds, exact; the recording's own time is rounded for storage. */
  time: number;
  recording: Recording;
}

/** The stored value as a best run, or null when it is missing, corrupt or from an older format. */
export function parseBest(value: unknown): BestRun | null {
  if (!value || typeof value !== 'object') return null;
  const { time, recording } = value as Partial<BestRun>;
  if (typeof time !== 'number' || !Number.isFinite(time) || time <= 0) return null;
  if (!isRecording(recording)) return null;
  return { time, recording };
}

/** The faster of two runs; null only when both are. */
export function fasterOf(a: BestRun | null, b: BestRun | null): BestRun | null {
  if (!a) return b;
  if (!b) return a;
  return b.time < a.time ? b : a;
}

export interface BestStore {
  load(): BestRun | null;
  /** False when the run could not be saved (a private window, a full quota). */
  save(run: BestRun): boolean;
}

/**
 * The best run in localStorage, with an in-memory copy of whatever was saved this visit: when
 * storage is disabled the ghost still shows up for the next session on the same page.
 */
export function createBestStore(key: string = GHOST_TUNING.storageKey): BestStore {
  let memory: BestRun | null = null;
  return {
    load: () => fasterOf(parseBest(loadJson<unknown>(key, null)), memory),
    save(run) {
      memory = run;
      return saveJson(key, run);
    },
  };
}

/**
 * The live gap to the ghost in seconds, as racing games show it: negative when the player is
 * ahead (reached this progress sooner than the ghost did), positive when behind.
 */
export function ghostDelta(best: Recording, progress: number, time: number): number {
  return time - timeAtProgress(best, progress);
}

/** A gap in seconds as '+1.23' (behind) or '−0.42' (ahead, a real minus sign), in hundredths. */
export function formatDelta(seconds: number): string {
  const h = Math.round(seconds * 100);
  const a = Math.abs(h);
  const sign = h < 0 ? '−' : '+';
  return `${sign}${Math.floor(a / 100)}.${(a % 100).toString().padStart(2, '0')}`;
}

/** Who the status line says is ahead; 'even' shows nothing. */
export type Standing = 'even' | 'ahead' | 'behind';

/** The standing after this frame: it switches once the delta leaves the band, otherwise it holds. */
export function updateStanding(prev: Standing, delta: number, band: number = GHOST_TUNING.statusBand): Standing {
  if (delta <= -band) return 'ahead';
  if (delta >= band) return 'behind';
  return prev;
}

export const STATUS: Record<Standing, string> & { record: string } = {
  even: '',
  ahead: "You're ahead",
  behind: 'Ghost ahead',
  record: 'New record!',
};
