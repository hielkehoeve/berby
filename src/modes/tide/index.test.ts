/**
 * The session against a real Race on the Malibu track and a real Three.js scene (no renderer,
 * no DOM): the grid, the catch, the results and the scene bookkeeping.
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { KartInput } from '../../shared/types';
import type { GameAudio, Sfx } from '../../audio/audio';
import type { ModeContext } from '../types';
import { buildTrack } from '../../sim/track';
import { rivalInput } from '../../sim/rival';
import { MALIBU } from '../../tracks/malibu';
import { createRace, UNLIMITED_LAPS, withLaps } from '../../game/race';
import { createTideSession } from './index';
import { TIDE_TUNING } from './tuning';

const track = buildTrack(MALIBU);
const DT = 1 / 60;
/** No input at all: the kart stays put (holding the brake would reverse it into the tide). */
const IDLE: KartInput = { steer: 0, throttle: 0, brake: 0 };

function fakeContext(): { ctx: ModeContext; sounds: Sfx[] } {
  const sounds: Sfx[] = [];
  const audio = { sfx: (name: Sfx) => sounds.push(name) } as unknown as GameAudio;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera();
  return { ctx: { track, scene, camera, audio }, sounds };
}

describe('createTideSession', () => {
  it('sets up an unlimited solo run and adds two meshes to the scene until disposed', () => {
    const { ctx } = fakeContext();
    const session = createTideSession(ctx);
    expect(session.setup(1)).toEqual({ laps: UNLIMITED_LAPS, rival: 'none' });
    expect(ctx.scene.children).toHaveLength(2);
    for (const child of ctx.scene.children) {
      expect(child.castShadow).toBe(false);
      expect(child.receiveShadow).toBe(false);
    }
    session.dispose();
    expect(ctx.scene.children).toHaveLength(0);
  });

  it('washes out a kart that never moves after startGap / startSpeed seconds', () => {
    const { ctx, sounds } = fakeContext();
    const session = createTideSession(ctx);
    const race = createRace(withLaps(track, UNLIMITED_LAPS), { rival: false });
    session.startRun(race, 1);
    expect(session.hud(race)).toEqual({ left: '🌊 45 m', right: '0 m', status: 'The tide is rising…' });
    session.render(race, DT, 0);

    let steps = 0;
    while (!session.isOver(race) && steps < 600) {
      race.step(IDLE, DT);
      session.step(race, IDLE, DT);
      session.render(race, DT, race.time);
      steps++;
    }
    expect(session.isOver(race)).toBe(true);
    expect(race.time).toBeCloseTo(TIDE_TUNING.startGap / TIDE_TUNING.startSpeed, 1);
    expect(sounds).toEqual(['warn', 'splash']);
    expect(session.hud(race).left).toBe('⚠️ 0 m');

    // The coast after the catch: the kart is stopped, the clock runs on, the wave rolls over.
    for (let i = 0; i < 90; i++) {
      race.coast(DT);
      session.render(race, DT, race.time);
    }
    const finish = session.finish(race);
    expect(finish.kind).toBe('results');
    if (finish.kind !== 'results') return;
    // No localStorage in node: the best falls back to 0 and a 0 m run does not beat it.
    expect(finish.headline).toBe('Washed out!');
    expect(finish.won).toBeNull();
    expect(finish.again).toBe('Run again');
    expect(finish.rows[0]).toEqual(['Distance', '0 m']);
    expect(finish.rows[1][0]).toBe('Time survived');
    expect(finish.rows[2]).toEqual(['Best distance', '0 m']);
    session.dispose();
  });

  it('lets a clean driver pull away from the tide over the first lap', () => {
    const { ctx, sounds } = fakeContext();
    const session = createTideSession(ctx);
    const race = createRace(withLaps(track, UNLIMITED_LAPS), { rival: false });
    session.startRun(race, 1);
    // The player's grid progress is a few meters before the line: the first step reads about −8.
    race.step(IDLE, DT);
    session.step(race, IDLE, DT);
    expect(race.playerProgress.progress).toBeLessThan(0);
    expect(race.playerProgress.progress).toBeGreaterThan(-12);
    expect(session.hud(race).right).toBe('0 m');

    let lapMessage = false;
    const steps = Math.round(65 / DT);
    for (let i = 0; i < steps && !session.isOver(race); i++) {
      const input = rivalInput(race.player, track, { rivalProgress: 0, playerProgress: 0, player: race.rival }, DT);
      race.step(input, DT);
      session.step(race, input, DT);
      if (session.hud(race).status === 'Lap 2!') lapMessage = true;
    }
    expect(session.isOver(race)).toBe(false);
    expect(race.playerProgress.lap).toBe(2);
    expect(lapMessage).toBe(true);
    expect(sounds).toEqual([]);
    const hud = session.hud(race);
    expect(hud.status).not.toBe('Faster!');
    expect(hud.left).toMatch(/^🌊 \d+ m$/);
    expect(hud.right).toBeDefined();
    expect(Number(hud.left?.replace(/\D/g, ''))).toBeGreaterThan(TIDE_TUNING.startGap);
    expect(Number(hud.right?.replace(/\D/g, ''))).toBeGreaterThan(track.length);
    session.dispose();
  });
});
