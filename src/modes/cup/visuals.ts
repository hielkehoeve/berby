/**
 * The Glam Cup scene objects, the only file of the mode that touches Three.js: the item boxes
 * (one instanced mesh plus one instanced outline shell), the glitter bombs (one instanced
 * mesh), the kiss missile (one mesh) and a heart ring per kart (two meshes). Six draw calls,
 * no shadows, everything built in create and only matrices updated per frame.
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { PALETTE } from '../../shared/palette';
import { clamp } from '../../shared/math';
import type { KartState } from '../../shared/types';
import type { Race } from '../../game/race';
import {
  heartShape,
  mergeParts,
  outlineMaterial,
  paint,
  placement,
  starShape,
  toonMaterial,
} from '../../graphics/materials';
import type { CupState } from './cup';
import { CUP_TUNING } from './tuning';

export interface CupVisuals {
  /** Every frame: place the boxes, bombs, missile and shields from the state. */
  update(state: CupState, race: Race, elapsed: number): void;
  /** Remove everything from the scene and free the GPU resources. */
  dispose(): void;
}

/** Pastel colours of the three boxes in a row (right, centre, left). */
const BOX_COLORS = [PALETTE.bubblegum, PALETTE.lavender, PALETTE.mint];
/** Back-face shell scale for the box outline. */
const OUTLINE_SCALE = 1.08;
/** Tilt of the boxes' spin axis, so they tumble like gems rather than turn like turntables. */
const BOX_TILT = 0.45;

function bombGeometry(): THREE.BufferGeometry {
  const r = CUP_TUNING.bomb.size;
  const ball = paint(new THREE.SphereGeometry(r, 10, 7), PALETTE.bubblegum);
  const star = paint(
    new THREE.ExtrudeGeometry(starShape(), { depth: 0.08, bevelEnabled: false, curveSegments: 2 }),
    PALETTE.cream,
  );
  return mergeParts([
    { geometry: ball, matrix: placement(0, r, 0) },
    { geometry: star, matrix: placement(0, r * 2 + 0.18, 0, 0, Math.PI / 4, 0, 0.55) },
  ]);
}

function heartGeometry(width: number, depth: number): THREE.BufferGeometry {
  const g = new THREE.ExtrudeGeometry(heartShape(), {
    depth,
    bevelEnabled: true,
    bevelThickness: depth * 0.25,
    bevelSize: depth * 0.2,
    bevelSegments: 1,
    curveSegments: 6,
  });
  g.scale(width, width, 1);
  g.translate(0, 0, -depth / 2);
  return g;
}

function shieldGeometry(): THREE.BufferGeometry {
  const r = CUP_TUNING.shield.radius;
  const ring = new THREE.TorusGeometry(r, 0.09, 6, 28);
  const parts: { geometry: THREE.BufferGeometry; matrix?: THREE.Matrix4 }[] = [
    { geometry: paint(ring, 0xffffff), matrix: placement(0, 0, 0, Math.PI / 2) },
  ];
  for (let i = 0; i < 3; i++) {
    const a = (i * Math.PI * 2) / 3;
    parts.push({
      geometry: paint(heartGeometry(0.55, 0.1), 0xffffff),
      matrix: placement(Math.sin(a) * r, 0.1, Math.cos(a) * r, 0, a, 0),
    });
  }
  return mergeParts(parts);
}

