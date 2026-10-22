import { afterEach, describe, expect, it, vi } from 'vitest';
import type { KartInput, KartState, RaceProgress } from '../../shared/types';
import { buildTrack } from '../../sim/track';
import { rivalInput } from '../../sim/rival';
import { MALIBU } from '../../tracks/malibu';
import { createRace, withLaps, type Race } from '../../game/race';
import { createGhostState } from '../shared/recording';
import type { ModeSession } from '../types';
import { createHotSeatSession, HOTSEAT_MODE } from './index';
import { HOTSEAT_TUNING } from './tuning';

const DT = 1 / 60;
const track = buildTrack(MALIBU);

function fakeAudio() {
  return { sfx: vi.fn() };
}

// --- A scripted race: progress and time are set by the test, no sim involved. ---

interface Scripted {
  race: Race;
  /** Advance one step: the kart moves `metersPerSecond` along; progress follows. */
  advance(metersPerSecond: number): void;
}

function scriptedRace(): Scripted {
  const player: KartState = createGhostState();
  const playerProgress: RaceProgress = { lap: 1, nextCheckpoint: 0, progress: -10, lapTimes: [], finished: false };
  player.position.z = 10;
  let time = 0;
  const race = {
    track,
    player,
    rival: createGhostState(),
    playerProgress,
    rivalProgress: { lap: 1, nextCheckpoint: 0, progress: 0, lapTimes: [], finished: false },
    get time() {
      return time;
    },
    finished: false,
    winner: null,
    step() {},
    coast() {},
    playerPosition: () => 1 as const,
    bestLap: () => null,
    totalTime: () => time,
  } as unknown as Race;
  return {
    race,
    advance(metersPerSecond) {
      time += DT;
      player.position.z -= metersPerSecond * DT;
      player.speed = metersPerSecond;
      playerProgress.progress += metersPerSecond * DT;
    },
  };
}

const NO_INPUT: KartInput = { steer: 0, throttle: 1, brake: 0 };

/** Run 1 on a scripted race: 10 s at 20 m/s, so progress goes from -10 to 190. */
function scriptedRun1(session: ModeSession) {
  expect(session.setup(1)).toEqual({ laps: 1, rival: 'none' });
  const s = scriptedRace();
  session.startRun(s.race, 1);
  for (let i = 0; i < 600; i++) {
    s.advance(20);
    session.step(s.race, NO_INPUT, DT);
  }
  return session.finish(s.race);
}

