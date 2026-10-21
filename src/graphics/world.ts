// The dressed Malibu world: sky dome and sun, fog, lights, sand, animated ocean, the road
// ribbon with curbs and markings, barrier walls, and all scenery placed from the track's
// scenery data (see ../tracks/malibu-scenery.ts). Everything is procedural; no files are
// loaded. Static scenery is merged into a handful of draw calls; repeated things (palms,
// bushes, flamingos) are instanced.
import * as THREE from 'three';
import type { Track, Vec2 } from '../shared/types';
import { forwardToHeading, leftOf } from '../shared/math';
import { PALETTE } from '../shared/palette';
import {
  ASPHALT,
  canvasTexture,
  heartShape,
  hex,
  mergeParts,
  paint,
  placement,
  PLUM,
  rng,
  SAND,
  toonMaterial,
  WET_SAND,
} from './materials';
import { createKartModel } from './kart-mesh';
import {
  MALIBU_SCENERY,
  resolveScenery,
  shorelineX,
  type PlacedScenery,
  type SceneryEntry,
} from '../tracks/malibu-scenery';

export interface World {
  /** Add this to the scene. Built once per track; includes the lights. */
  group: THREE.Group;
  /** Assign to scene.background when present. */
  background?: THREE.Color | THREE.Texture;
  /** Assign to scene.fog when present. */
  fog?: THREE.Fog | THREE.FogExp2;
  /**
   * Advance animated parts (ocean waves, etc.). focus is the player's position, so the
   * shadow camera and any streamed detail can follow the action.
   */
  update(dt: number, elapsed: number, focus: Vec2): void;
}

/** Scenery data per track id. Unknown tracks get road, sand, ocean and sky only. */
const SCENERY_BY_TRACK: Record<string, SceneryEntry[]> = { malibu: MALIBU_SCENERY };

// Sky / light palette
const HORIZON = 0xffc3d2;
const SKY_MID = 0xf0b6ec;
const SKY_TOP = 0xa89af0;
const SUN_GLOW = PALETTE.sunsetOrange;
const SUN_DISC = 0xfff6e2;
const WATER_Y = -0.25;
/** Visual sun (low over the ocean) and the direction the shadow-casting light comes from. */
const SUN_DIR = new THREE.Vector3(-0.85, 0.2, -0.45).normalize();
const LIGHT_DIR = new THREE.Vector3(-0.55, 0.78, -0.3).normalize();
const SHADOW_SIZE = 110;
const SHADOW_MAP = 1024;

export function buildWorld(track: Track): World {
  const group = new THREE.Group();
  group.name = 'world';

  const fog = new THREE.Fog(HORIZON, 110, 640);

  // Lights
  const sun = new THREE.DirectionalLight(0xfff1e4, 2.7);
  sun.castShadow = true;
  sun.shadow.mapSize.set(SHADOW_MAP, SHADOW_MAP);
  const sc = sun.shadow.camera;
  sc.left = -SHADOW_SIZE / 2;
  sc.right = SHADOW_SIZE / 2;
  sc.top = SHADOW_SIZE / 2;
  sc.bottom = -SHADOW_SIZE / 2;
  sc.near = 20;
  sc.far = 320;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.5;
  group.add(sun, sun.target);
  const hemi = new THREE.HemisphereLight(0xffd3e6, 0xe6cfae, 1.25);
  group.add(hemi);

  // Sky, ground, water, road
  const sky = buildSky();
  group.add(sky);
  group.add(buildSand());
  const ocean = buildOcean();
  group.add(ocean.mesh);
  group.add(buildRoad(track));
  group.add(buildStartLine(track));
  group.add(buildWalls(track));

  // Scenery
  const placed = resolveScenery(SCENERY_BY_TRACK[track.definition.id] ?? [], track);
  const animated = addScenery(group, placed);

  // Shadow camera texel snapping basis (fixed because the light direction is fixed).
  const lightZ = LIGHT_DIR.clone();
  const lightX = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), lightZ).normalize();
  const lightY = new THREE.Vector3().crossVectors(lightZ, lightX).normalize();
  const texel = SHADOW_SIZE / SHADOW_MAP;
  const focusV = new THREE.Vector3();

  const update = (dt: number, elapsed: number, focus: Vec2) => {
    void dt;
    ocean.uniforms.uTime.value = elapsed;
    sky.position.set(focus.x, 0, focus.z);

    // Keep the shadow frustum centred on the player, snapped to shadow texels to avoid shimmer.
    focusV.set(focus.x, 0, focus.z);
    const fx = focusV.dot(lightX);
    const fy = focusV.dot(lightY);
    const sx = Math.round(fx / texel) * texel - fx;
    const sy = Math.round(fy / texel) * texel - fy;
    focusV.addScaledVector(lightX, sx).addScaledVector(lightY, sy);
    sun.target.position.copy(focusV);
    sun.position.copy(focusV).addScaledVector(LIGHT_DIR, 180);

    animated.update(elapsed);
  };

  return { group, background: new THREE.Color(HORIZON), fog, update };
}

// ---------------------------------------------------------------------------------------------
// Sky
// ---------------------------------------------------------------------------------------------

