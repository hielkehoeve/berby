/**
 * Every Hot Seat constant. Times are seconds. The feel of the karts is not here: that is
 * src/sim/tuning.ts, shared by every mode.
 */
import { DEFAULT_RECORD_HZ } from '../shared/recording';

export interface HotSeatTuning {
  laps: number;
  recordHz: number;
  deadHeat: number;
  catchSeconds: number;
  leadDeadband: number;
  leadHoldSeconds: number;
  tickSpacing: number;
  bestKey: string;
}

export const HOTSEAT_TUNING: HotSeatTuning = {
  /** Laps per run (each player drives one run). */
  laps: 1,
  /** Samples per second of Player 1's run, replayed as the ghost in run 2. */
  recordHz: DEFAULT_RECORD_HZ,
  /** Runs closer than this are a dead heat: nobody wins. */
  deadHeat: 0.01,
  /** How long 'Catch Player 1!' stays on the HUD after GO in run 2 (it also shows during the countdown). */
  catchSeconds: 3,
  /**
   * The live delta must swing this far past zero before the HUD calls a change of lead, so a
   * close battle does not flicker between 'Ahead!' and 'Behind' every frame (0.15 s is about
   * two and a half meters at top speed).
   */
  leadDeadband: 0.15,
  /** How long 'Ahead!' / 'Behind' stays on the HUD after a change of lead. */
  leadHoldSeconds: 2,
  /** Minimum spacing between two 'tick' effects for changes of lead. */
  tickSpacing: 1.5,
  /** localStorage key of the fastest run ever driven in Hot Seat on this phone, in seconds. */
  bestKey: 'berby.hotseat.best',
};

/** Every line of copy the mode shows, so the wording can be tuned without touching the logic. */
export const HOTSEAT_TEXT = {
  /** Left HUD pill per run (1-based). */
  player: ['P1', 'P2'],
  /** Right HUD pill in run 1, where there is no ghost to compare with. */
  noDelta: '--',
  catch: 'Catch Player 1!',
  ahead: 'Ahead!',
  behind: 'Behind',
  passHeadline: 'Pass the phone',
  passLine: 'Player 2, beat that!',
  passButton: "I'm ready",
  deadHeat: 'Dead heat!',
  /** `wins(2)` is the headline when Player 2 wins. */
  wins: (player: 1 | 2) => `Player ${player} wins!`,
  rowPlayer: (player: 1 | 2) => `Player ${player}`,
  rowGap: 'Gap',
  rowBest: 'Best ever',
  again: 'Rematch',
} as const;
