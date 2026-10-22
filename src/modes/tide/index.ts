/**
 * Tide Rush: a solo survival run. The tide comes in behind you and gets faster; every braked
 * corner, every trip into the sand and every barrier hit lets it gain. How far can you get?
 *
 * The rules live in tide.ts (pure, tested), the constants in tuning.ts and the wave in visuals.ts
 * (the only file here that imports Three.js).
 */
import type { GameMode, ModeContext, ModeSession } from '../types';
import { UNLIMITED_LAPS, type Race } from '../../game/race';
import { loadJson, saveJson } from '../../game/storage';
import { TIDE_TUNING } from './tuning';
import {
  createTideRun,
  resetTideRun,
  TIDE_EVENT,
  tideGap,
  tideHud,
  tideProgressAt,
  tideResults,
  unwrapGridDistance,
  updateTideRun,
} from './tide';
import { createTideVisuals } from './visuals';

export const TIDE_MODE: GameMode = {
  info: {
    id: 'tide',
    name: 'Tide Rush',
    icon: '🌊',
    tagline: 'The tide is coming in behind you. How far can you get?',
  },
  create: (ctx) => createTideSession(ctx),
};

/**
 * The player's progress on the grid, before the first step has set RaceProgress.progress: the
 * kart's centerline distance, unwrapped to the small negative value the grid has.
 */
function gridProgress(race: Race): number {
  return unwrapGridDistance(race.track.nearest(race.player.position).sample.distance, race.track.length);
}

export function createTideSession(ctx: ModeContext): ModeSession {
  const run = createTideRun();
  const visuals = createTideVisuals(ctx.scene, ctx.track);
  let startProgress = 0;

  /** Meters since the grid; RaceProgress.progress is only valid once the race has stepped. */
  const distanceOf = (race: Race) => (race.time > 0 ? race.playerProgress.progress - startProgress : 0);

  return {
    setup: () => ({ laps: UNLIMITED_LAPS, rival: 'none' }),
    startRun(race) {
      resetTideRun(run);
      startProgress = gridProgress(race);
    },
    step(race) {
      const events = updateTideRun(run, race.time, distanceOf(race), race.playerProgress.lap);
      if (events & TIDE_EVENT.warn) ctx.audio.sfx('warn');
      if (events & TIDE_EVENT.caught) ctx.audio.sfx('splash');
    },
    isOver: () => run.caught,
    hud: () => tideHud(run),
    render(race, _dt, elapsed) {
      // The clock keeps running through the coast after the catch, so the wave rolls on over the
      // stopped kart while the results card is on its way.
      const time = race.time;
      visuals.update(tideProgressAt(time, startProgress), tideGap(time, distanceOf(race)), elapsed);
    },
    finish() {
      const saved = loadJson<unknown>(TIDE_TUNING.bestKey, 0);
      const previous = typeof saved === 'number' && Number.isFinite(saved) ? saved : 0;
      const result = tideResults(run.distance, run.caughtAt, previous);
      if (result.newBest) saveJson(TIDE_TUNING.bestKey, result.best);
      return { kind: 'results', headline: result.headline, won: result.won, rows: result.rows, again: 'Run again' };
    },
    dispose() {
      visuals.dispose();
    },
  };
}
