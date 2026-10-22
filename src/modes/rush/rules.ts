/**
 * The rules of Glitter Rush: collecting, the chain and its multiplier, the clock and its bonuses,
 * and when a collected star is back. Pure functions over a plain state object, no allocations in
 * the per-step path (the events object is reused), so the session stays cheap and the rules are
 * tested in node.
 */
import type { Vec2 } from '../../shared/types';
import { RUSH_TUNING, type RushTuning } from './tuning';
import type { Star } from './layout';

export interface RushState {
  score: number;
  /** Pickups in the current chain (0 when none is running). */
  chain: number;
  longestChain: number;
  /** Current score multiplier: 1, 2 or 3. */
  multiplier: number;
  /** Race time of the last pickup; -Infinity before the first. */
  lastPickupTime: number;
  /** Seconds the gold stars added to the clock so far. */
  bonusSeconds: number;
  /** Stars taken this run, all kinds. */
  pickups: number;
  goldPickups: number;
  /** Per star: race time at which it was taken, -Infinity while it has never been. */
  takenAt: Float64Array;
}

/** What happened in one step, for the HUD status and the sounds. Reused between steps. */
export interface RushEvents {
  /** Glitter stars taken this step. */
  glitter: number;
  /** Gold stars taken this step. */
  gold: number;
  /** The multiplier went up this step (to state.multiplier). */
  multiplierRose: boolean;
  /** A chain of at least chainLostFrom links expired this step. */
  chainLost: boolean;
}

export function createRushState(starCount: number): RushState {
  const state: RushState = {
    score: 0,
    chain: 0,
    longestChain: 0,
    multiplier: 1,
    lastPickupTime: -Infinity,
    bonusSeconds: 0,
    pickups: 0,
    goldPickups: 0,
    takenAt: new Float64Array(starCount),
  };
  resetRushState(state);
  return state;
}

/** Back to the start of a run: nothing scored, every star on the track. */
export function resetRushState(state: RushState): void {
  state.score = 0;
  state.chain = 0;
  state.longestChain = 0;
  state.multiplier = 1;
  state.lastPickupTime = -Infinity;
  state.bonusSeconds = 0;
  state.pickups = 0;
  state.goldPickups = 0;
  state.takenAt.fill(-Infinity);
}

export function createRushEvents(): RushEvents {
  return { glitter: 0, gold: 0, multiplierRose: false, chainLost: false };
}

export function clearRushEvents(events: RushEvents): void {
  events.glitter = 0;
  events.gold = 0;
  events.multiplierRose = false;
  events.chainLost = false;
}

export function multiplierFor(chain: number, tuning: RushTuning = RUSH_TUNING): number {
  if (chain >= tuning.chainForX3) return 3;
  if (chain >= tuning.chainForX2) return 2;
  return 1;
}

/** Seconds left on the clock: the limit plus the gold bonuses, minus the race time. */
export function timeLeft(state: RushState, raceTime: number, tuning: RushTuning = RUSH_TUNING): number {
  return tuning.seconds + state.bonusSeconds - raceTime;
}

export function isRushOver(state: RushState, raceTime: number, tuning: RushTuning = RUSH_TUNING): boolean {
  return timeLeft(state, raceTime, tuning) <= 0;
}

/** Whether a star can be taken: never taken, or taken long enough ago to be back. */
export function isStarActive(takenAt: number, time: number, tuning: RushTuning = RUSH_TUNING): boolean {
  return time - takenAt >= tuning.respawnSeconds;
}

/**
 * Visual size of a star, 0..1: full while on the track, shrinking just after a pickup, gone
 * while it is away, growing back when it respawns.
 */
export function starScale(takenAt: number, time: number, tuning: RushTuning = RUSH_TUNING): number {
  const age = time - takenAt;
  if (age < 0) return 1;
  if (age < tuning.shrinkSeconds) return 1 - age / tuning.shrinkSeconds;
  if (age < tuning.respawnSeconds) return 0;
  const back = age - tuning.respawnSeconds;
  return back < tuning.growSeconds ? back / tuning.growSeconds : 1;
}

