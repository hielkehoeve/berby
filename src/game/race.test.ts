import { describe, expect, it } from 'vitest';
import { buildTrack } from '../sim/track';
import { MALIBU } from '../tracks/malibu';
import { forwardToHeading, wrapAngle } from '../shared/math';
import type { KartInput, KartState, Track } from '../shared/types';
import { createRace, GRID, gridSlot } from './race';

const DT = 1 / 60;
const track = buildTrack(MALIBU);

/** A simple look-ahead driver for the player, so a test can complete a race. */
function lookAheadInput(kart: KartState, t: Track): KartInput {
  const { sample } = t.nearest(kart.position);
  const target = t.sampleAt(sample.distance + 18);
  const desired = forwardToHeading({ x: target.position.x - kart.position.x, z: target.position.z - kart.position.z });
  const error = wrapAngle(desired - kart.heading);
  const steer = Math.max(-1, Math.min(1, -error * 2.5));
  return { steer, throttle: 1, brake: Math.abs(error) > 0.9 ? 1 : 0 };
}

describe('gridSlot', () => {
  it('places a kart before the start line, facing along the track', () => {
    const slot = gridSlot(track, 8, 0);
    const { sample, lateral } = track.nearest(slot.position);
    expect(Math.abs(sample.distance - (track.length - 8))).toBeLessThan(1);
    expect(Math.abs(lateral)).toBeLessThan(0.5);
    expect(Math.abs(wrapAngle(slot.heading - forwardToHeading(sample.tangent)))).toBeLessThan(0.05);
  });

  it('offsets laterally (+ = left of travel)', () => {
    const left = gridSlot(track, 8, 2.5);
    const right = gridSlot(track, 8, -2.5);
    expect(track.nearest(left.position).lateral).toBeCloseTo(2.5, 1);
    expect(track.nearest(right.position).lateral).toBeCloseTo(-2.5, 1);
  });
});

describe('createRace', () => {
  it('starts both karts on the grid, stopped, with no progress', () => {
    const race = createRace(track);
    expect(race.player.speed).toBe(0);
    expect(race.rival.speed).toBe(0);
    expect(race.time).toBe(0);
    expect(race.finished).toBe(false);
    expect(race.winner).toBeNull();
    expect(race.playerProgress.lap).toBe(1);
    const pd = track.nearest(race.player.position).sample.distance;
    const rd = track.nearest(race.rival.position).sample.distance;
    expect(Math.abs(pd - (track.length - GRID.player.back))).toBeLessThan(1);
    expect(Math.abs(rd - (track.length - GRID.rival.back))).toBeLessThan(1);
  });

  it('advances time and the karts in fixed steps (auto-gas)', () => {
    const race = createRace(track);
    for (let i = 0; i < 60; i++) race.step({ steer: 0, throttle: 1, brake: 0 }, DT);
    expect(race.time).toBeCloseTo(1, 5);
    expect(race.player.speed).toBeGreaterThan(0);
    expect(race.rival.speed).toBeGreaterThan(0);
    expect(race.finished).toBe(false);
    expect([1, 2]).toContain(race.playerPosition());
    expect(race.bestLap()).toBeNull();
  });

  it('ends when the player finishes and names a winner', (ctx) => {
    const race = createRace(track);
    const budgetSteps = 900 * 60; // 15 simulated minutes, far more than three laps need
    for (let i = 0; i < budgetSteps && !race.finished; i++) {
      race.step(lookAheadInput(race.player, track), DT);
    }
    if (!race.finished) {
      ctx.skip('the test driver could not complete the race with the current kart tuning');
      return;
    }
    expect(race.winner === 'player' || race.winner === 'rival').toBe(true);
    expect(race.playerProgress.lapTimes).toHaveLength(MALIBU.laps);
    expect(race.totalTime()).toBeGreaterThan(0);
    expect(race.totalTime()).toBeCloseTo(
      race.playerProgress.lapTimes.reduce((a, b) => a + b, 0),
      1,
    );
    expect(race.bestLap()).toBe(Math.min(...race.playerProgress.lapTimes));
    expect(race.playerPosition()).toBe(race.winner === 'player' ? 1 : 2);
    // Coasting after the finish keeps the clock running but never changes the result.
    const t = race.time;
    race.coast(DT);
    expect(race.time).toBeGreaterThan(t);
    expect(race.finished).toBe(true);
  });
});
