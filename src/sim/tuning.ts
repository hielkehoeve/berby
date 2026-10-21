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

/** Rival AI driving behaviour (rival.ts). */
export const RIVAL_TUNING = {
  /** Pure-pursuit look-ahead distance = base + perSpeed * speed, meters. */
  lookAheadBase: 7,
  lookAheadPerSpeed: 0.5,
  /** Look this far beyond the look-ahead point to pick the inside of the upcoming curve. */
  curvePreview: 20,
  /** Lateral target = clamp(curvature * insideGain, ±maxLateralTarget); + = left of center. */
  insideGain: 90,
  maxLateralTarget: 2.5,
  /** A slow deterministic weave in the target line so the rival is not pixel-perfect. */
  lineWobbleAmplitude: 0.8,
  lineWobbleWavelength: 170,
  /** Grip the rival plans with, as a fraction of its kart's maxLateralAccel (< 1 = cautious). */
  corneringGripFraction: 0.82,
  /** Braking deceleration the rival plans with, as a fraction of its kart's brakeDecel. */
  brakingFraction: 0.7,
  /** How far ahead (meters) and how finely the rival samples curvature for speed planning. */
  planHorizon: 70,
  planStep: 4,
  /** Lift the throttle when within this many m/s of the planned speed limit; brake above it. */
  liftMargin: 1,
  /** Brake input ramps to 1 over this many m/s of excess speed. */
  brakeRamp: 4,
};

/** Rubber-banding: a small speed bonus when behind the player, a penalty when far ahead. */
export const RUBBER_BAND = {
  /** Largest top-speed (and acceleration) bonus when well behind, as a fraction. */
  maxBonus: 0.08,
  /** Largest penalty when well ahead, as a fraction. */
  maxPenalty: 0.08,
  /** Gap (meters) at which the bonus reaches its maximum. */
  bonusRange: 40,
  /** Gap (meters) at which the penalty reaches its maximum. */
  penaltyRange: 60,
};
