/**
 * Every feel constant of Glitter Rush in one place. Units: meters, seconds, radians, points.
 * The layout, the scoring and the visuals all read from here, so the mode is tuned by editing
 * this object only.
 */
export interface RushTuning {
  /** Seconds on the clock at GO. */
  seconds: number;
  /** Seconds a gold star adds to the clock. */
  goldBonusSeconds: number;
  /** Points for a glitter star, before the multiplier. */
  starPoints: number;
  /** Points for a gold star, before the multiplier. */
  goldPoints: number;
  /** Distance from the kart's centre within which a star is taken, m. */
  pickupRadius: number;
  /** Longest pause between two pickups that keeps the chain alive, s. */
  chainGapSeconds: number;
  /** Chain length from which the multiplier is ×2. */
  chainForX2: number;
  /** Chain length from which the multiplier is ×3. */
  chainForX3: number;
  /** 'Chain lost' is only announced when the lost chain was at least this long. */
  chainLostFrom: number;
  /** A collected star is back on the track after this many seconds. */
  respawnSeconds: number;
  /** A collected star shrinks to nothing over this long. */
  shrinkSeconds: number;
  /** A respawning star grows back over this long. */
  growSeconds: number;
  /** Target spacing of the glitter stars along the lap, m (the real spacing divides the lap evenly). */
  starSpacing: number;
  /** Lateral offset of the left and right lanes from the centreline, m (the middle lane is 0). */
  laneOffset: number;
  /** Shortest and longest run of stars in one lane before the pattern moves to a neighbouring lane. */
  runLength: { min: number; max: number };
  /** No glitter stars in the first metres after the start line: the grid and the GO. */
  startGap: number;
  /** No glitter stars in the last metres before the start line, so the grid is clear. */
  endGap: number;
  /** Gold stars per lap, spread over the corners in proportion to their length. */
  goldCount: number;
  /** Lateral offset of a gold star, m: the outside edge of the corner, almost on the sand. */
  goldLateral: number;
  /** Curvature (1/m) from which a stretch counts as a corner; 1/80 is a radius of 80 m. */
  cornerCurvature: number;
  /** Corners shorter than this get no gold star, m. */
  minCornerLength: number;
  /** Seed of the deterministic lane pattern. */
  seed: number;
  /** How long a status line (a bonus, a multiplier change, a lost chain) stays on the HUD, s. */
  statusSeconds: number;
  /** The clock ticks at every whole second from this one down to 1. */
  tickFrom: number;
  /** The pickup sound rises in pitch by this much per link in the chain ... */
  pickupPitchStep: number;
  /** ... up to this many links. */
  pickupPitchCap: number;
  /** Height of a star's centre above the road, m. */
  starHeight: number;
  /** Width of a glitter star, m. */
  starSize: number;
  /** Width of a gold star, m. */
  goldSize: number;
  /** Depth of the extruded star, as a fraction of its width. */
  starDepth: number;
  /** Spin around the vertical axis, rad/s. */
  spinRate: number;
  /** Bobbing amplitude, m, and rate, rad/s. */
  bobAmplitude: number;
  bobRate: number;
  /** Colours of the two star kinds (pastel yellow, gold). */
  starColor: number;
  goldColor: number;
  /** Self-lit share of the star colour, so a star reads bright from every angle while it spins. */
  glow: number;
}

export const RUSH_TUNING: RushTuning = {
  seconds: 75,
  goldBonusSeconds: 3,
  starPoints: 1,
  goldPoints: 5,
  pickupRadius: 1.3,
  chainGapSeconds: 3,
  chainForX2: 10,
  chainForX3: 25,
  chainLostFrom: 3,
  respawnSeconds: 15,
  shrinkSeconds: 0.15,
  growSeconds: 0.35,
  starSpacing: 12,
  laneOffset: 3.5,
  runLength: { min: 5, max: 8 },
  startGap: 40,
  endGap: 20,
  goldCount: 10,
  goldLateral: 5,
  cornerCurvature: 1 / 80,
  minCornerLength: 25,
  seed: 13,
  statusSeconds: 1.2,
  tickFrom: 5,
  pickupPitchStep: 0.05,
  pickupPitchCap: 12,
  starHeight: 0.9,
  starSize: 0.9,
  goldSize: 1.25,
  starDepth: 0.14,
  spinRate: 2.4,
  bobAmplitude: 0.12,
  bobRate: 2.6,
  starColor: 0xfff0a0,
  goldColor: 0xffc23d,
  glow: 0.35,
};
