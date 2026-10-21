// Chase camera: sits behind and above the kart, smoothed with frame-rate independent damping,
// looks at a point ahead of the kart, pulls back and widens its field of view with speed, and
// leans a little into turns. Tuned for landscape phone aspect ratios (~2:1).
import * as THREE from 'three';
import type { KartState } from '../shared/types';
import { clamp, headingToForward, lerp, wrapAngle } from '../shared/math';
import { PLAYER_TUNING } from '../sim/tuning';
import { steerFraction } from './kart-mesh';

/** Tunables; exported so a debug UI could tweak them. */
export const CHASE = {
  /** Speed (m/s) at which the "fast" settings are fully applied. */
  topSpeed: PLAYER_TUNING.topSpeed,
  fovSlow: 58,
  fovFast: 68,
  distanceSlow: 5.4,
  distanceFast: 6.8,
  heightSlow: 2.3,
  heightFast: 2.7,
  lookAheadSlow: 4.5,
  lookAheadFast: 8,
  lookHeight: 1.15,
  /** How quickly the camera's orbit angle follows the kart heading (1/s). Lower = more swing. */
  yawRate: 4.2,
  positionRate: 14,
  lookRate: 9,
  fovRate: 2.5,
  speedRate: 3,
  /** Camera roll at full steering lock, radians. */
  rollPerSteer: 0.03,
  /** Lateral slide at full steering lock, metres (shows more of the inside of the turn). */
  slidePerSteer: 0.6,
  near: 0.3,
  far: 2400,
};

interface ChaseState {
  yaw: number;
  pos: THREE.Vector3;
  look: THREE.Vector3;
  fov: number;
  speedN: number;
  steer: number;
  initialised: boolean;
}

const states = new WeakMap<THREE.PerspectiveCamera, ChaseState>();

function stateOf(camera: THREE.PerspectiveCamera): ChaseState {
  let s = states.get(camera);
  if (!s) {
    s = {
      yaw: 0,
      pos: new THREE.Vector3(),
      look: new THREE.Vector3(),
      fov: CHASE.fovSlow,
      speedN: 0,
      steer: 0,
      initialised: false,
    };
    states.set(camera, s);
  }
  return s;
}

/** Frame-rate independent exponential smoothing factor. */
function damp(rate: number, dt: number): number {
  return 1 - Math.exp(-rate * dt);
}

export function createChaseCamera(aspect: number): THREE.PerspectiveCamera {
  const camera = new THREE.PerspectiveCamera(CHASE.fovSlow, aspect, CHASE.near, CHASE.far);
  stateOf(camera);
  return camera;
}

/** Put the camera straight into its rest position behind the kart (race start, resets). */
export function snapChaseCamera(camera: THREE.PerspectiveCamera, target: KartState): void {
  const s = stateOf(camera);
  s.initialised = false;
  s.speedN = 0;
  s.steer = 0;
  updateChaseCamera(camera, target, 0);
}

const up = new THREE.Vector3(0, 1, 0);
const desired = new THREE.Vector3();
const lookDesired = new THREE.Vector3();

/** Move the camera behind the kart. Call once per rendered frame. */
export function updateChaseCamera(camera: THREE.PerspectiveCamera, target: KartState, dt: number): void {
  const s = stateOf(camera);
  const step = clamp(dt, 0, 0.1);

  const speedN = clamp(Math.abs(target.speed) / CHASE.topSpeed, 0, 1);
  const lock = steerFraction(target);
  const first = !s.initialised;
  if (first) {
    s.yaw = target.heading;
    s.speedN = speedN;
    s.steer = lock;
    s.fov = lerp(CHASE.fovSlow, CHASE.fovFast, speedN);
  } else {
    s.speedN = lerp(s.speedN, speedN, damp(CHASE.speedRate, step));
    s.steer = lerp(s.steer, lock, damp(6, step));
    // Follow the heading with some swing so corners read; the swing tightens at speed.
    const yawRate = CHASE.yawRate * (0.8 + 0.5 * s.speedN);
    s.yaw += wrapAngle(target.heading - s.yaw) * damp(yawRate, step);
  }
  const t = s.speedN;
  const back = lerp(CHASE.distanceSlow, CHASE.distanceFast, t);
  const height = lerp(CHASE.heightSlow, CHASE.heightFast, t);
  const ahead = lerp(CHASE.lookAheadSlow, CHASE.lookAheadFast, t);

  // Camera rig frame from the smoothed yaw; look-at from the kart's real heading.
  const rig = headingToForward(s.yaw);
  const rigRight = { x: -rig.z, z: rig.x };
  const fwd = headingToForward(target.heading);
  // Positive steer is a right turn: slide the camera left a touch so the inside of the turn opens up.
  const slide = -s.steer * CHASE.slidePerSteer * (0.4 + 0.6 * t);

  desired.set(
    target.position.x - rig.x * back + rigRight.x * slide,
    height,
    target.position.z - rig.z * back + rigRight.z * slide,
  );
  lookDesired.set(target.position.x + fwd.x * ahead, CHASE.lookHeight, target.position.z + fwd.z * ahead);

  if (first) {
    s.pos.copy(desired);
    s.look.copy(lookDesired);
    s.initialised = true;
  } else {
    s.pos.lerp(desired, damp(CHASE.positionRate, step));
    s.look.lerp(lookDesired, damp(CHASE.lookRate, step));
  }

  camera.position.copy(s.pos);
  camera.up.copy(up);
  camera.lookAt(s.look);
  // Lean into the turn: a right turn (positive steer) rolls the view clockwise.
  camera.rotateZ(s.steer * CHASE.rollPerSteer * (0.3 + 0.7 * t));

  const fovTarget = lerp(CHASE.fovSlow, CHASE.fovFast, t);
  s.fov = first ? fovTarget : lerp(s.fov, fovTarget, damp(CHASE.fovRate, step));
  if (Math.abs(camera.fov - s.fov) > 0.01) {
    camera.fov = s.fov;
    camera.updateProjectionMatrix();
  }
}