function buildSky(): THREE.Mesh {
  const geom = new THREE.SphereGeometry(1000, 36, 18);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
    fog: false,
    uniforms: {
      uHorizon: { value: new THREE.Color(HORIZON) },
      uMid: { value: new THREE.Color(SKY_MID) },
      uTop: { value: new THREE.Color(SKY_TOP) },
      uGlow: { value: new THREE.Color(SUN_GLOW) },
      uSun: { value: new THREE.Color(SUN_DISC) },
      uSunDir: { value: SUN_DIR.clone() },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uHorizon, uMid, uTop, uGlow, uSun, uSunDir;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        float h = clamp(d.y, 0.0, 1.0);
        vec3 col = mix(uHorizon, uMid, smoothstep(0.0, 0.32, h));
        col = mix(col, uTop, smoothstep(0.25, 0.95, h));
        float a = dot(d, uSunDir);
        // Warm band along the horizon, strongest toward the sun.
        float band = exp(-pow((d.y - 0.03) / 0.09, 2.0)) * (0.35 + 0.65 * clamp(a * 0.5 + 0.5, 0.0, 1.0));
        col = mix(col, uGlow, band * 0.55);
        // Sun glow and disc.
        float glow = pow(max(a, 0.0), 10.0) * 0.55 + pow(max(a, 0.0), 40.0) * 0.5;
        col = mix(col, uGlow, clamp(glow, 0.0, 1.0));
        float disc = smoothstep(0.99905, 0.99935, a);
        col = mix(col, uSun, disc);
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  const mesh = new THREE.Mesh(geom, mat);
  mesh.name = 'sky';
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  return mesh;
}

// ---------------------------------------------------------------------------------------------
// Ground and water
// ---------------------------------------------------------------------------------------------

/** Indexed grid from coordinate columns/rows; fn returns [x, y, z, r, g, b] per vertex. */
function gridGeometry(
  cols: number,
  rows: number,
  fn: (c: number, r: number) => [number, number, number, number, number, number],
): THREE.BufferGeometry {
  const pos = new Float32Array(cols * rows * 3);
  const col = new Float32Array(cols * rows * 3);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      const [x, y, z, cr, cg, cb] = fn(c, r);
      pos[i * 3] = x;
      pos[i * 3 + 1] = y;
      pos[i * 3 + 2] = z;
      col[i * 3] = cr;
      col[i * 3 + 1] = cg;
      col[i * 3 + 2] = cb;
    }
  }
  const idx: number[] = [];
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      const a = r * cols + c;
      const b = a + 1;
      const d = a + cols;
      const e = d + 1;
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

/** Row coordinates: dense within ±inner, then a few sparse rows out to ±outer. */
function rowCoords(inner: number, innerStep: number, outer: number, outerSteps: number): number[] {
  const zs: number[] = [];
  for (let i = outerSteps; i >= 1; i--) zs.push(-inner - ((outer - inner) * i) / outerSteps);
  for (let z = -inner; z <= inner + 1e-6; z += innerStep) zs.push(z);
  for (let i = 1; i <= outerSteps; i++) zs.push(inner + ((outer - inner) * i) / outerSteps);
  return zs;
}

function buildSand(): THREE.Mesh {
  // Columns are offsets from the (wavy) shoreline near the water, then absolute x inland.
  const shoreOffsets = [-9, 0, 8, 18, 30, 45, 65, 90, 120, 160];
  const inland = [220, 300, 420, 600, 850, 1200, 1600];
  const zs = rowCoords(430, 10, 1600, 5);
  const cols = shoreOffsets.length + inland.length;
  const sand = new THREE.Color(SAND);
  const wet = new THREE.Color(WET_SAND);
  const noise = rng(11);
  const tmp = new THREE.Color();
  const geom = gridGeometry(cols, zs.length, (c, r) => {
    const z = zs[r];
    let x: number;
    let y = 0;
    let wetness = 0;
    if (c < shoreOffsets.length) {
      const off = shoreOffsets[c];
      x = shorelineX(z) + off;
      // The beach slopes gently into the water so the waterline follows the waves.
      if (off <= 0) y = -0.35 + off * 0.07;
      else if (off < 18) y = -0.35 + (off / 18) * 0.35;
      wetness = off <= 0 ? 1 : off < 18 ? 1 - off / 18 : 0;
    } else {
      x = inland[c - shoreOffsets.length];
    }
    const shade = 0.965 + noise() * 0.05;
    tmp.copy(sand).lerp(wet, wetness).multiplyScalar(shade);
    return [x, y, z, tmp.r, tmp.g, tmp.b];
  });
  const mesh = new THREE.Mesh(geom, new THREE.MeshLambertMaterial({ vertexColors: true }));
  mesh.name = 'sand';
  mesh.receiveShadow = true;
  return mesh;
}

interface Ocean {
  mesh: THREE.Mesh;
  uniforms: { uTime: { value: number } };
}

