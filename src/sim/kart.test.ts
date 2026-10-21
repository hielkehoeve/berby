import { describe, expect, it } from 'vitest';
import type { KartInput, KartState, Track } from '../shared/types';
import { forwardToHeading, leftOf, wrapAngle } from '../shared/math';
import { MALIBU } from '../tracks/malibu';
import { KART_RADIUS, createKartState, maxSteerAngleAt, resolveKartCollision, stepKart } from './kart';
import { buildTrack } from './track';
import { PLAYER_TUNING } from './tuning';

const track = buildTrack(MALIBU);
const GAS: KartInput = { steer: 0, throttle: 1, brake: 0 };

/** A kart on the centerline at a distance, facing along the track, offset laterally (+ = left). */
function kartAt(distance: number, lateral = 0, t: Track = track): KartState {
  const s = t.sampleAt(distance);
  const left = leftOf(s.tangent);
  return createKartState(
    { x: s.position.x + left.x * lateral, z: s.position.z + left.z * lateral },
    forwardToHeading(s.tangent),
  );
}

function run(kart: KartState, input: KartInput | ((t: number) => KartInput), seconds: number, dt: number): void {
  const steps = Math.round(seconds / dt);
  for (let i = 0; i < steps; i++) {
    stepKart(kart, typeof input === 'function' ? input(i * dt) : input, track, dt);
  }
}

function finite(kart: KartState): boolean {
  return [kart.position.x, kart.position.z, kart.heading, kart.speed, kart.steerAngle].every(Number.isFinite);
}

