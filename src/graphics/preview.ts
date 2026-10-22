// Dev-only preview harness for the graphics stream (open /preview.html via `npx vite --port 5174`).
// Builds the Malibu track and world, drives both karts along the centerline with no sim
// physics, and lets you switch between the chase camera and a free orbit camera.
//
// Keys: C chase/orbit toggle, T top-down orbit view, Space pause, R restart at the line,
//       Left/Right scrub 20 m, Up/Down change speed, W toggle wireframe,
//       G park Vix 3.5 m behind Berby (ghost fade test), V cycle her lateral offset 0 / +1.5 / -1.5 m.
// URL params: ?d=<metres> start distance, ?speed=<m/s>, ?orbit=1, ?top=1, ?tail=1, ?lat=<m>.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { buildTrack } from '../sim/track';
import { MALIBU } from '../tracks/malibu';
import { buildWorld } from './world';
import { createKartView } from './kart-mesh';
import { createChaseCamera, kartOcclusion, snapChaseCamera, updateChaseCamera } from './camera';
import type { KartState } from '../shared/types';
import { PLAYER_TUNING } from '../sim/tuning';
import { clamp, forwardToHeading, leftOf, lerp, wrapAngle, wrapDistance } from '../shared/math';

const params = new URLSearchParams(location.search);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const track = buildTrack(MALIBU);
const world = buildWorld(track);
scene.add(world.group);
if (world.background) scene.background = world.background;
if (world.fog) scene.fog = world.fog;

const player = createKartView('player');
const rival = createKartView('rival');
scene.add(player.object, rival.object);

const camera = createChaseCamera(window.innerWidth / window.innerHeight);
const orbit = new OrbitControls(camera, renderer.domElement);
orbit.enabled = false;
orbit.enableDamping = true;

let distance = Number(params.get('d') ?? 0);
let speed = Number(params.get('speed') ?? PLAYER_TUNING.topSpeed);
let paused = false;
let orbitMode = params.get('orbit') === '1' || params.get('top') === '1';
let wire = false;
// Ghost-fade test pose: Vix parked close behind Berby instead of weaving 18 m ahead.
let tailgate = params.get('tail') === '1';
let tailLateral = Number(params.get('lat') ?? 0);
const TAIL_BEHIND = 3.5;
const TAIL_SIDE = 1.5;
let occlusion = 0;

const makeState = (): KartState => ({ position: { x: 0, z: 0 }, heading: 0, speed: 0, steerAngle: 0, onRoad: true });
const playerState = makeState();
const rivalState = makeState();
let playerSteer = 0;
let rivalSteer = 0;

/** Put a kart on the centerline at a distance with a lateral offset, deriving heading/steer. */
function drive(state: KartState, d: number, lateral: number, dt: number, steerPrev: number): number {
  const s = track.sampleAt(d);
  const l = leftOf(s.tangent);
  const heading = forwardToHeading(s.tangent);
  const dh = dt > 0 ? wrapAngle(heading - state.heading) / dt : 0;
  state.position.x = s.position.x + l.x * lateral;
  state.position.z = s.position.z + l.z * lateral;
  state.heading = heading;
  state.speed = speed;
  // Physical steering angle for this yaw rate (right turn = heading decreasing = positive steer).
  const curvature = speed > 0.1 ? -dh / speed : 0;
  const steer = clamp(Math.atan(PLAYER_TUNING.wheelbase * curvature), -0.45, 0.45);
  state.steerAngle = lerp(steerPrev, steer, 1 - Math.exp(-8 * dt));
  state.onRoad = Math.abs(lateral) <= track.definition.roadWidth / 2;
  return state.steerAngle;
}

/** Where Vix drives relative to Berby: metres along the centerline and lateral (+ = left). */
function rivalPose(elapsed: number): { along: number; lateral: number } {
  if (tailgate) return { along: -TAIL_BEHIND, lateral: tailLateral };
  return { along: 18, lateral: Math.sin(elapsed * 0.6) * 2.5 };
}

function setTailgate(on: boolean, lateral = tailLateral) {
  tailgate = on;
  tailLateral = lateral;
}

function setOrbit(on: boolean, top = false) {
  orbitMode = on;
  orbit.enabled = on;
  if (on) {
    orbit.target.set(playerState.position.x, 0.8, playerState.position.z);
    if (top) {
      camera.position.set(playerState.position.x + 1, 420, playerState.position.z + 1);
      orbit.target.set(playerState.position.x, 0, playerState.position.z);
    }
    camera.fov = 55;
    camera.updateProjectionMatrix();
  } else {
    snapChaseCamera(camera, playerState);
  }
}

function setWire(on: boolean) {
  wire = on;
  scene.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of mats) if ('wireframe' in m) (m as THREE.MeshLambertMaterial).wireframe = on;
  });
}

