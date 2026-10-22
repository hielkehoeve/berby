import { describe, expect, it } from 'vitest';
import type { Star } from './layout';
import {
  collectStar,
  createRushEvents,
  createRushState,
  expireChain,
  isRushOver,
  isStarActive,
  lowerBound,
  multiplierFor,
  pickupPitch,
  resetRushState,
  starScale,
  stepRush,
  tickAt,
  timeLeft,
} from './rules';
import { RUSH_TUNING } from './tuning';

const T = RUSH_TUNING;

/** A star on a straight "track" that runs along +x, so distance === x. */
const star = (distance: number, lateral = 0, kind: Star['kind'] = 'glitter'): Star => ({
  kind,
  distance,
  lateral,
  x: distance,
  z: -lateral,
});

describe('multiplierFor', () => {
  it('is ×1, ×2 from chainForX2 and ×3 from chainForX3', () => {
    expect(multiplierFor(0)).toBe(1);
    expect(multiplierFor(T.chainForX2 - 1)).toBe(1);
    expect(multiplierFor(T.chainForX2)).toBe(2);
    expect(multiplierFor(T.chainForX3 - 1)).toBe(2);
    expect(multiplierFor(T.chainForX3)).toBe(3);
    expect(multiplierFor(1000)).toBe(3);
  });
});

describe('timeLeft and isRushOver', () => {
  it('counts down from the limit plus the bonuses', () => {
    const state = createRushState(0);
    expect(timeLeft(state, 0)).toBe(T.seconds);
    expect(timeLeft(state, 10)).toBe(T.seconds - 10);
    state.bonusSeconds = 6;
    expect(timeLeft(state, 10)).toBe(T.seconds - 4);
    expect(isRushOver(state, T.seconds + 5.99)).toBe(false);
    expect(isRushOver(state, T.seconds + 6)).toBe(true);
  });
});

describe('isStarActive and starScale', () => {
  it('a never-taken star is active and full size', () => {
    expect(isStarActive(-Infinity, 0)).toBe(true);
    expect(starScale(-Infinity, 0)).toBe(1);
    expect(starScale(-Infinity, 1000)).toBe(1);
  });

  it('a taken star shrinks, stays away for respawnSeconds, then grows back', () => {
    const t0 = 10;
    expect(starScale(t0, t0)).toBe(1);
    expect(starScale(t0, t0 + T.shrinkSeconds / 2)).toBeCloseTo(0.5);
    expect(starScale(t0, t0 + T.shrinkSeconds)).toBe(0);
    expect(starScale(t0, t0 + T.respawnSeconds - 0.01)).toBe(0);
    expect(isStarActive(t0, t0 + T.respawnSeconds - 0.01)).toBe(false);
    expect(starScale(t0, t0 + T.respawnSeconds + T.growSeconds / 2)).toBeCloseTo(0.5);
    expect(isStarActive(t0, t0 + T.respawnSeconds)).toBe(true);
    expect(starScale(t0, t0 + T.respawnSeconds + T.growSeconds)).toBe(1);
  });
});

describe('collectStar', () => {
  it('scores, chains pickups within the gap, and restarts the chain after a longer pause', () => {
    const state = createRushState(3);
    const events = createRushEvents();
    collectStar(state, 0, star(10), 1, T, events);
    expect(state.score).toBe(T.starPoints);
    expect(state.chain).toBe(1);
    expect(events.glitter).toBe(1);
    expect(state.takenAt[0]).toBe(1);
    collectStar(state, 1, star(22), 1 + T.chainGapSeconds, T, events);
    expect(state.chain).toBe(2);
    collectStar(state, 2, star(34), 1 + T.chainGapSeconds + T.chainGapSeconds + 0.01, T, events);
    expect(state.chain).toBe(1);
    expect(state.longestChain).toBe(2);
    expect(state.score).toBe(3 * T.starPoints);
    expect(state.pickups).toBe(3);
  });

  it('raises the multiplier at the chain thresholds and multiplies the points from then on', () => {
    const state = createRushState(40);
    const events = createRushEvents();
    let expected = 0;
    for (let i = 0; i < 30; i++) {
      events.multiplierRose = false;
      collectStar(state, i, star(10 + i * 12), i * 0.5, T, events);
      const chain = i + 1;
      expected += T.starPoints * multiplierFor(chain);
      expect(state.multiplier).toBe(multiplierFor(chain));
      expect(events.multiplierRose).toBe(chain === T.chainForX2 || chain === T.chainForX3);
    }
    expect(state.score).toBe(expected);
    expect(state.longestChain).toBe(30);
  });

  it('a gold star is worth goldPoints and adds goldBonusSeconds to the clock', () => {
    const state = createRushState(1);
    const events = createRushEvents();
    collectStar(state, 0, star(10, 5, 'gold'), 2, T, events);
    expect(state.score).toBe(T.goldPoints);
    expect(state.bonusSeconds).toBe(T.goldBonusSeconds);
    expect(state.goldPickups).toBe(1);
    expect(events.gold).toBe(1);
    expect(events.glitter).toBe(0);
    expect(timeLeft(state, 2)).toBe(T.seconds + T.goldBonusSeconds - 2);
  });
});

