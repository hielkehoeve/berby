// Shared material helpers for the graphics stream: the toon shading ramp, pastel materials,
// vertex-colour utilities and small procedural canvas textures. Nothing here is loaded from
// disk; every texture is drawn at startup.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Dark plum used for outlines, tyres and small details (reads as "black" in the palette). */
export const PLUM = 0x3a2340;
export const SAND = 0xf6e3c6;
export const WET_SAND = 0xe3c9a3;
export const ASPHALT = 0x5c5472;

let gradientMap: THREE.DataTexture | undefined;

/**
 * A 4-step light ramp for MeshToonMaterial. The texture spans dot(N, L) from -1 to +1, so the
 * first half is unlit (0) and the lit half climbs in four soft bands.
 */
export function toonGradient(): THREE.DataTexture {
  if (gradientMap) return gradientMap;
  const steps = [0, 0, 0, 0, 0.42, 0.66, 0.86, 1.0];
  const data = new Uint8Array(steps.map((v) => Math.round(v * 255)));
  gradientMap = new THREE.DataTexture(data, steps.length, 1, THREE.RedFormat);
  gradientMap.minFilter = THREE.NearestFilter;
  gradientMap.magFilter = THREE.NearestFilter;
  gradientMap.generateMipmaps = false;
  gradientMap.needsUpdate = true;
  return gradientMap;
}

export interface ToonOptions {
  vertexColors?: boolean;
  side?: THREE.Side;
  transparent?: boolean;
  opacity?: number;
}

/** Flat pastel toon material. Pass vertexColors when the geometry carries its own colours. */
export function toonMaterial(color: number, opts: ToonOptions = {}): THREE.MeshToonMaterial {
  return new THREE.MeshToonMaterial({
    color,
    gradientMap: toonGradient(),
    vertexColors: opts.vertexColors ?? false,
    side: opts.side ?? THREE.FrontSide,
    transparent: opts.transparent ?? false,
    opacity: opts.opacity ?? 1,
  });
}

/** Outline material for back-face-scaled shells. */
export function outlineMaterial(color = PLUM): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ color, side: THREE.BackSide, fog: true });
}

/** Give every vertex of a geometry the same colour (adds / replaces the 'color' attribute). */
export function paint(geometry: THREE.BufferGeometry, color: number, shade = 1): THREE.BufferGeometry {
  const c = new THREE.Color(color).multiplyScalar(shade);
  const n = geometry.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = c.r;
    arr[i * 3 + 1] = c.g;
    arr[i * 3 + 2] = c.b;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geometry;
}

/**
 * Merge coloured parts into one non-indexed geometry (one draw call). Each part is
 * transformed by its matrix first; parts must already carry a 'color' attribute.
 */
export function mergeParts(parts: { geometry: THREE.BufferGeometry; matrix?: THREE.Matrix4 }[]): THREE.BufferGeometry {
  const prepared = parts.map(({ geometry, matrix }) => {
    let g = geometry.index ? geometry.toNonIndexed() : geometry;
    if (g === geometry) g = geometry.clone();
    // Keep only the attributes every primitive shares, so mergeGeometries accepts the set.
    for (const name of Object.keys(g.attributes)) {
      if (name !== 'position' && name !== 'normal' && name !== 'color') g.deleteAttribute(name);
    }
    if (!g.attributes.normal) g.computeVertexNormals();
    if (matrix) g.applyMatrix4(matrix);
    return g;
  });
  const merged = mergeGeometries(prepared, false);
  if (!merged) throw new Error('mergeParts: incompatible geometries');
  for (const g of prepared) g.dispose();
  return merged;
}

/** Convenience: a transform matrix from position / euler rotation / scale. */
export function placement(
  x: number,
  y: number,
  z: number,
  rx = 0,
  ry = 0,
  rz = 0,
  sx = 1,
  sy = sx,
  sz = sx,
): THREE.Matrix4 {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
    new THREE.Vector3(sx, sy, sz),
  );
}

export function hex(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}

/** Make a canvas and hand it to a draw callback; returns a texture with sRGB colours. */
export function canvasTexture(
  width: number,
  height: number,
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  draw(ctx, width, height);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/** Tiny deterministic PRNG (mulberry32) so scenery jitter is stable between runs. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Classic heart outline in the XY plane, tip down, centred, 1 unit wide. */
export function heartShape(): THREE.Shape {
  // Source points describe a heart with the tip at +y; we flip y so the tip points down,
  // then normalise to a unit width and centre it.
  const raw: [number, number][][] = [
    [[5, 5]],
    [
      [5, 5],
      [4, 0],
      [0, 0],
    ],
    [
      [-6, 0],
      [-6, 7],
      [-6, 7],
    ],
    [
      [-6, 11],
      [-3, 15.4],
      [5, 19],
    ],
    [
      [12, 15.4],
      [16, 11],
      [16, 7],
    ],
    [
      [16, 7],
      [16, 0],
      [10, 0],
    ],
    [
      [7, 0],
      [5, 5],
      [5, 5],
    ],
  ];
  const s = 1 / 22;
  const cx = 5;
  const cy = 9.5;
  const map = ([x, y]: [number, number]): [number, number] => [(x - cx) * s, -(y - cy) * s];
  const shape = new THREE.Shape();
  const [m] = raw[0];
  shape.moveTo(...map(m));
  for (let i = 1; i < raw.length; i++) {
    const [a, b, c] = raw[i].map(map);
    shape.bezierCurveTo(a[0], a[1], b[0], b[1], c[0], c[1]);
  }
  return shape;
}

/** Five-point star in the XY plane, centred, 1 unit wide. */
export function starShape(inner = 0.42): THREE.Shape {
  const shape = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? 0.5 : 0.5 * inner;
    const a = Math.PI / 2 + (i * Math.PI) / 5;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  return shape;
}