window.addEventListener('keydown', (e) => {
  switch (e.key) {
    case 'c':
    case 'C':
      setOrbit(!orbitMode);
      break;
    case 't':
    case 'T':
      setOrbit(true, true);
      break;
    case ' ':
      paused = !paused;
      e.preventDefault();
      break;
    case 'r':
    case 'R':
      distance = 0;
      break;
    case 'ArrowLeft':
      distance -= 20;
      break;
    case 'ArrowRight':
      distance += 20;
      break;
    case 'ArrowUp':
      speed = Math.min(40, speed + 2);
      break;
    case 'ArrowDown':
      speed = Math.max(0, speed - 2);
      break;
    case 'w':
    case 'W':
      setWire(!wire);
      break;
    case 'g':
    case 'G':
      setTailgate(!tailgate);
      break;
    case 'v':
    case 'V':
      // 0 -> left 1.5 m -> right 1.5 m -> 0
      setTailgate(true, tailLateral === 0 ? TAIL_SIDE : tailLateral > 0 ? -TAIL_SIDE : 0);
      break;
  }
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

const hud = document.getElementById('hud');
let frames = 0;
let fpsTime = performance.now();
let fps = 0;

// Prime both karts, then snap the camera.
drive(playerState, distance, 0, 0, 0);
{
  const pose = rivalPose(0);
  drive(rivalState, distance + pose.along, pose.lateral, 0, 0);
}
setOrbit(orbitMode, params.get('top') === '1');

const timer = new THREE.Timer();
let elapsed = 0;
const frame = () => {
  timer.update();
  const dt = Math.min(timer.getDelta(), 0.05);
  if (!paused) {
    elapsed += dt;
    distance = wrapDistance(distance + speed * dt, track.length);
  }
  const step = paused ? 0 : dt;
  playerSteer = drive(playerState, distance, 0, step, playerSteer);
  const pose = rivalPose(elapsed);
  rivalSteer = drive(rivalState, distance + pose.along, pose.lateral, step, rivalSteer);
  player.update(playerState, step);
  rival.update(rivalState, step);
  world.update(step, elapsed, playerState.position);

  if (orbitMode) orbit.update();
  else updateChaseCamera(camera, playerState, dt);
  // Same call the game loop makes: fade Vix when she sits between the camera and Berby.
  occlusion = kartOcclusion(camera, playerState, rivalState);
  rival.setGhost(occlusion);

  renderer.render(scene, camera);

  frames++;
  const now = performance.now();
  if (now - fpsTime > 500) {
    fps = (frames * 1000) / (now - fpsTime);
    frames = 0;
    fpsTime = now;
    const info = renderer.info.render;
    if (hud) {
      hud.textContent =
        `${fps.toFixed(0)} fps | ${info.calls} calls | ${(info.triangles / 1000).toFixed(1)}k tris | ` +
        `d=${distance.toFixed(0)} m of ${track.length.toFixed(0)} | ${speed} m/s | ${orbitMode ? 'orbit' : 'chase'}${paused ? ' | paused' : ''}` +
        ` | pos ${playerState.position.x.toFixed(0)},${playerState.position.z.toFixed(0)}` +
        ` | occlusion ${occlusion.toFixed(2)}${tailgate ? ` | Vix ${TAIL_BEHIND} m behind, lateral ${tailLateral}` : ''}`;
    }
  }
};
renderer.setAnimationLoop(frame);

/** Debug hook for scripted inspection (dev only). */
Object.assign(window, {
  __preview: {
    renderer,
    scene,
    camera,
    track,
    frame,
    stop: () => renderer.setAnimationLoop(null),
    start: () => renderer.setAnimationLoop(frame),
    setDistance: (d: number) => {
      distance = d;
    },
    setSpeed: (v: number) => {
      speed = v;
    },
    setOrbit,
    pause: (on: boolean) => {
      paused = on;
    },
    /** Teleport both karts to a distance and snap the chase camera behind the player. */
    jump: (d: number) => {
      distance = d;
      playerSteer = drive(playerState, distance, 0, 0, 0);
      const pose = rivalPose(elapsed);
      rivalSteer = drive(rivalState, distance + pose.along, pose.lateral, 0, 0);
      snapChaseCamera(camera, playerState);
    },
    /** Park Vix 3.5 m behind Berby (lateral in metres, + = left) to check the ghost fade. */
    tailgate: setTailgate,
    /** Latest kartOcclusion() value (0 = Vix clear of the view line, 1 = squarely in it). */
    occlusion: () => occlusion,
    /** Render one frame and POST it as JPEG to a local collector (dev screenshots). */
    shoot: async (name: string, url = 'http://localhost:5175/shot') => {
      renderer.render(scene, camera);
      const src = renderer.domElement;
      const out = document.createElement('canvas');
      out.width = Math.min(1280, src.width);
      out.height = Math.round((out.width / src.width) * src.height);
      out.getContext('2d')?.drawImage(src, 0, 0, out.width, out.height);
      const data = out.toDataURL('image/jpeg', 0.85);
      const res = await fetch(`${url}?name=${encodeURIComponent(name)}`, { method: 'POST', body: data });
      return res.text();
    },
    /** Triangles per mesh (instances included), largest first. */
    budget: () => {
      const rows: [string, number][] = [];
      scene.traverse((o) => {
        const m = o as THREE.Mesh & { count?: number; isInstancedMesh?: boolean };
        if (!m.isMesh) return;
        const g = m.geometry;
        const tris = (g.index ? g.index.count : g.attributes.position.count) / 3;
        rows.push([m.name || m.parent?.name || m.type, Math.round(tris * (m.isInstancedMesh ? (m.count ?? 1) : 1))]);
      });
      return rows.sort((a, b) => b[1] - a[1]);
    },
  },
});
