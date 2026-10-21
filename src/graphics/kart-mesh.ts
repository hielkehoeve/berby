// The two stylised karts (Berby: hot pink with a heart spoiler, Vix: lavender with a star) and
// a lightweight model builder reused for parked set-dressing karts.
//
// Local frame: the kart's front is -Z (heading 0), +X is the right-hand side. The object's
// origin sits on the ground. All static chassis parts are merged into one vertex-coloured
// toon mesh plus one back-face outline shell, so a kart costs six draw calls (body, outline,
// four wheels) and roughly 2.5k triangles.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { KartState, KartVariant } from '../shared/types';
import { clamp, lerp } from '../shared/math';
import { PALETTE } from '../shared/palette';
import { maxSteerAngleAt } from '../sim/kart';
import { PLAYER_TUNING } from '../sim/tuning';
import { heartShape, mergeParts, outlineMaterial, paint, placement, PLUM, starShape, toonMaterial } from './materials';

export interface KartView {
  /** Add this to the scene. */
  object: THREE.Object3D;
  /** Sync the visual to the simulated state (position, heading, wheel steer, lean). */
  update(state: KartState, dt: number): void;
}

export interface KartLook {
  body: number;
  accent: number;
  spoiler: 'heart' | 'star' | 'none';
  spoilerColor: number;
  driver?: { skin: number; hair: number; hairStyle: 'ponytail' | 'bob'; outfit: number };
}

export const KART_LOOKS: Record<KartVariant, KartLook> = {
  player: {
    body: PALETTE.hotPink,
    accent: 0xffffff,
    spoiler: 'heart',
    spoilerColor: PALETTE.hotPink,
    driver: { skin: 0xffd6c2, hair: 0xffe08a, hairStyle: 'ponytail', outfit: PALETTE.bubblegum },
  },
  rival: {
    body: 0xb48cff,
    accent: 0xffffff,
    spoiler: 'star',
    spoilerColor: PALETTE.lavender,
    driver: { skin: 0xe8b894, hair: 0x3b2a63, hairStyle: 'bob', outfit: 0x5a3d8a },
  },
};

/** Wheel geometry: tyre plus coloured hub, axis along X, radius WHEEL_RADIUS. */
export const WHEEL_RADIUS = 0.3;
const WHEEL_X = 0.74;
const WHEEL_Z = 0.82;

export interface KartModel {
  group: THREE.Group;
  /** Chassis + driver; leans and bobs. */
  chassis: THREE.Group;
  /** Front-left, front-right, rear-left, rear-right pivots (steer the front two). */
  wheelPivots: THREE.Object3D[];
  /** Spinning wheel meshes inside the pivots. */
  wheels: THREE.Mesh[];
  triangles: number;
}

function wheelGeometry(hubColor: number): THREE.BufferGeometry {
  const tyre = paint(new THREE.CylinderGeometry(WHEEL_RADIUS, WHEEL_RADIUS, 0.26, 12, 1), 0x2d2436);
  const hub = paint(new THREE.CylinderGeometry(0.17, 0.17, 0.28, 8, 1), hubColor);
  const rot = new THREE.Matrix4().makeRotationZ(Math.PI / 2);
  return mergeParts([
    { geometry: tyre, matrix: rot },
    { geometry: hub, matrix: rot },
  ]);
}

function spoilerGeometry(kind: 'heart' | 'star', width: number): THREE.BufferGeometry {
  const shape = kind === 'heart' ? heartShape() : starShape();
  const geom = new THREE.ExtrudeGeometry(shape, {
    depth: 0.08,
    bevelEnabled: true,
    bevelThickness: 0.025,
    bevelSize: 0.025,
    bevelSegments: 1,
    curveSegments: 5,
  });
  geom.scale(width, width, 1);
  geom.translate(0, 0, -0.04);
  return geom;
}

