import { describe, expect, it } from 'vitest';
import { buildTrack, curvatureAt } from '../../sim/track';
import { MALIBU } from '../../tracks/malibu';
import { findCorners, glitterDistances, goldPlacements, lanePattern, layoutStars, rng, signedWrap } from './layout';
import { RUSH_TUNING } from './tuning';

const track = buildTrack(MALIBU);
const T = RUSH_TUNING;

describe('lanePattern', () => {
  const lanes = lanePattern(400, rng(T.seed));

  it('uses the three lanes', () => {
    expect(new Set(lanes)).toEqual(new Set([-1, 0, 1]));
  });

  it('switches only to a neighbouring lane', () => {
    for (let i = 1; i < lanes.length; i++) expect(Math.abs(lanes[i] - lanes[i - 1])).toBeLessThanOrEqual(1);
  });

  it('runs 5 to 8 stars in a lane (the last run may be cut short)', () => {
    const runs: number[] = [];
    let run = 1;
    for (let i = 1; i < lanes.length; i++) {
      if (lanes[i] === lanes[i - 1]) run++;
      else {
        runs.push(run);
        run = 1;
      }
    }
    expect(runs.length).toBeGreaterThan(40);
    for (const r of runs) {
      expect(r).toBeGreaterThanOrEqual(T.runLength.min);
      expect(r).toBeLessThanOrEqual(T.runLength.max);
    }
    expect(Math.min(...runs)).toBe(T.runLength.min);
    expect(Math.max(...runs)).toBe(T.runLength.max);
  });

  it('is deterministic for a seed and differs between seeds', () => {
    expect(lanePattern(100, rng(7))).toEqual(lanePattern(100, rng(7)));
    expect(lanePattern(100, rng(7))).not.toEqual(lanePattern(100, rng(8)));
  });
});

describe('glitterDistances', () => {
  it('spaces the stars evenly between the start and end gaps', () => {
    const d = glitterDistances(track.length);
    expect(d[0]).toBe(T.startGap);
    expect(d[d.length - 1]).toBeLessThanOrEqual(track.length - T.endGap - T.starSpacing + 1e-9);
    const spacing = d[1] - d[0];
    expect(spacing).toBeGreaterThanOrEqual(T.starSpacing);
    expect(spacing).toBeLessThan(T.starSpacing * 1.15);
    for (let i = 1; i < d.length; i++) expect(d[i] - d[i - 1]).toBeCloseTo(spacing, 9);
    // Malibu: ~1215 m minus the gaps, one star every ~12 m.
    expect(d.length).toBeGreaterThanOrEqual(90);
    expect(d.length).toBeLessThanOrEqual(100);
  });

  it('is empty on a track shorter than the gaps', () => {
    expect(glitterDistances(50)).toEqual([]);
  });
});

describe('findCorners', () => {
  const corners = findCorners(track);

  it('finds the six Malibu corners in lap order with the right turn direction', () => {
    // Turn 1 (right), the café hairpin (right), the hill curve (left), the turn onto the south leg
    // (right), the turn into the palm tunnel (right), the final turn onto the straight (right).
    expect(corners.map((c) => c.turn)).toEqual([-1, -1, 1, -1, -1, -1]);
    for (let i = 1; i < corners.length; i++) expect(corners[i].start).toBeGreaterThan(corners[i - 1].end);
    for (const c of corners) {
      expect(c.end - c.start).toBeGreaterThanOrEqual(T.minCornerLength);
      const mid = curvatureAt(track, (c.start + c.end) / 2);
      expect(Math.sign(mid)).toBe(c.turn);
      expect(Math.abs(mid)).toBeGreaterThanOrEqual(T.cornerCurvature);
    }
  });

  it('is straight at the start line', () => {
    expect(corners.some((c) => c.start <= 0 && c.end >= 0)).toBe(false);
    expect(corners[0].start).toBeGreaterThan(100);
  });
});

describe('goldPlacements', () => {
  const glitter = glitterDistances(track.length);
  const gold = goldPlacements(track, glitter);

  it('places about goldCount stars on the outside of the corners', () => {
    expect(gold.length).toBeGreaterThanOrEqual(T.goldCount - 1);
    expect(gold.length).toBeLessThanOrEqual(T.goldCount + 1);
    for (const g of gold) {
      expect(Math.abs(g.lateral)).toBe(T.goldLateral);
      // The outside of a left turn (curvature > 0) is on the right (negative lateral).
      const c = curvatureAt(track, g.distance);
      expect(Math.sign(g.lateral)).toBe(-Math.sign(c));
      expect(Math.abs(c)).toBeGreaterThan(T.cornerCurvature * 0.5);
    }
  });

  it('sits halfway between two glitter stars, never on one', () => {
    for (const g of gold) {
      const gaps = glitter.map((d) => Math.abs(signedWrap(d - g.distance, track.length)));
      expect(Math.min(...gaps)).toBeGreaterThan(T.starSpacing * 0.45);
    }
  });

  it('gives the long hairpin and hill curve more stars than the short turns', () => {
    const corners = findCorners(track);
    const perCorner = corners.map((c) => gold.filter((g) => g.distance >= c.start && g.distance <= c.end).length);
    const longest = corners.map((c) => c.end - c.start).indexOf(Math.max(...corners.map((c) => c.end - c.start)));
    expect(perCorner[longest]).toBe(Math.max(...perCorner));
    expect(perCorner.reduce((a, b) => a + b, 0)).toBe(gold.length);
  });
});

describe('layoutStars', () => {
  const stars = layoutStars(track);

  it('is sorted by distance, skips the start gap, and lies on the lanes', () => {
    for (let i = 1; i < stars.length; i++) expect(stars[i].distance).toBeGreaterThanOrEqual(stars[i - 1].distance);
    expect(stars[0].distance).toBeGreaterThanOrEqual(T.startGap);
    for (const s of stars) {
      expect(s.distance).toBeLessThan(track.length);
      if (s.kind === 'glitter') expect([-T.laneOffset, 0, T.laneOffset]).toContain(s.lateral);
      else expect(Math.abs(s.lateral)).toBe(T.goldLateral);
      // The world position is the star's lateral offset from the centreline sample.
      const n = track.nearest({ x: s.x, z: s.z });
      expect(n.lateral).toBeCloseTo(s.lateral, 1);
      expect(Math.abs(signedWrap(n.sample.distance - s.distance, track.length))).toBeLessThan(0.6);
    }
  });

  it('has ~95 glitter stars and ~10 gold stars, deterministically', () => {
    const glitter = stars.filter((s) => s.kind === 'glitter');
    const gold = stars.filter((s) => s.kind === 'gold');
    expect(glitter.length).toBe(glitterDistances(track.length).length);
    expect(gold.length).toBeGreaterThanOrEqual(T.goldCount - 1);
    expect(layoutStars(track)).toEqual(stars);
  });
});
