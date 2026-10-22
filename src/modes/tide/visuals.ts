/**
 * The tide's look: a translucent wave front across the road at the tide's position and a flooded
 * ribbon of water on the road behind it. The only file of the mode that imports Three.js.
 *
 * Two draw calls, no shadows, nothing allocated after create(): the ribbon's vertex positions are
 * rewritten each frame from a centerline table sampled once in create(), and the wave is a static
 * mesh that is moved, turned and scaled.
 */
import * as THREE from 'three';
import type { Track } from '../../shared/types';
import { clamp, wrapDistance } from '../../shared/math';
import { PALETTE } from '../../shared/palette';
import { toonMaterial } from '../../graphics/materials';
import { TIDE_TUNING } from './tuning';

/** Deep and shallow water, matching the ocean in graphics/world.ts, and the foam. */
const SEA = 0x58b6ea;
const SHALLOW = 0x8fe9d2;
const FOAM = 0xffffff;
/** The flood sits this far above the ground (the road ribbon is at 0.02). */
const FLOOD_Y = 0.1;
/** The flood starts this far ahead of the wave's center so water shows under the curling lip. */
const FLOOD_LEAD = 1;
/** Spacing of the centerline table the visuals read each frame, m. */
const TABLE_SPACING = 1;
/** Columns across the wave front; the crest ripples a little from column to column. */
const WAVE_COLUMNS = 13;
/** Vertical bob of the wave, m, and its rate, rad/s. */
const BOB = 0.06;
const BOB_RATE = 2.6;

/**
 * Cross-section of the wave front from the base to the curling lip, for a 2.5 m wave: z in the
 * wave's local frame (−Z faces the player ahead of it), height and colour.
 */
const PROFILE = [
  { z: 0.6, y: 0, color: SEA },
  { z: 0.25, y: 0.4, color: SEA },
  { z: -0.05, y: 1.1, color: SHALLOW },
  { z: -0.45, y: 1.85, color: PALETTE.mint },
  { z: -1.05, y: 2.5, color: FOAM },
  { z: -1.75, y: 2.3, color: FOAM },
  { z: -2.1, y: 1.75, color: FOAM },
];
const PROFILE_HEIGHT = 2.5;

export interface TideVisuals {
  /**
   * Place the wave at the tide's progress (meters along the centerline, any value: it wraps) and
   * the flood behind it. gap is the distance to the player, for the final swell.
   */
  update(tideProgress: number, gap: number, elapsed: number): void;
  /** Remove everything from the scene and free the GPU resources. */
  dispose(): void;
}

/** Centerline positions and tangents at a fixed spacing: cx, cz, tx, tz per entry. */
interface CenterTable {
  n: number;
  step: number;
  data: Float32Array;
}

interface CenterSample {
  x: number;
  z: number;
  tx: number;
  tz: number;
}

function buildCenterTable(track: Track): CenterTable {
  const n = Math.max(8, Math.round(track.length / TABLE_SPACING));
  const step = track.length / n;
  const data = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    const s = track.sampleAt(i * step);
    data[i * 4] = s.position.x;
    data[i * 4 + 1] = s.position.z;
    data[i * 4 + 2] = s.tangent.x;
    data[i * 4 + 3] = s.tangent.z;
  }
  return { n, step, data };
}

/** Interpolated table lookup; writes into `out` so the per-frame loops allocate nothing. */
function sampleCenter(table: CenterTable, length: number, d: number, out: CenterSample): void {
  const { data, n, step } = table;
  const f = wrapDistance(d, length) / step;
  let i = Math.floor(f);
  if (i >= n) i = n - 1;
  const u = f - i;
  const a = i * 4;
  const b = ((i + 1) % n) * 4;
  out.x = data[a] + (data[b] - data[a]) * u;
  out.z = data[a + 1] + (data[b + 1] - data[a + 1]) * u;
  const tx = data[a + 2] + (data[b + 2] - data[a + 2]) * u;
  const tz = data[a + 3] + (data[b + 3] - data[a + 3]) * u;
  const m = Math.hypot(tx, tz) || 1;
  out.tx = tx / m;
  out.tz = tz / m;
}

