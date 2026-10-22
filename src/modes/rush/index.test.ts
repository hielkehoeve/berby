import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import type { KartInput } from '../../shared/types';
import { buildTrack } from '../../sim/track';
import { rivalInput } from '../../sim/rival';
import { MALIBU } from '../../tracks/malibu';
import { createRace, UNLIMITED_LAPS, withLaps, type Race } from '../../game/race';
import type { GameAudio, Sfx } from '../../audio/audio';
import type { ModeContext } from '../types';
import { BEST_KEY, RUSH_MODE, createRushSession } from './index';
import { layoutStars } from './layout';
import { RUSH_TUNING } from './tuning';

const T = RUSH_TUNING;
const track = buildTrack(MALIBU);
const stars = layoutStars(track);

/** Records every effect played. */
function fakeAudio(): GameAudio & { played: { name: Sfx; pitch: number }[] } {
  const played: { name: Sfx; pitch: number }[] = [];
  return {
    played,
    sfx: (name: Sfx, pitch = 1) => {
      played.push({ name, pitch });
    },
  } as unknown as GameAudio & { played: { name: Sfx; pitch: number }[] };
}

function context() {
  const scene = new THREE.Scene();
  const audio = fakeAudio();
  const ctx: ModeContext = { track, scene, camera: new THREE.PerspectiveCamera(), audio };
  return { ctx, scene, audio };
}

/** Just enough of a Race for the session: the clock, the kart's position and its progress. */
function fakeRace(time: number, x: number, z: number, progress: number): Race {
  return { time, player: { position: { x, z } }, playerProgress: { progress } } as unknown as Race;
}

/** A race frame with the kart sitting on star `i` at race time `time`. */
function onStar(i: number, time: number): Race {
  const s = stars[i];
  return fakeRace(time, s.x, s.z, s.distance);
}

const input: KartInput = { steer: 0, throttle: 1, brake: 0 };
const dt = 1 / 60;

/** A localStorage stand-in for node. */
function storage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    map,
  };
}

