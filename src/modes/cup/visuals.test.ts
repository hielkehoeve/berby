/**
 * Smoke test of the Three.js side in node: the objects exist with the expected instance
 * counts, the budget holds (six draw calls at most), an update places things without
 * throwing, and dispose empties the scene.
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildTrack } from '../../sim/track';
import { MALIBU } from '../../tracks/malibu';
import { createRace } from '../../game/race';
import { createCupState, useItem } from './cup';
import { CUP_TUNING } from './tuning';
import { createCupVisuals } from './visuals';

const track = buildTrack(MALIBU);

function drawables(scene: THREE.Scene): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  scene.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) out.push(o as THREE.Mesh);
  });
  return out;
}

function triangles(mesh: THREE.Mesh): number {
  const g = mesh.geometry;
  const n = g.index ? g.index.count : g.attributes.position.count;
  const count = (mesh as THREE.InstancedMesh).isInstancedMesh ? (mesh as THREE.InstancedMesh).count : 1;
  return (n / 3) * count;
}

describe('cup visuals', () => {
  it('adds at most six draw calls, instanced boxes and bombs, and stays within the triangle budget', () => {
    const scene = new THREE.Scene();
    const state = createCupState(track, () => 0.5);
    const visuals = createCupVisuals(scene, state);
    const meshes = drawables(scene);
    expect(meshes.length).toBeLessThanOrEqual(6);
    const instanced = meshes.filter((m) => (m as THREE.InstancedMesh).isInstancedMesh) as THREE.InstancedMesh[];
    expect(instanced.map((m) => m.count).sort((a, b) => a - b)).toEqual([6, 12, 12]);
    for (const m of meshes) {
      expect(m.castShadow).toBe(false);
      expect(m.frustumCulled).toBe(false);
    }
    const total = meshes.reduce((sum, m) => sum + triangles(m), 0);
    expect(total).toBeLessThan(8000);
    visuals.dispose();
    expect(drawables(scene)).toHaveLength(0);
  });

  it('shows the missile and the shields only while they are active', () => {
    const scene = new THREE.Scene();
    const state = createCupState(track, () => 0.5);
    const visuals = createCupVisuals(scene, state);
    const race = createRace(track);
    visuals.update(state, race, 0);
    const visible = () => drawables(scene).filter((m) => m.visible && !(m as THREE.InstancedMesh).isInstancedMesh);
    expect(visible()).toHaveLength(0);
    state.player.held = 'shield';
    useItem(state, race, 'player');
    state.rival.held = 'missile';
    useItem(state, race, 'rival');
    visuals.update(state, race, 1);
    expect(visible()).toHaveLength(2);
    visuals.dispose();
  });

  it('hides taken boxes by scaling their instance to zero and pops them back after the respawn', () => {
    const scene = new THREE.Scene();
    const state = createCupState(track, () => 0.5);
    const visuals = createCupVisuals(scene, state);
    const race = createRace(track);
    const boxes = drawables(scene).find((m) => (m as THREE.InstancedMesh).count === 12) as THREE.InstancedMesh;
    const m = new THREE.Matrix4();
    const scale = new THREE.Vector3();
    const read = (i: number) => {
      boxes.getMatrixAt(i, m);
      scale.setFromMatrixScale(m);
      return scale.x;
    };
    visuals.update(state, race, 0);
    expect(read(3)).toBeCloseTo(1, 6);
    expect(read(7)).toBeCloseTo(1, 6);
    state.respawnAt[3] = 2 + CUP_TUNING.boxes.respawn; // taken at t = 2
    // Pretend the clock reads 4 s (taken, not back) and then half-way through the pop-in.
    const at = (time: number) => ({ ...race, time }) as typeof race;
    visuals.update(state, at(4), 0);
    expect(read(3)).toBe(0);
    expect(read(7)).toBeCloseTo(1, 6);
    visuals.update(state, at(2 + CUP_TUNING.boxes.respawn + CUP_TUNING.boxes.popIn / 2), 0);
    expect(read(3)).toBeCloseTo(0.5, 6);
    visuals.dispose();
  });
});
