// Closed centripetal Catmull-Rom centerline, arc-length sampled into a uniform lookup table.
//
// buildTrack() is the only entry point other modules use (see shared/types.ts for the Track
// contract). curvatureAt() is an extra helper for the rival AI; it works on any Track but is
// exact and cheap for tracks built here.
import type { Track, TrackDefinition, TrackSample, Vec2 } from '../shared/types';
import { forwardToHeading, leftOf, wrapAngle, wrapDistance } from '../shared/math';

/** Spacing of the arc-length lookup table in meters. */
export const TABLE_STEP = 0.5;
/** Centripetal parametrization: avoids loops and cusps on unevenly spaced control points. */
const CATMULL_ROM_ALPHA = 0.5;
/** Fine subdivision step (meters, approximate) used while measuring arc length. */
const FINE_STEP = 0.1;
/** Stride of the coarse pass in nearest(); the fine pass re-scans ±stride around the best hit. */
const COARSE_STRIDE = 8;

interface TableData {
  n: number;
  step: number;
  px: Float64Array;
  pz: Float64Array;
  tx: Float64Array;
  tz: Float64Array;
  /** Signed curvature per entry: + = turning left, in 1/m. */
  curvature: Float64Array;
}

/** Lookup tables of tracks built by buildTrack(), so curvatureAt() can be exact for them. */
const tables = new WeakMap<Track, TableData>();

/**
 * Barry-Goldman evaluation of one centripetal Catmull-Rom segment p1..p2 at parameter t in
 * [t1, t2], returning the position and the (non-normalized) derivative dP/dt.
 */
function evalSegment(
  p0: Vec2,
  p1: Vec2,
  p2: Vec2,
  p3: Vec2,
  t0: number,
  t1: number,
  t2: number,
  t3: number,
  t: number,
): { x: number; z: number; dx: number; dz: number } {
  const a1x = ((t1 - t) * p0.x + (t - t0) * p1.x) / (t1 - t0);
  const a1z = ((t1 - t) * p0.z + (t - t0) * p1.z) / (t1 - t0);
  const a2x = ((t2 - t) * p1.x + (t - t1) * p2.x) / (t2 - t1);
  const a2z = ((t2 - t) * p1.z + (t - t1) * p2.z) / (t2 - t1);
  const a3x = ((t3 - t) * p2.x + (t - t2) * p3.x) / (t3 - t2);
  const a3z = ((t3 - t) * p2.z + (t - t2) * p3.z) / (t3 - t2);
  const da1x = (p1.x - p0.x) / (t1 - t0);
  const da1z = (p1.z - p0.z) / (t1 - t0);
  const da2x = (p2.x - p1.x) / (t2 - t1);
  const da2z = (p2.z - p1.z) / (t2 - t1);
  const da3x = (p3.x - p2.x) / (t3 - t2);
  const da3z = (p3.z - p2.z) / (t3 - t2);

  const b1x = ((t2 - t) * a1x + (t - t0) * a2x) / (t2 - t0);
  const b1z = ((t2 - t) * a1z + (t - t0) * a2z) / (t2 - t0);
  const b2x = ((t3 - t) * a2x + (t - t1) * a3x) / (t3 - t1);
  const b2z = ((t3 - t) * a2z + (t - t1) * a3z) / (t3 - t1);
  const db1x = (a2x - a1x + (t2 - t) * da1x + (t - t0) * da2x) / (t2 - t0);
  const db1z = (a2z - a1z + (t2 - t) * da1z + (t - t0) * da2z) / (t2 - t0);
  const db2x = (a3x - a2x + (t3 - t) * da2x + (t - t1) * da3x) / (t3 - t1);
  const db2z = (a3z - a2z + (t3 - t) * da2z + (t - t1) * da3z) / (t3 - t1);

  const x = ((t2 - t) * b1x + (t - t1) * b2x) / (t2 - t1);
  const z = ((t2 - t) * b1z + (t - t1) * b2z) / (t2 - t1);
  const dx = (b2x - b1x + (t2 - t) * db1x + (t - t1) * db2x) / (t2 - t1);
  const dz = (b2z - b1z + (t2 - t) * db1z + (t - t1) * db2z) / (t2 - t1);
  return { x, z, dx, dz };
}

