/**
 * Scenery placement for the Malibu Sunset Loop.
 *
 * TrackDefinition is frozen, so set dressing lives here. Objects are placed relative to the
 * track: an anchor is a control point index plus metres past it (`{ cp, along }`), which stays
 * valid whichever spline the sim uses, or an absolute world position (`{ x, z }`) for things
 * like hills. `lateral` is metres from the centerline, positive = LEFT of travel (on the
 * seaside straight that is the ocean side). `resolveScenery()` turns the entries into world
 * placements using the Track contract only.
 */
import type { Track } from '../shared/types';
import { forwardToHeading, leftOf, wrapDistance } from '../shared/math';
import { PALETTE } from '../shared/palette';

export type SceneryKind =
  | 'palm'
  | 'house'
  | 'cafe'
  | 'umbrella'
  | 'towel'
  | 'ball'
  | 'surfboard'
  | 'lifeguard'
  | 'flamingo'
  | 'bush'
  | 'hill'
  | 'kart'
  | 'arch';

/** A point on the track: control point index plus metres along the centerline past it. */
export interface TrackAnchor {
  cp: number;
  along?: number;
}
/** An absolute ground position. */
export interface WorldAnchor {
  x: number;
  z: number;
}
export type Anchor = TrackAnchor | WorldAnchor;

/** Which way an object's front (local -Z) points. */
export type Facing = 'along' | 'back' | 'road' | 'away';

export interface SceneryItem {
  kind: SceneryKind;
  at: Anchor;
  /** Metres from the centerline, + = left of travel. Ignored for world anchors. */
  lateral?: number;
  /** Base height above the ground (default 0). */
  y?: number;
  facing?: Facing;
  /** Extra yaw in radians, added after `facing`. */
  yaw?: number;
  scale?: number;
  /** Separate vertical scale (hills). Defaults to `scale`. */
  scaleY?: number;
  color?: number;
  /** Lean toward the road, radians (palms in the tunnel). */
  tilt?: number;
}

/** A repeated object along a stretch of track. */
export interface SceneryRun {
  kind: SceneryKind;
  from: TrackAnchor;
  to: TrackAnchor;
  /** Spacing in metres along the centerline. */
  step: number;
  lateral: number;
  /** Also place a mirrored copy at -lateral. */
  mirror?: boolean;
  /** Random lateral offset, ± metres. */
  jitter?: number;
  /** Random offset along the track, ± metres. */
  alongJitter?: number;
  scale?: number;
  scaleJitter?: number;
  facing?: Facing;
  yaw?: number;
  /** One of these colours is picked per object. */
  colors?: number[];
  tilt?: number;
  seed?: number;
}

export type SceneryEntry = SceneryItem | SceneryRun;

export interface PlacedScenery {
  kind: SceneryKind;
  x: number;
  y: number;
  z: number;
  /** World yaw: rotation.y of the object. */
  yaw: number;
  /** Roll about the object's forward axis (palm lean), radians. */
  roll: number;
  scale: number;
  scaleY: number;
  color?: number;
  /** Stable pseudo-random value in [0, 1) for per-object variation. */
  seed: number;
}

function isRun(e: SceneryEntry): e is SceneryRun {
  return (e as SceneryRun).from !== undefined;
}

function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Centerline distance of a track anchor. Control points lie on the spline, so nearest() is exact. */
export function anchorDistance(track: Track, a: TrackAnchor): number {
  const cp = track.definition.controlPoints[a.cp];
  if (!cp) throw new Error(`scenery anchor: no control point ${a.cp}`);
  return wrapDistance(track.nearest(cp).sample.distance + (a.along ?? 0), track.length);
}

function yawFor(facing: Facing, heading: number, lateral: number): number {
  switch (facing) {
    case 'back':
      return heading + Math.PI;
    case 'road':
      // Right of travel is heading - PI/2 (a right turn decreases the heading).
      return lateral > 0 ? heading - Math.PI / 2 : heading + Math.PI / 2;
    case 'away':
      return lateral > 0 ? heading + Math.PI / 2 : heading - Math.PI / 2;
    default:
      return heading;
  }
}