/** Drop the chain when the pause since the last pickup grew too long. */
export function expireChain(state: RushState, time: number, tuning: RushTuning, events: RushEvents): void {
  if (state.chain === 0 || time - state.lastPickupTime <= tuning.chainGapSeconds) return;
  if (state.chain >= tuning.chainLostFrom) events.chainLost = true;
  state.chain = 0;
  state.multiplier = 1;
}

/** Take star `index` at `time`: extend or restart the chain, score it, and start its respawn clock. */
export function collectStar(
  state: RushState,
  index: number,
  star: Star,
  time: number,
  tuning: RushTuning,
  events: RushEvents,
): void {
  const linked = time - state.lastPickupTime <= tuning.chainGapSeconds;
  state.chain = linked ? state.chain + 1 : 1;
  if (state.chain > state.longestChain) state.longestChain = state.chain;
  const multiplier = multiplierFor(state.chain, tuning);
  if (multiplier > state.multiplier) events.multiplierRose = true;
  state.multiplier = multiplier;
  const gold = star.kind === 'gold';
  state.score += (gold ? tuning.goldPoints : tuning.starPoints) * multiplier;
  if (gold) {
    state.bonusSeconds += tuning.goldBonusSeconds;
    state.goldPickups++;
    events.gold++;
  } else {
    events.glitter++;
  }
  state.pickups++;
  state.lastPickupTime = time;
  state.takenAt[index] = time;
}

/** First index whose star distance is >= d (binary search over the sorted stars). */
export function lowerBound(stars: readonly Star[], d: number): number {
  let lo = 0;
  let hi = stars.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (stars[mid].distance < d) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Slack on top of the pickup radius for the along-track window: a star in a side lane of a bend
 * projects a little off its own centreline distance. */
const WINDOW_SLACK = 1;

/**
 * One fixed step: expire a stale chain, then take every active star within the pickup radius of
 * the kart. `lapDistance` is the kart's centreline distance in [0, trackLength); only the few
 * stars around it are tested. Returns `events`, filled in.
 */
export function stepRush(
  state: RushState,
  stars: readonly Star[],
  trackLength: number,
  position: Vec2,
  lapDistance: number,
  time: number,
  tuning: RushTuning,
  events: RushEvents,
): RushEvents {
  clearRushEvents(events);
  expireChain(state, time, tuning, events);
  const window = tuning.pickupRadius + WINDOW_SLACK;
  const lo = lapDistance - window;
  const hi = lapDistance + window;
  if (lo < 0) {
    collectRange(state, stars, lo + trackLength, trackLength, position, time, tuning, events);
    collectRange(state, stars, 0, hi, position, time, tuning, events);
  } else if (hi >= trackLength) {
    collectRange(state, stars, lo, trackLength, position, time, tuning, events);
    collectRange(state, stars, 0, hi - trackLength, position, time, tuning, events);
  } else {
    collectRange(state, stars, lo, hi, position, time, tuning, events);
  }
  return events;
}

function collectRange(
  state: RushState,
  stars: readonly Star[],
  from: number,
  to: number,
  position: Vec2,
  time: number,
  tuning: RushTuning,
  events: RushEvents,
): void {
  const r2 = tuning.pickupRadius * tuning.pickupRadius;
  for (let i = lowerBound(stars, from); i < stars.length && stars[i].distance <= to; i++) {
    if (!isStarActive(state.takenAt[i], time, tuning)) continue;
    const star = stars[i];
    const dx = star.x - position.x;
    const dz = star.z - position.z;
    if (dx * dx + dz * dz <= r2) collectStar(state, i, star, time, tuning, events);
  }
}

/**
 * The whole second the clock crossed downward this step, from `tickFrom` down to 1, or 0 when it
 * crossed none (a bonus jumping the clock up never ticks).
 */
export function tickAt(prevLeft: number, left: number, tuning: RushTuning = RUSH_TUNING): number {
  const n = Math.floor(prevLeft);
  return n >= 1 && n <= tuning.tickFrom && left < n ? n : 0;
}

/** Pitch of the pickup sound: rising with the chain, capped. */
export function pickupPitch(chain: number, tuning: RushTuning = RUSH_TUNING): number {
  return 1 + Math.min(chain, tuning.pickupPitchCap) * tuning.pickupPitchStep;
}
