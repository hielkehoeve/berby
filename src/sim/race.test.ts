import { describe, expect, it } from 'vitest';
import type { KartState, RaceProgress, Track, TrackDefinition, Vec2 } from '../shared/types';
import { TAU, forwardToHeading, leftOf } from '../shared/math';
import { createKartState } from './kart';
import { createRaceProgress, updateRaceProgress } from './race';
import { buildTrack } from './track';

/** A simple circle so distances are easy to reason about (length ≈ 628 m, 6 checkpoints). */
function circle(): TrackDefinition {
  const controlPoints: Vec2[] = [];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU;
    controlPoints.push({ x: 100 * Math.sin(a), z: -100 * Math.cos(a) });
  }
  return { id: 'circle', name: 'Circle', controlPoints, roadWidth: 12, barrierOffset: 9, checkpointCount: 6, laps: 3 };
}

const track = buildTrack(circle());
const L = track.length;

/** Place a kart on the centerline at a distance (optionally offset laterally, + = left). */
function place(kart: KartState, distance: number, lateral = 0, t: Track = track): void {
  const s = t.sampleAt(distance);
  const left = leftOf(s.tangent);
  kart.position.x = s.position.x + left.x * lateral;
  kart.position.z = s.position.z + left.z * lateral;
  kart.heading = forwardToHeading(s.tangent);
}

/** Drive the kart along the centerline from `from` to `to` (signed, may wrap) in 5 m steps. */
function drive(p: RaceProgress, kart: KartState, from: number, to: number, startTime: number, speed = 20): number {
  const dir = to > from ? 1 : -1;
  let d = from;
  let t = startTime;
  while (dir > 0 ? d < to : d > to) {
    const next = dir > 0 ? Math.min(d + 5, to) : Math.max(d - 5, to);
    t += Math.abs(next - d) / speed;
    d = next;
    place(kart, d);
    updateRaceProgress(p, kart, track, t);
  }
  return t;
}

function setup(startDistance = L - 10): { p: RaceProgress; kart: KartState } {
  const kart = createKartState({ x: 0, z: 0 }, 0);
  place(kart, startDistance);
  const p = createRaceProgress();
  updateRaceProgress(p, kart, track, 0);
  return { p, kart };
}

