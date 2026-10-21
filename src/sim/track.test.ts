import { describe, expect, it } from 'vitest';
import type { TrackDefinition, Vec2 } from '../shared/types';
import { TAU, forwardToHeading, leftOf, wrapAngle } from '../shared/math';
import { MALIBU } from '../tracks/malibu';
import { buildTrack, curvatureAt } from './track';

/**
 * Circle of radius r sampled every 30 degrees. With X to the right and Z down the page, heading 0
 * faces -Z (up the page) and a right turn decreases the heading, so clockwise on the page = right
 * turns (negative curvature) and counter-clockwise = left turns (positive curvature).
 */
function circleDefinition(r: number, turn: 'left' | 'right'): TrackDefinition {
  const controlPoints: Vec2[] = [];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU;
    const x = r * Math.sin(a) * (turn === 'right' ? 1 : -1);
    controlPoints.push({ x, z: -r * Math.cos(a) });
  }
  return { id: 'circle', name: 'Circle', controlPoints, roadWidth: 12, barrierOffset: 9, checkpointCount: 6, laps: 3 };
}

describe('buildTrack spline', () => {
  const malibu = buildTrack(MALIBU);

  it('has a plausible Malibu lap length', () => {
    expect(malibu.length).toBeGreaterThan(900);
    expect(malibu.length).toBeLessThan(1800);
  });

  it('closes the loop: distance 0 and distance length coincide', () => {
    const a = malibu.sampleAt(0);
    const b = malibu.sampleAt(malibu.length);
    const c = malibu.sampleAt(malibu.length - 1e-4);
    expect(b.position.x).toBeCloseTo(a.position.x, 6);
    expect(b.position.z).toBeCloseTo(a.position.z, 6);
    expect(c.position.x).toBeCloseTo(a.position.x, 3);
    expect(c.position.z).toBeCloseTo(a.position.z, 3);
    expect(Math.abs(wrapAngle(forwardToHeading(c.tangent) - forwardToHeading(a.tangent)))).toBeLessThan(0.02);
    expect(b.distance).toBeCloseTo(0, 9);
  });

  it('is continuous in position and tangent along the whole lap', () => {
    const step = 0.1;
    let prev = malibu.sampleAt(-step);
    for (let d = 0; d <= malibu.length + step; d += step) {
      const s = malibu.sampleAt(d);
      const moved = Math.hypot(s.position.x - prev.position.x, s.position.z - prev.position.z);
      expect(moved).toBeLessThan(step * 1.2);
      expect(moved).toBeGreaterThan(step * 0.8);
      expect(Math.hypot(s.tangent.x, s.tangent.z)).toBeCloseTo(1, 6);
      const turn = Math.abs(wrapAngle(forwardToHeading(s.tangent) - forwardToHeading(prev.tangent)));
      expect(turn).toBeLessThan(0.05);
      prev = s;
    }
  });

  it('passes through the control points', () => {
    for (const cp of MALIBU.controlPoints) {
      const { sample, lateral } = malibu.nearest(cp);
      expect(Math.abs(lateral)).toBeLessThan(0.05);
      expect(Math.hypot(sample.position.x - cp.x, sample.position.z - cp.z)).toBeLessThan(0.05);
    }
  });

  it('wraps negative and over-length distances', () => {
    const a = malibu.sampleAt(-10);
    const b = malibu.sampleAt(malibu.length - 10);
    const c = malibu.sampleAt(2 * malibu.length - 10);
    expect(a.distance).toBeCloseTo(malibu.length - 10, 9);
    expect(a.position.x).toBeCloseTo(b.position.x, 9);
    expect(a.position.z).toBeCloseTo(b.position.z, 9);
    expect(c.position.x).toBeCloseTo(b.position.x, 6);
    expect(c.position.z).toBeCloseTo(b.position.z, 6);
  });

  it('measures a circle within 1% of its circumference', () => {
    const circle = buildTrack(circleDefinition(100, 'right'));
    expect(circle.length).toBeGreaterThan(TAU * 100 * 0.99);
    expect(circle.length).toBeLessThan(TAU * 100 * 1.01);
    for (let d = 0; d < circle.length; d += 7) {
      const s = circle.sampleAt(d);
      expect(Math.hypot(s.position.x, s.position.z)).toBeCloseTo(100, 0);
    }
  });

  it('round-trips sampleAt -> nearest with lateral 0', () => {
    for (let d = 0; d < malibu.length; d += 3.7) {
      const s = malibu.sampleAt(d);
      const { sample, lateral } = malibu.nearest(s.position);
      const diff = Math.abs(wrapAngle(((sample.distance - d) / malibu.length) * TAU)) * (malibu.length / TAU);
      expect(diff).toBeLessThan(0.06);
      expect(Math.abs(lateral)).toBeLessThan(0.02);
    }
  });

  it('reports a positive lateral for a point to the left of travel and negative to the right', () => {
    for (let d = 0; d < malibu.length; d += 11.3) {
      const s = malibu.sampleAt(d);
      const left = leftOf(s.tangent);
      const pLeft = { x: s.position.x + left.x * 3, z: s.position.z + left.z * 3 };
      const pRight = { x: s.position.x - left.x * 4, z: s.position.z - left.z * 4 };
      expect(malibu.nearest(pLeft).lateral).toBeCloseTo(3, 1);
      expect(malibu.nearest(pRight).lateral).toBeCloseTo(-4, 1);
    }
    // Concretely: on the seaside straight (heading -Z) the ocean side -X is on the left.
    const start = malibu.sampleAt(20);
    expect(start.tangent.z).toBeLessThan(-0.99);
    expect(malibu.nearest({ x: start.position.x - 2, z: start.position.z }).lateral).toBeCloseTo(2, 1);
  });

  it('spaces checkpoints evenly with checkpoint 0 at the start line', () => {
    expect(malibu.checkpoints).toHaveLength(MALIBU.checkpointCount);
    expect(malibu.checkpoints[0]).toBe(0);
    const spacing = malibu.length / MALIBU.checkpointCount;
    malibu.checkpoints.forEach((c, i) => expect(c).toBeCloseTo(i * spacing, 6));
  });

  it('signs curvature + for left turns and - for right turns', () => {
    const left = buildTrack(circleDefinition(50, 'left'));
    const right = buildTrack(circleDefinition(50, 'right'));
    for (let d = 0; d < left.length; d += 5) {
      expect(curvatureAt(left, d)).toBeCloseTo(1 / 50, 2);
      expect(curvatureAt(right, d)).toBeCloseTo(-1 / 50, 2);
    }
    // The Malibu straight is straight and its tightest corner is a sane kart-track radius.
    expect(Math.abs(curvatureAt(malibu, 30))).toBeLessThan(1 / 300);
    let maxCurvature = 0;
    for (let d = 0; d < malibu.length; d += 1) maxCurvature = Math.max(maxCurvature, Math.abs(curvatureAt(malibu, d)));
    expect(1 / maxCurvature).toBeGreaterThan(10);
    expect(1 / maxCurvature).toBeLessThan(80);
  });

  it('falls back to finite differences for a foreign Track implementation', () => {
    const circle = buildTrack(circleDefinition(50, 'left'));
    const foreign = { ...circle }; // same behaviour, but not the object buildTrack registered
    expect(curvatureAt(foreign, 12)).toBeCloseTo(1 / 50, 2);
  });
});