describe('expireChain', () => {
  it('keeps the chain within the gap and drops it after, announcing it from chainLostFrom links', () => {
    const state = createRushState(10);
    const events = createRushEvents();
    for (let i = 0; i < T.chainLostFrom; i++) collectStar(state, i, star(10 + i * 12), i * 0.5, T, events);
    const last = state.lastPickupTime;
    expireChain(state, last + T.chainGapSeconds, T, events);
    expect(state.chain).toBe(T.chainLostFrom);
    expect(events.chainLost).toBe(false);
    expireChain(state, last + T.chainGapSeconds + 0.001, T, events);
    expect(state.chain).toBe(0);
    expect(state.multiplier).toBe(1);
    expect(events.chainLost).toBe(true);
    // A second expiry is a no-op.
    events.chainLost = false;
    expireChain(state, last + 10, T, events);
    expect(events.chainLost).toBe(false);
  });

  it('a short chain expires quietly', () => {
    const state = createRushState(10);
    const events = createRushEvents();
    collectStar(state, 0, star(10), 0, T, events);
    expireChain(state, T.chainGapSeconds + 1, T, events);
    expect(state.chain).toBe(0);
    expect(events.chainLost).toBe(false);
  });

  it('drops the multiplier with the chain', () => {
    const state = createRushState(20);
    const events = createRushEvents();
    for (let i = 0; i < T.chainForX2; i++) collectStar(state, i, star(10 + i * 12), i * 0.5, T, events);
    expect(state.multiplier).toBe(2);
    expireChain(state, state.lastPickupTime + T.chainGapSeconds + 1, T, events);
    expect(state.multiplier).toBe(1);
    expect(state.longestChain).toBe(T.chainForX2);
  });
});

describe('lowerBound', () => {
  const stars = [10, 20, 30, 40].map((d) => star(d));
  it('finds the first star at or past a distance', () => {
    expect(lowerBound(stars, 0)).toBe(0);
    expect(lowerBound(stars, 10)).toBe(0);
    expect(lowerBound(stars, 10.5)).toBe(1);
    expect(lowerBound(stars, 40)).toBe(3);
    expect(lowerBound(stars, 41)).toBe(4);
    expect(lowerBound([], 5)).toBe(0);
  });
});

