// Rival AI (MVP.md "Rival AI"): pure-pursuit steering toward a look-ahead point on the
// centerline (offset to the inside of the upcoming curve), curvature-based speed planning, and
// light rubber-banding applied through a rubber-banded copy of the kart tuning.
import type { KartInput, KartState, Track } from '../shared/types';
import { TAU, clamp, forwardToHeading, leftOf, wrapAngle } from '../shared/math';
import { maxSteerAngleAt, stepKartWithTuning } from './kart';
import { curvatureAt } from './track';
import { PLAYER_TUNING, RIVAL_TUNING, RUBBER_BAND, type KartTuning } from './tuning';

export interface RivalContext {
  /** The rival's own RaceProgress.progress. */
  rivalProgress: number;
  /** The player's RaceProgress.progress, for rubber-banding. */
  playerProgress: number;
}

/**
 * Rubber-band multiplier on the rival's top speed and acceleration: up to 1 + maxBonus when
 * behind the player, down to 1 - maxPenalty when far ahead, linear in between, 1 when level.
 */
export function rivalRubberBandFactor(ctx: RivalContext): number {
  const gap = ctx.playerProgress - ctx.rivalProgress; // > 0: rival is behind
  if (gap > 0) return 1 + RUBBER_BAND.maxBonus * clamp(gap / RUBBER_BAND.bonusRange, 0, 1);
  return 1 - RUBBER_BAND.maxPenalty * clamp(-gap / RUBBER_BAND.penaltyRange, 0, 1);
}

/** The kart tuning the rival drives with this step. */
export function rivalTuning(ctx: RivalContext): KartTuning {
  const factor = rivalRubberBandFactor(ctx);
  return { ...PLAYER_TUNING, topSpeed: PLAYER_TUNING.topSpeed * factor, accel: PLAYER_TUNING.accel * factor };
}

/** Decide the rival's input for this step. Must not mutate state. */
export function rivalInput(state: KartState, track: Track, ctx: RivalContext, _dt: number): KartInput {
  return rivalInputWithTuning(state, track, rivalTuning(ctx));
}

function rivalInputWithTuning(state: KartState, track: Track, tuning: KartTuning): KartInput {
  const T = RIVAL_TUNING;
  const { sample } = track.nearest(state.position);
  const d = sample.distance;
  const speed = Math.max(0, state.speed);

  // --- Speed: the fastest speed from which every curve ahead can still be taken ---
  const planGrip = tuning.maxLateralAccel * T.corneringGripFraction;
  const planBrake = tuning.brakeDecel * T.brakingFraction;
  let allowed = Infinity;
  for (let s = 0; s <= T.planHorizon; s += T.planStep) {
    const kappa = Math.abs(curvatureAt(track, d + s));
    if (kappa < 1e-6) continue;
    const cornerSpeed = Math.sqrt(planGrip / kappa);
    const allowedNow = Math.sqrt(cornerSpeed * cornerSpeed + 2 * planBrake * s);
    if (allowedNow < allowed) allowed = allowedNow;
  }
  let throttle = 1;
  let brake = 0;
  if (speed > allowed) {
    throttle = 0;
    brake = clamp((speed - allowed) / T.brakeRamp, 0.15, 1);
  } else if (speed > allowed - T.liftMargin) {
    throttle = 0;
  }
  const braking = brake > 0 && speed > tuning.reverseEngageSpeed;

  // --- Steering: pure pursuit toward a point on the look-ahead line ---
  const lookAhead = T.lookAheadBase + T.lookAheadPerSpeed * speed;
  const kTarget = curvatureAt(track, d + lookAhead);
  const kPreview = curvatureAt(track, d + lookAhead + T.curvePreview);
  const k = Math.abs(kPreview) > Math.abs(kTarget) ? kPreview : kTarget;
  // + curvature = left turn, and the inside of a left turn is + lateral (left of travel).
  let lateralTarget = clamp(k * T.insideGain, -T.maxLateralTarget, T.maxLateralTarget);
  lateralTarget += T.lineWobbleAmplitude * Math.sin((d / T.lineWobbleWavelength) * TAU);
  const margin = track.definition.roadWidth / 2 - 2;
  lateralTarget = clamp(lateralTarget, -margin, margin);

  const ahead = track.sampleAt(d + lookAhead);
  const left = leftOf(ahead.tangent);
  const tx = ahead.position.x + left.x * lateralTarget - state.position.x;
  const tz = ahead.position.z + left.z * lateralTarget - state.position.z;
  const ld = Math.hypot(tx, tz);
  let steer: number;
  if (ld < 1e-3) {
    steer = 0;
  } else {
    // alpha > 0: the target is to the left (heading increases on a left turn).
    const alpha = wrapAngle(forwardToHeading({ x: tx, z: tz }) - state.heading);
    if (Math.abs(alpha) > Math.PI / 2) {
      steer = alpha > 0 ? -1 : 1;
    } else {
      // Pure pursuit: curvature 2 sin(alpha) / ld; bicycle steer angle atan(L * curvature).
      // Positive steer turns right, so flip the sign.
      const steerAngle = -Math.atan((2 * tuning.wheelbase * Math.sin(alpha)) / ld);
      steer = clamp(steerAngle / maxSteerAngleAt(speed, tuning, braking), -1, 1);
    }
  }

  return { steer, throttle, brake };
}

/**
 * Advance the rival one step: decides its input and steps the kart, applying rubber-banding
 * internally. The game loop calls this for the rival and stepKart() for the player.
 */
export function stepRival(state: KartState, track: Track, ctx: RivalContext, dt: number): void {
  const tuning = rivalTuning(ctx);
  stepKartWithTuning(state, rivalInputWithTuning(state, track, tuning), track, dt, tuning);
}
