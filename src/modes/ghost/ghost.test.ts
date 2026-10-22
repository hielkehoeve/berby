import { describe, expect, it } from 'vitest';
import type { KartInput } from '../../shared/types';
import { buildTrack } from '../../sim/track';
import { rivalInput } from '../../sim/rival';
import { MALIBU } from '../../tracks/malibu';
import { createRace, withLaps, type Race } from '../../game/race';
import { formatLapTime } from '../../ui/format';
import { isRecording, type Recording } from '../shared/recording';
import {
  createBestStore,
  fasterOf,
  formatDelta,
  ghostDelta,
  GHOST_TUNING,
  parseBest,
  updateStanding,
  type BestRun,
  type BestStore,
} from './ghost-lap';
import { createGhostSession, GHOST_MODE } from './index';

const track = buildTrack(MALIBU);
const DT = 1 / 60;
const BRAKE: KartInput = { steer: 0, throttle: 0, brake: 1 };

/** A short straight run: hz 1, 10 m per second from progress 0, four seconds. */
const STRAIGHT: Recording = {
  hz: 1,
  x: [0, 0, 0, 0, 0],
  z: [0, -10, -20, -30, -40],
  h: [0, 0, 0, 0, 0],
  p: [0, 10, 20, 30, 40],
  time: 4,
};

function fakeStore(initial: BestRun | null = null, canSave = true) {
  const saved: BestRun[] = [];
  const store: BestStore & { saved: BestRun[] } = {
    saved,
    load: () => initial,
    save(run) {
      saved.push(run);
      return canSave;
    },
  };
  return store;
}

function fakeAudio() {
  const played: string[] = [];
  return { played, sfx: (name: string) => void played.push(name) };
}

/** A race-shaped object for HUD tests, so they need no sim. */
function fakeRace(time: number, progress: number, finished = false): Race {
  return { time, playerProgress: { progress }, finished, totalTime: () => time } as unknown as Race;
}

/** The engine's dev autopilot: the rival AI drives the player's kart. */
function autopilot(race: Race, dt: number): KartInput {
  return rivalInput(race.player, track, { rivalProgress: 0, playerProgress: 0, player: race.rival }, dt);
}

/**
 * Drive one lap the way the engine does (countdown HUD, then step/hud/ghost per fixed step) and
 * return what the session showed along the way. `brakeFor` seconds of braking first makes it slow.
 */
function driveLap(store: BestStore, brakeFor = 0) {
  const audio = fakeAudio();
  const session = createGhostSession(store, audio);
  const setup = session.setup(1);
  const race = createRace(withLaps(track, setup.laps), { rival: false });
  session.startRun(race, 1);
  const countdownHud = { ...session.hud(race) };
  const countdownGhost = session.ghost!(race);
  const statuses = new Set<string>();
  const ghostGaps: number[] = [];
  const deltas: string[] = [];
  let ghostObject: unknown = null;
  let sameGhost = true;
  while (!race.finished && race.time < 180) {
    const input = race.time < brakeFor ? BRAKE : autopilot(race, DT);
    race.step(input, DT);
    session.step(race, input, DT);
    const hud = session.hud(race);
    statuses.add(hud.status ?? '');
    deltas.push(hud.right!);
    const ghost = session.ghost!(race);
    if (ghost) {
      if (ghostObject === null) ghostObject = ghost;
      else if (ghost !== ghostObject) sameGhost = false;
      ghostGaps.push(Math.hypot(ghost.position.x - race.player.position.x, ghost.position.z - race.player.position.z));
    }
  }
  expect(race.finished).toBe(true);
  // The coast: the engine keeps asking for the HUD and the ghost until the card shows.
  for (let i = 0; i < 84; i++) race.coast(DT);
  const coastHud = { ...session.hud(race) };
  const finish = session.finish(race);
  return {
    race,
    session,
    audio,
    countdownHud,
    countdownGhost,
    statuses,
    deltas,
    ghostGaps,
    sameGhost,
    coastHud,
    finish,
  };
}

