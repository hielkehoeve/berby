import type { TrackDefinition } from '../shared/types';

/**
 * Malibu Sunset Loop (see MVP.md, "Track: Malibu Sunset Loop").
 *
 * Top view with X to the right and Z down the page; travel is clockwise. The ocean is the whole
 * -X side (the shoreline runs along x ≈ -45), so it is on the LEFT while driving the seaside
 * straight, which heads -Z (north). Everything is on the flat ground plane; the "hill" is
 * suggested by scenery (see malibu-scenery.ts), not by road height.
 *
 * Sections, in travel order (control point indices in brackets):
 *   [0–2]   seaside straight, ~230 m, start/finish at the first point
 *   [3–5]   turn 1: right-hand sweeper inland (R ≈ 60 m)
 *   [6–7]   short approach straight to the beach café
 *   [8–13]  hairpin around the café (R ≈ 40 m), the café sits inside the loop
 *   [14]    link west toward the hill
 *   [15–20] hill curve: a long left-hand sweeper (R ≈ 62 m) with the ocean on the right
 *   [21–24] east along the foot of the hill, right turn onto the south leg
 *   [25–28] south leg and the right turn into the palm tunnel
 *   [29–31] palm tunnel heading west
 *   [32–34] final right turn back onto the straight
 *
 * Arcs are sampled every 30° so the Catmull-Rom spline stays close to a true circle; with
 * sparser points the spline pinches at the control points and the radius drops. Measured with
 * both uniform and centripetal Catmull-Rom: lap ≈ 1215 m, minimum radius ≈ 25 m (12 m road).
 */
export const MALIBU: TrackDefinition = {
  id: 'malibu',
  name: 'Malibu Sunset Loop',
  roadWidth: 12,
  barrierOffset: 9,
  checkpointCount: 12,
  laps: 3,
  controlPoints: [
    { x: 0, z: 40 }, // 0: start/finish line on the seaside straight, heading -Z (north); ocean on the left (-X)
    { x: 0, z: -55 }, // 1: seaside straight
    { x: 0, z: -150 }, // 2: end of the straight
    { x: 8, z: -180 }, // 3: turn 1: right-hand sweeper inland
    { x: 30, z: -202 },
    { x: 60, z: -210 },
    { x: 120, z: -210 }, // 6: approach straight to the beach café
    { x: 150, z: -210 }, // 7: hairpin entry
    { x: 170, z: -204.6 }, // 8: hairpin around the café; the café sits inside the loop near (150, -170)
    { x: 184.6, z: -190 },
    { x: 190, z: -170 }, // 10: hairpin apex, heading +Z (south)
    { x: 184.6, z: -150 },
    { x: 170, z: -135.4 },
    { x: 150, z: -130 }, // 13: hairpin exit, heading -X (west)
    { x: 112, z: -130 }, // 14: link west toward the hill
    { x: 81, z: -121.7 }, // 15: hill curve: a long left-hand sweeper, the ocean view is on the right
    { x: 58.3, z: -99 },
    { x: 50, z: -68 }, // 17: westmost point of the hill curve, heading +Z (south)
    { x: 58.3, z: -37 },
    { x: 81, z: -14.3 },
    { x: 112, z: -6 }, // 20: hill curve exit, heading +X (east)
    { x: 150, z: -6 }, // 21: east along the foot of the hill
    { x: 177.5, z: 1.4 }, // 22: right turn onto the south leg
    { x: 197.6, z: 21.5 },
    { x: 205, z: 49 },
    { x: 205, z: 90 }, // 25: south leg, heading +Z
    { x: 197.6, z: 117.5 }, // 26: right turn into the palm tunnel
    { x: 177.5, z: 137.6 },
    { x: 150, z: 145 },
    { x: 115, z: 145 }, // 29: palm tunnel, heading -X (west)
    { x: 75, z: 145 }, // 30: palm tunnel
    { x: 55, z: 145 }, // 31: palm tunnel exit
    { x: 27.5, z: 137.6 }, // 32: final right turn onto the straight
    { x: 7.4, z: 117.5 },
    { x: 0, z: 90 }, // 34: rejoin the straight, heading -Z
  ],
};
