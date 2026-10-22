import { describe, expect, it } from 'vitest';
import type { KartInput, KartState } from '../../shared/types';
import { TAU, distance, forwardToHeading, headingToForward, leftOf, wrapAngle } from '../../shared/math';
import { buildTrack } from '../../sim/track';
import { PLAYER_TUNING } from '../../sim/tuning';
import { rivalInput } from '../../sim/rival';
import { MALIBU } from '../../tracks/malibu';
import { createRace, type Race } from '../../game/race';
import { boostSpeed, createCupState, gapBehind, resetCupState, stepCup, useItem, type CupState } from './cup';
import { CUP_TUNING } from './tuning';

const track = buildTrack(MALIBU);
const DT = 1 / 60;
const GAS: KartInput = { steer: 0, throttle: 1, brake: 0 };
const COAST: KartInput = { steer: 0, throttle: 0, brake: 0 };

/** mulberry32, so the item rolls are the same on every run. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Teleport a kart onto the centerline at a distance, facing along the track. */
function place(kart: KartState, dist: number, lateral = 0, speed = 0): void {
  const s = track.sampleAt(dist);
  const left = leftOf(s.tangent);
  kart.position.x = s.position.x + left.x * lateral;
  kart.position.z = s.position.z + left.z * lateral;
  kart.heading = forwardToHeading(s.tangent);
  kart.speed = speed;
  kart.steerAngle = 0;
}

function setup(seed = 1): { race: Race; state: CupState } {
  const race = createRace(track);
  const state = createCupState(track, seeded(seed));
  return { race, state };
}

/** Run the race and the cup for `seconds` with the player's input (the rival drives itself). */
function run(race: Race, state: CupState, input: KartInput, seconds: number, onStep?: () => void): void {
  const steps = Math.round(seconds / DT);
  for (let i = 0; i < steps; i++) {
    race.step(input, DT);
    stepCup(state, race, DT);
    onStep?.();
  }
}

/** The centerline distance of the point of the loop farthest (as the crow flies) from p. */
function farthestFrom(p: { x: number; z: number }): number {
  let best = 0;
  let bestD = -1;
  for (let d = 0; d < track.length; d += 5) {
    const q = distance(p, track.sampleAt(d).position);
    if (q > bestD) {
      bestD = q;
      best = d;
    }
  }
  return best;
}

/** Keep the rival parked on the far side of the track so it cannot interfere. */
function parkRival(race: Race): void {
  place(race.rival, 600, 0, 0);
}

describe('item boxes', () => {
  it('hands an item to a kart driving through a box and brings the box back after 4 s', () => {
    const { race, state } = setup();
    parkRival(race);
    const box = state.boxes[1]; // row 0, centre
    place(race.player, box.distance - 6, 0, PLAYER_TUNING.topSpeed);
    let picked = false;
    run(race, state, GAS, 1, () => {
      if (state.events.some((e) => e.kind === 'pickup' && e.who === 'player')) picked = true;
    });
    expect(picked).toBe(true);
    expect(state.player.held).not.toBeNull();
    expect(state.respawnAt[1]).toBeGreaterThan(0);
    const takenAt = state.respawnAt[1] - CUP_TUNING.boxes.respawn;
    expect(race.time).toBeLessThan(takenAt + CUP_TUNING.boxes.respawn);
    expect(state.respawnAt[1]).toBeCloseTo(takenAt + 4, 6);
  });

  it('does not pick up with full hands and takes one box per pass', () => {
    const { race, state } = setup();
    parkRival(race);
    const box = state.boxes[1];
    place(race.player, box.distance - 6, 0, PLAYER_TUNING.topSpeed);
    run(race, state, GAS, 1);
    const held = state.player.held;
    expect(held).not.toBeNull();
    expect(state.respawnAt.filter((t) => t > 0)).toHaveLength(1);
    // Drive through the next row holding the item: nothing happens.
    place(race.player, state.boxes[4].distance - 6, 0, PLAYER_TUNING.topSpeed);
    run(race, state, GAS, 1);
    expect(state.player.held).toBe(held);
    expect(state.respawnAt.filter((t) => t > 0)).toHaveLength(1);
  });

  it('misses a box more than the pickup radius away', () => {
    const { race, state } = setup();
    parkRival(race);
    const box = state.boxes[1];
    // 1.5 m left of the centre box: inside the 1.6 m radius.
    place(race.player, box.distance - 6, 1.5, PLAYER_TUNING.topSpeed);
    run(race, state, GAS, 1);
    expect(state.player.held).not.toBeNull();
    const { race: r2, state: s2 } = setup();
    parkRival(r2);
    // 5.3 m left of centre: 1.8 m from the left box, just outside.
    place(r2.player, box.distance - 6, 5.3, PLAYER_TUNING.topSpeed);
    run(r2, s2, GAS, 1);
    expect(s2.player.held).toBeNull();
  });

  it('resets to the grid state', () => {
    const { race, state } = setup();
    parkRival(race);
    place(race.player, state.boxes[1].distance - 6, 0, PLAYER_TUNING.topSpeed);
    run(race, state, GAS, 1);
    state.player.held = 'bomb';
    useItem(state, race, 'player');
    resetCupState(state);
    expect(state.respawnAt.every((t) => t === -Infinity)).toBe(true);
    expect(state.player.held).toBeNull();
    expect(state.player.itemsUsed).toBe(0);
    expect(state.bombs.every((b) => !b.active)).toBe(true);
    expect(state.missile.active).toBe(false);
  });
});