describe('parseBest', () => {
  it('rejects missing, corrupt and older values', () => {
    expect(parseBest(null)).toBeNull();
    expect(parseBest('fast')).toBeNull();
    expect(parseBest({})).toBeNull();
    expect(parseBest({ time: 58.1 })).toBeNull();
    expect(parseBest({ time: -1, recording: STRAIGHT })).toBeNull();
    expect(parseBest({ time: Number.NaN, recording: STRAIGHT })).toBeNull();
    // An older format: a bare samples array instead of a recording.
    expect(parseBest({ time: 58.1, recording: { samples: [[0, 0, 0]] } })).toBeNull();
    expect(parseBest({ time: 58.1, recording: { ...STRAIGHT, h: [0] } })).toBeNull();
  });

  it('accepts a time with a recording', () => {
    const best = parseBest({ time: 4, recording: STRAIGHT, extra: true });
    expect(best).toEqual({ time: 4, recording: STRAIGHT });
  });

  it('picks the faster of two runs', () => {
    const a = { time: 4, recording: STRAIGHT };
    const b = { time: 3, recording: STRAIGHT };
    expect(fasterOf(null, null)).toBeNull();
    expect(fasterOf(a, null)).toBe(a);
    expect(fasterOf(null, b)).toBe(b);
    expect(fasterOf(a, b)).toBe(b);
    expect(fasterOf(b, a)).toBe(b);
  });
});

describe('createBestStore without localStorage (node)', () => {
  it('reports the failed save and still serves the run from memory', () => {
    const store = createBestStore('berby.test.best');
    expect(store.load()).toBeNull();
    const run = { time: 4, recording: STRAIGHT };
    expect(store.save(run)).toBe(false);
    expect(store.load()).toBe(run);
    expect(store.save({ time: 5, recording: STRAIGHT })).toBe(false);
    expect(store.load()?.time).toBe(5);
  });
});

describe('delta', () => {
  it('formats a gap with a sign and two decimals', () => {
    expect(formatDelta(-0.42)).toBe('−0.42');
    expect(formatDelta(1.234)).toBe('+1.23');
    expect(formatDelta(0)).toBe('+0.00');
    expect(formatDelta(-0.004)).toBe('+0.00');
    expect(formatDelta(65.5)).toBe('+65.50');
    expect(formatDelta(-61.006)).toBe('−61.01');
  });

  it('is negative when the player reached the progress sooner than the ghost', () => {
    // The ghost was at progress 20 after 2 s.
    expect(ghostDelta(STRAIGHT, 20, 1.5)).toBeCloseTo(-0.5, 9);
    expect(ghostDelta(STRAIGHT, 20, 2.5)).toBeCloseTo(0.5, 9);
    expect(ghostDelta(STRAIGHT, 25, 2.5)).toBeCloseTo(0, 9);
    // Behind the first sample (driving backwards) the ghost's time is 0: the whole clock counts.
    expect(ghostDelta(STRAIGHT, -30, 2)).toBe(2);
    // Past the last sample the ghost's full time counts.
    expect(ghostDelta(STRAIGHT, 99, 3)).toBe(-1);
  });

  it('switches the standing only outside the band and holds inside it', () => {
    const band = GHOST_TUNING.statusBand;
    expect(updateStanding('even', 0)).toBe('even');
    expect(updateStanding('even', band / 2)).toBe('even');
    expect(updateStanding('even', band)).toBe('behind');
    expect(updateStanding('behind', -band / 2)).toBe('behind');
    expect(updateStanding('behind', 0.01)).toBe('behind');
    expect(updateStanding('behind', -band)).toBe('ahead');
    expect(updateStanding('ahead', band - 0.01)).toBe('ahead');
    expect(updateStanding('ahead', band)).toBe('behind');
  });
});

