/**
 * The stars on the track: one InstancedMesh of extruded glitter stars and one of gold stars, two
 * draw calls in all (no shadow casting, so no shadow-pass draws). Every frame the instances spin,
 * bob and scale with their pickup state; the matrices are rebuilt with scratch objects, nothing is
 * allocated per frame, and no geometry or material is created after create().
 *
 * This is the only file of the mode that imports Three.js.
 */
import * as THREE from 'three';
import { starShape, toonMaterial } from '../../graphics/materials';
import type { Star } from './layout';
import { starScale } from './rules';
import type { RushTuning } from './tuning';

export interface StarVisuals {
  /** Place every star for this frame: `time` is the race clock (pickup state), `elapsed` the animation clock. */
  update(takenAt: Float64Array, time: number, elapsed: number): void;
  /** Remove the meshes from the scene and free their geometry and materials. */
  dispose(): void;
  /** The meshes added to the scene: one per star kind that exists, for tests and draw-call counts. */
  readonly meshes: readonly THREE.InstancedMesh[];
}

/** A unit-wide five-point star, upright in the XY plane, centred on its depth. */
function starGeometry(depth: number): THREE.ExtrudeGeometry {
  const geometry = new THREE.ExtrudeGeometry(starShape(), { depth, bevelEnabled: false });
  geometry.translate(0, 0, -depth / 2);
  return geometry;
}

interface Group {
  mesh: THREE.InstancedMesh;
  /** Index into the stars array per instance. */
  indices: Uint16Array;
  size: number;
}

const pos = new THREE.Vector3();
const quat = new THREE.Quaternion();
const eul = new THREE.Euler();
const scl = new THREE.Vector3();
const mat = new THREE.Matrix4();

export function createStarVisuals(scene: THREE.Scene, stars: readonly Star[], tuning: RushTuning): StarVisuals {
  const geometry = starGeometry(tuning.starDepth);
  const groups: Group[] = [];

  const makeGroup = (kind: Star['kind'], color: number, size: number, name: string) => {
    const indices: number[] = [];
    stars.forEach((s, i) => {
      if (s.kind === kind) indices.push(i);
    });
    if (!indices.length) return;
    const material = toonMaterial(color);
    material.emissive.setHex(color);
    material.emissiveIntensity = tuning.glow;
    const mesh = new THREE.InstancedMesh(geometry, material, indices.length);
    mesh.name = name;
    // The set spans the whole track, so culling it as a whole never pays; and no shadows: a
    // casting InstancedMesh would cost a second draw in the shadow pass.
    mesh.frustumCulled = false;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    scene.add(mesh);
    groups.push({ mesh, indices: Uint16Array.from(indices), size });
  };
  makeGroup('glitter', tuning.starColor, tuning.starSize, 'glitter-stars');
  makeGroup('gold', tuning.goldColor, tuning.goldSize, 'gold-stars');

  const visuals: StarVisuals = {
    meshes: groups.map((g) => g.mesh),
    update(takenAt, time, elapsed) {
      for (let g = 0; g < groups.length; g++) {
        const { mesh, indices, size } = groups[g];
        for (let k = 0; k < indices.length; k++) {
          const i = indices[k];
          const star = stars[i];
          const phase = i * 0.7;
          const s = starScale(takenAt[i], time, tuning) * size;
          pos.set(star.x, tuning.starHeight + Math.sin(elapsed * tuning.bobRate + phase) * tuning.bobAmplitude, star.z);
          eul.set(0, elapsed * tuning.spinRate + phase, 0);
          quat.setFromEuler(eul);
          scl.set(s, s, s);
          mat.compose(pos, quat, scl);
          mesh.setMatrixAt(k, mat);
        }
        mesh.instanceMatrix.needsUpdate = true;
      }
    },
    dispose() {
      for (const { mesh } of groups) {
        scene.remove(mesh);
        (mesh.material as THREE.Material).dispose();
        mesh.dispose();
      }
      groups.length = 0;
      geometry.dispose();
    },
  };
  visuals.update(new Float64Array(stars.length).fill(-Infinity), 0, 0);
  return visuals;
}
