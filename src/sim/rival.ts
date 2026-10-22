// Rival AI (MVP.md "Rival AI"): pure-pursuit steering toward a look-ahead point on the racing
// line (the inside of the upcoming curve), curvature-based speed planning, light rubber-banding
// applied through a rubber-banded copy of the kart tuning, and, when the player's kart is
// known, overtaking: move to the free side, keep the speed, pass, blend back, never ram.
import type { KartInput, KartState, Track } from '../shared/types';
import { TAU, clamp, forwardToHeading, headingToForward, leftOf, lerp, wrapAngle } from '../shared/math';
import { KART_RADIUS, maxSteerAngleAt, stepKartWithTuning } from './kart';
import { curvatureAt } from './track';
import { OVERTAKE_TUNING, PLAYER_TUNING, RIVAL_TUNING, RUBBER_BAND, type KartTuning } from './tuning';

export interface RivalContext {
  /** The rival's own RaceProgress.progress. */
  rivalProgress: number;
  /** The player's RaceProgress.progress, for rubber-banding. */
  playerProgress: number;
  /**
   * The player's kart (position, heading, speed), so the rival can set up a pass and avoid
   * ramming it. Optional: without it the rival just drives its racing line, which is what the
   * dev autopilot wants when it drives the player's kart with this AI.
   */
  player?: KartState;
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
  return rivalInputWithTuning(state, track, rivalTuning(ctx), ctx.player);
}

/** Floor of 1 - curvature * offset in the planner: an offset can never exceed the curve radius. */
const MIN_OFFSET_DENOMINATOR = 0.25;

/** Wrap a distance difference along the loop into [-length/2, length/2). */
function signedWrap(d: number, length: number): number {
  return d - length * Math.floor((d + length / 2) / length);
}

interface Traffic {
  /** Lateral target (+ = left of center) after accounting for the player. */
  lateralTarget: number;
  /** The player is in the rival's path right ahead: lift instead of hitting it. */
  blocked: boolean;
  /** Closing speed on the player, m/s (> 0: the rival is faster). */
  closing: number;
}

/**
 * How to drive around the player: on the approach pick the side with more room (opposite the
 * player's offset from the centerline), hold that line while alongside and until clearly
 * ahead, then blend back to the racing line, leaving a little room if the player is right
 * behind. Stateless: the side follows from where the two karts are, which keeps it consistent
 * from one step to the next without remembering anything.
 */
function planTraffic(
  state: KartState,
  track: Track,
  distance: number,
  lateral: number,
  speed: number,
  player: KartState,
  lineTarget: number,
): Traffic {
  const O = OVERTAKE_TUNING;
  const halfRoad = track.definition.roadWidth / 2;
  const passBound = halfRoad - O.passMargin;

  const near = track.nearest(player.position);
  const gapAhead = signedWrap(near.sample.distance - distance, track.length); // > 0: player ahead
  const playerLateral = near.lateral;
  const relative = lateral - playerLateral; // > 0: the rival is left of the player
  const closing = speed - Math.max(0, player.speed);

  // The side to pass on. Approaching a player who sits off-center: the other side. Otherwise
  // (alongside, just past, or a centered player) the side the rival is already on, unless the
  // player has squeezed that side shut and the rival is still far enough behind to cross over.
  let side: number;
  if (gapAhead > O.alongsideRange && Math.abs(playerLateral) > O.centerDeadband) {
    side = playerLateral > 0 ? -1 : 1;
  } else if (Math.abs(relative) > 1e-3) {
    side = relative > 0 ? 1 : -1;
  } else if (Math.abs(playerLateral) > 1e-3) {
    side = playerLateral > 0 ? -1 : 1;
  } else {
    side = lineTarget >= 0 ? 1 : -1;
  }
  const roomOn = (s: number) => passBound - s * playerLateral; // from the player to the pass line
  if (gapAhead > O.switchGap && roomOn(side) < O.minRoom && roomOn(-side) > roomOn(side)) side = -side;
  const passTarget = side * passBound;

  // Weight of the passing line against the racing line.
  let weight: number;
  let base = lineTarget;
  if (gapAhead >= 0) {
    weight = clamp((O.approachRange + O.blendRange - gapAhead) / O.blendRange, 0, 1);
    // Only set up a pass while closing; alongside, the line is held whatever the speeds.
    if (gapAhead > O.alongsideRange) weight *= clamp((closing + O.closingTolerance) / O.closingTolerance, 0, 1);
  } else {
    weight = clamp((O.clearAhead + O.blendRange + gapAhead) / O.blendRange, 0, 1);
    // Ahead with the player close behind: stay a little off the line so it has room to try.
    const room = clamp((O.dontBlockRange + gapAhead) / (O.dontBlockRange - O.clearAhead), 0, 1);
    base = clamp(lineTarget + side * O.dontBlockOffset * room, -passBound, passBound);
  }
  const lateralTarget = lerp(base, passTarget, weight);

  // In the rival's own frame: is the player right ahead, in its path, and not pulling away?
  const forward = headingToForward(state.heading);
  const left = leftOf(forward);
  const dx = player.position.x - state.position.x;
  const dz = player.position.z - state.position.z;
  const ahead = dx * forward.x + dz * forward.z;
  const beside = dx * left.x + dz * left.z;
  const blocked =
    ahead > 0 && ahead < O.blockGap + 2 * KART_RADIUS && Math.abs(beside) < O.blockWidth && closing > -0.5;

  return { lateralTarget, blocked, closing };
}