describe('stepKart', () => {
  it('accelerates to the top speed on asphalt and no further', () => {
    const kart = kartAt(10);
    run(kart, GAS, 8, 1 / 60);
    expect(kart.speed).toBeCloseTo(PLAYER_TUNING.topSpeed, 3);
    expect(kart.onRoad).toBe(true);
    // Moved forward along the straight (toward -Z).
    expect(kart.position.z).toBeLessThan(track.sampleAt(10).position.z - 100);
  });

  it('is slower on sand than on asphalt', () => {
    const onRoad = kartAt(5, 0);
    const onSand = kartAt(5, MALIBU.roadWidth / 2 + 1.5);
    run(onRoad, GAS, 6, 1 / 60);
    run(onSand, GAS, 6, 1 / 60);
    expect(onSand.onRoad).toBe(false);
    expect(onSand.speed).toBeCloseTo(PLAYER_TUNING.topSpeed * PLAYER_TUNING.offRoadSpeedFactor, 2);
    expect(onSand.speed).toBeLessThan(onRoad.speed * 0.7);
  });

  it('turns right for a positive steer and decreases the heading', () => {
    const kart = kartAt(10);
    const startX = kart.position.x;
    run(kart, { steer: 1, throttle: 1, brake: 0 }, 1.5, 1 / 60);
    expect(kart.heading).toBeLessThan(forwardToHeading(track.sampleAt(10).tangent) - 0.3);
    expect(kart.position.x).toBeGreaterThan(startX + 1);
    expect(kart.steerAngle).toBeGreaterThan(0);
  });

  it('slews the steering angle instead of snapping it', () => {
    const kart = kartAt(10);
    run(kart, GAS, 2, 1 / 60);
    const before = kart.steerAngle;
    stepKart(kart, { steer: 1, throttle: 1, brake: 0 }, track, 1 / 60);
    expect(before).toBe(0);
    expect(kart.steerAngle).toBeGreaterThan(0);
    expect(kart.steerAngle).toBeLessThan(maxSteerAngleAt(kart.speed) * 0.5);
  });

  it('limits the steering angle by grip at speed', () => {
    expect(maxSteerAngleAt(0)).toBe(PLAYER_TUNING.maxSteerAngle);
    const atTop = maxSteerAngleAt(PLAYER_TUNING.topSpeed);
    expect(atTop).toBeLessThan(PLAYER_TUNING.maxSteerAngle / 3);
    // Turn radius at top speed is at least v^2 / grip.
    const radius = PLAYER_TUNING.wheelbase / Math.tan(atTop);
    expect(radius).toBeCloseTo(PLAYER_TUNING.topSpeed ** 2 / PLAYER_TUNING.maxLateralAccel, 1);
    // Braking tightens the turn.
    expect(maxSteerAngleAt(PLAYER_TUNING.topSpeed, PLAYER_TUNING, true)).toBeGreaterThan(atTop);
  });

  it('brakes strongly and reverses slowly from a standstill', () => {
    const kart = kartAt(10);
    run(kart, GAS, 6, 1 / 60);
    run(kart, { steer: 0, throttle: 1, brake: 1 }, 2, 1 / 60);
    expect(kart.speed).toBeLessThan(0.5); // braking won against the auto-gas throttle
    run(kart, { steer: 0, throttle: 1, brake: 1 }, 3, 1 / 60);
    expect(kart.speed).toBeCloseTo(-PLAYER_TUNING.reverseTopSpeed, 3);
    // Releasing the brake drives forward again.
    run(kart, GAS, 3, 1 / 60);
    expect(kart.speed).toBeGreaterThan(5);
  });

  it('coasts to a stop without throttle', () => {
    const kart = kartAt(10);
    run(kart, GAS, 4, 1 / 60);
    run(kart, { steer: 0, throttle: 0, brake: 0 }, 12, 1 / 60);
    expect(kart.speed).toBe(0);
  });

  it('stays inside the barriers when driven into them and recovers afterwards', () => {
    for (const steer of [-1, 1]) {
      // At top speed on the straight, full lock reaches the barrier in about 1.3 s.
      const kart = kartAt(20);
      kart.speed = PLAYER_TUNING.topSpeed;
      const dt = 1 / 60;
      let maxLateral = 0;
      let minSpeedAfterHit = Infinity;
      let hit = false;
      for (let i = 0; i < 60 * 3; i++) {
        stepKart(kart, { steer, throttle: 1, brake: 0 }, track, dt);
        const lateral = Math.abs(track.nearest(kart.position).lateral);
        maxLateral = Math.max(maxLateral, lateral);
        if (lateral >= MALIBU.barrierOffset - 1e-6) hit = true;
        if (hit) minSpeedAfterHit = Math.min(minSpeedAfterHit, kart.speed);
        expect(finite(kart)).toBe(true);
      }
      expect(hit).toBe(true);
      expect(maxLateral).toBeLessThanOrEqual(MALIBU.barrierOffset + 1e-6);
      expect(minSpeedAfterHit).toBeLessThan(PLAYER_TUNING.topSpeed * 0.75); // the hit bled speed
      expect(kart.speed).toBeGreaterThanOrEqual(0);
      // Let go of the steering: the kart peels off the wall, back onto the road, and speeds up.
      run(kart, GAS, 3, dt);
      expect(Math.abs(track.nearest(kart.position).lateral)).toBeLessThan(MALIBU.roadWidth / 2);
      expect(kart.onRoad).toBe(true);
      expect(kart.speed).toBeGreaterThan(10);
      expect(
        Math.abs(wrapAngle(kart.heading - forwardToHeading(track.nearest(kart.position).sample.tangent))),
      ).toBeLessThan(0.5);
    }
  });

  it('pins a kart placed beyond the barrier back onto the barrier line', () => {
    const kart = kartAt(40, MALIBU.barrierOffset + 5);
    stepKart(kart, GAS, track, 1 / 60);
    expect(track.nearest(kart.position).lateral).toBeCloseTo(MALIBU.barrierOffset, 5);
    expect(kart.onRoad).toBe(false);
  });

  it('is stable and consistent at dt = 1/60 and dt = 1/30', () => {
    // An S-curve on the seaside straight that stays on the road, then a brake stab.
    const script = (t: number): KartInput => ({
      steer: t < 2 ? 0 : t < 3.5 ? 0.2 : t < 6.5 ? -0.2 : t < 8 ? 0.2 : 0,
      throttle: 1,
      brake: t >= 8 && t < 9 ? 1 : 0,
    });
    const a = kartAt(-30);
    const b = kartAt(-30);
    run(a, script, 10, 1 / 60);
    run(b, script, 10, 1 / 30);
    expect(finite(a)).toBe(true);
    expect(finite(b)).toBe(true);
    expect(a.onRoad).toBe(true);
    expect(b.onRoad).toBe(true);
    expect(Math.abs(a.speed - b.speed)).toBeLessThan(1);
    expect(Math.abs(wrapAngle(a.heading - b.heading))).toBeLessThan(0.1);
    expect(Math.hypot(a.position.x - b.position.x, a.position.z - b.position.z)).toBeLessThan(5);
  });

  it('bleeds speed on a square barrier hit, but only a little when sliding parallel to it', () => {
    const s = track.sampleAt(30);
    const left = leftOf(s.tangent);
    // Heading straight at the left barrier from 2 m away at 15 m/s.
    const head = createKartState(
      { x: s.position.x + left.x * (MALIBU.barrierOffset - 2), z: s.position.z + left.z * (MALIBU.barrierOffset - 2) },
      forwardToHeading(left),
    );
    head.speed = 15;
    run(head, { steer: 0, throttle: 0, brake: 0 }, 0.5, 1 / 60);
    expect(Math.abs(track.nearest(head.position).lateral)).toBeLessThanOrEqual(MALIBU.barrierOffset + 1e-6);
    expect(head.speed).toBeLessThan(15 * 0.5);

    // On the barrier line heading along it: at most coasting plus a touch of grind friction.
    const slide = kartAt(30, MALIBU.barrierOffset);
    slide.speed = 10;
    stepKart(slide, { steer: 0, throttle: 0, brake: 0 }, track, 1 / 60);
    expect(slide.speed).toBeGreaterThan(10 - (PLAYER_TUNING.coastDecel + PLAYER_TUNING.barrierGrindDecel) / 60 - 1e-6);
    expect(slide.speed).toBeLessThan(10);
    // ...and the nose is nudged off the wall.
    const rel = wrapAngle(slide.heading - forwardToHeading(track.nearest(slide.position).sample.tangent));
    expect(rel).toBeLessThan(0); // the wall is on the left (+lateral); turning right = heading decreases
  });

  it('ignores a non-positive dt', () => {
    const kart = kartAt(10);
    stepKart(kart, GAS, track, 0);
    stepKart(kart, GAS, track, -1);
    expect(kart.speed).toBe(0);
  });
});

