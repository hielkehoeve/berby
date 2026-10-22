/**
 * Every feel constant of Tide Rush. Units: meters, seconds. The player tops out at 21 m/s on
 * asphalt (PLAYER_TUNING.topSpeed) and 60 % of that on sand, and a clean lap covers the 1215 m
 * centerline in ~57 s (21.3 m/s). With these numbers a clean driver pulls away for the first two
 * minutes, then the tide (24 m/s from 180 s on) closes at ~2.7 m/s and catches up around 5.5
 * minutes; a 14 m/s driver is caught after 30 s, a 17 m/s one after ~107 s.
 */
export interface TideTuning {
  /** Meters the tide starts behind the player's grid progress at GO. */
  startGap: number;
  /** Tide speed at GO, m/s. */
  startSpeed: number;
  /** The tide gains this much speed (m/s) every rampInterval seconds... */
  speedStep: number;
  rampInterval: number;
  /** ...up to this speed, m/s. */
  maxSpeed: number;
  /** Under this gap the HUD warns ('⚠️', 'Faster!') and the warn sound plays once per entry. */
  warnGap: number;
  /** 'The tide is rising…' shows during the countdown and this long after GO. */
  introSeconds: number;
  /** 'Lap N!' shows this long after a new lap starts. */
  lapMessageSeconds: number;
  /** The HUD distance is rounded to this many meters. */
  distanceRounding: number;
  /** localStorage key of the best distance, meters. */
  bestKey: string;

  // Visuals
  /** Width of the wave front and the flood across the road, m (the barriers stand at ±9). */
  waveWidth: number;
  /** Height of the wave crest, m. */
  waveHeight: number;
  /** The wave grows to this scale over the last waveGrowGap meters before it catches the player. */
  waveGrowScale: number;
  waveGrowGap: number;
  /** The flooded ribbon covers this many meters of road behind the wave, in this many segments. */
  floodLength: number;
  floodSegments: number;
  /** Opacity of the wave and the flood. */
  waterOpacity: number;
}

export const TIDE_TUNING: TideTuning = {
  startGap: 45,
  startSpeed: 15,
  speedStep: 0.5,
  rampInterval: 10,
  maxSpeed: 24,
  warnGap: 12,
  introSeconds: 3,
  lapMessageSeconds: 2.5,
  distanceRounding: 10,
  bestKey: 'berby.tide.best',

  waveWidth: 24,
  waveHeight: 2.5,
  waveGrowScale: 1.4,
  waveGrowGap: 10,
  floodLength: 50,
  floodSegments: 24,
  waterOpacity: 0.75,
};