describe('hot seat on a scripted race', () => {
  it('runs a solo first run with P1 and no delta, then asks to pass the phone', () => {
    const session = createHotSeatSession(fakeAudio());
    expect(session.setup(1)).toEqual({ laps: 1, rival: 'none' });
    const s = scriptedRace();
    session.startRun(s.race, 1);
    expect(session.hud(s.race)).toEqual({ left: 'P1', right: '--', status: undefined });
    for (let i = 0; i < 600; i++) {
      s.advance(20);
      session.step(s.race, NO_INPUT, DT);
    }
    expect(session.hud(s.race).right).toBe('--');
    expect(session.finish(s.race)).toEqual({
      kind: 'intermission',
      headline: 'Pass the phone',
      lines: ['Player 1: 0:10.00', 'Player 2, beat that!'],
      button: "I'm ready",
    });
  });

  it('in run 2 shows the catch message, a live delta, the ghost, and announces a change of lead once', () => {
    const audio = fakeAudio();
    const session = createHotSeatSession(audio);
    scriptedRun1(session);

    expect(session.setup(2)).toEqual({ laps: 1, rival: 'ghost' });
    const s = scriptedRace();
    session.startRun(s.race, 2);
    const hud = session.hud(s.race);
    expect(hud).toEqual({ left: 'P2', right: '+0.00', status: 'Catch Player 1!' });
    // The ghost sits on the grid during the countdown, where Player 1 started (its first sample
    // is one step into run 1, a third of a meter from the grid at this speed).
    const ghost = session.ghost!(s.race)!;
    expect(ghost.position.z).toBeCloseTo(10, 0);

    // 4 s at 25 m/s: ahead of the 20 m/s recording.
    for (let i = 0; i < 240; i++) {
      s.advance(25);
      session.step(s.race, NO_INPUT, DT);
      // The catch message holds for the first 3 s and then clears.
      expect(session.hud(s.race).status).toBe(s.race.time < 3 ? 'Catch Player 1!' : undefined);
      // The same HUD object every frame, no allocation.
      expect(session.hud(s.race)).toBe(hud);
    }
    // At t = 4 the player is at progress 90, which Player 1 reached at t = 5: 1 s ahead.
    expect(hud.right).toBe('-1.00');
    expect(audio.sfx).not.toHaveBeenCalled();
    // The ghost follows the recording: 20 m/s from z = 10 for 4 s.
    expect(session.ghost!(s.race)!.position.z).toBeCloseTo(10 - 80, 1);
    expect(session.ghost!(s.race)).toBe(ghost);

    // Then 10 m/s: Player 1 catches up and passes; the switch is announced once.
    let announcedAt = -1;
    for (let i = 0; i < 600; i++) {
      s.advance(10);
      session.step(s.race, NO_INPUT, DT);
      if (announcedAt < 0 && hud.status === 'Behind') announcedAt = s.race.time;
    }
    // From t = 4 the delta is 0.5 t - 3: level at t = 6, past the deadband at t = 6.3.
    expect(announcedAt).toBeGreaterThan(6 + 2 * HOTSEAT_TUNING.leadDeadband);
    expect(announcedAt).toBeLessThan(6 + 2 * HOTSEAT_TUNING.leadDeadband + 0.1);
    expect(audio.sfx).toHaveBeenCalledTimes(1);
    expect(audio.sfx).toHaveBeenCalledWith('tick');
    // The message is gone after its hold time.
    expect(hud.status).toBeUndefined();
    expect(String(hud.right).startsWith('+')).toBe(true);

    const card = session.finish(s.race);
    expect(card.kind).toBe('results');
    if (card.kind !== 'results') return;
    expect(card.headline).toBe('Player 1 wins!');
    expect(card.won).toBeNull();
    expect(card.rows).toEqual([
      ['Player 1', '0:10.00'],
      ['Player 2', '0:14.00'],
      ['Gap', '+4.00'],
      ['Best ever', '0:10.00'],
    ]);
    expect(card.again).toBe('Rematch');
  });

  it('survives Player 2 reversing past the grid: the delta is the lost time, nothing throws', () => {
    const session = createHotSeatSession(fakeAudio());
    scriptedRun1(session);
    session.setup(2);
    const s = scriptedRace();
    session.startRun(s.race, 2);
    for (let i = 0; i < 300; i++) {
      s.advance(-5);
      session.step(s.race, NO_INPUT, DT);
      expect(session.ghost!(s.race)).not.toBeNull();
    }
    expect(session.hud(s.race).right).toBe('+5.00');
    expect(session.hud(s.race).status).toBeUndefined();
  });

  it('spaces the ticks when the lead flips back and forth', () => {
    const audio = fakeAudio();
    const session = createHotSeatSession(audio);
    scriptedRun1(session);
    session.setup(2);
    const s = scriptedRace();
    session.startRun(s.race, 2);
    // Level for the catch window, then alternate: 0.5 s fast, 0.5 s slow, forever.
    for (let i = 0; i < 180; i++) {
      s.advance(20);
      session.step(s.race, NO_INPUT, DT);
    }
    for (let i = 0; i < 600; i++) {
      s.advance(Math.floor(i / 30) % 2 === 0 ? 40 : 1);
      session.step(s.race, NO_INPUT, DT);
    }
    const flips = audio.sfx.mock.calls.length;
    expect(flips).toBeGreaterThanOrEqual(2);
    // 10 s of flipping, ticks at least tickSpacing apart.
    expect(flips).toBeLessThanOrEqual(Math.ceil(10 / HOTSEAT_TUNING.tickSpacing));
  });
});