function buildOcean(): Ocean {
  // Columns must run toward +X (like the sand grid) so the triangles wind face-up.
  const offsets = [
    -1650, -1300, -1000, -780, -600, -470, -370, -290, -230, -185, -150, -122, -100, -82, -68, -56, -46, -38, -31, -25,
    -20, -16, -12, -9, -6, -3, 0, 4, 8, 12,
  ];
  const zs = rowCoords(450, 6, 1650, 6);
  const geom = gridGeometry(offsets.length, zs.length, (c, r) => {
    const z = zs[r];
    return [shorelineX(z) + offsets[c], WATER_Y, z, 1, 1, 1];
  });
  geom.deleteAttribute('color');

  const uniforms = {
    uTime: { value: 0 },
    uShallow: { value: new THREE.Color(0x8fe9d2) },
    uDeep: { value: new THREE.Color(0x58b6ea) },
    uFoam: { value: new THREE.Color(0xffffff) },
    uSunDir: { value: SUN_DIR.clone() },
    uSunColor: { value: new THREE.Color(0xfff0d0) },
    uLightDir: { value: LIGHT_DIR.clone() },
    ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    fog: true,
    vertexShader: /* glsl */ `
      uniform float uTime;
      varying vec3 vWorld;
      varying vec3 vNormalW;
      varying float vShore;
      #include <fog_pars_vertex>
      float shoreX(float z) { return ${SHORE_GLSL}; }
      void main() {
        vec3 wp = (modelMatrix * vec4(position, 1.0)).xyz;
        float d = shoreX(wp.z) - wp.x; // metres out to sea
        float amp = 0.08 + 0.1 * smoothstep(0.0, 25.0, d) * (1.0 - smoothstep(60.0, 400.0, d));
        vec2 g = vec2(0.0);
        float h = 0.0;
        // Three gentle sine waves, mostly rolling toward the shore (+x).
        vec2 d1 = normalize(vec2(1.0, 0.25));  float f1 = 0.11; float s1 = 1.1;
        vec2 d2 = normalize(vec2(0.8, -0.6));  float f2 = 0.19; float s2 = 1.6;
        vec2 d3 = normalize(vec2(0.3, 1.0));   float f3 = 0.06; float s3 = 0.7;
        float p1 = dot(wp.xz, d1) * f1 + uTime * s1;
        float p2 = dot(wp.xz, d2) * f2 + uTime * s2;
        float p3 = dot(wp.xz, d3) * f3 + uTime * s3;
        h += amp * sin(p1);        g += amp * f1 * cos(p1) * d1;
        h += amp * 0.5 * sin(p2);  g += amp * 0.5 * f2 * cos(p2) * d2;
        h += amp * 0.8 * sin(p3);  g += amp * 0.8 * f3 * cos(p3) * d3;
        wp.y += h;
        vWorld = wp;
        vShore = d;
        vNormalW = normalize(vec3(-g.x, 1.0, -g.y));
        vec4 mvPosition = viewMatrix * vec4(wp, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uShallow, uDeep, uFoam, uSunDir, uSunColor, uLightDir;
      uniform float uTime;
      varying vec3 vWorld;
      varying vec3 vNormalW;
      varying float vShore;
      #include <fog_pars_fragment>
      void main() {
        float d = vShore;
        vec3 n = normalize(vNormalW);
        vec3 col = mix(uShallow, uDeep, smoothstep(2.0, 140.0, d));
        float ndl = max(dot(n, uLightDir), 0.0);
        col *= 0.78 + 0.3 * ndl;
        // Sun glints toward the low sun.
        vec3 v = normalize(cameraPosition - vWorld);
        vec3 hv = normalize(v + uSunDir);
        float spec = pow(max(dot(n, hv), 0.0), 90.0);
        col += uSunColor * spec * 0.7;
        // Foam: a wavy strip hugging the shore plus a second broken line further out.
        float edge = 4.5 + 2.2 * sin(vWorld.z * 0.13 + uTime * 0.9) + 1.4 * sin(vWorld.z * 0.37 - uTime * 1.4);
        float foam = 1.0 - smoothstep(edge - 1.5, edge + 1.0, d);
        float w2 = d + 2.5 * sin(vWorld.z * 0.21 + uTime * 1.1) + 1.5 * sin(vWorld.z * 0.05 - uTime * 0.6);
        float line2 = smoothstep(9.5, 10.5, w2) * (1.0 - smoothstep(12.0, 14.0, w2));
        float line3 = smoothstep(19.0, 20.0, w2 + 3.0 * sin(vWorld.z * 0.09 + uTime * 0.5)) * (1.0 - smoothstep(21.0, 23.0, w2));
        col = mix(col, uFoam, clamp(foam + 0.65 * line2 + 0.4 * line3, 0.0, 1.0));
        gl_FragColor = vec4(col, 1.0);
        #include <fog_fragment>
      }
    `,
  });
  const mesh = new THREE.Mesh(geom, mat);
  mesh.name = 'ocean';
  mesh.frustumCulled = false;
  return { mesh, uniforms };
}

/** GLSL version of shorelineX(); keep in sync with malibu-scenery.ts. */
const SHORE_GLSL = '-46.0 + 6.0 * sin(z * 0.0349) + 2.5 * sin(z * 0.103 + 1.3)';

// ---------------------------------------------------------------------------------------------
// Road, start line and barriers
// ---------------------------------------------------------------------------------------------

/** One tile of road: 12 m across, 8 m along. Pink/white curbs, cream edge lines, centre dash. */
function roadTexture(): THREE.CanvasTexture {
  const tex = canvasTexture(256, 512, (ctx, w, h) => {
    ctx.fillStyle = hex(ASPHALT);
    ctx.fillRect(0, 0, w, h);
    // Speckle for a little texture.
    const r = rng(5);
    ctx.fillStyle = 'rgba(255,255,255,0.07)';
    for (let i = 0; i < 1400; i++) ctx.fillRect(r() * w, r() * h, 2, 2);
    ctx.fillStyle = 'rgba(0,0,0,0.08)';
    for (let i = 0; i < 900; i++) ctx.fillRect(r() * w, r() * h, 2, 2);
    // Curbs: 0.9 m = 19 px, alternating every 4 m (half the tile).
    const curb = 19;
    for (const [x0, x1] of [
      [0, curb],
      [w - curb, w],
    ]) {
      ctx.fillStyle = hex(PALETTE.hotPink);
      ctx.fillRect(x0, 0, x1 - x0, h / 2);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x0, h / 2, x1 - x0, h / 2);
    }
    // Edge lines just inside the curbs.
    ctx.fillStyle = hex(PALETTE.cream);
    ctx.fillRect(curb + 2, 0, 4, h);
    ctx.fillRect(w - curb - 6, 0, 4, h);
    // Centre dash: 3 m of 8.
    ctx.fillRect(w / 2 - 3, h * 0.3, 6, h * 0.375);
  });
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  return tex;
}

function buildRoad(track: Track): THREE.Mesh {
  const half = track.definition.roadWidth / 2;
  const step = 1.25;
  const n = Math.max(8, Math.ceil(track.length / step));
  const tile = track.length / Math.max(1, Math.round(track.length / 8));
  const pos: number[] = [];
  const uv: number[] = [];
  for (let i = 0; i <= n; i++) {
    const d = (i / n) * track.length;
    const s = track.sampleAt(i === n ? 0 : d);
    const l = leftOf(s.tangent);
    pos.push(s.position.x + l.x * half, 0, s.position.z + l.z * half);
    pos.push(s.position.x - l.x * half, 0, s.position.z - l.z * half);
    const v = d / tile;
    uv.push(0, v, 1, v);
  }
  const idx: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = i * 2;
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geom.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geom.setIndex(idx);
  geom.computeVertexNormals();
  const mesh = new THREE.Mesh(geom, new THREE.MeshLambertMaterial({ map: roadTexture() }));
  mesh.name = 'road';
  mesh.position.y = 0.02;
  mesh.receiveShadow = true;
  return mesh;
}