function knotDelta(a: Vec2, b: Vec2): number {
  // Coincident control points would make the knot interval zero; keep a tiny spacing instead.
  return Math.max(Math.hypot(b.x - a.x, b.z - a.z) ** CATMULL_ROM_ALPHA, 1e-6);
}

/** Build the uniform arc-length table for a closed spline through the control points. */
function buildTable(controlPoints: Vec2[]): TableData {
  const pts = controlPoints;
  const n = pts.length;
  if (n < 3) throw new Error('A closed track needs at least 3 control points');

  // 1. Fine polyline along the whole loop with positions, derivatives and cumulative length.
  const fx: number[] = [];
  const fz: number[] = [];
  const fdx: number[] = [];
  const fdz: number[] = [];
  const fs: number[] = [];
  let s = 0;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];
    const t0 = 0;
    const t1 = t0 + knotDelta(p0, p1);
    const t2 = t1 + knotDelta(p1, p2);
    const t3 = t2 + knotDelta(p2, p3);
    const chord = Math.hypot(p2.x - p1.x, p2.z - p1.z);
    const subdivisions = Math.max(4, Math.ceil(chord / FINE_STEP));
    for (let k = 0; k < subdivisions; k++) {
      const t = t1 + ((t2 - t1) * k) / subdivisions;
      const e = evalSegment(p0, p1, p2, p3, t0, t1, t2, t3, t);
      if (fx.length > 0) s += Math.hypot(e.x - fx[fx.length - 1], e.z - fz[fz.length - 1]);
      fx.push(e.x);
      fz.push(e.z);
      fdx.push(e.dx);
      fdz.push(e.dz);
      fs.push(s);
    }
  }
  // Close the loop: distance from the last fine point back to the first.
  const length = s + Math.hypot(fx[0] - fx[fx.length - 1], fz[0] - fz[fz.length - 1]);
  const fineCount = fx.length;

  // 2. Resample at uniform spacing. Entry i sits at distance i * step; entry N wraps to entry 0.
  const count = Math.max(8, Math.round(length / TABLE_STEP));
  const step = length / count;
  const px = new Float64Array(count);
  const pz = new Float64Array(count);
  const tx = new Float64Array(count);
  const tz = new Float64Array(count);
  let j = 0;
  for (let i = 0; i < count; i++) {
    const target = i * step;
    while (j < fineCount - 1 && fs[j + 1] <= target) j++;
    const jn = (j + 1) % fineCount;
    const segLen = (jn === 0 ? length : fs[jn]) - fs[j];
    const u = segLen > 0 ? (target - fs[j]) / segLen : 0;
    px[i] = fx[j] + (fx[jn] - fx[j]) * u;
    pz[i] = fz[j] + (fz[jn] - fz[j]) * u;
    let dx = fdx[j] + (fdx[jn] - fdx[j]) * u;
    let dz = fdz[j] + (fdz[jn] - fdz[j]) * u;
    const m = Math.hypot(dx, dz);
    if (m > 1e-9) {
      dx /= m;
      dz /= m;
    } else {
      dx = fx[jn] - fx[j];
      dz = fz[jn] - fz[j];
      const m2 = Math.hypot(dx, dz) || 1;
      dx /= m2;
      dz /= m2;
    }
    tx[i] = dx;
    tz[i] = dz;
  }

  // 3. Signed curvature from the heading change between neighbours (+ = left turn).
  const curvature = new Float64Array(count);
  for (let i = 0; i < count; i++) {
    const prev = (i - 1 + count) % count;
    const next = (i + 1) % count;
    const hPrev = forwardToHeading({ x: tx[prev], z: tz[prev] });
    const hNext = forwardToHeading({ x: tx[next], z: tz[next] });
    // A right turn decreases heading, so a positive heading change is a left turn.
    curvature[i] = wrapAngle(hNext - hPrev) / (2 * step);
  }

  return { n: count, step, px, pz, tx, tz, curvature };
}