describe('race progress', () => {
  it('starts a few meters before the line with negative progress and no lap credit for crossing it', () => {
    const { p, kart } = setup(L - 10);
    expect(p.lap).toBe(1);
    expect(p.nextCheckpoint).toBe(0);
    expect(p.progress).toBeCloseTo(-10, 1);
    expect(p.lapTimes).toEqual([]);

    drive(p, kart, L - 10, L + 12, 0);
    expect(p.lap).toBe(1);
    expect(p.nextCheckpoint).toBe(1);
    expect(p.lapTimes).toEqual([]);
    expect(p.finished).toBe(false);
    expect(p.progress).toBeCloseTo(12, 1);
  });

  it('passes checkpoints in order and completes laps only after all of them', () => {
    const { p, kart } = setup();
    const spacing = L / 6;
    let t = drive(p, kart, L - 10, L + spacing * 0.5, 0);
    expect(p.nextCheckpoint).toBe(1);
    for (let k = 1; k < 6; k++) {
      t = drive(p, kart, L + spacing * (k - 0.5), L + spacing * (k + 0.5), t);
      expect(p.nextCheckpoint).toBe((k + 1) % 6);
      expect(p.lap).toBe(1);
    }
    expect(p.nextCheckpoint).toBe(0);
    t = drive(p, kart, 2 * L - spacing * 0.5, 2 * L + 5, t);
    expect(p.lap).toBe(2);
    expect(p.lapTimes).toHaveLength(1);
    expect(p.nextCheckpoint).toBe(1);
    expect(p.progress).toBeCloseTo(L + 5, 1);
  });

  it('keeps progress continuous across the start/finish line', () => {
    const { p, kart } = setup();
    let prev = p.progress;
    let d = L - 10;
    let t = 0;
    // Two full laps plus 20 m: crosses the line three times (start, lap 1, lap 2).
    for (let i = 0; i < 2 * L + 20; i += 5) {
      d += 5;
      t += 0.25;
      place(kart, d);
      updateRaceProgress(p, kart, track, t);
      expect(p.progress - prev).toBeGreaterThan(4);
      expect(p.progress - prev).toBeLessThan(6);
      prev = p.progress;
    }
    expect(p.lap).toBe(3);
    expect(p.lapTimes).toHaveLength(2);
    expect(p.progress).toBeCloseTo(d - L, 0);
  });

  it('finishes after the configured laps, records lap times that add up, then freezes', () => {
    const { p, kart } = setup();
    let t = 0;
    for (let lap = 0; lap < 3; lap++) t = drive(p, kart, L - 10 + lap * L, L - 10 + (lap + 1) * L, t);
    expect(p.finished).toBe(false);
    t = drive(p, kart, 4 * L - 10, 4 * L + 20, t);
    expect(p.finished).toBe(true);
    expect(p.lap).toBe(3);
    expect(p.lapTimes).toHaveLength(3);
    expect(p.finishTime).toBeDefined();
    const total = p.lapTimes.reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(p.finishTime!, 6);
    // Lap 1 includes the run-up to the line; laps 2 and 3 are a full lap each at 20 m/s.
    expect(p.lapTimes[1]).toBeCloseTo(L / 20, 1);
    expect(p.lapTimes[2]).toBeCloseTo(L / 20, 1);
    expect(p.lapTimes[0]).toBeCloseTo((L + 10) / 20, 1);
    // Crossing times are interpolated, so the finish is not quantized to the 0.25 s step.
    expect(p.finishTime!).toBeCloseTo((3 * L + 10) / 20, 1);

    const snapshot = JSON.stringify(p);
    drive(p, kart, 4 * L + 20, 5 * L + 20, t);
    expect(JSON.stringify(p)).toBe(snapshot);
  });

  it('does not count a lap on a reverse crossing and un-passes checkpoints driven backwards', () => {
    const { p, kart } = setup();
    // Full lap minus the last bit, so all checkpoints are passed and the line is next.
    let t = drive(p, kart, L - 10, 2 * L - 5, 0);
    expect(p.nextCheckpoint).toBe(0);
    expect(p.lap).toBe(1);
    // Cross the line forward: lap 2. Then reverse back over it: lap 1 again, lap time withdrawn.
    t = drive(p, kart, 2 * L - 5, 2 * L + 8, t);
    expect(p.lap).toBe(2);
    expect(p.lapTimes).toHaveLength(1);
    t = drive(p, kart, 2 * L + 8, 2 * L - 8, t);
    expect(p.lap).toBe(1);
    expect(p.lapTimes).toHaveLength(0);
    expect(p.nextCheckpoint).toBe(0);
    expect(p.progress).toBeCloseTo(L - 8, 1);
    // Forward again counts the lap exactly once.
    t = drive(p, kart, 2 * L - 8, 2 * L + 8, t);
    expect(p.lap).toBe(2);
    expect(p.lapTimes).toHaveLength(1);
    expect(p.nextCheckpoint).toBe(1);
    // Reverse across the line from the start grid: the lap "un-starts" and progress follows.
    const fresh = setup();
    drive(fresh.p, fresh.kart, L - 10, L + 5, 0);
    expect(fresh.p.nextCheckpoint).toBe(1);
    drive(fresh.p, fresh.kart, L + 5, L - 15, 1);
    expect(fresh.p.nextCheckpoint).toBe(0);
    expect(fresh.p.lap).toBe(1);
    expect(fresh.p.progress).toBeCloseTo(-15, 1);
    expect(fresh.p.lapTimes).toEqual([]);
  });

  it('ignores checkpoints crossed outside the barriers (no credit for cutting the track)', () => {
    const { p, kart } = setup();
    const spacing = L / 6;
    let t = drive(p, kart, L - 10, L + spacing * 0.5, 0);
    expect(p.nextCheckpoint).toBe(1);
    // Teleport past checkpoints 1 and 2 while 15 m outside the barriers.
    place(kart, L + spacing * 2.5, 15);
    t += 1;
    updateRaceProgress(p, kart, track, t);
    expect(p.nextCheckpoint).toBe(1);
    // Rejoin the track there and keep driving: checkpoint 1 is still owed, so finishing the
    // lap does not complete it.
    place(kart, L + spacing * 2.6);
    t += 1;
    updateRaceProgress(p, kart, track, t);
    t = drive(p, kart, L + spacing * 2.6, 2 * L + 10, t);
    expect(p.lap).toBe(1);
    expect(p.lapTimes).toEqual([]);
    expect(p.nextCheckpoint).toBe(1);
  });

  it('handles the real Malibu grid position: progress is about -10 and no lap on the first crossing', async () => {
    const { MALIBU } = await import('../tracks/malibu');
    const malibu = buildTrack(MALIBU);
    const kart = createKartState({ x: 0, z: 0 }, 0);
    place(kart, malibu.length - 10, 0, malibu);
    const p = createRaceProgress();
    updateRaceProgress(p, kart, malibu, 0);
    expect(p.progress).toBeCloseTo(-10, 0);
    expect(p.lap).toBe(1);
    let t = 0;
    for (let d = malibu.length - 10; d < malibu.length + 30; d += 0.35) {
      t += 1 / 60;
      place(kart, d, 1.5, malibu);
      updateRaceProgress(p, kart, malibu, t);
    }
    expect(p.lap).toBe(1);
    expect(p.lapTimes).toEqual([]);
    expect(p.nextCheckpoint).toBe(1);
    expect(p.progress).toBeGreaterThan(25);
    expect(p.progress).toBeLessThan(35);
  });
});
