/**
 * Hot Seat rules as pure functions: who wins, by how much, the live delta against Player 1's
 * recording, the lead with hysteresis, the best-ever bookkeeping and the two cards. No state,
 * no DOM, no Three.js; tested in node.
 */
import type { Recording } from '../shared/recording';
import { timeAtProgress } from '../shared/recording';
import { formatLapTime } from '../../ui/format';
import type { ModeFinish } from '../types';
import { HOTSEAT_TEXT } from './tuning';

export type Player = 1 | 2;

export interface Verdict {
  /** null for a dead heat. */
  winner: Player | null;
  /** |Player 2 - Player 1|, seconds, never negative. */
  gap: number;
}

/** The faster run wins; runs within `deadHeat` seconds of each other tie. */
export function verdict(time1: number, time2: number, deadHeat: number): Verdict {
  const gap = Math.abs(time2 - time1);
  if (gap <= deadHeat + 1e-9) return { winner: null, gap };
  return { winner: time2 < time1 ? 2 : 1, gap };
}

export function headline(v: Verdict): string {
  return v.winner === null ? HOTSEAT_TEXT.deadHeat : HOTSEAT_TEXT.wins(v.winner);
}

/** Seconds with a sign and two decimals: '+1.23', '-0.42'; a value that rounds to zero is '+0.00'. */
export function formatSigned(seconds: number): string {
  const hundredths = Math.round(Math.abs(seconds) * 100);
  const sign = seconds < 0 && hundredths > 0 ? '-' : '+';
  const whole = Math.floor(hundredths / 100);
  const frac = hundredths % 100;
  return `${sign}${whole}.${frac.toString().padStart(2, '0')}`;
}

/**
 * The live delta against Player 1's recording: the race time minus the time Player 1 needed to
 * reach the same progress. Negative means Player 2 is ahead, like a timing screen. Before the
 * first sample (still on the grid, or reversing past it) Player 1's time is 0, so the delta is
 * the race time itself: behind, and never a throw.
 */
export function liveDelta(rec: Recording, progress: number, time: number): number {
  return time - timeAtProgress(rec, progress);
}

export type Lead = 'ahead' | 'behind' | 'level';

/**
 * Who leads given the delta, with hysteresis: the previous lead holds until the delta swings
 * more than `deadband` past zero the other way. 'level' only exists before the first call.
 */
export function updateLead(lead: Lead, delta: number, deadband: number): Lead {
  if (delta < -deadband) return 'ahead';
  if (delta > deadband) return 'behind';
  return lead;
}

/** True for a value that can be a run time (storage may hold anything). */
export function isRunTime(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

/** The fastest of the stored best (if it is a sane number) and these runs; Infinity when nothing is known. */
export function bestEver(stored: unknown, ...runs: number[]): number {
  let best = isRunTime(stored) ? stored : Infinity;
  for (const run of runs) if (isRunTime(run) && run < best) best = run;
  return best;
}

/** The card between the runs: Player 1's time and the handover. */
export function intermissionCard(time1: number): ModeFinish {
  return {
    kind: 'intermission',
    headline: HOTSEAT_TEXT.passHeadline,
    lines: [`${HOTSEAT_TEXT.rowPlayer(1)}: ${formatLapTime(time1)}`, HOTSEAT_TEXT.passLine],
    button: HOTSEAT_TEXT.passButton,
  };
}

/** The verdict card: both times, the gap and the best run ever seen on this phone. */
export function resultsCard(time1: number, time2: number, best: number, deadHeat: number): ModeFinish {
  const v = verdict(time1, time2, deadHeat);
  return {
    kind: 'results',
    headline: headline(v),
    won: null,
    rows: [
      [HOTSEAT_TEXT.rowPlayer(1), formatLapTime(time1)],
      [HOTSEAT_TEXT.rowPlayer(2), formatLapTime(time2)],
      [HOTSEAT_TEXT.rowGap, formatSigned(v.gap)],
      [HOTSEAT_TEXT.rowBest, formatLapTime(best)],
    ],
    again: HOTSEAT_TEXT.again,
  };
}