function placeOnTrack(
  track: Track,
  distance: number,
  lateral: number,
  kind: SceneryKind,
  opts: {
    y?: number;
    facing?: Facing;
    yaw?: number;
    scale?: number;
    scaleY?: number;
    color?: number;
    tilt?: number;
    seed: number;
  },
): PlacedScenery {
  const s = track.sampleAt(distance);
  const l = leftOf(s.tangent);
  const heading = forwardToHeading(s.tangent);
  const scale = opts.scale ?? 1;
  return {
    kind,
    x: s.position.x + l.x * lateral,
    z: s.position.z + l.z * lateral,
    y: opts.y ?? 0,
    yaw: yawFor(opts.facing ?? 'along', heading, lateral) + (opts.yaw ?? 0),
    // Positive rotation.z leans the top toward local -X (left of travel); lean toward the road.
    roll: opts.tilt ? -Math.sign(lateral) * opts.tilt : 0,
    scale,
    scaleY: opts.scaleY ?? scale,
    color: opts.color,
    seed: opts.seed,
  };
}

/** Resolve the placement list against a built track. */
export function resolveScenery(entries: SceneryEntry[], track: Track): PlacedScenery[] {
  const out: PlacedScenery[] = [];
  entries.forEach((e, index) => {
    if (isRun(e)) {
      const rand = mulberry((e.seed ?? 1) * 7919 + index * 104729);
      const from = anchorDistance(track, e.from);
      let to = anchorDistance(track, e.to);
      if (to < from) to += track.length;
      const sides = e.mirror ? [e.lateral, -e.lateral] : [e.lateral];
      for (let d = from; d <= to + 1e-6; d += e.step) {
        for (const lat of sides) {
          const r1 = rand();
          const r2 = rand();
          const r3 = rand();
          const r4 = rand();
          const scale = (e.scale ?? 1) + (e.scaleJitter ?? 0) * (r3 * 2 - 1);
          out.push(
            placeOnTrack(track, d + (e.alongJitter ?? 0) * (r2 * 2 - 1), lat + (e.jitter ?? 0) * (r1 * 2 - 1), e.kind, {
              facing: e.facing,
              yaw: e.yaw,
              scale,
              color: e.colors ? e.colors[Math.floor(r4 * e.colors.length) % e.colors.length] : undefined,
              tilt: e.tilt,
              seed: rand(),
            }),
          );
        }
      }
      return;
    }
    const seed = mulberry(index * 2654435761)();
    if ('cp' in e.at) {
      out.push(
        placeOnTrack(track, anchorDistance(track, e.at), e.lateral ?? 0, e.kind, {
          y: e.y,
          facing: e.facing,
          yaw: e.yaw,
          scale: e.scale,
          scaleY: e.scaleY,
          color: e.color,
          tilt: e.tilt,
          seed,
        }),
      );
    } else {
      const scale = e.scale ?? 1;
      out.push({
        kind: e.kind,
        x: e.at.x,
        z: e.at.z,
        y: e.y ?? 0,
        yaw: e.yaw ?? 0,
        roll: 0,
        scale,
        scaleY: e.scaleY ?? scale,
        color: e.color,
        seed,
      });
    }
  });
  return out;
}

// ---------------------------------------------------------------------------------------------
// Malibu data
// ---------------------------------------------------------------------------------------------

/** The shoreline: the ocean covers x < shorelineX(z). Shared with the world's sand and water. */
export const SHORE_X = -46;
export function shorelineX(z: number): number {
  return SHORE_X + 6 * Math.sin(z * 0.0349) + 2.5 * Math.sin(z * 0.103 + 1.3);
}

/** The near hill inside the sweeping hill curve: a soft dome the road wraps around. */
export const NEAR_HILL = { x: 112, z: -68, radius: 47, height: 13 };

/** Height of the near hill's surface at a world position (0 off the hill). */
export function hillY(x: number, z: number): number {
  const d = Math.hypot(x - NEAR_HILL.x, z - NEAR_HILL.z) / NEAR_HILL.radius;
  return d >= 1 ? 0 : NEAR_HILL.height * Math.sqrt(1 - d * d);
}

const HOUSE_COLORS = [PALETTE.bubblegum, PALETTE.lavender, PALETTE.mint, PALETTE.cream, 0xffcba4, 0xbfe6ff, 0xffffff];
const UMBRELLA_COLORS = [PALETTE.hotPink, PALETTE.lavender, PALETTE.mint, PALETTE.sunsetOrange, PALETTE.bubblegum];
const TOWEL_COLORS = [PALETTE.hotPink, PALETTE.lavender, PALETTE.mint, PALETTE.sunsetOrange, 0xffffff];
const FAR_HILL_COLORS = [0xb59ae6, 0xc98fcc, 0xa892e0];

