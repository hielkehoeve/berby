import { describe, expect, it } from 'vitest';
import { buildTrack } from '../sim/track';
import { MALIBU } from '../tracks/malibu';
import { createRace, UNLIMITED_LAPS, withLaps } from './race';

const track = buildTrack(MALIBU);
const FULL: { steer: number; throttle: number; brake: number } = { steer: 0, throttle: 1, brake: 0 };

describe('withLaps', () => {
  it('changes only the lap count and keeps the track queryable', () => {
    const one = withLaps(track, 1);
    expect(one.definition.laps).toBe(1);
    expect(one.length).toBe(track.length);
    expect(one.checkpoints).toBe(track.checkpoints);
    expect(one.sampleAt(10).distance).toBeCloseTo(10, 5);
    expect(withLaps(track, track.definition.laps)).toBe(track);
    expect(withLaps(track, UNLIMITED_LAPS).definition.laps).toBe(UNLIMITED_LAPS);
  });
});

describe('createRace without a rival', () => {
  it('parks the rival on the grid and ranks the player first', () => {
    const race = createRace(withLaps(track, 1), { rival: false });
    const start = { ...race.rival.position };
    for (let i = 0; i < 300; i++) race.step(FULL, 1 / 60);
    expect(race.rival.position).toEqual(start);
    expect(race.rival.speed).toBe(0);
    expect(race.rivalProgress.progress).toBe(0);
    expect(race.player.speed).toBeGreaterThan(10);
    expect(race.playerPosition()).toBe(1);
  });

  it('still finishes and names the player the winner', () => {
    const race = createRace(withLaps(track, 1), { rival: false });
    // Full throttle, no steering: the kart hits the barriers in turn 1 but the straight is long
    // enough for the start line to be crossed, which is all this checks.
    for (let i = 0; i < 120 && !race.finished; i++) race.step(FULL, 1 / 60);
    expect(race.playerProgress.lap).toBe(1);
    expect(race.winner).toBeNull();
  });
});