describe('session HUD', () => {
  it('shows no ghost when there is no best', () => {
    const session = createGhostSession(fakeStore(), fakeAudio());
    expect(session.setup(1)).toEqual({ laps: 1, rival: 'ghost' });
    const race = fakeRace(0, 0);
    session.startRun(race, 1);
    expect(session.hud(race)).toMatchObject({ left: '👻 no ghost yet', right: '--', status: '' });
    expect(session.hud(race).center).toBeUndefined();
    expect(session.ghost!(fakeRace(2, 30))).toBeNull();
  });

  it('shows the best, a calm delta and the standing', () => {
    const session = createGhostSession(fakeStore({ time: 4, recording: STRAIGHT }), fakeAudio());
    session.startRun(fakeRace(0, 0), 1);
    // The countdown: progress is not initialised yet, so nothing is read into it.
    expect(session.hud(fakeRace(0, 0))).toMatchObject({ left: '👻 0:04.00', right: '+0.00', status: '' });
    // 1 s in, at 12 m: the ghost needed 1.2 s, so 0.2 s ahead, inside the band.
    expect(session.hud(fakeRace(1, 12))).toMatchObject({ right: '−0.20', status: '' });
    expect(session.hud(fakeRace(1.9, 12))).toMatchObject({ right: '+0.70', status: 'Ghost ahead' });
    // Back inside the band the line holds; across it, it flips.
    expect(session.hud(fakeRace(2.1, 20)).status).toBe('Ghost ahead');
    const same = session.hud(fakeRace(2.1, 20));
    expect(session.hud(fakeRace(2.1, 20))).toBe(same);
    expect(session.hud(fakeRace(2.6, 30))).toMatchObject({ right: '−0.40', status: "You're ahead" });
  });

  it('keeps a positive delta when the player drives backwards past the first sample', () => {
    const session = createGhostSession(fakeStore({ time: 4, recording: STRAIGHT }), fakeAudio());
    session.startRun(fakeRace(0, 0), 1);
    expect(session.hud(fakeRace(3, -20))).toMatchObject({ right: '+3.00', status: 'Ghost ahead' });
    expect(session.hud(fakeRace(3.5, -25)).right).toBe('+3.50');
  });

  it('places one reused ghost state along the recording, hidden during the countdown', () => {
    const session = createGhostSession(fakeStore({ time: 4, recording: STRAIGHT }), fakeAudio());
    expect(session.ghost!(fakeRace(0, 0))).toBeNull();
    const a = session.ghost!(fakeRace(1.5, 0))!;
    expect(a.position.z).toBeCloseTo(-15, 9);
    expect(a.speed).toBeCloseTo(10, 9);
    const b = session.ghost!(fakeRace(3, 0))!;
    expect(b).toBe(a);
    expect(b.position.z).toBeCloseTo(-30, 9);
    // Clamped past the end: the ghost parks at the line.
    expect(session.ghost!(fakeRace(99, 0))!.position.z).toBeCloseTo(-40, 9);
  });
});