describe('Lipstick Rocket', () => {
  it('holds the kart above its top speed for the duration, then the sim pulls it back', () => {
    const { race, state } = setup();
    parkRival(race);
    place(race.player, 50, 0, PLAYER_TUNING.topSpeed);
    state.player.held = 'rocket';
    expect(useItem(state, race, 'player')).toBe(true);
    expect(state.player.itemsUsed).toBe(1);
    expect(race.player.speed).toBeCloseTo(boostSpeed(), 6);
    let minDuringBoost = Infinity;
    run(race, state, GAS, CUP_TUNING.rocket.duration - 0.05, () => {
      minDuringBoost = Math.min(minDuringBoost, race.player.speed);
    });
    expect(minDuringBoost).toBeCloseTo(boostSpeed(), 6);
    run(race, state, GAS, 2);
    expect(race.player.speed).toBeCloseTo(PLAYER_TUNING.topSpeed, 3);
  });
});

describe('Glitter Bomb', () => {
  it('drops 2 m behind the kart and spares the dropper for a second', () => {
    const { race, state } = setup();
    parkRival(race);
    place(race.player, 50, 0, 0);
    state.player.held = 'bomb';
    useItem(state, race, 'player');
    const bomb = state.bombs.find((b) => b.active)!;
    expect(bomb).toBeDefined();
    const fwd = headingToForward(race.player.heading);
    expect(bomb.x).toBeCloseTo(race.player.position.x - fwd.x * 2, 6);
    expect(bomb.z).toBeCloseTo(race.player.position.z - fwd.z * 2, 6);
    // Standing still with the bomb 2 m behind, i.e. outside its 1.5 m radius; back into it.
    race.player.position.x = bomb.x;
    race.player.position.z = bomb.z;
    run(race, state, COAST, 0.5);
    expect(state.player.spinLeft).toBe(0);
    expect(bomb.active).toBe(true);
    run(race, state, COAST, 0.6);
    expect(state.player.spinLeft).toBeGreaterThan(0);
    expect(bomb.active).toBe(false);
  });

  it('spins out the other kart: speed x 0.35 and one full turn over 0.8 s', () => {
    const { race, state } = setup();
    place(race.player, 50, 0, 0);
    state.player.held = 'bomb';
    useItem(state, race, 'player');
    const bomb = state.bombs.find((b) => b.active)!;
    place(race.rival, 48, 0, PLAYER_TUNING.topSpeed);
    race.rival.position.x = bomb.x;
    race.rival.position.z = bomb.z;
    const heading0 = race.rival.heading;
    // Step the cup alone so the rival's AI does not steer during the measurement.
    stepCup(state, race, DT);
    expect(state.events).toContainEqual({ kind: 'spin', who: 'rival', by: 'player' });
    expect(race.rival.speed).toBeCloseTo(PLAYER_TUNING.topSpeed * CUP_TUNING.spin.speedFactor, 6);
    expect(state.player.hitsLanded).toBe(1);
    expect(bomb.active).toBe(false);
    let turned = 0;
    let prev = race.rival.heading;
    const steps = Math.round(CUP_TUNING.spin.duration / DT);
    for (let i = 0; i < steps; i++) {
      stepCup(state, race, DT);
      turned += wrapAngle(race.rival.heading - prev);
      prev = race.rival.heading;
    }
    expect(turned).toBeCloseTo(TAU, 6);
    expect(wrapAngle(race.rival.heading - heading0)).toBeCloseTo(0, 6);
    expect(state.rival.spinLeft).toBe(0);
  });

  it('keeps at most six bombs and lets them expire after 20 s', () => {
    const { race, state } = setup();
    parkRival(race);
    place(race.player, 50, 0, 0);
    for (let i = 0; i < 8; i++) {
      state.player.held = 'bomb';
      useItem(state, race, 'player');
      run(race, state, COAST, 0.1);
      place(race.player, 50 + (i + 1) * 5, 0, 0);
    }
    expect(state.bombs.filter((b) => b.active)).toHaveLength(6);
    // The oldest two were replaced: every live bomb was dropped after the first two.
    const oldest = Math.min(...state.bombs.map((b) => b.droppedAt));
    expect(oldest).toBeGreaterThan(0.15);
    run(race, state, COAST, CUP_TUNING.bomb.life + 0.5);
    expect(state.bombs.some((b) => b.active)).toBe(false);
  });
});