/** The wave front: the profile swept across the road, with vertex colours from sea to foam. */
function buildWaveGeometry(): THREE.BufferGeometry {
  const { waveWidth, waveHeight } = TIDE_TUNING;
  const k = waveHeight / PROFILE_HEIGHT;
  const rows = PROFILE.length;
  const cols = WAVE_COLUMNS;
  const pos = new Float32Array(rows * cols * 3);
  const col = new Float32Array(rows * cols * 3);
  const c = new THREE.Color();
  for (let r = 0; r < rows; r++) {
    const p = PROFILE[r];
    c.set(p.color);
    // The ripple grows from nothing at the base to its full size at the lip.
    const lift = r / (rows - 1);
    for (let i = 0; i < cols; i++) {
      const ripple = Math.sin(i * 1.9) * lift;
      const v = (r * cols + i) * 3;
      pos[v] = (i / (cols - 1) - 0.5) * waveWidth;
      pos[v + 1] = (p.y + ripple * 0.12) * k;
      pos[v + 2] = (p.z + ripple * 0.2) * k;
      col[v] = c.r;
      col[v + 1] = c.g;
      col[v + 2] = c.b;
    }
  }
  const idx: number[] = [];
  for (let r = 0; r < rows - 1; r++) {
    for (let i = 0; i < cols - 1; i++) {
      const a = r * cols + i;
      const b = a + 1;
      const d = a + cols;
      const e = d + 1;
      // Wound so the front faces (toward −Z, the player) carry the normals; the back is lit by
      // the DoubleSide flip when the wave passes the camera.
      idx.push(a, d, b, b, d, e);
    }
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geom.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geom.setIndex(idx);
  geom.computeVertexNormals();
  return geom;
}

/**
 * The flood: a two-vertex-per-row strip whose positions are filled in every frame. Colours go
 * from foam at the wave to sea blue, and the alpha fades the far end into the road.
 */
function buildFloodGeometry(): { geom: THREE.BufferGeometry; positions: THREE.BufferAttribute } {
  const segments = TIDE_TUNING.floodSegments;
  const rows = segments + 1;
  const pos = new Float32Array(rows * 2 * 3);
  const col = new Float32Array(rows * 2 * 4);
  const normal = new Float32Array(rows * 2 * 3);
  const c = new THREE.Color();
  const foam = new THREE.Color(FOAM);
  const shallow = new THREE.Color(SHALLOW);
  const sea = new THREE.Color(SEA);
  for (let i = 0; i < rows; i++) {
    const t = i / segments;
    if (t < 0.12) c.copy(foam).lerp(shallow, t / 0.12);
    else c.copy(shallow).lerp(sea, (t - 0.12) / 0.88);
    const alpha = t < 0.6 ? 1 : 1 - (t - 0.6) / 0.4;
    for (let side = 0; side < 2; side++) {
      const v = (i * 2 + side) * 4;
      col[v] = c.r;
      col[v + 1] = c.g;
      col[v + 2] = c.b;
      col[v + 3] = alpha;
      normal[(i * 2 + side) * 3 + 1] = 1;
    }
  }
  const idx: number[] = [];
  for (let i = 0; i < segments; i++) {
    const l = i * 2;
    const r = l + 1;
    const l2 = l + 2;
    const r2 = l + 3;
    // Counter-clockwise seen from above, so the normals (+Y) are the front.
    idx.push(l, l2, r, r, l2, r2);
  }
  const geom = new THREE.BufferGeometry();
  const positions = new THREE.BufferAttribute(pos, 3);
  positions.setUsage(THREE.DynamicDrawUsage);
  geom.setAttribute('position', positions);
  geom.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
  geom.setAttribute('color', new THREE.BufferAttribute(col, 4));
  geom.setIndex(idx);
  return { geom, positions };
}

function waterMaterial(): THREE.MeshToonMaterial {
  const mat = toonMaterial(0xffffff, {
    vertexColors: true,
    transparent: true,
    opacity: TIDE_TUNING.waterOpacity,
    side: THREE.DoubleSide,
  });
  mat.depthWrite = false;
  return mat;
}

export function createTideVisuals(scene: THREE.Scene, track: Track): TideVisuals {
  const table = buildCenterTable(track);
  const length = track.length;
  const { waveWidth, waveGrowScale, waveGrowGap, floodLength, floodSegments } = TIDE_TUNING;

  const waveMaterial = waterMaterial();
  const wave = new THREE.Mesh(buildWaveGeometry(), waveMaterial);
  wave.name = 'tide-wave';

  const flood = buildFloodGeometry();
  const floodMaterial = waterMaterial();
  const floodMesh = new THREE.Mesh(flood.geom, floodMaterial);
  floodMesh.name = 'tide-flood';
  // The positions move every frame; the stale bounding sphere must not cull it.
  floodMesh.frustumCulled = false;

  scene.add(wave, floodMesh);

  const c: CenterSample = { x: 0, z: 0, tx: 0, tz: 0 };
  const positions = flood.positions.array as Float32Array;
  const half = waveWidth / 2;
  const segment = floodLength / floodSegments;

  return {
    update(tideProgress, gap, elapsed) {
      sampleCenter(table, length, tideProgress, c);
      // The last meters before the catch: the wave swells.
      const grow = 1 + (waveGrowScale - 1) * (1 - clamp(gap / waveGrowGap, 0, 1));
      wave.position.set(c.x, Math.sin(elapsed * BOB_RATE) * BOB, c.z);
      // heading convention: rotation.y = heading, heading 0 faces −Z (forwardToHeading).
      wave.rotation.y = Math.atan2(-c.tx, -c.tz);
      wave.scale.set(1, grow, 1);

      for (let i = 0; i <= floodSegments; i++) {
        sampleCenter(table, length, tideProgress + FLOOD_LEAD - i * segment, c);
        // leftOf(tangent) = (tz, −tx)
        const lx = c.tz * half;
        const lz = -c.tx * half;
        const v = i * 6;
        positions[v] = c.x + lx;
        positions[v + 1] = FLOOD_Y;
        positions[v + 2] = c.z + lz;
        positions[v + 3] = c.x - lx;
        positions[v + 4] = FLOOD_Y;
        positions[v + 5] = c.z - lz;
      }
      flood.positions.needsUpdate = true;
    },
    dispose() {
      scene.remove(wave, floodMesh);
      wave.geometry.dispose();
      waveMaterial.dispose();
      flood.geom.dispose();
      floodMaterial.dispose();
    },
  };
}
