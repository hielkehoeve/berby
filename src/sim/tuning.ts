// All feel/tuning constants for the simulation live here, so handling can be tweaked in one
// place. Units: meters, seconds, radians. See MVP.md "Gameplay" for the intent.

/** Everything that shapes how one kart drives. The rival uses a modified copy (see rival.ts). */
export interface KartTuning {
  /** Distance between the front and rear axles; sets how a steering angle turns into yaw. */
  wheelbase: number;
  /** Top forward speed on asphalt, m/s. Chosen so a Malibu lap (~1215 m) takes ~60 s: ≈ length / 58. */
  topSpeed: number;
  /** Forward acceleration on asphalt with full throttle, m/s^2. */
  accel: number;
  /** Deceleration while coasting (no throttle, no brake), m/s^2. */
  coastDecel: number;
  /** Braking deceleration with full brake, m/s^2. */
  brakeDecel: number;
  /** Deceleration applied when the kart is above its current top speed (sand, rubber band). */
  overspeedDecel: number;
  /** Top speed while reversing, m/s (positive number; the state's speed goes negative). */
  reverseTopSpeed: number;
  /** Reverse acceleration with the brake held, m/s^2. */
  reverseAccel: number;
  /** Below this forward speed, holding the brake starts reversing instead of braking. */
  reverseEngageSpeed: number;
  /** Steering lock: the largest wheel angle, applied at low speed. */
  maxSteerAngle: number;
  /**
   * Grip: the largest lateral (centripetal) acceleration the kart can hold, m/s^2. Above a few
   * m/s this caps the steering angle so the kart does not oversteer at top speed:
   * turn radius at speed v is at least v^2 / maxLateralAccel.
   */
  maxLateralAccel: number;
  /** Multiplier on maxLateralAccel while braking, so braking tightens the turn. */
  brakeGripBonus: number;
  /** Hard cap on yaw rate, rad/s, for stability at large dt. */
  maxYawRate: number;
  /** How fast the steering moves toward the input, in "full locks per second". */
  steerResponse: number;
  /** How fast the steering returns toward center, in "full locks per second". */
  steerReturn: number;
  /** Speed scrubbed by steering: fraction of speed lost per second at full lock. */
  steerDrag: number;
  /** Top speed multiplier on sand (|lateral| > roadWidth / 2). */
  offRoadSpeedFactor: number;
  /** Acceleration multiplier on sand. */
  offRoadAccelFactor: number;
  /** Fraction of speed lost on a square barrier hit (scaled down for glancing contact). */
  barrierSpeedLoss: number;
  /** Impact angle (sine) at which the full barrierSpeedLoss applies; smaller angles lose less. */
  barrierFullLossSine: number;
  /** Friction while sliding along a barrier after the hit, m/s^2. */
  barrierGrindDecel: number;
  /** Rate at which a barrier contact turns the heading toward the track direction, rad/s. */
  barrierTurnRate: number;
  /** The contact turns the heading slightly past parallel so the kart peels off the wall. */
  barrierExitAngle: number;
}

export const PLAYER_TUNING: KartTuning = {
  wheelbase: 1.6,
  topSpeed: 21,
  accel: 8,
  coastDecel: 3,
  brakeDecel: 16,
  overspeedDecel: 8,
  reverseTopSpeed: 4,
  reverseAccel: 4,
  reverseEngageSpeed: 0.5,
  maxSteerAngle: 0.45,
  maxLateralAccel: 10,
  brakeGripBonus: 1.35,
  maxYawRate: 3,
  steerResponse: 7,
  steerReturn: 10,
  steerDrag: 0.12,
  offRoadSpeedFactor: 0.6,
  offRoadAccelFactor: 0.6,
  barrierSpeedLoss: 0.3,
  barrierFullLossSine: 0.5,
  barrierGrindDecel: 5,
  barrierTurnRate: 12,
  barrierExitAngle: 0.2,
};

/** Kart-vs-kart bumps (resolveKartCollision). */
export const COLLISION_TUNING = {
  /** Collision radius of a kart in meters. */
  kartRadius: 1.2,
  /** Fraction of the approach speed exchanged between the two karts along the contact normal. */
  speedExchange: 0.5,
};

/**
 * Rival AI driving behaviour (rival.ts). Tuned so that Vix alone laps Malibu in ~56.5–57.5 s,
 * the pace of a flat-out player on a good inside line (docs/log/005).
 */