describe('stepRush', () => {
  const L = 100;
  const stars = [star(10), star(50, T.laneOffset), star(95), star(70, 5, 'gold')].sort(
    (a, b) => a.distance - b.distance,
  );
  const dt = 1 / 60;

  it('takes a star within the pickup radius and leaves one just outside', () => {
    const state = createRushState(stars.length);
    const events = createRushEvents();
    stepRush(state, stars, L, { x: 10 + T.pickupRadius + 0.05, z: 0 }, 10, 1, T, events);
    expect(state.score).toBe(0);
    stepRush(state, stars, L, { x: 10 + T.pickupRadius - 0.05, z: 0 }, 10, 1 + dt, T, events);
    expect(state.score).toBe(T.starPoints);
    expect(events.glitter).toBe(1);
  });

  it('only tests stars near the kart along the track', () => {
    const state = createRushState(stars.length);
    const events = createRushEvents();
    // Standing on the star at 50 but with a wrong lap distance: not within the window, not taken.
    stepRush(state, stars, L, { x: 50, z: -T.laneOffset }, 20, 1, T, events);
    expect(state.score).toBe(0);
    stepRush(state, stars, L, { x: 50, z: -T.laneOffset }, 49, 1, T, events);
    expect(state.score).toBe(T.starPoints);
  });

  it('wraps the window around the start line', () => {
    const events = createRushEvents();
    // A kart just past the line (lap distance 0.3) takes a star just before it (99.8).
    const s1 = createRushState(1);
    stepRush(s1, [star(99.8)], L, { x: 100.3, z: 0 }, 0.3, 1, T, events);
    expect(s1.score).toBe(T.starPoints);
    // A kart just before the line (99.7) takes a star just past it (0.2; world x 100.2 on this straight).
    const s2 = createRushState(1);
    stepRush(s2, [{ ...star(0.2), x: 100.2 }], L, { x: 99.7, z: 0 }, 99.7, 1, T, events);
    expect(s2.score).toBe(T.starPoints);
    // Close in the world but 5.5 m apart along the loop: outside the window, not even tested.
    const s3 = createRushState(1);
    stepRush(s3, [star(95)], L, { x: 95.5, z: 0 }, 0.5, 1, T, events);
    expect(s3.score).toBe(0);
  });

  it('a taken star is gone until it respawns, then can be taken again', () => {
    const state = createRushState(stars.length);
    const events = createRushEvents();
    const at = { x: 10, z: 0 };
    stepRush(state, stars, L, at, 10, 1, T, events);
    stepRush(state, stars, L, at, 10, 1 + dt, T, events);
    stepRush(state, stars, L, at, 10, 1 + T.respawnSeconds - dt, T, events);
    expect(state.score).toBe(T.starPoints);
    stepRush(state, stars, L, at, 10, 1 + T.respawnSeconds, T, events);
    expect(state.score).toBe(2 * T.starPoints);
    expect(state.chain).toBe(1);
  });

  it('expires a stale chain before collecting, and takes gold', () => {
    const state = createRushState(stars.length);
    const events = createRushEvents();
    stepRush(state, stars, L, { x: 10, z: 0 }, 10, 1, T, events);
    stepRush(state, stars, L, { x: 50, z: -T.laneOffset }, 50, 2, T, events);
    expect(state.chain).toBe(2);
    stepRush(state, stars, L, { x: 70, z: -5 }, 70, 2 + T.chainGapSeconds + 0.1, T, events);
    expect(state.chain).toBe(1);
    expect(events.gold).toBe(1);
    expect(state.score).toBe(2 * T.starPoints + T.goldPoints);
    expect(state.bonusSeconds).toBe(T.goldBonusSeconds);
  });

  it('resetRushState brings every star back and clears the score', () => {
    const state = createRushState(stars.length);
    const events = createRushEvents();
    stepRush(state, stars, L, { x: 10, z: 0 }, 10, 1, T, events);
    resetRushState(state);
    expect(state.score).toBe(0);
    expect(state.takenAt[0]).toBe(-Infinity);
    stepRush(state, stars, L, { x: 10, z: 0 }, 10, 0, T, events);
    expect(state.score).toBe(T.starPoints);
  });
});

describe('tickAt', () => {
  it('ticks once per whole second from tickFrom down to 1', () => {
    expect(tickAt(5.01, 4.99)).toBe(5);
    expect(tickAt(5, 4.98)).toBe(5);
    expect(tickAt(4.98, 4.97)).toBe(0);
    expect(tickAt(1.001, 0.99)).toBe(1);
    expect(tickAt(0.5, 0.4)).toBe(0);
    expect(tickAt(0.01, -0.01)).toBe(0);
    expect(tickAt(T.tickFrom + 1.01, T.tickFrom + 0.99)).toBe(0);
  });

  it('never ticks when a bonus pushes the clock up', () => {
    expect(tickAt(2.5, 5.4)).toBe(0);
  });

  it('plays every tick of a run exactly once', () => {
    const ticks: number[] = [];
    let prev = 7;
    for (let t = 7; t > -0.5; t -= 1 / 60) {
      const n = tickAt(prev, t);
      if (n) ticks.push(n);
      prev = t;
    }
    expect(ticks).toEqual([5, 4, 3, 2, 1]);
  });
});

describe('pickupPitch', () => {
  it('rises with the chain and caps', () => {
    expect(pickupPitch(0)).toBe(1);
    expect(pickupPitch(1)).toBeCloseTo(1 + T.pickupPitchStep);
    expect(pickupPitch(T.pickupPitchCap)).toBeCloseTo(1 + T.pickupPitchCap * T.pickupPitchStep);
    expect(pickupPitch(T.pickupPitchCap + 20)).toBeCloseTo(1 + T.pickupPitchCap * T.pickupPitchStep);
  });
});