export function createCupVisuals(scene: THREE.Scene, state: CupState): CupVisuals {
  const group = new THREE.Group();
  group.name = 'cup-items';
  const t = CUP_TUNING;

  // Item boxes: pastel rounded cubes with a plum outline shell, instanced.
  const n = state.boxes.length;
  const boxGeo = new RoundedBoxGeometry(t.boxes.size, t.boxes.size, t.boxes.size, 1, 0.14);
  const boxMat = toonMaterial(0xffffff);
  const outlineMat = outlineMaterial();
  const boxes = new THREE.InstancedMesh(boxGeo, boxMat, n);
  const outlines = new THREE.InstancedMesh(boxGeo, outlineMat, n);
  const color = new THREE.Color();
  for (let i = 0; i < n; i++) {
    color.setHex(BOX_COLORS[i % BOX_COLORS.length]);
    boxes.setColorAt(i, color);
  }
  if (boxes.instanceColor) boxes.instanceColor.needsUpdate = true;

  // Glitter bombs: a bubblegum ball with a cream star on top, instanced over the pool.
  const bombGeo = bombGeometry();
  const bombMat = toonMaterial(0xffffff, { vertexColors: true });
  const bombs = new THREE.InstancedMesh(bombGeo, bombMat, state.bombs.length);

  // The kiss missile: a hot pink heart flying upright, face along the travel direction.
  const missileGeo = heartGeometry(1.0, 0.3);
  const missileMat = toonMaterial(PALETTE.hotPink);
  const missile = new THREE.Mesh(missileGeo, missileMat);
  missile.visible = false;

  // Heart shields: a translucent ring with three hearts, one per kart.
  const shieldGeo = shieldGeometry();
  const shieldMats = [PALETTE.hotPink, PALETTE.lavender].map((c) => {
    const m = toonMaterial(c, { transparent: true, opacity: 0.55, side: THREE.DoubleSide });
    m.depthWrite = false;
    return m;
  });
  const shields = shieldMats.map((m) => {
    const mesh = new THREE.Mesh(shieldGeo, m);
    mesh.visible = false;
    return mesh;
  });

  const all: THREE.Object3D[] = [boxes, outlines, bombs, missile, ...shields];
  for (const o of all) {
    o.castShadow = false;
    o.receiveShadow = false;
    o.frustumCulled = false;
    group.add(o);
  }
  scene.add(group);

  // Scratch objects for the per-frame matrix updates.
  const pos = new THREE.Vector3();
  const eul = new THREE.Euler();
  const quat = new THREE.Quaternion();
  const scl = new THREE.Vector3();
  const mat = new THREE.Matrix4();

  function updateBoxes(state: CupState, time: number, elapsed: number): void {
    for (let i = 0; i < n; i++) {
      const b = state.boxes[i];
      const up = (time - state.respawnAt[i]) / t.boxes.popIn;
      const scale = up < 0 ? 0 : clamp(up, 0, 1);
      pos.set(b.position.x, t.boxes.height + Math.sin(elapsed * 2.2 + i * 1.3) * t.boxes.bob, b.position.z);
      eul.set(BOX_TILT, b.heading + elapsed * 1.8 + i, BOX_TILT * 0.6);
      quat.setFromEuler(eul);
      scl.setScalar(scale);
      boxes.setMatrixAt(i, mat.compose(pos, quat, scl));
      scl.setScalar(scale * OUTLINE_SCALE);
      outlines.setMatrixAt(i, mat.compose(pos, quat, scl));
    }
    boxes.instanceMatrix.needsUpdate = true;
    outlines.instanceMatrix.needsUpdate = true;
  }

  function updateBombs(state: CupState, elapsed: number): void {
    for (let i = 0; i < state.bombs.length; i++) {
      const b = state.bombs[i];
      if (b.active) {
        pos.set(b.x, 0, b.z);
        eul.set(0, elapsed * 2 + i, 0);
        quat.setFromEuler(eul);
        scl.setScalar(1 + Math.sin(elapsed * 6 + i) * 0.06);
      } else {
        pos.set(0, -5, 0);
        quat.identity();
        scl.setScalar(0);
      }
      bombs.setMatrixAt(i, mat.compose(pos, quat, scl));
    }
    bombs.instanceMatrix.needsUpdate = true;
  }

  function updateMissile(state: CupState, elapsed: number): void {
    const m = state.missile;
    missile.visible = m.active;
    if (!m.active) return;
    missile.position.set(m.x, t.missile.height + Math.sin(elapsed * 14) * 0.05, m.z);
    missile.rotation.set(0, m.heading, Math.sin(elapsed * 9) * 0.25);
  }

  function updateShield(i: number, active: boolean, kart: KartState, elapsed: number): void {
    const mesh = shields[i];
    mesh.visible = active;
    if (!active) return;
    mesh.position.set(kart.position.x, t.shield.height + Math.sin(elapsed * 3 + i) * 0.06, kart.position.z);
    mesh.rotation.y = (i === 0 ? 1 : -1) * elapsed * 1.6;
  }

  return {
    update(state, race, elapsed) {
      updateBoxes(state, race.time, elapsed);
      updateBombs(state, elapsed);
      updateMissile(state, elapsed);
      updateShield(0, state.player.shield, race.player, elapsed);
      updateShield(1, state.rival.shield, race.rival, elapsed);
    },
    dispose() {
      scene.remove(group);
      boxes.dispose();
      outlines.dispose();
      bombs.dispose();
      for (const g of [boxGeo, bombGeo, missileGeo, shieldGeo]) g.dispose();
      for (const m of [boxMat, outlineMat, bombMat, missileMat, ...shieldMats]) m.dispose();
    },
  };
}