export const RIVAL_TUNING = {
  /** Pure-pursuit look-ahead distance = base + perSpeed * speed, meters. */
  lookAheadBase: 7,
  lookAheadPerSpeed: 0.5,
  /** Look this far beyond the look-ahead point to pick the inside of the upcoming curve. */
  curvePreview: 20,
  /**
   * Lateral target = clamp(curvature * insideGain, ±maxLateralTarget); + = left of center. At
   * 200 the full inside offset is reached from a 50 m radius, so every Malibu curve is cut.
   */
  insideGain: 200,
  maxLateralTarget: 4,
  /** The racing line keeps this far (meters) from the edge of the asphalt. */
  lineMargin: 2,
  /** A slow deterministic weave in the target line so the rival is not pixel-perfect. */
  lineWobbleAmplitude: 0.3,
  lineWobbleWavelength: 170,
  /** Grip the rival plans with, as a fraction of its kart's maxLateralAccel (< 1 = cautious). */
  corneringGripFraction: 0.96,
  /** Braking deceleration the rival plans with, as a fraction of its kart's brakeDecel. */
  brakingFraction: 0.7,
  /** How far ahead (meters) and how finely the rival samples curvature for speed planning. */
  planHorizon: 70,
  planStep: 4,
  /** Lift the throttle when within this many m/s of the planned speed limit; brake above it. */
  liftMargin: 0.5,
  /** Brake input ramps to 1 over this many m/s of excess speed. */
  brakeRamp: 4,
  /**
   * A lateral move larger than swerveDeadband (meters off the target line) reserves grip for
   * itself in the speed plan, up to swerveGripReserve of maxLateralAccel, so a lane change in a
   * corner is taken slower instead of running wide.
   */
  swerveDeadband: 2,
  swerveGripReserve: 0.4,
};

/**
 * Overtaking (rival.ts): how the rival deals with the player's kart when it knows where it is.
 * Gaps are measured along the track centerline between the two karts' nearest points.
 */
export const OVERTAKE_TUNING = {
  /** Set up a pass once the player is within this many meters ahead. */
  approachRange: 18,
  /** Within this gap (either way) the karts count as alongside: the side is never switched. */
  alongsideRange: 5,
  /** Keep the passing line until this far ahead of the player, then return to the racing line. */
  clearAhead: 7,
  /** The passing line fades in and out over this many meters beyond approachRange / clearAhead. */
  blendRange: 6,
  /**
   * A pass is only set up while closing: the weight fades to zero when the player pulls away
   * faster than this many m/s.
   */
  closingTolerance: 2,
  /** The passing line runs at ±(roadWidth / 2 - passMargin): still on the asphalt. */
  passMargin: 1.5,
  /** A player within this many meters of the centerline has no free side; keep the current one. */
  centerDeadband: 1.5,
  /**
   * If the player leaves less than minRoom meters between itself and the passing line on the
   * rival's side, the rival crosses to the other side, provided it is still more than switchGap
   * meters behind (crossing right behind a kart is safe; crossing through one is not).
   */
  minRoom: 2.8,
  switchGap: 2.5,
  /** Lift instead of ramming when the player is in the rival's path within this bumper gap, m. */
  blockGap: 4,
  /** Sideways distance between kart centers below which the player is in the rival's path. */
  blockWidth: 2.8,
  /** When blocked, brake proportionally to the closing speed, up to this input, over this ramp. */
  blockMaxBrake: 0.5,
  blockBrakeRamp: 3,
  /** Just after passing, stay this far off the racing line while the player is within range. */
  dontBlockOffset: 1.5,
  dontBlockRange: 15,
};

/**
 * Rubber-banding: a speed bonus when behind the player, a penalty when far ahead, both as a
 * fraction of top speed and acceleration. Strong enough that a weaker player still has a close
 * race, and that Vix never disappears either way (MVP.md: a first try is winnable 50–60 %).
 */
export const RUBBER_BAND = {
  /** Largest top-speed (and acceleration) bonus when well behind, as a fraction. */
  maxBonus: 0.11,
  /** Largest penalty when well ahead, as a fraction. */
  maxPenalty: 0.1,
  /** Gap (meters) at which the bonus reaches its maximum. */
  bonusRange: 40,
  /** Gap (meters) at which the penalty reaches its maximum. */
  penaltyRange: 60,
};