describe('session over a real lap', () => {
  const first = driveLap(fakeStore());

  it('records the first lap as the first best', () => {
    expect(first.countdownHud).toMatchObject({ left: '👻 no ghost yet', right: '--', status: '' });
    expect(first.countdownGhost).toBeNull();
    expect(first.ghostGaps).toHaveLength(0);
    expect([...first.statuses]).toEqual(['', 'New record!']);
    expect(first.coastHud.status).toBe('New record!');
    expect(first.finish).toEqual({
      kind: 'results',
      headline: 'New best!',
      won: true,
      rows: [
        ['Your lap', expect.stringMatching(/^0:\d\d\.\d\d$/)],
        ['Previous best', '--'],
      ],
      again: 'Go again',
    });
    expect(first.audio.played).toEqual(['bonus']);
  });

  const store = fakeStore();
  driveLap(store);
  const run = store.saved[0];

  it('saves a quantized recording of the whole lap', () => {
    expect(store.saved).toHaveLength(1);
    expect(isRecording(run.recording)).toBe(true);
    expect(run.recording.hz).toBe(GHOST_TUNING.recordHz);
    expect(run.time).toBeGreaterThan(40);
    expect(run.time).toBeLessThan(90);
    expect(run.recording.time).toBeCloseTo(run.time, 2);
    expect(run.recording.x.length).toBeCloseTo(run.time * GHOST_TUNING.recordHz, -1);
    const cm = (v: number) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6;
    expect(run.recording.x.every(cm) && run.recording.h.every(cm) && run.recording.p.every(cm)).toBe(true);
    expect(run.recording.p[0]).toBeLessThan(0);
    expect(run.recording.p[run.recording.p.length - 1]).toBeGreaterThan(track.length - 20);
    expect(JSON.stringify(run).length).toBeLessThan(80_000);
  });

  it('replays the same lap as a ghost at the player with a delta near zero', () => {
    const again = driveLap(fakeStore(run));
    expect(again.countdownHud).toMatchObject({ left: `👻 ${formatLapTime(run.time)}`, right: '+0.00', status: '' });
    expect(again.countdownGhost).toBeNull();
    expect(again.sameGhost).toBe(true);
    expect(again.ghostGaps.length).toBeGreaterThan(1000);
    expect(Math.max(...again.ghostGaps)).toBeLessThan(1);
    const worst = Math.max(...again.deltas.map((d) => Math.abs(parseFloat(d.replace('−', '-')))));
    expect(worst).toBeLessThanOrEqual(0.05);
    expect([...again.statuses]).toEqual(['']);
    // The identical lap is not a new best.
    expect(again.coastHud.status).toBe('');
    expect(again.finish).toEqual({
      kind: 'results',
      headline: 'Lap done',
      won: null,
      rows: [
        ['Your lap', expect.any(String)],
        ['Best lap', expect.any(String)],
        ['Gap', '+0.00'],
      ],
      again: 'Go again',
    });
    expect(again.audio.played).toEqual([]);
  });

  it('loses to the ghost after a slow start and keeps the old best', () => {
    const slowStore = fakeStore(run);
    const slow = driveLap(slowStore, 1.5);
    expect(slow.statuses.has('Ghost ahead')).toBe(true);
    expect(slow.statuses.has("You're ahead")).toBe(false);
    expect(slow.coastHud.status).toBe('Ghost ahead');
    expect(slow.finish.kind).toBe('results');
    if (slow.finish.kind !== 'results') return;
    expect(slow.finish.headline).toBe('Lap done');
    expect(slow.finish.won).toBeNull();
    expect(slow.finish.rows[2][0]).toBe('Gap');
    expect(parseFloat(slow.finish.rows[2][1])).toBeGreaterThan(0.5);
    expect(slow.finish.again).toBe('Go again');
    expect(slowStore.saved).toHaveLength(0);
    expect(slow.audio.played).toEqual([]);
  });

  it('beats a slower ghost: a new record, saved, even when storage is off', () => {
    // The same run stretched to take 5 s longer: a lower sample rate replays it slower.
    const stretch = run.time / (run.time + 5);
    const slowBest: BestRun = {
      time: run.time + 5,
      recording: { ...run.recording, hz: run.recording.hz * stretch, time: run.time + 5 },
    };
    const offStore = fakeStore(slowBest, false);
    const win = driveLap(offStore);
    expect(win.statuses.has("You're ahead")).toBe(true);
    expect(win.statuses.has('Ghost ahead')).toBe(false);
    expect(win.statuses.has('New record!')).toBe(true);
    expect(win.coastHud.status).toBe('New record!');
    expect(win.ghostGaps[win.ghostGaps.length - 1]).toBeGreaterThan(5);
    expect(win.finish).toEqual({
      kind: 'results',
      headline: 'New best!',
      won: true,
      rows: [
        ['Your lap', expect.any(String)],
        ['Previous best', expect.any(String)],
      ],
      again: 'Go again',
    });
    expect(offStore.saved).toHaveLength(1);
    expect(offStore.saved[0].time).toBeCloseTo(run.time, 6);
    expect(win.audio.played).toEqual(['bonus']);
  });
});

describe('GHOST_MODE', () => {
  it('has the card and builds a session from the context', () => {
    expect(GHOST_MODE.info).toMatchObject({ id: 'ghost', name: 'Ghost Lap', icon: '👻' });
    expect(GHOST_MODE.info.tagline.length).toBeLessThanOrEqual(60);
    const audio = fakeAudio();
    const session = GHOST_MODE.create({ track, audio } as never);
    expect(session.setup(1)).toEqual({ laps: 1, rival: 'ghost' });
    expect(session.hud(fakeRace(0, 0)).left).toBe('👻 no ghost yet');
    session.dispose();
  });
});
