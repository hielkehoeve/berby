import { describe, expect, it } from 'vitest';
import type { KartState, RaceProgress, Track, Vec2 } from '../shared/types';
import { TAU, forwardToHeading, leftOf } from '../shared/math';
import { MALIBU } from '../tracks/malibu';
import { createKartState, resolveKartCollision } from './kart';
import { createRaceProgress, updateRaceProgress } from './race';
import { type RivalContext, rivalInput, rivalRubberBandFactor, stepRival } from './rival';
import { buildTrack } from './track';
import { PLAYER_TUNING, RUBBER_BAND } from './tuning';

const track = buildTrack(MALIBU);

function gridKart(t: Track, lateral = 0, distanceBeforeLine = 10): KartState {
  const s = t.sampleAt(t.length - distanceBeforeLine);
  const left = leftOf(s.tangent);
  return createKartState(
    { x: s.position.x + left.x * lateral, z: s.position.z + left.z * lateral },
    forwardToHeading(s.tangent),
  );
}

interface Runner {
  kart: KartState;
  progress: RaceProgress;
  /** Context to drive with, given the other runner's progress. */
  context: (other: RaceProgress) => RivalContext;
}

interface RaceResult {
  time: number;
  steps: number;
  onRoadSteps: number[];
  maxAbsLateral: number[];
  /** Lowest speed of each runner after the first 10 s (shows that corners are braked for). */
  minSpeedAfterStart: number[];
}

/** Run runners with stepRival until all finish (or the time limit), resolving bumps between them. */
function runRace(runners: Runner[], dt: number, timeLimit = 400): RaceResult {
  let t = 0;
  let steps = 0;
  const onRoadSteps = runners.map(() => 0);
  const maxAbsLateral = runners.map(() => 0);
  const minSpeedAfterStart = runners.map(() => Infinity);
  while (t < timeLimit && runners.some((r) => !r.progress.finished)) {
    runners.forEach((r, i) => {
      const other = runners[(i + 1) % runners.length];
      stepRival(r.kart, track, r.context(other.progress), dt);
    });
    if (runners.length === 2) resolveKartCollision(runners[0].kart, runners[1].kart);
    t += dt;
    steps++;
    runners.forEach((r, i) => {
      updateRaceProgress(r.progress, r.kart, track, t);
      const lateral = Math.abs(track.nearest(r.kart.position).lateral);
      maxAbsLateral[i] = Math.max(maxAbsLateral[i], lateral);
      if (r.kart.onRoad) onRoadSteps[i]++;
      if (t > 10 && !r.progress.finished) minSpeedAfterStart[i] = Math.min(minSpeedAfterStart[i], r.kart.speed);
    });
  }
  return { time: t, steps, onRoadSteps, maxAbsLateral, minSpeedAfterStart };
}

describe('rivalInput', () => {
  it('is pure, full throttle on the straight, and steers toward the centerline', () => {
    const kart = gridKart(track, 3); // 3 m left of center on the seaside straight
    kart.speed = 15;
    const snapshot = JSON.stringify(kart);
    const input = rivalInput(kart, track, { rivalProgress: 0, playerProgress: 0 }, 1 / 60);
    expect(JSON.stringify(kart)).toBe(snapshot);
    expect(input.throttle).toBe(1);
    expect(input.brake).toBe(0);
    expect(input.steer).toBeGreaterThan(0); // the center is to the right of a kart on the left
    expect(Math.abs(input.steer)).toBeLessThanOrEqual(1);

    const right = gridKart(track, -3);
    right.speed = 15;
    expect(rivalInput(right, track, { rivalProgress: 0, playerProgress: 0 }, 1 / 60).steer).toBeLessThan(0);
  });

  it('brakes when arriving too fast at a corner', () => {
    // A 30 m radius circle cannot be taken at top speed with the rival's planning grip.
    const controlPoints: Vec2[] = [];
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU;
      controlPoints.push({ x: 30 * Math.sin(a), z: -30 * Math.cos(a) });
    }
    const circle = buildTrack({ ...MALIBU, id: 'circle', controlPoints });
    const s = circle.sampleAt(5);
    const kart = createKartState(s.position, forwardToHeading(s.tangent));
    kart.speed = PLAYER_TUNING.topSpeed;
    const input = rivalInput(kart, circle, { rivalProgress: 0, playerProgress: 0 }, 1 / 60);
    expect(input.throttle).toBe(0);
    expect(input.brake).toBeGreaterThan(0);
    expect(input.brake).toBeLessThanOrEqual(1);
  });
});

