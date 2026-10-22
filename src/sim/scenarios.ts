// Headless race scenarios shared by the sim tests and the tuning report (report.test.ts). Not
// used by the game. Like the rest of src/sim this runs in Node: no DOM, no Three.js.
import type { KartState, Track } from '../shared/types';
import { distance, forwardToHeading, leftOf } from '../shared/math';
import { KART_RADIUS, createKartState, resolveKartCollision, stepKartWithTuning } from './kart';
import { createRaceProgress, updateRaceProgress } from './race';
import { rivalInput, stepRival } from './rival';
import { OVERTAKE_TUNING, PLAYER_TUNING } from './tuning';

/** Wrap a distance difference along the loop into [-length/2, length/2). */
function signedWrap(d: number, length: number): number {
  return d - length * Math.floor((d + length / 2) / length);
}

/** A kart on the centerline at a distance, offset laterally (+ = left), facing along the track. */
export function kartAt(track: Track, distance: number, lateral: number): KartState {
  const s = track.sampleAt(distance);
  const left = leftOf(s.tangent);
  return createKartState(
    { x: s.position.x + left.x * lateral, z: s.position.z + left.z * lateral },
    forwardToHeading(s.tangent),
  );
}

export interface PassResult {
  /** Seconds until the rival is more than OVERTAKE_TUNING.clearAhead ahead of the player; -1 if never. */
  passedAt: number;
  /** Steps on which the two karts overlapped before the bump was resolved. */
  overlapSteps: number;
  /** Share of steps the rival spent on the asphalt, 0..1. */
  onRoad: number;
  maxAbsLateral: number;
  /** Whether the player got back in front at any time after the pass. */
  fellBehindAfterPass: boolean;
  /** Rival progress minus player progress at the end, meters. */
  finalGap: number;
}

/**
 * Overtaking scenario: a slower player (the rival AI's own steering, a kart with top speed
 * `playerTopSpeed`) starts 10 m ahead of the rival at `start` meters along the track,
 * `playerLateral` off the centerline, both rolling at 15 m/s. The rival rubber-bands on the
 * player's progress and knows where it is; bumps are resolved like in the game. The player's
 * AI does not know about the rival, so it never yields: a worst case for contact.
 */
export function passScenario(
  track: Track,
  start: number,
  playerTopSpeed: number,
  playerLateral: number,
  duration = 30,
  dt = 1 / 60,
): PassResult {
  const player = kartAt(track, start + 10, playerLateral);
  const rival = kartAt(track, start, 0);
  player.speed = rival.speed = 15;
  const playerTuning = { ...PLAYER_TUNING, topSpeed: playerTopSpeed };
  const playerProgress = createRaceProgress();
  const rivalProgress = createRaceProgress();
  let time = 0;
  let steps = 0;
  let onRoadSteps = 0;
  let overlapSteps = 0;
  let maxAbsLateral = 0;
  let passedAt = -1;
  let fellBehindAfterPass = false;
  while (time < duration) {
    const playerInput = rivalInput(player, track, { rivalProgress: 0, playerProgress: 0 }, dt);
    stepKartWithTuning(player, playerInput, track, dt, playerTuning);
    const ctx = { rivalProgress: rivalProgress.progress, playerProgress: playerProgress.progress, player };
    stepRival(rival, track, ctx, dt);
    if (distance(player.position, rival.position) < 2 * KART_RADIUS) overlapSteps++;
    resolveKartCollision(player, rival);
    time += dt;
    steps++;
    updateRaceProgress(playerProgress, player, track, time);
    updateRaceProgress(rivalProgress, rival, track, time);
    const near = track.nearest(rival.position);
    maxAbsLateral = Math.max(maxAbsLateral, Math.abs(near.lateral));
    if (rival.onRoad) onRoadSteps++;
    const playerDistance = track.nearest(player.position).sample.distance;
    const gapAhead = signedWrap(playerDistance - near.sample.distance, track.length);
    if (passedAt < 0 && gapAhead < -OVERTAKE_TUNING.clearAhead) passedAt = time;
    if (passedAt >= 0 && gapAhead > 0) fellBehindAfterPass = true;
  }
  return {
    passedAt,
    overlapSteps,
    onRoad: onRoadSteps / steps,
    maxAbsLateral,
    fellBehindAfterPass,
    finalGap: rivalProgress.progress - playerProgress.progress,
  };
}