describe('Glitter Rush session', () => {
  beforeEach(() => vi.stubGlobal('localStorage', storage()));
  afterEach(() => vi.unstubAllGlobals());

  it('runs unlimited laps with no rival', () => {
    const { ctx } = context();
    const session = createRushSession(ctx);
    expect(RUSH_MODE.info.id).toBe('rush');
    expect(session.setup(1)).toEqual({ laps: UNLIMITED_LAPS, rival: 'none' });
    session.dispose();
  });

  it('adds two instanced meshes (two draw calls, no shadow casting) and removes them on dispose', () => {
    const { ctx, scene } = context();
    const session = createRushSession(ctx);
    const meshes = scene.children.filter((c) => c instanceof THREE.InstancedMesh) as THREE.InstancedMesh[];
    expect(scene.children.length).toBe(2);
    expect(meshes.map((m) => m.count).sort((a, b) => a - b)).toEqual(
      [stars.filter((s) => s.kind === 'gold').length, stars.filter((s) => s.kind === 'glitter').length].sort(
        (a, b) => a - b,
      ),
    );
    for (const m of meshes) {
      expect(m.castShadow).toBe(false);
      expect(m.geometry.attributes.position.count).toBeGreaterThan(0);
    }
    session.render(fakeRace(0, 0, 0, -8), dt, 1.5);
    session.dispose();
    expect(scene.children.length).toBe(0);
  });

  it('starts with an empty HUD and the full clock', () => {
    const { ctx } = context();
    const session = createRushSession(ctx);
    session.startRun(fakeRace(0, 0, 0, -8), 1);
    const hud = session.hud(fakeRace(0, 0, 0, -8));
    expect(hud.left).toBe('✨ 0');
    expect(hud.center).toBe('1:15.0');
    expect(hud.right).toBe('×1 · chain 0');
    expect(hud.status).toBeUndefined();
    expect(session.isOver(fakeRace(0, 0, 0, -8))).toBe(false);
    session.dispose();
  });

  it('scores a chain, raises the multiplier with a status and a rising pickup pitch', () => {
    const { ctx, audio } = context();
    const session = createRushSession(ctx);
    session.startRun(fakeRace(0, 0, 0, -8), 1);
    const glitter = stars.map((s, i) => i).filter((i) => stars[i].kind === 'glitter');
    let time = 1;
    for (let k = 0; k < T.chainForX2; k++) {
      time += 0.5;
      session.step(onStar(glitter[k], time), input, dt);
    }
    const hud = session.hud(fakeRace(time, 0, 0, 0));
    // Nine at ×1, the tenth at ×2.
    expect(hud.left).toBe(`✨ ${(T.chainForX2 - 1) * T.starPoints + 2 * T.starPoints}`);
    expect(hud.right).toBe(`×2 · chain ${T.chainForX2}`);
    expect(hud.status).toBe('×2!');
    expect(session.hud(fakeRace(time + T.statusSeconds + 0.01, 0, 0, 0)).status).toBeUndefined();
    const pickups = audio.played.filter((p) => p.name === 'pickup');
    expect(pickups.length).toBe(T.chainForX2);
    expect(pickups[0].pitch).toBeCloseTo(1 + T.pickupPitchStep);
    expect(pickups[pickups.length - 1].pitch).toBeCloseTo(1 + T.chainForX2 * T.pickupPitchStep);
    // The same star again, a step later: already taken, nothing happens.
    session.step(onStar(glitter[0], time + dt), input, dt);
    expect(session.hud(fakeRace(time + dt, 0, 0, 0)).left).toBe(hud.left);
    session.dispose();
  });

  it('a gold star plays the bonus, shows "+3 s!" and adds to the clock; a pause loses the chain', () => {
    const { ctx, audio } = context();
    const session = createRushSession(ctx);
    session.startRun(fakeRace(0, 0, 0, -8), 1);
    const glitter = stars.map((s, i) => i).filter((i) => stars[i].kind === 'glitter');
    const gold = stars.findIndex((s) => s.kind === 'gold');
    session.step(onStar(glitter[0], 1), input, dt);
    session.step(onStar(glitter[1], 1.5), input, dt);
    session.step(onStar(gold, 2), input, dt);
    expect(audio.played.map((p) => p.name)).toEqual(['pickup', 'pickup', 'bonus']);
    let hud = session.hud(fakeRace(2, 0, 0, 0));
    expect(hud.status).toBe(`+${T.goldBonusSeconds} s!`);
    expect(hud.left).toBe(`✨ ${2 * T.starPoints + T.goldPoints}`);
    expect(hud.right).toBe('×1 · chain 3');
    expect(hud.center).toBe('1:16.0');
    // Nothing for a while: the chain of three is lost.
    session.step(fakeRace(2 + T.chainGapSeconds + dt, 0, 0, 0), input, dt);
    hud = session.hud(fakeRace(2 + T.chainGapSeconds + dt, 0, 0, 0));
    expect(hud.status).toBe('Chain lost');
    expect(hud.right).toBe('×1 · chain 0');
    session.dispose();
  });

  it('ticks the last five seconds and ends when the clock hits zero', () => {
    const { ctx, audio } = context();
    const session = createRushSession(ctx);
    session.startRun(fakeRace(0, 0, 0, -8), 1);
    let time = T.seconds - 6;
    while (!session.isOver(fakeRace(time, 0, 0, 0))) {
      time += dt;
      session.step(fakeRace(time, 0, 0, 0), input, dt);
    }
    expect(audio.played.filter((p) => p.name === 'tick').length).toBe(5);
    expect(time).toBeCloseTo(T.seconds, 1);
    expect(session.hud(fakeRace(time, 0, 0, 0)).center).toBe('0:00.0');
    session.dispose();
  });

  it('saves a new best and shows it on the results card', () => {
    const { ctx } = context();
    const session = createRushSession(ctx);
    session.startRun(fakeRace(0, 0, 0, -8), 1);
    const glitter = stars.map((s, i) => i).filter((i) => stars[i].kind === 'glitter');
    for (let k = 0; k < 4; k++) session.step(onStar(glitter[k], 1 + k * 0.5), input, dt);
    const finish = session.finish(fakeRace(T.seconds, 0, 0, 0));
    expect(finish).toEqual({
      kind: 'results',
      headline: 'New best!',
      won: true,
      rows: [
        ['Glitter', '4'],
        ['Best', '4'],
        ['Longest chain', '4'],
      ],
      again: 'Rush again',
    });
    expect(localStorage.getItem(BEST_KEY)).toBe('4');
    session.dispose();
  });

  it("says time's up when the best stands, and a fresh run starts from zero", () => {
    vi.stubGlobal('localStorage', storage({ [BEST_KEY]: '99' }));
    const { ctx } = context();
    const session = createRushSession(ctx);
    session.startRun(fakeRace(0, 0, 0, -8), 1);
    const glitter = stars.map((s, i) => i).filter((i) => stars[i].kind === 'glitter');
    session.step(onStar(glitter[0], 1), input, dt);
    const finish = session.finish(fakeRace(T.seconds, 0, 0, 0));
    expect(finish.kind).toBe('results');
    if (finish.kind !== 'results') return;
    expect(finish.headline).toBe("Time's up!");
    expect(finish.won).toBeNull();
    expect(finish.rows).toEqual([
      ['Glitter', '1'],
      ['Best', '99'],
      ['Longest chain', '1'],
    ]);
    expect(localStorage.getItem(BEST_KEY)).toBe('99');
    // The next run: stars back, score zero.
    session.startRun(fakeRace(0, 0, 0, -8), 2);
    expect(session.hud(fakeRace(0, 0, 0, -8)).left).toBe('✨ 0');
    session.step(onStar(glitter[0], 1), input, dt);
    expect(session.hud(fakeRace(1, 0, 0, 0)).left).toBe('✨ 1');
    session.dispose();
  });

  it('a full run on the autopilot collects stars and ends at the clock', () => {
    const { ctx, audio } = context();
    const session = createRushSession(ctx);
    const setup = session.setup(1);
    const race = createRace(withLaps(track, setup.laps), { rival: false });
    session.startRun(race, 1);
    let steps = 0;
    let elapsed = 0;
    while (!session.isOver(race) && steps < 20000) {
      const drive = rivalInput(race.player, track, { rivalProgress: 0, playerProgress: 0, player: race.rival }, dt);
      race.step(drive, dt);
      session.step(race, drive, dt);
      if (steps % 4 === 0) session.render(race, dt * 4, (elapsed += dt * 4));
      steps++;
    }
    expect(session.isOver(race)).toBe(true);
    const hud = session.hud(race);
    const score = Number(hud.left?.replace('✨ ', ''));
    // The racing line runs through the centre lane on the straights: a decent haul in 75 s.
    expect(score).toBeGreaterThan(15);
    expect(race.playerProgress.progress).toBeGreaterThan(track.length);
    expect(audio.played.some((p) => p.name === 'pickup')).toBe(true);
    expect(audio.played.filter((p) => p.name === 'tick').length).toBeGreaterThanOrEqual(5);
    const finish = session.finish(race);
    expect(finish.kind).toBe('results');
    if (finish.kind === 'results') expect(finish.rows[0]).toEqual(['Glitter', String(score)]);
    session.dispose();
  });
});