describe('rubber band', () => {
  it('gives a bonus when behind, a penalty when far ahead, and nothing when level', () => {
    expect(rivalRubberBandFactor({ rivalProgress: 100, playerProgress: 100 })).toBe(1);
    expect(rivalRubberBandFactor({ rivalProgress: 0, playerProgress: 500 })).toBeCloseTo(1 + RUBBER_BAND.maxBonus, 9);
    expect(rivalRubberBandFactor({ rivalProgress: 500, playerProgress: 0 })).toBeCloseTo(1 - RUBBER_BAND.maxPenalty, 9);
    const half = rivalRubberBandFactor({ rivalProgress: 0, playerProgress: RUBBER_BAND.bonusRange / 2 });
    expect(half).toBeCloseTo(1 + RUBBER_BAND.maxBonus / 2, 9);
    expect(RUBBER_BAND.maxBonus).toBeLessThanOrEqual(0.1);
    expect(RUBBER_BAND.maxPenalty).toBeLessThanOrEqual(0.1);
  });

  it('lets the rival exceed the normal top speed only when behind', () => {
    const behind = gridKart(track);
    const level = gridKart(track);
    for (let i = 0; i < 60 * 8; i++) {
      stepRival(behind, track, { rivalProgress: 0, playerProgress: 1000 }, 1 / 60);
      stepRival(level, track, { rivalProgress: 0, playerProgress: 0 }, 1 / 60);
    }
    expect(level.speed).toBeCloseTo(PLAYER_TUNING.topSpeed, 1);
    expect(behind.speed).toBeCloseTo(PLAYER_TUNING.topSpeed * (1 + RUBBER_BAND.maxBonus), 1);
  });
});

describe('headless races on Malibu', () => {
  it('the rival alone finishes 3 laps in a sane time and stays on the road', () => {
    const runner: Runner = {
      kart: gridKart(track),
      progress: createRaceProgress(),
      context: () => ({ rivalProgress: 0, playerProgress: 0 }), // level: no rubber band
    };
    const result = runRace([runner], 1 / 60);
    const p = runner.progress;
    expect(p.finished).toBe(true);
    expect(p.lapTimes).toHaveLength(MALIBU.laps);
    for (const lap of p.lapTimes) {
      expect(lap).toBeGreaterThan(40);
      expect(lap).toBeLessThan(80);
    }
    expect(p.finishTime!).toBeGreaterThan(120);
    expect(p.finishTime!).toBeLessThan(240);
    expect(result.onRoadSteps[0] / result.steps).toBeGreaterThanOrEqual(0.97);
    expect(result.maxAbsLateral[0]).toBeLessThan(MALIBU.barrierOffset);
    // It reaches top speed on the straights and slows down for the corners.
    expect(runner.kart.speed).toBeGreaterThan(PLAYER_TUNING.topSpeed * 0.9);
    expect(result.minSpeedAfterStart[0]).toBeLessThan(PLAYER_TUNING.topSpeed * 0.9);
    expect(result.minSpeedAfterStart[0]).toBeGreaterThan(5);
    // Progress ended up where a 3-lap race ends.
    expect(p.progress).toBeGreaterThan(MALIBU.laps * track.length - 5);
    expect(p.progress).toBeLessThan(MALIBU.laps * track.length + 5);
  });

  it('also holds together at dt = 1/30', () => {
    const runner: Runner = {
      kart: gridKart(track),
      progress: createRaceProgress(),
      context: () => ({ rivalProgress: 0, playerProgress: 0 }),
    };
    const result = runRace([runner], 1 / 30);
    expect(runner.progress.finished).toBe(true);
    expect(result.onRoadSteps[0] / result.steps).toBeGreaterThanOrEqual(0.97);
    for (const lap of runner.progress.lapTimes) {
      expect(lap).toBeGreaterThan(40);
      expect(lap).toBeLessThan(80);
    }
  });

  it('the rubber band keeps the finish gap to a handicapped stand-in player small', () => {
    // The stand-in drives the rival AI with a permanent 5% penalty (as if always far ahead),
    // on the right side of the grid. The real rival starts on the left and rubber-bands on the
    // stand-in's actual progress.
    const handicap: RivalContext = {
      rivalProgress: (RUBBER_BAND.penaltyRange * 0.05) / RUBBER_BAND.maxPenalty,
      playerProgress: 0,
    };
    expect(rivalRubberBandFactor(handicap)).toBeCloseTo(0.95, 9);

    const race = (banded: boolean) => {
      const standIn: Runner = { kart: gridKart(track, -3), progress: createRaceProgress(), context: () => handicap };
      const rival: Runner = {
        kart: gridKart(track, 3),
        progress: createRaceProgress(),
        context: (other) =>
          banded
            ? { rivalProgress: rival.progress.progress, playerProgress: other.progress }
            : { rivalProgress: 0, playerProgress: 0 },
      };
      runRace([standIn, rival], 1 / 60);
      expect(standIn.progress.finished).toBe(true);
      expect(rival.progress.finished).toBe(true);
      return standIn.progress.finishTime! - rival.progress.finishTime!;
    };

    const gapWithoutBand = race(false);
    const gapWithBand = race(true);
    // Without the band a 5% pace difference opens up a large gap over 3 laps...
    expect(gapWithoutBand).toBeGreaterThan(5);
    // ...with it the rival sits just ahead, within a few seconds.
    expect(gapWithBand).toBeGreaterThan(0);
    expect(gapWithBand).toBeLessThan(4);
    expect(gapWithBand).toBeLessThan(gapWithoutBand / 2);
  });
});