function buildStartLine(track: Track): THREE.Mesh {
  const width = track.definition.roadWidth;
  const depth = 2.4;
  const cols = 16;
  const rows = 3;
  const tex = canvasTexture(cols * 16, rows * 16, (ctx) => {
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        ctx.fillStyle = (r + c) % 2 === 0 ? '#ffffff' : hex(PALETTE.hotPink);
        ctx.fillRect(c * 16, r * 16, 16, 16);
      }
    }
  });
  tex.magFilter = THREE.NearestFilter;
  const geom = new THREE.PlaneGeometry(width, depth);
  geom.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geom, new THREE.MeshLambertMaterial({ map: tex }));
  const s = track.sampleAt(depth / 2);
  mesh.position.set(s.position.x, 0.045, s.position.z);
  mesh.rotation.y = forwardToHeading(s.tangent);
  mesh.receiveShadow = true;
  mesh.name = 'start-line';
  return mesh;
}

/** Low pastel walls at ±barrierOffset: alternating pink/white stripes with a cream top. */
function buildWalls(track: Track): THREE.Mesh {
  const off = track.definition.barrierOffset;
  const height = 0.55;
  const thick = 0.36;
  const step = 1.5;
  const n = Math.max(8, Math.ceil(track.length / step));
  const pos: number[] = [];
  const col: number[] = [];
  const colors = [new THREE.Color(PALETTE.bubblegum), new THREE.Color(0xffffff)];
  const top = new THREE.Color(PALETTE.cream);
  const tmpN = new THREE.Vector3();
  const e1 = new THREE.Vector3();
  const e2 = new THREE.Vector3();

  const quad = (
    p0: THREE.Vector3,
    p1: THREE.Vector3,
    p2: THREE.Vector3,
    p3: THREE.Vector3,
    hint: THREE.Vector3,
    c: THREE.Color,
  ) => {
    e1.subVectors(p1, p0);
    e2.subVectors(p3, p0);
    tmpN.crossVectors(e1, e2);
    const order = tmpN.dot(hint) >= 0 ? [p0, p1, p2, p0, p2, p3] : [p0, p2, p1, p0, p3, p2];
    for (const p of order) {
      pos.push(p.x, p.y, p.z);
      col.push(c.r, c.g, c.b);
    }
  };

  const samples: { x: number; z: number; lx: number; lz: number }[] = [];
  for (let i = 0; i < n; i++) {
    const s = track.sampleAt((i / n) * track.length);
    const l = leftOf(s.tangent);
    samples.push({ x: s.position.x, z: s.position.z, lx: l.x, lz: l.z });
  }
  const v = Array.from({ length: 8 }, () => new THREE.Vector3());
  for (const side of [1, -1]) {
    for (let i = 0; i < n; i++) {
      const a = samples[i];
      const b = samples[(i + 1) % n];
      const inner = side * (off - thick / 2);
      const outer = side * (off + thick / 2);
      v[0].set(a.x + a.lx * inner, 0, a.z + a.lz * inner);
      v[1].set(a.x + a.lx * inner, height, a.z + a.lz * inner);
      v[2].set(b.x + b.lx * inner, height, b.z + b.lz * inner);
      v[3].set(b.x + b.lx * inner, 0, b.z + b.lz * inner);
      v[4].set(a.x + a.lx * outer, 0, a.z + a.lz * outer);
      v[5].set(a.x + a.lx * outer, height, a.z + a.lz * outer);
      v[6].set(b.x + b.lx * outer, height, b.z + b.lz * outer);
      v[7].set(b.x + b.lx * outer, 0, b.z + b.lz * outer);
      const stripe = colors[Math.floor(i / 2) % 2];
      // Inner face points toward the road (against the lateral direction), outer away.
      const towardRoad = new THREE.Vector3(-a.lx * side, 0, -a.lz * side);
      quad(v[0], v[1], v[2], v[3], towardRoad, stripe);
      quad(v[4], v[5], v[6], v[7], towardRoad.clone().negate(), stripe);
      quad(v[1], v[5], v[6], v[2], new THREE.Vector3(0, 1, 0), top);
    }
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geom.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geom.computeVertexNormals();
  const mesh = new THREE.Mesh(geom, new THREE.MeshLambertMaterial({ vertexColors: true }));
  mesh.name = 'walls';
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  return mesh;
}

// ---------------------------------------------------------------------------------------------
// Scenery
// ---------------------------------------------------------------------------------------------

interface Animated {
  update(elapsed: number): void;
}

type Part = { geometry: THREE.BufferGeometry; matrix?: THREE.Matrix4 };

const PALM_TRUNK = 0xb8865a;
const PALM_FROND_BASE = 0x4fbf86;
const PALM_FROND_TIP = 0x9af0b8;
const BUSH_GREEN = 0x86dcae;

function palmGeometry(): THREE.BufferGeometry {
  const parts: Part[] = [];
  const trunkH = 7;
  const trunk = new THREE.CylinderGeometry(0.2, 0.36, trunkH, 6, 5);
  // Bend the trunk a little toward +X and shade the top lighter.
  const tp = trunk.attributes.position;
  const tc = new Float32Array(tp.count * 3);
  const c0 = new THREE.Color(PALM_TRUNK).multiplyScalar(0.85);
  const c1 = new THREE.Color(PALM_TRUNK);
  const tmp = new THREE.Color();
  for (let i = 0; i < tp.count; i++) {
    const y = tp.getY(i);
    const t = (y + trunkH / 2) / trunkH;
    tp.setX(i, tp.getX(i) + t * t * 1.1);
    tmp.copy(c0).lerp(c1, t);
    tc[i * 3] = tmp.r;
    tc[i * 3 + 1] = tmp.g;
    tc[i * 3 + 2] = tmp.b;
  }
  trunk.setAttribute('color', new THREE.BufferAttribute(tc, 3));
  trunk.computeVertexNormals();
  parts.push({ geometry: trunk, matrix: placement(0, trunkH / 2, 0) });

  const crown = new THREE.Vector3(1.1, trunkH + 0.1, 0);
  const frondCount = 7;
  for (let i = 0; i < frondCount; i++) {
    const frond = new THREE.PlaneGeometry(0.95, 3.6, 1, 4);
    frond.translate(0, 1.8, 0);
    const fp = frond.attributes.position;
    const fc = new Float32Array(fp.count * 3);
    const cb = new THREE.Color(PALM_FROND_BASE);
    const ct = new THREE.Color(PALM_FROND_TIP);
    for (let k = 0; k < fp.count; k++) {
      const t = fp.getY(k) / 3.6;
      // Droop: bend the frond outward and down along its length, pinch the tip.
      fp.setZ(k, -t * t * 1.6);
      fp.setX(k, fp.getX(k) * (1 - t * 0.8));
      tmp.copy(cb).lerp(ct, t);
      fc[k * 3] = tmp.r;
      fc[k * 3 + 1] = tmp.g;
      fc[k * 3 + 2] = tmp.b;
    }
    frond.setAttribute('color', new THREE.BufferAttribute(fc, 3));
    frond.computeVertexNormals();
    const yaw = (i / frondCount) * Math.PI * 2 + 0.3;
    // Tilt the frond up ~60° from vertical, then spin it around the crown.
    const m = new THREE.Matrix4()
      .makeTranslation(crown.x, crown.y, crown.z)
      .multiply(new THREE.Matrix4().makeRotationY(yaw))
      .multiply(new THREE.Matrix4().makeRotationX(-Math.PI / 2 + 0.55 + (i % 2) * 0.2));
    parts.push({ geometry: frond, matrix: m });
  }
  const nuts = paint(new THREE.SphereGeometry(0.32, 6, 4), 0x8a5a3a);
  parts.push({ geometry: nuts, matrix: placement(crown.x, crown.y - 0.3, crown.z) });
  return mergeParts(parts);
}

function bushGeometry(): THREE.BufferGeometry {
  const parts: Part[] = [];
  const g1 = new THREE.Color(BUSH_GREEN);
  const g2 = new THREE.Color(BUSH_GREEN).multiplyScalar(0.9);
  parts.push({ geometry: paint(new THREE.SphereGeometry(0.62, 6, 4), g1.getHex()), matrix: placement(0, 0.45, 0) });
  parts.push({
    geometry: paint(new THREE.SphereGeometry(0.46, 5, 4), g2.getHex()),
    matrix: placement(0.48, 0.34, 0.2),
  });
  const flowers: [number, number, number, number][] = [
    [0.2, 0.98, 0.25, PALETTE.hotPink],
    [-0.38, 0.72, 0.28, PALETTE.bubblegum],
  ];
  for (const [x, y, z, c] of flowers)
    parts.push({ geometry: paint(new THREE.SphereGeometry(0.11, 4, 3), c), matrix: placement(x, y, z) });
  return mergeParts(parts);
}

function flamingoGeometry(): THREE.BufferGeometry {
  const pink = 0xff7fb8;
  const parts: Part[] = [];
  parts.push({
    geometry: paint(new THREE.TorusGeometry(1.0, 0.36, 6, 14), pink),
    matrix: placement(0, 0, 0, -Math.PI / 2),
  });
  const neck = new THREE.TubeGeometry(
    new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(0, 0.2, -0.9),
      new THREE.Vector3(0, 1.5, -1.5),
      new THREE.Vector3(0, 1.7, -0.9),
    ),
    8,
    0.17,
    6,
    false,
  );
  parts.push({ geometry: paint(neck, pink) });
  parts.push({ geometry: paint(new THREE.SphereGeometry(0.3, 8, 6), pink), matrix: placement(0, 1.72, -0.82) });
  parts.push({
    geometry: paint(new THREE.ConeGeometry(0.11, 0.42, 6), PLUM),
    matrix: placement(0, 1.6, -0.45, Math.PI / 2 + 0.3),
  });
  parts.push({ geometry: paint(new THREE.SphereGeometry(0.05, 4, 3), PLUM), matrix: placement(0.14, 1.8, -0.98) });
  parts.push({ geometry: paint(new THREE.SphereGeometry(0.05, 4, 3), PLUM), matrix: placement(-0.14, 1.8, -0.98) });
  parts.push({
    geometry: paint(new THREE.ConeGeometry(0.3, 0.7, 5), pink),
    matrix: placement(0, 0.45, 1.1, -Math.PI / 2 + 0.5),
  });
  return mergeParts(parts);
}