describe('best ever in storage', () => {
  const store = new Map<string, string>();
  const fakeStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
  };

  afterEach(() => {
    store.clear();
    delete (globalThis as { localStorage?: unknown }).localStorage;
  });

  it('saves the fastest run and shows a faster stored best instead', () => {
    (globalThis as { localStorage?: unknown }).localStorage = fakeStorage;
    const session = createHotSeatSession(fakeAudio());
    scriptedRun1(session);
    const s = scriptedRace();
    session.setup(2);
    session.startRun(s.race, 2);
    for (let i = 0; i < 480; i++) {
      s.advance(25);
      session.step(s.race, NO_INPUT, DT);
    }
    const card = session.finish(s.race);
    expect(card.kind === 'results' && card.rows[3]).toEqual(['Best ever', '0:08.00']);
    expect(Number(store.get(HOTSEAT_TUNING.bestKey))).toBeCloseTo(8, 6);

    store.set(HOTSEAT_TUNING.bestKey, '7.5');
    const again = createHotSeatSession(fakeAudio());
    scriptedRun1(again);
    const r = scriptedRace();
    again.setup(2);
    again.startRun(r.race, 2);
    for (let i = 0; i < 600; i++) {
      r.advance(20);
      again.step(r.race, NO_INPUT, DT);
    }
    const second = again.finish(r.race);
    expect(second.kind === 'results' && second.headline).toBe('Dead heat!');
    expect(second.kind === 'results' && second.rows[3]).toEqual(['Best ever', '0:07.50']);
    expect(store.get(HOTSEAT_TUNING.bestKey)).toBe('7.5');
  });

  it('plays on without storage', () => {
    const session = createHotSeatSession(fakeAudio());
    scriptedRun1(session);
    const s = scriptedRace();
    session.setup(2);
    session.startRun(s.race, 2);
    for (let i = 0; i < 600; i++) {
      s.advance(20);
      session.step(s.race, NO_INPUT, DT);
    }
    const card = session.finish(s.race);
    expect(card.kind === 'results' && card.rows[3]).toEqual(['Best ever', '0:10.00']);
  });
});

// --- The real track with the dev autopilot driving both players. ---

/** The engine's dev autopilot: the rival AI drives the player's kart on its racing line. */
function autopilot(race: Race, dt: number): KartInput {
  return rivalInput(race.player, track, { rivalProgress: 0, playerProgress: 0, player: race.rival }, dt);
}

function driveRun(session: ModeSession, run: number, onStep?: (race: Race) => void) {
  const setup = session.setup(run);
  const race = createRace(withLaps(track, setup.laps), { rival: setup.rival === 'ai' });
  session.startRun(race, run);
  for (let i = 0; i < 60 * 180 && !race.finished; i++) {
    const input = autopilot(race, DT);
    race.step(input, DT);
    session.step(race, input, DT);
    onStep?.(race);
  }
  expect(race.finished).toBe(true);
  for (let i = 0; i < 84; i++) race.coast(DT);
  return { race, finish: session.finish(race) };
}

describe('hot seat on the Malibu track', () => {
  it('the same autopilot twice is a dead heat, with the ghost on the player and the delta at zero', () => {
    const audio = fakeAudio();
    const session = HOTSEAT_MODE.create({ audio } as never);
    const first = driveRun(session, 1);
    expect(first.finish.kind).toBe('intermission');
    const time1 = first.race.totalTime();
    expect(time1).toBeGreaterThan(40);
    expect(time1).toBeLessThan(90);

    let maxGhostDistance = 0;
    let maxDelta = 0;
    const second = driveRun(session, 2, (race) => {
      const g = session.ghost!(race)!;
      maxGhostDistance = Math.max(
        maxGhostDistance,
        Math.hypot(g.position.x - race.player.position.x, g.position.z - race.player.position.z),
      );
      const right = session.hud(race).right!;
      maxDelta = Math.max(maxDelta, Math.abs(Number(right)));
    });
    expect(maxGhostDistance).toBeLessThan(0.5);
    expect(maxDelta).toBeLessThan(0.1);
    expect(audio.sfx).not.toHaveBeenCalled();
    expect(second.finish.kind).toBe('results');
    if (second.finish.kind !== 'results') return;
    expect(second.finish.headline).toBe('Dead heat!');
    expect(second.finish.rows[2]).toEqual(['Gap', '+0.00']);
    expect(second.finish.rows[0][1]).toBe(second.finish.rows[1][1]);
    // The ghost parks at the line once the recording is over.
    const parked = session.ghost!(second.race)!;
    expect(parked.speed).toBe(0);
  });
});
