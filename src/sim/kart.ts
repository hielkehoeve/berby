// Arcade kart controller (MVP.md "Kart handling"): a kinematic bicycle model with grip-limited
// steering, sand that slows the kart, barriers that keep it on the track, and kart-vs-kart bumps.
// No physics engine, no Three.js: this runs headless in tests.
import type { KartInput, KartState, Track, Vec2 } from '../shared/types';
import { clamp, forwardToHeading, headingToForward, leftOf, wrapAngle } from '../shared/math';
import { COLLISION_TUNING, PLAYER_TUNING, type KartTuning } from './tuning';

/** Collision radius of a kart in meters, used for kart-vs-kart bumps. */
export const KART_RADIUS = COLLISION_TUNING.kartRadius;

/** Within this distance of the barrier line the kart counts as touching it (heading nudge). */
const BARRIER_CONTACT_ZONE = 0.05;
/** A kart pinned to the barrier last step sits within this of the line (float slack). */
const BARRIER_CONTACT_EPS = 0.01;

export function createKartState(position: Vec2, heading: number): KartState {
  return { position: { ...position }, heading, speed: 0, steerAngle: 0, onRoad: true };
}

/**
 * Largest steering angle the kart can apply at a speed. At low speed it is the steering lock;
 * above a few m/s grip takes over and the lock shrinks so the turn radius never drops below
 * speed^2 / maxLateralAccel. Useful for visuals too: steerAngle / maxSteerAngleAt(speed) is
 * the fraction of lock currently applied, in -1..1.
 */
export function maxSteerAngleAt(speed: number, tuning: KartTuning = PLAYER_TUNING, braking = false): number {
  const grip = tuning.maxLateralAccel * (braking ? tuning.brakeGripBonus : 1);
  const gripLimited = Math.atan((grip * tuning.wheelbase) / Math.max(speed * speed, 1e-6));
  return Math.min(tuning.maxSteerAngle, gripLimited);
}

/** Advance one kart by dt seconds with the player tuning. Mutates state in place. */
export function stepKart(state: KartState, input: KartInput, track: Track, dt: number): void {
  stepKartWithTuning(state, input, track, dt, PLAYER_TUNING);
}