describe('Kiss Missile', () => {
  it('chases the other kart and spins it out', () => {
    const { race, state } = setup();
    place(race.player, 50, 0, PLAYER_TUNING.topSpeed);
    place(race.rival, 80, 2, 0);
    state.player.held = 'missile';
    useItem(state, race, 'player');
    expect(state.missile.active).toBe(true);
    expect(state.missile.owner).toBe('player');
    let hit = false;
    for (let i = 0; i < 120 && !hit; i++) {
      stepCup(state, race, DT);
      hit = state.events.some((e) => e.kind === 'spin' && e.who === 'rival' && e.by === 'player');
    }
    expect(hit).toBe(true);
    expect(state.missile.active).toBe(false);
    expect(state.player.hitsLanded).toBe(1);
    expect(race.time).toBeLessThan(1);
  });

  it('fizzles at launch when the target is more than 60 m ahead', () => {
    const { race, state } = setup();
    place(race.player, 50, 0, 0);
    place(race.rival, 50 + CUP_TUNING.missile.maxGap + 5, 0, 0);
    run(race, state, COAST, DT); // progress needs one update
    expect(gapBehind(race, 'player')).toBeGreaterThan(CUP_TUNING.missile.maxGap);
    state.player.held = 'missile';
    useItem(state, race, 'player');
    expect(state.missile.active).toBe(false);
    expect(state.events).toContainEqual({ kind: 'fizzle', who: 'player' });
    expect(state.player.itemsUsed).toBe(1);
  });

  it('fizzles after 3 s in the air without a hit', () => {
    const { race, state } = setup();
    place(race.player, 50, 0, 0);
    place(race.rival, 90, 0, 0);
    run(race, state, COAST, DT);
    state.player.held = 'missile';
    useItem(state, race, 'player');
    expect(state.missile.active).toBe(true);
    // The target vanishes to the geometrically farthest point of the loop (well over 135 m away).
    place(race.rival, farthestFrom(race.player.position), 0, 0);
    expect(distance(race.player.position, race.rival.position)).toBeGreaterThan(200);
    let fizzled = false;
    run(race, state, COAST, CUP_TUNING.missile.life + 0.1, () => {
      if (state.events.some((e) => e.kind === 'fizzle')) fizzled = true;
    });
    expect(fizzled).toBe(true);
    expect(state.missile.active).toBe(false);
    expect(state.rival.spinLeft).toBe(0);
  });

  it('turns around to chase a target behind the shooter', () => {
    const { race, state } = setup();
    place(race.player, 80, 0, 0);
    place(race.rival, 60, 0, 0);
    run(race, state, COAST, DT);
    state.player.held = 'missile';
    useItem(state, race, 'player');
    let hit = false;
    for (let i = 0; i < 180 && !hit; i++) {
      stepCup(state, race, DT);
      hit = state.events.some((e) => e.kind === 'spin' && e.who === 'rival');
    }
    expect(hit).toBe(true);
  });
});