/** Build a kart model from a look. Used for the racers and for parked karts (driver omitted). */
export function createKartModel(look: KartLook): KartModel {
  const group = new THREE.Group();
  const chassis = new THREE.Group();
  group.add(chassis);

  const parts: { geometry: THREE.BufferGeometry; matrix?: THREE.Matrix4 }[] = [];
  const outlineParts: { geometry: THREE.BufferGeometry; matrix?: THREE.Matrix4 }[] = [];
  const add = (geometry: THREE.BufferGeometry, color: number, matrix?: THREE.Matrix4, outlineScale?: number) => {
    parts.push({ geometry: paint(geometry, color), matrix });
    if (outlineScale) {
      const shell = geometry.clone();
      const m = (matrix ?? new THREE.Matrix4()).clone();
      // Scale about the part's own centre so the shell hugs it evenly.
      const centre = new THREE.Vector3();
      shell.computeBoundingBox();
      shell.boundingBox?.getCenter(centre);
      const scaleAboutCentre = new THREE.Matrix4()
        .makeTranslation(centre.x, centre.y, centre.z)
        .multiply(new THREE.Matrix4().makeScale(outlineScale, outlineScale, outlineScale))
        .multiply(new THREE.Matrix4().makeTranslation(-centre.x, -centre.y, -centre.z));
      outlineParts.push({ geometry: paint(shell, PLUM), matrix: m.multiply(scaleAboutCentre) });
    }
  };

  // Tub and nose
  add(new RoundedBoxGeometry(1.24, 0.42, 2.05, 2, 0.16), look.body, placement(0, 0.46, 0.08), 1.045);
  add(new RoundedBoxGeometry(0.9, 0.28, 0.9, 1, 0.12), look.body, placement(0, 0.38, -1.1, 0.12));
  // Bumper, side pods, rear deck, exhausts
  add(new THREE.CapsuleGeometry(0.09, 1.1, 3, 8), look.accent, placement(0, 0.3, -1.52, 0, 0, Math.PI / 2));
  add(new RoundedBoxGeometry(0.3, 0.22, 1.05, 1, 0.08), look.accent, placement(0.72, 0.4, 0.12));
  add(new RoundedBoxGeometry(0.3, 0.22, 1.05, 1, 0.08), look.accent, placement(-0.72, 0.4, 0.12));
  add(new RoundedBoxGeometry(0.82, 0.3, 0.52, 1, 0.08), look.accent, placement(0, 0.6, 0.92));
  add(new THREE.CylinderGeometry(0.06, 0.07, 0.3, 7), 0xe6e0ee, placement(0.3, 0.5, 1.25, Math.PI / 2));
  add(new THREE.CylinderGeometry(0.06, 0.07, 0.3, 7), 0xe6e0ee, placement(-0.3, 0.5, 1.25, Math.PI / 2));
  // Seat and steering wheel
  add(new RoundedBoxGeometry(0.64, 0.56, 0.22, 1, 0.08), PLUM, placement(0, 0.8, 0.62, -0.12));
  add(new THREE.TorusGeometry(0.16, 0.03, 5, 10), PLUM, placement(0, 0.86, -0.3, -Math.PI / 3));
  add(new THREE.CylinderGeometry(0.025, 0.025, 0.35, 5), PLUM, placement(0, 0.75, -0.2, Math.PI / 6));
  // Spoiler on two struts
  if (look.spoiler !== 'none') {
    // Low and wide so the driver's head stays visible from the chase camera.
    add(new THREE.BoxGeometry(0.05, 0.3, 0.05), PLUM, placement(0.3, 0.85, 1.12));
    add(new THREE.BoxGeometry(0.05, 0.3, 0.05), PLUM, placement(-0.3, 0.85, 1.12));
    add(
      spoilerGeometry(look.spoiler, look.spoiler === 'heart' ? 0.85 : 0.95),
      look.spoilerColor,
      placement(0, 1.08, 1.14),
      1.06,
    );
  }
  // Driver
  const d = look.driver;
  if (d) {
    add(new RoundedBoxGeometry(0.52, 0.44, 0.34, 1, 0.1), d.outfit, placement(0, 0.92, 0.3));
    add(new THREE.CapsuleGeometry(0.055, 0.34, 2, 6), d.outfit, placement(0.26, 0.9, 0.0, -Math.PI / 2.6, 0, 0.25));
    add(new THREE.CapsuleGeometry(0.055, 0.34, 2, 6), d.outfit, placement(-0.26, 0.9, 0.0, -Math.PI / 2.6, 0, -0.25));
    add(new THREE.SphereGeometry(0.22, 10, 8), d.skin, placement(0, 1.34, 0.3), 1.08);
    add(new THREE.BoxGeometry(0.3, 0.07, 0.08), PLUM, placement(0, 1.37, 0.1));
    if (d.hairStyle === 'ponytail') {
      add(
        new THREE.SphereGeometry(0.245, 12, 7, 0, Math.PI * 2, 0, Math.PI * 0.52),
        d.hair,
        placement(0, 1.35, 0.33, 0.25),
      );
      add(new THREE.CapsuleGeometry(0.085, 0.42, 3, 7), d.hair, placement(0, 1.2, 0.66, -0.9));
      add(new THREE.SphereGeometry(0.07, 7, 5), PALETTE.hotPink, placement(0, 1.42, 0.52));
    } else {
      add(
        new THREE.SphereGeometry(0.255, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.62),
        d.hair,
        placement(0, 1.36, 0.32, 0.12),
      );
      add(new RoundedBoxGeometry(0.14, 0.3, 0.3, 1, 0.05), d.hair, placement(0.2, 1.22, 0.36));
      add(new RoundedBoxGeometry(0.14, 0.3, 0.3, 1, 0.05), d.hair, placement(-0.2, 1.22, 0.36));
    }
  }

  const bodyGeom = mergeParts(parts);
  const body = new THREE.Mesh(bodyGeom, toonMaterial(0xffffff, { vertexColors: true }));
  body.castShadow = true;
  body.receiveShadow = false;
  chassis.add(body);

  const outlineGeom = mergeParts(outlineParts);
  const outline = new THREE.Mesh(outlineGeom, outlineMaterial());
  chassis.add(outline);

  const wheelGeom = wheelGeometry(look.spoilerColor === look.body ? look.accent : look.spoilerColor);
  const wheelMat = toonMaterial(0xffffff, { vertexColors: true });
  const wheelPivots: THREE.Object3D[] = [];
  const wheels: THREE.Mesh[] = [];
  for (const [x, z] of [
    [-WHEEL_X, -WHEEL_Z],
    [WHEEL_X, -WHEEL_Z],
    [-WHEEL_X, WHEEL_Z],
    [WHEEL_X, WHEEL_Z],
  ]) {
    const pivot = new THREE.Object3D();
    pivot.position.set(x, WHEEL_RADIUS, z);
    const wheel = new THREE.Mesh(wheelGeom, wheelMat);
    wheel.castShadow = true;
    pivot.add(wheel);
    group.add(pivot);
    wheelPivots.push(pivot);
    wheels.push(wheel);
  }

  const triangles =
    bodyGeom.attributes.position.count / 3 +
    outlineGeom.attributes.position.count / 3 +
    (4 * wheelGeom.attributes.position.count) / 3;
  return { group, chassis, wheelPivots, wheels, triangles };
}