function houseParts(color: number, seed: number): Part[] {
  const r = rng(Math.floor(seed * 1e6) + 1);
  const w = 8 + r() * 3;
  const d = 6.5 + r() * 2;
  const h = 3.6 + r() * 0.8;
  const roofColors = [0xffffff, PALETTE.hotPink, 0xffcba4, PALETTE.cream];
  const roof = roofColors[Math.floor(r() * roofColors.length)];
  const parts: Part[] = [];
  parts.push({ geometry: paint(new THREE.BoxGeometry(w, h, d), color), matrix: placement(0, h / 2, 0) });
  if (r() < 0.55) {
    // Hip roof: a four-sided pyramid.
    const cone = new THREE.ConeGeometry(1, 1, 4);
    parts.push({
      geometry: paint(cone, roof),
      matrix: placement(0, h + 1.05, 0, 0, Math.PI / 4, 0, w * 0.78, 2.1, d * 0.78),
    });
  } else {
    // Flat roof with a parapet and a rooftop box.
    parts.push({
      geometry: paint(new THREE.BoxGeometry(w + 0.6, 0.45, d + 0.6), roof),
      matrix: placement(0, h + 0.2, 0),
    });
    parts.push({
      geometry: paint(new THREE.BoxGeometry(w * 0.35, 1.2, d * 0.35), color),
      matrix: placement(-w * 0.2, h + 1.0, d * 0.1),
    });
  }
  // Door and windows on the front (-Z), porch slab.
  parts.push({
    geometry: paint(new THREE.BoxGeometry(1.3, 2.3, 0.2), PLUM),
    matrix: placement(w * 0.2, 1.15, -d / 2 - 0.05),
  });
  parts.push({
    geometry: paint(new THREE.BoxGeometry(1.7, 1.3, 0.16), 0xdcf3ff),
    matrix: placement(-w * 0.22, 2.0, -d / 2 - 0.05),
  });
  parts.push({
    geometry: paint(new THREE.BoxGeometry(1.9, 1.5, 0.12), PLUM),
    matrix: placement(-w * 0.22, 2.0, -d / 2 - 0.02),
  });
  parts.push({
    geometry: paint(new THREE.BoxGeometry(1.2, 1.0, 0.16), 0xdcf3ff),
    matrix: placement(w * 0.35, 2.6, d / 2 + 0.05),
  });
  parts.push({
    geometry: paint(new THREE.BoxGeometry(w + 1.2, 0.3, 2.6), PALETTE.cream),
    matrix: placement(0, 0.15, -d / 2 - 1.1),
  });
  return parts;
}

