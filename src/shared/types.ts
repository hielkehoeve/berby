/**
 * Berby shared contract.
 *
 * Every module (sim, graphics, game) codes against these types. This file is FROZEN while the
 * sim, graphics and tech-stack work streams run in parallel: if you need a change, describe it
 * in your report instead of editing it here.
 *
 * Coordinate system (matches Three.js): Y is up, the ground is the XZ plane.
 *   - heading 0 faces -Z (the Three.js default "forward"), so mesh.rotation.y === heading.
 *   - Positive steer turns RIGHT. A right turn DECREASES heading.
 *   - See shared/math.ts for headingToForward() and leftOf().
 * Units: meters, seconds, radians.
 */

export interface Vec2 {
  x: number;
  z: number;
}

export interface TrackDefinition {
  id: string;
  name: string;
  /** Control points of the closed Catmull-Rom centerline spline. Travel direction = array order. */
  controlPoints: Vec2[];
  /** Full asphalt width in meters. Beyond ±roadWidth/2 of the centerline is off-road (sand). */
  roadWidth: number;
  /** Lateral distance from the centerline to the barriers, in meters (> roadWidth / 2). */
  barrierOffset: number;
  /** Number of checkpoints spread evenly along a lap. Checkpoint 0 is the start/finish line. */
  checkpointCount: number;
  laps: number;
}

export interface TrackSample {
  position: Vec2;
  /** Unit tangent in the direction of travel. */
  tangent: Vec2;
  /** Distance along the centerline from the start/finish line, in [0, length). */
  distance: number;
}

/** Queryable, arc-length-sampled track built once from a TrackDefinition (see sim/track.ts). */
export interface Track {
  definition: TrackDefinition;
  /** Centerline length in meters. */
  length: number;
  /** Centerline distances of the checkpoints; checkpoints[0] === 0 (start/finish line). */
  checkpoints: number[];
  /** Sample the centerline at a distance. Wraps around; negative values are allowed. */
  sampleAt(distance: number): TrackSample;
  /** Nearest centerline point to p, with the signed lateral offset (+ = left of travel). */
  nearest(p: Vec2): { sample: TrackSample; lateral: number };
}

export interface KartInput {
  /** -1 full left .. +1 full right. */
  steer: number;
  /** 0..1. The MVP auto-gas control always sends 1 unless braking. */
  throttle: number;
  /** 0..1. */
  brake: number;
}

export interface KartState {
  position: Vec2;
  /** Yaw in radians; 0 faces -Z. */
  heading: number;
  /** Signed forward speed in m/s (slightly negative while reversing). */
  speed: number;
  /**
   * Physical steering angle currently applied, in radians (+ = right). Grip limits it, so it is
   * small at speed (~0.04 rad at top speed). Visuals that want a full-looking wheel turn should
   * use the fraction of lock, steerAngle / maxSteerAngleAt(speed) from sim/kart.ts, in -1..1.
   */
  steerAngle: number;
  onRoad: boolean;
}

export interface RaceProgress {
  /** 1-based current lap: laps completed + 1, capped at the lap count once finished. */
  lap: number;
  /**
   * Index into track.checkpoints of the next checkpoint to pass. Starts at 0: karts begin a few
   * meters before the start/finish line, so crossing it is the first thing they do (it starts
   * lap 1 rather than completing one).
   */
  nextCheckpoint: number;
  /** Monotonic distance used for ranking: laps completed * track.length + distance along the lap. */
  progress: number;
  /** Duration in seconds of each completed lap. */
  lapTimes: number[];
  finished: boolean;
  /** Total race time in seconds, set once finished. */
  finishTime?: number;
}

export type KartVariant = 'player' | 'rival';