export function buildTrack(definition: TrackDefinition): Track {
  const table = buildTable(definition.controlPoints);
  const { n, step, px, pz, tx, tz } = table;
  const length = n * step;

  const sampleAt = (d: number): TrackSample => {
    const dist = wrapDistance(d, length);
    const f = dist / step;
    let i = Math.floor(f);
    if (i >= n) i = n - 1;
    const u = f - i;
    const j = (i + 1) % n;
    let tanX = tx[i] + (tx[j] - tx[i]) * u;
    let tanZ = tz[i] + (tz[j] - tz[i]) * u;
    const m = Math.hypot(tanX, tanZ) || 1;
    tanX /= m;
    tanZ /= m;
    return {
      position: { x: px[i] + (px[j] - px[i]) * u, z: pz[i] + (pz[j] - pz[i]) * u },
      tangent: { x: tanX, z: tanZ },
      distance: dist,
    };
  };

  const nearest = (p: Vec2): { sample: TrackSample; lateral: number } => {
    // Coarse pass over every COARSE_STRIDE-th entry, then a fine pass around the best hit.
    let best = -1;
    let bestD2 = Infinity;
    for (let i = 0; i < n; i += COARSE_STRIDE) {
      const dx = px[i] - p.x;
      const dz = pz[i] - p.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < bestD2) {
        bestD2 = d2;
        best = i;
      }
    }
    const center = best;
    for (let k = -COARSE_STRIDE; k <= COARSE_STRIDE; k++) {
      const i = (center + k + n) % n;
      const dx = px[i] - p.x;
      const dz = pz[i] - p.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < bestD2) {
        bestD2 = d2;
        best = i;
      }
    }
    // Refine: project onto the two table segments touching the best entry.
    let bestDist = best * step;
    let refinedD2 = bestD2;
    for (const dir of [-1, 1]) {
      const j = (best + dir + n) % n;
      const sx = px[j] - px[best];
      const sz = pz[j] - pz[best];
      const l2 = sx * sx + sz * sz;
      if (l2 <= 0) continue;
      const u = Math.max(0, Math.min(1, ((p.x - px[best]) * sx + (p.z - pz[best]) * sz) / l2));
      const qx = px[best] + sx * u;
      const qz = pz[best] + sz * u;
      const d2 = (qx - p.x) ** 2 + (qz - p.z) ** 2;
      if (d2 < refinedD2) {
        refinedD2 = d2;
        bestDist = best * step + dir * u * step;
      }
    }
    const sample = sampleAt(bestDist);
    const left = leftOf(sample.tangent);
    const lateral = (p.x - sample.position.x) * left.x + (p.z - sample.position.z) * left.z;
    return { sample, lateral };
  };

  const checkpoints = Array.from(
    { length: definition.checkpointCount },
    (_, i) => (i * length) / definition.checkpointCount,
  );

  const track: Track = { definition, length, checkpoints, sampleAt, nearest };
  tables.set(track, table);
  return track;
}

/**
 * Signed curvature of the centerline at a distance, in 1/m: + = the track turns left, - = right,
 * 0 = straight. Radius = 1 / |curvature|. Exact for tracks from buildTrack(); for any other Track
 * implementation it falls back to a finite difference of sampleAt() tangents.
 */
export function curvatureAt(track: Track, distance: number): number {
  const table = tables.get(track);
  if (table) {
    const dist = wrapDistance(distance, track.length);
    const f = dist / table.step;
    let i = Math.floor(f);
    if (i >= table.n) i = table.n - 1;
    const u = f - i;
    const j = (i + 1) % table.n;
    return table.curvature[i] + (table.curvature[j] - table.curvature[i]) * u;
  }
  const h = 2;
  const a = track.sampleAt(distance - h);
  const b = track.sampleAt(distance + h);
  return wrapAngle(forwardToHeading(b.tangent) - forwardToHeading(a.tangent)) / (2 * h);
}