function cafeParts(): Part[] {
  const w = 14;
  const d = 9;
  const h = 4.2;
  const parts: Part[] = [];
  parts.push({ geometry: paint(new THREE.BoxGeometry(w, h, d), 0xfff8f0), matrix: placement(0, h / 2, 0) });
  parts.push({
    geometry: paint(new THREE.BoxGeometry(w + 1, 0.5, d + 1), PALETTE.hotPink),
    matrix: placement(0, h + 0.25, 0),
  });
  // Big front window and door
  parts.push({
    geometry: paint(new THREE.BoxGeometry(w * 0.7, 2.2, 0.16), 0xdcf3ff),
    matrix: placement(1.2, 2.0, -d / 2 - 0.05),
  });
  parts.push({
    geometry: paint(new THREE.BoxGeometry(1.5, 2.6, 0.2), PLUM),
    matrix: placement(-w * 0.36, 1.3, -d / 2 - 0.06),
  });
  // Striped awning: a segmented slab with alternating colours, tilted toward the road.
  const awning = new THREE.BoxGeometry(w + 0.5, 0.12, 2.8, 10, 1, 1).toNonIndexed();
  const ap = awning.attributes.position;
  const ac = new Float32Array(ap.count * 3);
  const ca = new THREE.Color(PALETTE.hotPink);
  const cb = new THREE.Color(0xffffff);
  for (let i = 0; i < ap.count; i += 3) {
    const cx = (ap.getX(i) + ap.getX(i + 1) + ap.getX(i + 2)) / 3;
    const stripe = Math.floor(((cx + (w + 0.5) / 2) / (w + 0.5)) * 10) % 2 === 0 ? ca : cb;
    for (let k = 0; k < 3; k++) {
      ac[(i + k) * 3] = stripe.r;
      ac[(i + k) * 3 + 1] = stripe.g;
      ac[(i + k) * 3 + 2] = stripe.b;
    }
  }
  awning.setAttribute('color', new THREE.BufferAttribute(ac, 3));
  parts.push({ geometry: awning, matrix: placement(0, 3.3, -d / 2 - 1.3, 0.3) });
  for (const x of [-w / 2 + 0.3, w / 2 - 0.3]) {
    parts.push({
      geometry: paint(new THREE.CylinderGeometry(0.08, 0.08, 2.9, 6), 0xffffff),
      matrix: placement(x, 1.45, -d / 2 - 2.5),
    });
  }
  // Round sign with a white heart on the roof.
  parts.push({
    geometry: paint(new THREE.CylinderGeometry(1.5, 1.5, 0.25, 20), PALETTE.hotPink),
    matrix: placement(0, h + 2.0, -1.5, Math.PI / 2),
  });
  const heart = new THREE.ExtrudeGeometry(heartShape(), { depth: 0.12, bevelEnabled: false, curveSegments: 6 });
  heart.scale(1.8, 1.8, 1);
  parts.push({ geometry: paint(heart, 0xffffff), matrix: placement(0, h + 2.0, -1.75) });
  parts.push({
    geometry: paint(new THREE.CylinderGeometry(0.12, 0.12, 1.2, 6), 0xffffff),
    matrix: placement(0, h + 0.6, -1.5),
  });
  // Terrace tables
  for (const [x, z] of [
    [-4, -7.5],
    [0.5, -8],
    [4.5, -7.5],
  ]) {
    parts.push({
      geometry: paint(new THREE.CylinderGeometry(0.7, 0.7, 0.08, 10), 0xffffff),
      matrix: placement(x, 0.75, z),
    });
    parts.push({
      geometry: paint(new THREE.CylinderGeometry(0.05, 0.05, 0.75, 5), PLUM),
      matrix: placement(x, 0.37, z),
    });
  }
  return parts;
}

function umbrellaParts(color: number, seed: number): Part[] {
  const parts: Part[] = [];
  const canopy = new THREE.ConeGeometry(1.5, 0.6, 8, 1, true).toNonIndexed();
  const cp = canopy.attributes.position;
  const cc = new Float32Array(cp.count * 3);
  const ca = new THREE.Color(color);
  const cb = new THREE.Color(0xffffff);
  const triPerSeg = cp.count / 3 / 8;
  for (let i = 0; i < cp.count; i++) {
    const seg = Math.floor(i / 3 / triPerSeg);
    const c = seg % 2 === 0 ? ca : cb;
    cc[i * 3] = c.r;
    cc[i * 3 + 1] = c.g;
    cc[i * 3 + 2] = c.b;
  }
  canopy.setAttribute('color', new THREE.BufferAttribute(cc, 3));
  const tilt = 0.12 + seed * 0.1;
  parts.push({ geometry: canopy, matrix: placement(0, 2.35, 0, tilt, seed * 6) });
  parts.push({ geometry: paint(new THREE.SphereGeometry(0.1, 5, 4), 0xffffff), matrix: placement(0, 2.68, 0) });
  parts.push({
    geometry: paint(new THREE.CylinderGeometry(0.04, 0.04, 2.4, 5), 0xffffff),
    matrix: placement(0, 1.2, 0, tilt),
  });
  return parts;
}