describe('Heart Shield', () => {
  it('absorbs the next hit instead of a spin and counts as a landed hit', () => {
    const { race, state } = setup();
    place(race.player, 50, 0, PLAYER_TUNING.topSpeed);
    state.player.held = 'shield';
    useItem(state, race, 'player');
    expect(state.player.shield).toBe(true);
    place(race.rival, 52, 0, 0);
    state.rival.held = 'bomb';
    useItem(state, race, 'rival');
    const bomb = state.bombs.find((b) => b.active)!;
    race.player.position.x = bomb.x;
    race.player.position.z = bomb.z;
    stepCup(state, race, DT);
    expect(state.events).toContainEqual({ kind: 'shieldBreak', who: 'player', by: 'rival' });
    expect(state.player.shield).toBe(false);
    expect(state.player.spinLeft).toBe(0);
    expect(race.player.speed).toBeCloseTo(PLAYER_TUNING.topSpeed, 6);
    expect(state.rival.hitsLanded).toBe(1);
    expect(bomb.active).toBe(false);
  });

  it('a kart in its grace after a hit is not hit again', () => {
    const { race, state } = setup();
    place(race.player, 50, 0, 0);
    state.player.held = 'bomb';
    useItem(state, race, 'player');
    const first = state.bombs.find((b) => b.active)!;
    place(race.rival, 48, 0, 10);
    race.rival.position.x = first.x;
    race.rival.position.z = first.z;
    stepCup(state, race, DT);
    expect(state.rival.spinLeft).toBeGreaterThan(0);
    // A second bomb right under the spinning kart does nothing while it spins and for the grace.
    state.player.held = 'bomb';
    useItem(state, race, 'player');
    const second = state.bombs.find((b) => b.active)!;
    second.x = race.rival.position.x;
    second.z = race.rival.position.z;
    let spins = 0;
    for (let i = 0; i < 60; i++) {
      stepCup(state, race, DT);
      second.x = race.rival.position.x;
      second.z = race.rival.position.z;
      spins += state.events.filter((e) => e.kind === 'spin').length;
    }
    expect(spins).toBe(0);
    expect(state.player.hitsLanded).toBe(1);
  });
});

describe('Vix', () => {
  it('raises a shield after holding it for her hold time', () => {
    const { race, state } = setup();
    place(race.player, 300, 0, 0);
    place(race.rival, 50, 0, 0);
    state.rival.held = 'shield';
    state.rival.heldSince = 0;
    state.rival.holdTime = 1.5;
    run(race, state, COAST, 1.2);
    expect(state.rival.held).toBe('shield');
    expect(state.rival.shield).toBe(false);
    run(race, state, COAST, 0.5);
    expect(state.rival.held).toBeNull();
    expect(state.rival.shield).toBe(true);
    expect(state.rival.itemsUsed).toBe(1);
  });

  it('fires the missile at a player ahead within 50 m', () => {
    const { race, state } = setup();
    place(race.player, 80, 0, 0);
    place(race.rival, 50, 0, 0);
    run(race, state, COAST, DT);
    state.rival.held = 'missile';
    state.rival.heldSince = race.time;
    state.rival.holdTime = 0.5;
    let fired = false;
    run(race, state, COAST, 1, () => {
      if (state.events.some((e) => e.kind === 'use' && e.who === 'rival' && e.item === 'missile')) fired = true;
    });
    expect(fired).toBe(true);
  });
});

describe('a whole race on autopilot', () => {
  it('picks up, uses and lands items, and keeps every number finite', () => {
    const { race, state } = setup(7);
    const counts = { pickup: 0, use: 0, spin: 0, shieldBreak: 0, fizzle: 0 };
    const steps = Math.round(100 / DT);
    for (let i = 0; i < steps && !race.finished; i++) {
      const input = rivalInput(race.player, track, { rivalProgress: 0, playerProgress: 0, player: race.rival }, DT);
      race.step(input, DT);
      stepCup(state, race, DT);
      // The player uses whatever it picks up after a second.
      if (state.player.held !== null && race.time - state.player.heldSince > 1) useItem(state, race, 'player');
      for (const e of state.events) counts[e.kind]++;
    }
    for (const k of [race.player, race.rival]) {
      expect([k.position.x, k.position.z, k.heading, k.speed].every(Number.isFinite)).toBe(true);
      expect(distance(k.position, track.nearest(k.position).sample.position)).toBeLessThan(MALIBU.barrierOffset + 1);
    }
    expect(counts.pickup).toBeGreaterThan(6);
    expect(counts.use).toBeGreaterThan(4);
    expect(state.player.itemsUsed + state.rival.itemsUsed).toBe(counts.use);
    expect(state.player.hitsLanded + state.rival.hitsLanded).toBe(counts.spin + counts.shieldBreak);
  });
});