const TOP_SPEED = PLAYER_TUNING.topSpeed;
/** Visual wheel angle at full lock, radians (the physical lock is tiny at speed). */
const WHEEL_TURN = 0.42;

/**
 * Fraction of steering lock in -1..1. The sim's steerAngle is the physical angle, which grip
 * shrinks to a few hundredths of a radian at speed, so visuals use the fraction instead.
 */
export function steerFraction(state: KartState): number {
  const max = maxSteerAngleAt(Math.abs(state.speed));
  return max > 1e-6 ? clamp(state.steerAngle / max, -1, 1) : 0;
}

export function createKartView(variant: KartVariant): KartView {
  const model = createKartModel(KART_LOOKS[variant]);
  const { group, chassis, wheelPivots, wheels } = model;
  group.name = `kart-${variant}`;

  let lean = 0;
  let pitch = 0;
  let steerVis = 0;
  let lastSpeed = 0;
  let phase = variant === 'player' ? 0 : 1.7;

  return {
    object: group,
    update(state, dt) {
      group.position.x = state.position.x;
      group.position.z = state.position.z;
      group.rotation.y = state.heading;

      const step = Math.max(dt, 1e-4);
      const speed = state.speed;
      const speedN = clamp(Math.abs(speed) / TOP_SPEED, 0, 1);
      const k = 1 - Math.exp(-10 * step);

      // Wheels: spin with distance travelled, front pair follows the steering angle.
      const spin = (speed * step) / WHEEL_RADIUS;
      for (const w of wheels) w.rotation.x -= spin;
      const lock = steerFraction(state);
      steerVis = lerp(steerVis, lock * WHEEL_TURN, 1 - Math.exp(-14 * step));
      wheelPivots[0].rotation.y = -steerVis;
      wheelPivots[1].rotation.y = -steerVis;

      // Body: lean into the turn, pitch with acceleration, bob with speed (more on sand).
      const accel = clamp((speed - lastSpeed) / step, -30, 30);
      lastSpeed = speed;
      lean = lerp(lean, -lock * 0.16 * (0.3 + 0.7 * speedN), k);
      pitch = lerp(pitch, accel * 0.006, k);
      phase += step * (state.onRoad ? 22 : 34) * (0.3 + speedN);
      const bobAmp = (state.onRoad ? 0.012 : 0.03) * speedN;
      chassis.rotation.z = lean;
      chassis.rotation.x = pitch + (state.onRoad ? 0 : Math.sin(phase * 0.7) * 0.012 * speedN);
      chassis.position.y = Math.sin(phase) * bobAmp;
    },
  };
}