describe('resolveKartCollision', () => {
  it('pushes overlapping karts apart and leaves separated karts alone', () => {
    const a = createKartState({ x: 0, z: 0 }, 0);
    const b = createKartState({ x: 1, z: 0 }, 0);
    resolveKartCollision(a, b);
    const d = Math.hypot(b.position.x - a.position.x, b.position.z - a.position.z);
    expect(d).toBeCloseTo(KART_RADIUS * 2, 9);
    // Moved symmetrically about the original midpoint, x = 0.5.
    expect(a.position.x).toBeCloseTo(0.5 - KART_RADIUS, 9);
    expect(b.position.x).toBeCloseTo(0.5 + KART_RADIUS, 9);

    const c = createKartState({ x: 0, z: 0 }, 0);
    const e = createKartState({ x: 10, z: 0 }, 0);
    resolveKartCollision(c, e);
    expect(c.position.x).toBe(0);
    expect(e.position.x).toBe(10);
  });

  it('exchanges speed when one kart rear-ends another', () => {
    // Both face -Z; a is behind b and faster.
    const a = createKartState({ x: 0, z: 1 }, 0);
    const b = createKartState({ x: 0, z: 0 }, 0);
    a.speed = 20;
    b.speed = 10;
    resolveKartCollision(a, b);
    expect(a.speed).toBeLessThan(20);
    expect(b.speed).toBeGreaterThan(10);
    expect(a.speed + b.speed).toBeCloseTo(30, 9);
  });

  it('does not exchange speed when the karts are separating', () => {
    const a = createKartState({ x: 0, z: 1 }, 0);
    const b = createKartState({ x: 0, z: 0 }, 0);
    a.speed = 10;
    b.speed = 20; // b is in front and pulling away
    resolveKartCollision(a, b);
    expect(a.speed).toBe(10);
    expect(b.speed).toBe(20);
  });

  it('handles karts at exactly the same position', () => {
    const a = createKartState({ x: 3, z: 3 }, 0.5);
    const b = createKartState({ x: 3, z: 3 }, 0.5);
    resolveKartCollision(a, b);
    const d = Math.hypot(b.position.x - a.position.x, b.position.z - a.position.z);
    expect(d).toBeCloseTo(KART_RADIUS * 2, 9);
  });
});