const onHill = (x: number, z: number, kind: SceneryKind, extra: Partial<SceneryItem> = {}): SceneryItem => ({
  kind,
  at: { x, z },
  y: hillY(x, z) - 0.3,
  ...extra,
});

export const MALIBU_SCENERY: SceneryEntry[] = [
  // --- Start / finish ------------------------------------------------------------------------
  { kind: 'arch', at: { cp: 0 } },

  // --- Seaside straight (cp 34 -> 0 -> 2): ocean on the left --------------------------------
  // Beach side
  {
    kind: 'umbrella',
    from: { cp: 34, along: 4 },
    to: { cp: 2, along: -6 },
    step: 15,
    lateral: 21,
    jitter: 5,
    alongJitter: 4,
    colors: UMBRELLA_COLORS,
    seed: 3,
  },
  {
    kind: 'towel',
    from: { cp: 34, along: 11 },
    to: { cp: 2, along: -6 },
    step: 13,
    lateral: 26,
    jitter: 6,
    alongJitter: 4,
    colors: TOWEL_COLORS,
    seed: 4,
  },
  {
    kind: 'ball',
    from: { cp: 34, along: 20 },
    to: { cp: 2 },
    step: 47,
    lateral: 24,
    jitter: 6,
    alongJitter: 10,
    seed: 5,
  },
  {
    kind: 'palm',
    from: { cp: 34, along: 2 },
    to: { cp: 2, along: -4 },
    step: 23,
    lateral: 13.5,
    jitter: 1.5,
    alongJitter: 5,
    scale: 1,
    scaleJitter: 0.18,
    seed: 6,
  },
  { kind: 'surfboard', at: { cp: 1, along: -30 }, lateral: 16, facing: 'road', color: PALETTE.mint },
  { kind: 'surfboard', at: { cp: 1, along: -27 }, lateral: 16.5, facing: 'road', color: PALETTE.hotPink },
  { kind: 'surfboard', at: { cp: 1, along: 55 }, lateral: 30, facing: 'away', color: PALETTE.sunsetOrange },
  { kind: 'lifeguard', at: { cp: 1, along: 12 }, lateral: 31, facing: 'away' },
  { kind: 'flamingo', at: { cp: 0, along: -45 }, lateral: 58 },
  { kind: 'flamingo', at: { cp: 0, along: 25 }, lateral: 64 },
  { kind: 'flamingo', at: { cp: 1, along: 5 }, lateral: 55 },
  { kind: 'flamingo', at: { cp: 1, along: 55 }, lateral: 70 },
  { kind: 'flamingo', at: { cp: 34, along: -20 }, lateral: 60 },
  // Inland side: a row of beach houses with palms between them
  {
    kind: 'house',
    from: { cp: 34, along: 8 },
    to: { cp: 2, along: -12 },
    step: 31,
    lateral: -25,
    jitter: 2,
    facing: 'road',
    colors: HOUSE_COLORS,
    scale: 1,
    scaleJitter: 0.12,
    seed: 7,
  },
  {
    kind: 'palm',
    from: { cp: 34, along: 23 },
    to: { cp: 2, along: -4 },
    step: 31,
    lateral: -15.5,
    jitter: 2,
    scale: 1.05,
    scaleJitter: 0.2,
    seed: 8,
  },
  {
    kind: 'bush',
    from: { cp: 34 },
    to: { cp: 2 },
    step: 13.6,
    lateral: -11.5,
    jitter: 1,
    alongJitter: 2,
    scale: 1,
    scaleJitter: 0.3,
    seed: 9,
  },

  // --- Turn 1 (cp 3-5) ----------------------------------------------------------------------
  {
    kind: 'palm',
    from: { cp: 2, along: 6 },
    to: { cp: 6, along: -4 },
    step: 11,
    lateral: 14.5,
    jitter: 2.5,
    scale: 1.05,
    scaleJitter: 0.2,
    seed: 10,
  },
  { kind: 'house', at: { cp: 3, along: 8 }, lateral: 29, facing: 'road', color: PALETTE.bubblegum, scale: 1.1 },
  { kind: 'house', at: { cp: 5, along: 4 }, lateral: 27, facing: 'road', color: 0xbfe6ff },
  { kind: 'umbrella', at: { cp: 4 }, lateral: 30, color: PALETTE.mint },
  { kind: 'towel', at: { cp: 4, along: 3 }, lateral: 33, color: PALETTE.hotPink },
  {
    kind: 'bush',
    from: { cp: 3 },
    to: { cp: 5 },
    step: 11.2,
    lateral: -12,
    jitter: 1,
    scale: 1.1,
    scaleJitter: 0.3,
    seed: 11,
  },
  {
    kind: 'palm',
    from: { cp: 3, along: 4 },
    to: { cp: 5, along: 8 },
    step: 13,
    lateral: -19,
    jitter: 4,
    alongJitter: 3,
    scale: 0.95,
    scaleJitter: 0.2,
    seed: 12,
  },

  // --- Approach to the café (cp 6-7) ---------------------------------------------------------
  { kind: 'house', at: { cp: 6, along: 2 }, lateral: 25, facing: 'road', color: PALETTE.lavender },
  { kind: 'house', at: { cp: 6, along: 30 }, lateral: 25, facing: 'road', color: PALETTE.cream, scale: 0.9 },
  { kind: 'palm', at: { cp: 6, along: 16 }, lateral: 15 },
  { kind: 'palm', at: { cp: 6, along: 44 }, lateral: 16, scale: 1.15 },
  // The café car park: parked karts in guest colours, nose toward the café
  { kind: 'kart', at: { cp: 6, along: 10 }, lateral: -15.5, facing: 'away', color: PALETTE.mint },
  { kind: 'kart', at: { cp: 6, along: 15 }, lateral: -15.5, facing: 'away', color: PALETTE.sunsetOrange },
  { kind: 'kart', at: { cp: 6, along: 20 }, lateral: -15.5, facing: 'away', color: 0xbfe6ff },
  { kind: 'bush', from: { cp: 6, along: -6 }, to: { cp: 7 }, step: 9.6, lateral: -11.5, jitter: 0.8, seed: 13 },

  // --- Hairpin around the café (cp 8-13) ----------------------------------------------------
  { kind: 'cafe', at: { cp: 10 }, lateral: -34, facing: 'road' },
  { kind: 'umbrella', at: { cp: 9, along: 6 }, lateral: -22, color: PALETTE.hotPink },
  { kind: 'umbrella', at: { cp: 10, along: -4 }, lateral: -23, color: PALETTE.bubblegum },
  { kind: 'umbrella', at: { cp: 10, along: 6 }, lateral: -23, color: PALETTE.lavender },
  { kind: 'umbrella', at: { cp: 11, along: 4 }, lateral: -22, color: PALETTE.mint },
  { kind: 'umbrella', at: { cp: 10 }, lateral: -46, color: PALETTE.sunsetOrange },
  { kind: 'palm', at: { cp: 8, along: 10 }, lateral: -15, scale: 1.2 },
  { kind: 'palm', at: { cp: 12, along: 6 }, lateral: -15, scale: 1.1 },
  { kind: 'palm', at: { cp: 10 }, lateral: -50, scale: 1.3 },
  { kind: 'palm', at: { cp: 9, along: -4 }, lateral: -40, scale: 1.05 },
  { kind: 'palm', at: { cp: 11, along: 8 }, lateral: -42, scale: 1.15 },
  { kind: 'bush', from: { cp: 8 }, to: { cp: 13 }, step: 9.6, lateral: -11.5, jitter: 0.8, seed: 14 },
  // Outside of the hairpin
  {
    kind: 'palm',
    from: { cp: 7, along: 2 },
    to: { cp: 13, along: 6 },
    step: 10,
    lateral: 14.5,
    jitter: 2,
    scale: 1.1,
    scaleJitter: 0.2,
    seed: 15,
  },
  { kind: 'house', at: { cp: 8, along: 4 }, lateral: 30, facing: 'road', color: PALETTE.mint },
  { kind: 'house', at: { cp: 10, along: 2 }, lateral: 31, facing: 'road', color: PALETTE.bubblegum, scale: 1.15 },
  { kind: 'house', at: { cp: 12, along: 2 }, lateral: 30, facing: 'road', color: 0xffcba4 },
  { kind: 'bush', from: { cp: 7 }, to: { cp: 13 }, step: 11.2, lateral: 11.5, jitter: 0.8, seed: 16 },

  // --- Link west and the hill curve (cp 14-20) ----------------------------------------------
  {
    kind: 'hill',
    at: { x: NEAR_HILL.x, z: NEAR_HILL.z },
    scale: NEAR_HILL.radius,
    scaleY: NEAR_HILL.height,
    color: 0xc4ecc9,
  },
  onHill(100, -82, 'house', { facing: 'along', yaw: -0.5, color: PALETTE.cream, scale: 1.05 }),
  onHill(126, -60, 'house', { facing: 'along', yaw: 2.2, color: PALETTE.bubblegum }),
  onHill(104, -50, 'house', { facing: 'along', yaw: 0.9, color: PALETTE.lavender, scale: 0.9 }),
  onHill(92, -62, 'palm', { scale: 1.2 }),
  onHill(132, -84, 'palm', { scale: 1.1 }),
  onHill(112, -96, 'palm', { scale: 1.0 }),
  onHill(120, -40, 'palm', { scale: 1.25 }),
  onHill(88, -42, 'palm', { scale: 1.05 }),
  onHill(140, -62, 'palm', { scale: 0.95 }),
  onHill(112, -68, 'palm', { scale: 1.35 }),
  onHill(98, -100, 'bush', { scale: 1.6 }),
  onHill(136, -46, 'bush', { scale: 1.5 }),
  onHill(80, -74, 'bush', { scale: 1.4 }),
  // Outside the curve the sand runs down to the water: keep the view open, dress it lightly.
  {
    kind: 'bush',
    from: { cp: 14, along: 4 },
    to: { cp: 20, along: -4 },
    step: 14.4,
    lateral: -12,
    jitter: 1,
    scale: 0.9,
    scaleJitter: 0.3,
    seed: 17,
  },
  { kind: 'palm', at: { cp: 15, along: 8 }, lateral: -17, scale: 0.9 },
  { kind: 'palm', at: { cp: 18, along: 10 }, lateral: -18, scale: 1.0 },
  { kind: 'umbrella', at: { cp: 16, along: 10 }, lateral: -30, color: PALETTE.hotPink },
  { kind: 'towel', at: { cp: 16, along: 13 }, lateral: -33, color: PALETTE.mint },
  { kind: 'umbrella', at: { cp: 17, along: 12 }, lateral: -45, color: PALETTE.lavender },
  { kind: 'towel', at: { cp: 17, along: 15 }, lateral: -48, color: PALETTE.sunsetOrange },
  { kind: 'ball', at: { cp: 17, along: 4 }, lateral: -38 },
  { kind: 'umbrella', at: { cp: 18, along: 2 }, lateral: -28, color: PALETTE.mint },
  { kind: 'surfboard', at: { cp: 17, along: -6 }, lateral: -24, facing: 'road', color: PALETTE.lavender },
  { kind: 'flamingo', at: { x: -62, z: -95 } },
  { kind: 'flamingo', at: { x: -70, z: -40 } },
  { kind: 'flamingo', at: { x: -58, z: -160 } },

  // --- Foot of the hill, turn onto the south leg (cp 21-24) ---------------------------------
  {
    kind: 'house',
    from: { cp: 20, along: 6 },
    to: { cp: 22, along: -6 },
    step: 28,
    lateral: -25,
    facing: 'road',
    colors: HOUSE_COLORS,
    seed: 18,
  },
  {
    kind: 'palm',
    from: { cp: 20, along: 20 },
    to: { cp: 22 },
    step: 28,
    lateral: -15.5,
    jitter: 2,
    scale: 1.1,
    seed: 19,
  },
  { kind: 'bush', from: { cp: 20 }, to: { cp: 25 }, step: 12.8, lateral: -11.5, jitter: 0.8, seed: 20 },
  {
    kind: 'palm',
    from: { cp: 21, along: 4 },
    to: { cp: 24, along: 4 },
    step: 12,
    lateral: 15,
    jitter: 2,
    scale: 1.05,
    scaleJitter: 0.2,
    seed: 21,
  },
  { kind: 'house', at: { cp: 23, along: 2 }, lateral: 30, facing: 'road', color: PALETTE.lavender, scale: 1.1 },
  { kind: 'house', at: { cp: 24, along: 14 }, lateral: 27, facing: 'road', color: PALETTE.mint },

  // --- South leg (cp 25) --------------------------------------------------------------------
  {
    kind: 'house',
    from: { cp: 24, along: 42 },
    to: { cp: 26, along: -8 },
    step: 30,
    lateral: 26,
    facing: 'road',
    colors: HOUSE_COLORS,
    scale: 1,
    scaleJitter: 0.1,
    seed: 22,
  },
  {
    kind: 'palm',
    from: { cp: 24, along: 28 },
    to: { cp: 26 },
    step: 30,
    lateral: 15.5,
    jitter: 2,
    scale: 1.1,
    scaleJitter: 0.15,
    seed: 23,
  },
  { kind: 'bush', from: { cp: 24 }, to: { cp: 27 }, step: 12.8, lateral: 11.5, jitter: 0.8, seed: 24 },
  { kind: 'house', at: { cp: 25, along: -16 }, lateral: -30, facing: 'road', color: PALETTE.cream, scale: 1.1 },
  { kind: 'house', at: { cp: 25, along: 20 }, lateral: -28, facing: 'road', color: PALETTE.bubblegum },
  { kind: 'palm', at: { cp: 25, along: 2 }, lateral: -17, scale: 1.2 },
  { kind: 'palm', at: { cp: 25, along: 40 }, lateral: -16, scale: 1.0 },
  { kind: 'kart', at: { cp: 25, along: 30 }, lateral: -16, facing: 'away', color: PALETTE.bubblegum },

  // --- Turn into the palm tunnel (cp 26-28) --------------------------------------------------
  {
    kind: 'palm',
    from: { cp: 26, along: 6 },
    to: { cp: 28, along: -4 },
    step: 10,
    lateral: 15,
    jitter: 2,
    scale: 1.1,
    scaleJitter: 0.2,
    seed: 25,
  },
  { kind: 'house', at: { cp: 27, along: 4 }, lateral: 31, facing: 'road', color: 0xffcba4, scale: 1.15 },
  { kind: 'bush', from: { cp: 26 }, to: { cp: 28 }, step: 11.2, lateral: -12, jitter: 1, seed: 26 },
  { kind: 'palm', at: { cp: 27, along: 2 }, lateral: -20, scale: 1.1 },

  // --- Palm tunnel (cp 28-31): tall palms on both sides leaning over the road -----------------
  {
    kind: 'palm',
    from: { cp: 28, along: 4 },
    to: { cp: 31, along: 2 },
    step: 6,
    lateral: 11.5,
    mirror: true,
    jitter: 0.4,
    alongJitter: 0.6,
    scale: 1.35,
    scaleJitter: 0.1,
    tilt: 0.3,
    seed: 27,
  },
  {
    kind: 'bush',
    from: { cp: 28, along: 7 },
    to: { cp: 31 },
    step: 9.6,
    lateral: 13,
    mirror: true,
    jitter: 0.5,
    scale: 0.9,
    scaleJitter: 0.3,
    seed: 28,
  },

  // --- Final turn onto the straight (cp 32-34) -----------------------------------------------
  {
    kind: 'palm',
    from: { cp: 31, along: 8 },
    to: { cp: 34, along: -6 },
    step: 11,
    lateral: 15,
    jitter: 2,
    scale: 1.1,
    scaleJitter: 0.2,
    seed: 29,
  },
  { kind: 'house', at: { cp: 32, along: 6 }, lateral: 30, facing: 'road', color: PALETTE.mint },
  { kind: 'house', at: { cp: 33, along: 8 }, lateral: 29, facing: 'road', color: PALETTE.lavender, scale: 0.95 },
  { kind: 'bush', from: { cp: 32 }, to: { cp: 34 }, step: 11.2, lateral: -12, jitter: 1, seed: 30 },
  { kind: 'palm', at: { cp: 33 }, lateral: -22, scale: 1.0 },
  { kind: 'umbrella', at: { cp: 34, along: -14 }, lateral: 24, color: PALETTE.bubblegum },

  // --- Far backdrop: soft hills in the haze, inland and up/down the coast ---------------------
  { kind: 'hill', at: { x: 640, z: -220 }, scale: 300, scaleY: 70, color: FAR_HILL_COLORS[0] },
  { kind: 'hill', at: { x: 760, z: 160 }, scale: 340, scaleY: 85, color: FAR_HILL_COLORS[1] },
  { kind: 'hill', at: { x: 520, z: 520 }, scale: 280, scaleY: 60, color: FAR_HILL_COLORS[2] },
  { kind: 'hill', at: { x: 200, z: -720 }, scale: 320, scaleY: 70, color: FAR_HILL_COLORS[1] },
  { kind: 'hill', at: { x: 520, z: -600 }, scale: 300, scaleY: 80, color: FAR_HILL_COLORS[0] },
  { kind: 'hill', at: { x: 160, z: 700 }, scale: 300, scaleY: 65, color: FAR_HILL_COLORS[2] },
];