/** stepKart with an explicit tuning (the rival uses a rubber-banded copy of the player tuning). */
export function stepKartWithTuning(
  state: KartState,
  input: KartInput,
  track: Track,
  dt: number,
  tuning: KartTuning,
): void {
  if (!(dt > 0)) return;
  const steerIn = clamp(input.steer, -1, 1);
  const throttle = clamp(input.throttle, 0, 1);
  const brake = clamp(input.brake, 0, 1);
  const def = track.definition;

  // 1. Surface under the kart decides the speed envelope for this step.
  const before = track.nearest(state.position);
  const onRoadBefore = Math.abs(before.lateral) <= def.roadWidth / 2;
  const topSpeed = tuning.topSpeed * (onRoadBefore ? 1 : tuning.offRoadSpeedFactor);
  const accel = tuning.accel * (onRoadBefore ? 1 : tuning.offRoadAccelFactor);

  // 2. Longitudinal: brake beats throttle; holding the brake at a standstill reverses slowly.
  let speed = state.speed;
  const braking = brake > 0 && speed > tuning.reverseEngageSpeed;
  if (brake > 0) {
    if (speed > tuning.reverseEngageSpeed) {
      speed = Math.max(0, speed - tuning.brakeDecel * brake * dt);
    } else {
      speed = Math.max(-tuning.reverseTopSpeed, speed - tuning.reverseAccel * brake * dt);
    }
  } else if (throttle > 0) {
    if (speed < topSpeed) speed = Math.min(topSpeed, speed + accel * throttle * dt);
  } else if (speed > 0) {
    speed = Math.max(0, speed - tuning.coastDecel * dt);
  } else if (speed < 0) {
    speed = Math.min(0, speed + tuning.coastDecel * dt);
  }
  // Above the current cap (just drove onto sand, rubber band changed): settle down smoothly.
  if (speed > topSpeed) speed = Math.max(topSpeed, speed - tuning.overspeedDecel * dt);

  // 3. Steering. The input may be digital, so the applied angle slews toward it. The slew is
  //    done on the fraction of the speed-dependent lock, which keeps the response time the same
  //    at every speed and rescales the angle automatically as the kart speeds up or slows down.
  const maxSteer = maxSteerAngleAt(speed, tuning, braking);
  const prevMax = maxSteerAngleAt(state.speed, tuning, braking);
  let frac = clamp(state.steerAngle / prevMax, -1, 1);
  const delta = steerIn - frac;
  const awayFromCenter = frac === 0 || Math.sign(delta) === Math.sign(frac);
  const rate = awayFromCenter ? tuning.steerResponse : tuning.steerReturn;
  frac += clamp(delta, -rate * dt, rate * dt);
  state.steerAngle = frac * maxSteer;
  // Hard steering scrubs a little speed.
  if (speed > 0) speed *= Math.max(0, 1 - tuning.steerDrag * frac * frac * dt);

  // 4. Heading: bicycle model. A positive (right) steer decreases the heading.
  const yawRate = clamp((speed * Math.tan(state.steerAngle)) / tuning.wheelbase, -tuning.maxYawRate, tuning.maxYawRate);
  state.heading = wrapAngle(state.heading - yawRate * dt);

  // 5. Position.
  const fwd = headingToForward(state.heading);
  state.position.x += fwd.x * speed * dt;
  state.position.z += fwd.z * speed * dt;

  // 6. Barriers: pin the kart inside. On the frame of impact drop the velocity component into
  //    the wall and bleed speed; while sliding along the wall apply friction. In a thin contact
  //    zone turn the nose along the wall and slightly away from it, so the kart peels off instead
  //    of grinding forever.
  const after = track.nearest(state.position);
  let lateral = after.lateral;
  const absLateral = Math.abs(lateral);
  if (absLateral >= def.barrierOffset - BARRIER_CONTACT_ZONE) {
    const side = lateral > 0 ? 1 : -1;
    const left = leftOf(after.sample.tangent);
    const outX = left.x * side;
    const outZ = left.z * side;
    const pinned = absLateral > def.barrierOffset;
    if (pinned) {
      state.position.x = after.sample.position.x + outX * def.barrierOffset;
      state.position.z = after.sample.position.z + outZ * def.barrierOffset;
      lateral = side * def.barrierOffset;
    }

    if (speed !== 0) {
      const velSign = speed > 0 ? 1 : -1;
      const velX = fwd.x * velSign;
      const velZ = fwd.z * velSign;
      // Sine of the angle between the velocity and the wall: > 0 means moving into the wall.
      const into = velX * outX + velZ * outZ;

      if (pinned) {
        const wasInContact = Math.abs(before.lateral) >= def.barrierOffset - BARRIER_CONTACT_EPS;
        if (!wasInContact && into > 0) {
          // Impact: keep only the component along the wall, then bleed some of that.
          const alongFactor = Math.sqrt(Math.max(0, 1 - into * into));
          const loss = tuning.barrierSpeedLoss * clamp(into / tuning.barrierFullLossSine, 0, 1);
          speed *= alongFactor * (1 - loss);
        } else {
          // Sliding along the wall.
          speed = Math.max(0, Math.abs(speed) - tuning.barrierGrindDecel * dt) * velSign;
        }
      }

      // Turn toward "along the wall, tilted away by the exit angle" unless already pointing
      // further away than that (the driver may be steering off the wall on their own).
      if (-into < Math.sin(tuning.barrierExitAngle)) {
        const t = after.sample.tangent;
        const alongSign = velX * t.x + velZ * t.z >= 0 ? 1 : -1;
        const c = Math.cos(tuning.barrierExitAngle);
        const s = Math.sin(tuning.barrierExitAngle);
        let dirX = t.x * alongSign * c - outX * s;
        let dirZ = t.z * alongSign * c - outZ * s;
        if (velSign < 0) {
          dirX = -dirX;
          dirZ = -dirZ;
        }
        const diff = wrapAngle(forwardToHeading({ x: dirX, z: dirZ }) - state.heading);
        const maxTurn = tuning.barrierTurnRate * dt;
        state.heading = wrapAngle(state.heading + clamp(diff, -maxTurn, maxTurn));
      }
    }
  }

  state.speed = speed;
  state.onRoad = Math.abs(lateral) <= def.roadWidth / 2;
}

/**
 * Push two overlapping karts apart along the line between their centers and exchange some
 * speed along that line so a bump is felt. Mutates both in place.
 */
export function resolveKartCollision(a: KartState, b: KartState): void {
  const dx = b.position.x - a.position.x;
  const dz = b.position.z - a.position.z;
  const d = Math.hypot(dx, dz);
  const minDist = KART_RADIUS * 2;
  if (d >= minDist) return;
  let nx: number;
  let nz: number;
  if (d < 1e-6) {
    // Exactly on top of each other: separate sideways relative to a's heading.
    const l = leftOf(headingToForward(a.heading));
    nx = l.x;
    nz = l.z;
  } else {
    nx = dx / d;
    nz = dz / d;
  }
  const push = (minDist - d) / 2;
  a.position.x -= nx * push;
  a.position.z -= nz * push;
  b.position.x += nx * push;
  b.position.z += nz * push;

  // Velocity components along the contact normal (from a toward b).
  const fa = headingToForward(a.heading);
  const fb = headingToForward(b.heading);
  const an = fa.x * nx + fa.z * nz;
  const bn = fb.x * nx + fb.z * nz;
  const approach = a.speed * an - b.speed * bn;
  if (approach <= 0) return; // already separating
  const j = approach * COLLISION_TUNING.speedExchange;
  // Each kart only has a forward speed, so project the normal impulse onto its forward axis.
  const minSpeed = -PLAYER_TUNING.reverseTopSpeed;
  a.speed = Math.max(minSpeed, a.speed - j * an);
  b.speed = Math.max(minSpeed, b.speed + j * bn);
}