function towelParts(color: number): Part[] {
  return [
    { geometry: paint(new THREE.BoxGeometry(1.3, 0.05, 2.1), color), matrix: placement(0, 0.025, 0) },
    { geometry: paint(new THREE.BoxGeometry(0.4, 0.06, 2.1), 0xffffff), matrix: placement(0, 0.03, 0) },
  ];
}

function ballParts(): Part[] {
  const g = new THREE.SphereGeometry(0.36, 10, 8);
  const p = g.attributes.position;
  const c = new Float32Array(p.count * 3);
  const wedges = [PALETTE.hotPink, 0xffffff, PALETTE.mint, 0xffffff, PALETTE.lavender, 0xffffff];
  const cols = wedges.map((w) => new THREE.Color(w));
  for (let i = 0; i < p.count; i++) {
    const a = Math.atan2(p.getZ(i), p.getX(i)) + Math.PI;
    const k = Math.floor((a / (Math.PI * 2)) * wedges.length) % wedges.length;
    c[i * 3] = cols[k].r;
    c[i * 3 + 1] = cols[k].g;
    c[i * 3 + 2] = cols[k].b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return [{ geometry: g, matrix: placement(0, 0.36, 0) }];
}

function surfboardParts(color: number): Part[] {
  const board = new THREE.CapsuleGeometry(0.3, 1.5, 3, 8);
  board.scale(1, 1, 0.22);
  return [
    { geometry: paint(board, color), matrix: placement(0, 1.05, 0, -0.15) },
    { geometry: paint(new THREE.BoxGeometry(0.14, 1.4, 0.16), 0xffffff), matrix: placement(0, 1.05, -0.02, -0.15) },
  ];
}

function lifeguardParts(): Part[] {
  const parts: Part[] = [];
  for (const [x, z] of [
    [-1.2, -1.2],
    [1.2, -1.2],
    [-1.2, 1.2],
    [1.2, 1.2],
  ]) {
    parts.push({
      geometry: paint(new THREE.CylinderGeometry(0.1, 0.12, 3, 6), 0xffffff),
      matrix: placement(x, 1.5, z),
    });
  }
  parts.push({ geometry: paint(new THREE.BoxGeometry(3.4, 0.22, 3.4), PALETTE.cream), matrix: placement(0, 3.0, 0) });
  parts.push({ geometry: paint(new THREE.BoxGeometry(2.6, 2.2, 2.4), 0xffffff), matrix: placement(0, 4.2, 0.3) });
  parts.push({
    geometry: paint(new THREE.BoxGeometry(3.2, 0.25, 3.2), PALETTE.hotPink),
    matrix: placement(0, 5.45, 0.2),
  });
  parts.push({ geometry: paint(new THREE.BoxGeometry(1.6, 1.1, 0.14), 0xdcf3ff), matrix: placement(0, 4.4, -0.95) });
  const heart = new THREE.ExtrudeGeometry(heartShape(), { depth: 0.1, bevelEnabled: false, curveSegments: 5 });
  heart.scale(0.8, 0.8, 1);
  parts.push({ geometry: paint(heart, PALETTE.hotPink), matrix: placement(0, 5.0, -1.3) });
  // Stairs
  for (let i = 0; i < 4; i++) {
    parts.push({
      geometry: paint(new THREE.BoxGeometry(1.0, 0.12, 0.5), 0xffffff),
      matrix: placement(0, 0.6 + i * 0.7, -1.9 - (3 - i) * 0.55),
    });
  }
  return parts;
}

function hillParts(color: number): Part[] {
  const dome = new THREE.SphereGeometry(1, 28, 10, 0, Math.PI * 2, 0, Math.PI / 2);
  return [{ geometry: paint(dome, color) }];
}

/** Start/finish arch: two pillars, a beam, hearts; the banner is a separate textured mesh. */
function archParts(width: number): Part[] {
  const parts: Part[] = [];
  const beamY = 6.2;
  for (const x of [-width / 2, width / 2]) {
    parts.push({
      geometry: paint(new THREE.CylinderGeometry(0.8, 0.9, 0.5, 12), 0xffffff),
      matrix: placement(x, 0.25, 0),
    });
    parts.push({
      geometry: paint(new THREE.CylinderGeometry(0.42, 0.5, beamY, 12), PALETTE.hotPink),
      matrix: placement(x, beamY / 2, 0),
    });
    parts.push({
      geometry: paint(new THREE.SphereGeometry(0.7, 12, 8), PALETTE.bubblegum),
      matrix: placement(x, beamY + 1.4, 0),
    });
  }
  parts.push({
    geometry: paint(new THREE.BoxGeometry(width + 1.2, 1.9, 0.55), 0xffffff),
    matrix: placement(0, beamY + 0.6, 0),
  });
  const heart = new THREE.ExtrudeGeometry(heartShape(), { depth: 0.2, bevelEnabled: false, curveSegments: 6 });
  heart.scale(1.6, 1.6, 1);
  parts.push({ geometry: paint(heart, PALETTE.hotPink), matrix: placement(0, beamY + 2.4, -0.1) });
  return parts;
}

function bannerTexture(): THREE.CanvasTexture {
  return canvasTexture(2048, 160, (ctx, w, h) => {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = hex(PALETTE.bubblegum);
    ctx.fillRect(0, 0, w, 14);
    ctx.fillRect(0, h - 14, w, 14);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = hex(PALETTE.hotPink);
    ctx.font = '900 118px "Arial Black", "Helvetica Neue", Arial, sans-serif';
    ctx.fillText('BERBY', w / 2, h / 2 + 6);
    ctx.fillStyle = hex(PALETTE.lavender);
    ctx.font = '700 40px "Helvetica Neue", Arial, sans-serif';
    ctx.fillText('MALIBU SUNSET LOOP', w * 0.2, h / 2 + 4);
    ctx.fillText('MALIBU SUNSET LOOP', w * 0.8, h / 2 + 4);
    // Hearts between the words.
    const heart = (cx: number, cy: number, s: number) => {
      ctx.beginPath();
      ctx.moveTo(cx, cy + s * 0.6);
      ctx.bezierCurveTo(cx - s * 1.1, cy - s * 0.3, cx - s * 0.5, cy - s * 0.9, cx, cy - s * 0.35);
      ctx.bezierCurveTo(cx + s * 0.5, cy - s * 0.9, cx + s * 1.1, cy - s * 0.3, cx, cy + s * 0.6);
      ctx.fill();
    };
    ctx.fillStyle = hex(PALETTE.hotPink);
    heart(w * 0.355, h / 2, 34);
    heart(w * 0.645, h / 2, 34);
  });
}

function addScenery(group: THREE.Group, placed: PlacedScenery[]): Animated {
  const staticParts: Part[] = [];
  const palms: PlacedScenery[] = [];
  const bushes: PlacedScenery[] = [];
  const flamingos: PlacedScenery[] = [];
  const bannerMeshes: THREE.Mesh[] = [];
  let bannerTex: THREE.CanvasTexture | undefined;

  const transform = (p: PlacedScenery) =>
    new THREE.Matrix4().compose(
      new THREE.Vector3(p.x, p.y, p.z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, p.yaw, p.roll, 'YXZ')),
      new THREE.Vector3(p.scale, p.scaleY, p.scale),
    );
  const pushParts = (parts: Part[], p: PlacedScenery) => {
    const m = transform(p);
    for (const part of parts) {
      staticParts.push({ geometry: part.geometry, matrix: part.matrix ? m.clone().multiply(part.matrix) : m });
    }
  };

  for (const p of placed) {
    switch (p.kind) {
      case 'palm':
        palms.push(p);
        break;
      case 'bush':
        bushes.push(p);
        break;
      case 'flamingo':
        flamingos.push(p);
        break;
      case 'house':
        pushParts(houseParts(p.color ?? PALETTE.bubblegum, p.seed), p);
        break;
      case 'cafe':
        pushParts(cafeParts(), p);
        break;
      case 'umbrella':
        pushParts(umbrellaParts(p.color ?? PALETTE.hotPink, p.seed), p);
        break;
      case 'towel':
        pushParts(towelParts(p.color ?? PALETTE.lavender), { ...p, yaw: p.yaw + (p.seed - 0.5) * 0.8 });
        break;
      case 'ball':
        pushParts(ballParts(), p);
        break;
      case 'surfboard':
        pushParts(surfboardParts(p.color ?? PALETTE.mint), p);
        break;
      case 'lifeguard':
        pushParts(lifeguardParts(), p);
        break;
      case 'hill':
        pushParts(hillParts(p.color ?? 0xdcc8ff), p);
        break;
      case 'arch': {
        const width = 21;
        pushParts(archParts(width), p);
        bannerTex ??= bannerTexture();
        const geom = new THREE.PlaneGeometry(width + 1.2, 1.9);
        const mat = new THREE.MeshLambertMaterial({ map: bannerTex });
        const m = transform(p);
        for (const side of [-1, 1]) {
          const mesh = new THREE.Mesh(geom, mat);
          // Local -Z is the travel direction; the front banner faces oncoming karts.
          const local = placement(0, 6.8, side * 0.29, 0, side > 0 ? 0 : Math.PI);
          mesh.applyMatrix4(m.clone().multiply(local));
          mesh.name = 'banner';
          bannerMeshes.push(mesh);
        }
        break;
      }
      case 'kart': {
        const model = createKartModel({
          body: p.color ?? PALETTE.mint,
          accent: 0xffffff,
          spoiler: 'none',
          spoilerColor: 0xffffff,
        });
        model.group.position.set(p.x, p.y, p.z);
        model.group.rotation.y = p.yaw;
        model.group.name = 'parked-kart';
        group.add(model.group);
        break;
      }
    }
  }

  if (staticParts.length) {
    const mesh = new THREE.Mesh(mergeParts(staticParts), toonMaterial(0xffffff, { vertexColors: true }));
    mesh.name = 'scenery';
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  for (const b of bannerMeshes) group.add(b);

  const instanced = (
    name: string,
    geometry: THREE.BufferGeometry,
    items: PlacedScenery[],
    side: THREE.Side,
    shadows: boolean,
  ) => {
    if (!items.length) return undefined;
    const mesh = new THREE.InstancedMesh(geometry, toonMaterial(0xffffff, { vertexColors: true, side }), items.length);
    items.forEach((p, i) => mesh.setMatrixAt(i, transform(p)));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    mesh.castShadow = shadows;
    mesh.receiveShadow = true;
    mesh.name = name;
    group.add(mesh);
    return mesh;
  };
  instanced('palms', palmGeometry(), palms, THREE.DoubleSide, true);
  instanced('bushes', bushGeometry(), bushes, THREE.FrontSide, false);
  const floaties = instanced(
    'flamingos',
    flamingoGeometry(),
    flamingos.map((p) => ({ ...p, y: WATER_Y + 0.1, yaw: p.seed * Math.PI * 2 })),
    THREE.FrontSide,
    false,
  );

  // Flamingo floaties bob and turn slowly on the swell.
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const eul = new THREE.Euler();
  const scl = new THREE.Vector3(1, 1, 1);
  const update = (elapsed: number) => {
    if (!floaties) return;
    flamingos.forEach((p, i) => {
      const ph = p.seed * 10;
      pos.set(p.x, WATER_Y + 0.1 + Math.sin(elapsed * 1.1 + ph) * 0.1, p.z);
      eul.set(
        Math.sin(elapsed * 0.9 + ph) * 0.06,
        p.seed * Math.PI * 2 + Math.sin(elapsed * 0.3 + ph) * 0.3,
        Math.cos(elapsed * 0.7 + ph) * 0.06,
      );
      quat.setFromEuler(eul);
      floaties.setMatrixAt(i, new THREE.Matrix4().compose(pos, quat, scl));
    });
    floaties.instanceMatrix.needsUpdate = true;
  };
  return { update };
}
