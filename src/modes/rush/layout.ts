/**
 * Where the stars are: a pure, deterministic layout from the track geometry and the tuning.
 * No Three.js, no DOM, so it runs in node tests.
 *
 * Glitter stars line the lap every ~12 m in one of three lanes (left, centre, right). The lane
 * pattern is runs of 5–8 stars in one lane, then a neighbouring lane: from the centre to either
 * side, from a side back to the centre. A one-lane move fits between two stars at full speed when
 * the move starts on the last star of the run, which is the skill of the mode; a two-lane jump
 * would not, so the pattern never asks for one.
 *
 * Gold stars sit on the outside edge of the corners, almost on the sand, where picking one up
 * costs time on the racing line. They are spread over the corners in proportion to their length
 * and snapped halfway between two glitter stars so the two never overlap.
 */
import type { Track } from '../../shared/types';
import { leftOf, wrapDistance } from '../../shared/math';
import { curvatureAt } from '../../sim/track';
import { RUSH_TUNING, type RushTuning } from './tuning';

export type StarKind = 'glitter' | 'gold';

/** Lane of a glitter star: -1 right, 0 centre, +1 left (positive lateral is left of travel). */
export type Lane = -1 | 0 | 1;

export interface Star {
  kind: StarKind;
  /** Centreline distance from the start line, m, in [0, track.length). */
  distance: number;
  /** Lateral offset from the centreline, m, + = left of travel. */
  lateral: number;
  /** World position on the ground plane. */
  x: number;
  z: number;
}

/** Tiny deterministic PRNG (mulberry32), a copy of the one in src/graphics/materials.ts. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Lane per glitter star: runs of runLength.min..max in one lane, then a neighbouring lane. */
export function lanePattern(count: number, random: () => number, tuning: RushTuning = RUSH_TUNING): Lane[] {
  const { min, max } = tuning.runLength;
  const lanes: Lane[] = [];
  let lane: Lane = 0;
  while (lanes.length < count) {
    const run = min + Math.floor(random() * (max - min + 1));
    for (let i = 0; i < run && lanes.length < count; i++) lanes.push(lane);
    lane = lane === 0 ? (random() < 0.5 ? -1 : 1) : 0;
  }
  return lanes;
}

/** Centreline distances of the glitter stars: evenly spaced between the start and end gaps. */
export function glitterDistances(trackLength: number, tuning: RushTuning = RUSH_TUNING): number[] {
  const span = trackLength - tuning.startGap - tuning.endGap;
  const count = Math.max(0, Math.floor(span / tuning.starSpacing));
  if (count === 0) return [];
  const spacing = span / count;
  return Array.from({ length: count }, (_, i) => tuning.startGap + i * spacing);
}

export interface Corner {
  /** Centreline distance where the corner starts and ends, m; end may exceed the lap length when it wraps. */
  start: number;
  end: number;
  /** +1 for a left turn, -1 for a right turn (the sign of the curvature). */
  turn: 1 | -1;
}

/** Stretches of the lap that bend tighter than the corner threshold, in travel order. */
export function findCorners(track: Track, tuning: RushTuning = RUSH_TUNING): Corner[] {
  const step = 1;
  const n = Math.ceil(track.length / step);
  const side = (d: number): 1 | -1 | 0 => {
    const c = curvatureAt(track, d);
    return Math.abs(c) >= tuning.cornerCurvature ? (c > 0 ? 1 : -1) : 0;
  };
  // Start the scan on a straight stretch, so a corner across the start line is not split in two.
  let origin = 0;
  while (origin < n && side(origin * step) !== 0) origin++;
  if (origin === n) return [];

  const corners: Corner[] = [];
  let current: Corner | null = null;
  for (let i = 0; i <= n; i++) {
    const d = (origin + i) * step;
    const s = i === n ? 0 : side(d);
    if (current && s === current.turn) continue;
    if (current) {
      current.end = d;
      if (current.end - current.start >= tuning.minCornerLength) corners.push(current);
      current = null;
    }
    if (s !== 0) current = { start: d, end: d, turn: s };
  }
  // Back into lap order: the scan may have begun past the start line.
  corners.sort((a, b) => wrapDistance(a.start, track.length) - wrapDistance(b.start, track.length));
  return corners.map((c) => {
    const start = wrapDistance(c.start, track.length);
    return { start, end: start + (c.end - c.start), turn: c.turn };
  });
}

/** Gold star placements: goldCount spread over the corners, on the outside, between glitter stars. */
export function goldPlacements(
  track: Track,
  glitter: readonly number[],
  tuning: RushTuning = RUSH_TUNING,
): { distance: number; lateral: number }[] {
  const corners = findCorners(track, tuning);
  const total = corners.reduce((sum, c) => sum + (c.end - c.start), 0);
  if (total === 0 || tuning.goldCount === 0) return [];
  const spacing = total / tuning.goldCount;
  const result: { distance: number; lateral: number }[] = [];
  let cursor = spacing / 2;
  for (const corner of corners) {
    const length = corner.end - corner.start;
    while (cursor < length) {
      const distance = snapBetween(corner.start + cursor, glitter, track.length);
      // The outside of a left turn is on the right (negative lateral), and the other way round.
      result.push({ distance, lateral: -corner.turn * tuning.goldLateral });
      cursor += spacing;
    }
    cursor -= length;
  }
  return result;
}

/** Move a distance to the nearest midpoint between two consecutive glitter stars (wrap-aware). */
function snapBetween(distance: number, glitter: readonly number[], trackLength: number): number {
  const d = wrapDistance(distance, trackLength);
  if (glitter.length < 2) return d;
  let best = d;
  let bestGap = Infinity;
  for (let i = 0; i < glitter.length; i++) {
    const a = glitter[i];
    const b = i + 1 < glitter.length ? glitter[i + 1] : glitter[0] + trackLength;
    const mid = wrapDistance((a + b) / 2, trackLength);
    const gap = Math.abs(signedWrap(mid - d, trackLength));
    if (gap < bestGap) {
      bestGap = gap;
      best = mid;
    }
  }
  return best;
}

/** Wrap a distance difference along the loop into [-length/2, length/2). */
export function signedWrap(delta: number, length: number): number {
  return delta - length * Math.floor((delta + length / 2) / length);
}

function place(track: Track, kind: StarKind, distance: number, lateral: number): Star {
  const s = track.sampleAt(distance);
  const left = leftOf(s.tangent);
  return {
    kind,
    distance: s.distance,
    lateral,
    x: s.position.x + left.x * lateral,
    z: s.position.z + left.z * lateral,
  };
}

/** Every star of the lap, sorted by centreline distance. */
export function layoutStars(track: Track, tuning: RushTuning = RUSH_TUNING): Star[] {
  const distances = glitterDistances(track.length, tuning);
  const lanes = lanePattern(distances.length, rng(tuning.seed), tuning);
  const stars = distances.map((d, i) => place(track, 'glitter', d, lanes[i] * tuning.laneOffset));
  for (const g of goldPlacements(track, distances, tuning)) stars.push(place(track, 'gold', g.distance, g.lateral));
  stars.sort((a, b) => a.distance - b.distance);
  return stars;
}