function rivalInputWithTuning(state: KartState, track: Track, tuning: KartTuning, player?: KartState): KartInput {
  const T = RIVAL_TUNING;
  const { sample, lateral } = track.nearest(state.position);
  const d = sample.distance;
  const speed = Math.max(0, state.speed);

  // --- Racing line: the inside of the upcoming curve, with a slow wobble ---
  const lookAhead = T.lookAheadBase + T.lookAheadPerSpeed * speed;
  const kTarget = curvatureAt(track, d + lookAhead);
  const kPreview = curvatureAt(track, d + lookAhead + T.curvePreview);
  const k = Math.abs(kPreview) > Math.abs(kTarget) ? kPreview : kTarget;
  // + curvature = left turn, and the inside of a left turn is + lateral (left of travel).
  let lineTarget = clamp(k * T.insideGain, -T.maxLateralTarget, T.maxLateralTarget);
  lineTarget += T.lineWobbleAmplitude * Math.sin((d / T.lineWobbleWavelength) * TAU);
  const margin = track.definition.roadWidth / 2 - T.lineMargin;
  lineTarget = clamp(lineTarget, -margin, margin);

  // --- Traffic: pass the player on the free side, never ram it ---
  let lateralTarget = lineTarget;
  let blocked = false;
  let closing = 0;
  if (player && player !== state) {
    const traffic = planTraffic(state, track, d, lateral, speed, player, lineTarget);
    lateralTarget = traffic.lateralTarget;
    blocked = traffic.blocked;
    closing = traffic.closing;
  }

  // --- Speed: the fastest speed from which every curve ahead can still be taken ---
  // Planned on the curvature of the line actually driven: up to the look-ahead point the tighter
  // of the current and the target offset (so a swerve from the inside to the outside is not
  // taken at outside speed), the racing line (inside of each curve) beyond it. An offset `o`
  // toward the inside tightens a curve of curvature k to k / (1 - k * o); the outside loosens it.
  // A pending lateral move (a pass, a swerve behind a player who changed lanes) needs grip of
  // its own over the look-ahead distance: pure pursuit bends the path by about 2e / L^2 for a
  // lateral error e at look-ahead L, so that share of the grip is reserved on the near segment.
  const lateralError = Math.max(0, Math.abs(lateralTarget - lateral) - T.swerveDeadband);
  const swerveAccel = (speed * speed * 2 * lateralError) / (lookAhead * lookAhead);
  const gripReserve = Math.min(swerveAccel, tuning.maxLateralAccel * T.swerveGripReserve);
  const planGrip = tuning.maxLateralAccel * T.corneringGripFraction;
  const planBrake = tuning.brakeDecel * T.brakingFraction;
  let allowed = Infinity;
  for (let s = 0; s <= T.planHorizon; s += T.planStep) {
    const kCenter = curvatureAt(track, d + s);
    const near = s <= lookAhead;
    let offset: number;
    if (near) offset = kCenter * lateral > kCenter * lateralTarget ? lateral : lateralTarget;
    else offset = clamp(kCenter * T.insideGain, -T.maxLateralTarget, T.maxLateralTarget);
    const kappa = Math.abs(kCenter / Math.max(1 - kCenter * offset, MIN_OFFSET_DENOMINATOR));
    if (kappa < 1e-6) continue;
    const cornerSpeed = Math.sqrt((near ? planGrip - gripReserve : planGrip) / kappa);
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
  if (blocked) {
    // Lift, and brake a little when closing fast, while the lateral move clears the path.
    throttle = 0;
    brake = Math.max(brake, clamp(closing / OVERTAKE_TUNING.blockBrakeRamp, 0, OVERTAKE_TUNING.blockMaxBrake));
  }
  const braking = brake > 0 && speed > tuning.reverseEngageSpeed;

  // --- Steering: pure pursuit toward a point on the look-ahead line ---
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
 * internally. The game loop calls this for the rival and stepKart() for the player. Pass the
 * player's kart in the context so the rival overtakes instead of tailgating.
 */
export function stepRival(state: KartState, track: Track, ctx: RivalContext, dt: number): void {
  const tuning = rivalTuning(ctx);
  stepKartWithTuning(state, rivalInputWithTuning(state, track, tuning, ctx.player), track, dt, tuning);
}
