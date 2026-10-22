/**
 * Glitter Rush: a solo score attack. Glitter stars line the track in lanes; grab as many as you
 * can before the clock runs out. Reading the lane pattern ahead and threading the kart through it
 * at full speed is the fun; a chain multiplier rewards clean runs, and gold stars on the outside
 * of the corners trade line for points and seconds.
 *
 * The layout (layout.ts), the rules (rules.ts) and the feel constants (tuning.ts) are pure and
 * tested; visuals.ts owns the Three.js side. This file wires them to the mode contract.
 */
import type { GameMode, ModeContext, ModeHud, ModeSession } from '../types';
import { UNLIMITED_LAPS } from '../../game/race';
import { loadJson, saveJson } from '../../game/storage';
import { formatRaceTime } from '../../ui/format';
import { wrapDistance } from '../../shared/math';
import { layoutStars } from './layout';
import {
  createRushEvents,
  createRushState,
  isRushOver,
  pickupPitch,
  resetRushState,
  stepRush,
  tickAt,
  timeLeft,
} from './rules';
import { RUSH_TUNING, type RushTuning } from './tuning';
import { createStarVisuals } from './visuals';

/** localStorage key of the best score. */
export const BEST_KEY = 'berby.rush.best';

export const RUSH_MODE: GameMode = {
  info: {
    id: 'rush',
    name: 'Glitter Rush',
    icon: '✨',
    tagline: 'Grab every glitter star you can before time runs out.',
  },
  create: (ctx) => createRushSession(ctx),
};

export function createRushSession(ctx: ModeContext, tuning: RushTuning = RUSH_TUNING): ModeSession {
  const { track, audio } = ctx;
  const stars = layoutStars(track, tuning);
  const state = createRushState(stars.length);
  const events = createRushEvents();
  const visuals = createStarVisuals(ctx.scene, stars, tuning);

  let status = '';
  let statusUntil = 0;
  /** Clock reading after the previous step, for the ticks. */
  let prevLeft = tuning.seconds;

  // The HUD object is reused; its strings are rebuilt only when what they show changes.
  const hud: ModeHud = { left: '', center: '', right: '', status: undefined };
  let hudScore = -1;
  let hudTenths = -1;
  let hudMultiplier = -1;
  let hudChain = -1;

  const show = (line: string, time: number) => {
    status = line;
    statusUntil = time + tuning.statusSeconds;
  };

  return {
    setup: () => ({ laps: UNLIMITED_LAPS, rival: 'none' }),
    startRun() {
      resetRushState(state);
      status = '';
      statusUntil = 0;
      prevLeft = tuning.seconds;
    },
    step(race) {
      const time = race.time;
      const lapDistance = wrapDistance(race.playerProgress.progress, track.length);
      stepRush(state, stars, track.length, race.player.position, lapDistance, time, tuning, events);

      if (events.multiplierRose) show(`×${state.multiplier}!`, time);
      else if (events.gold) show(`+${tuning.goldBonusSeconds} s!`, time);
      else if (events.chainLost) show('Chain lost', time);

      if (events.gold) audio.sfx('bonus');
      else if (events.glitter) audio.sfx('pickup', pickupPitch(state.chain, tuning));

      const left = timeLeft(state, time, tuning);
      if (tickAt(prevLeft, left, tuning)) audio.sfx('tick');
      prevLeft = left;
    },
    isOver: (race) => isRushOver(state, race.time, tuning),
    hud(race) {
      if (state.score !== hudScore) {
        hudScore = state.score;
        hud.left = `✨ ${state.score}`;
      }
      const tenths = Math.max(0, Math.floor(timeLeft(state, race.time, tuning) * 10 + 1e-6));
      if (tenths !== hudTenths) {
        hudTenths = tenths;
        hud.center = formatRaceTime(tenths / 10);
      }
      if (state.multiplier !== hudMultiplier || state.chain !== hudChain) {
        hudMultiplier = state.multiplier;
        hudChain = state.chain;
        hud.right = `×${state.multiplier} · chain ${state.chain}`;
      }
      hud.status = race.time < statusUntil ? status : undefined;
      return hud;
    },
    render(race, _dt, elapsed) {
      visuals.update(state.takenAt, race.time, elapsed);
    },
    finish() {
      const best = loadJson<number>(BEST_KEY, 0);
      const isBest = state.score > best;
      if (isBest) saveJson(BEST_KEY, state.score);
      return {
        kind: 'results',
        headline: isBest ? 'New best!' : "Time's up!",
        won: isBest ? true : null,
        rows: [
          ['Glitter', String(state.score)],
          ['Best', String(Math.max(best, state.score))],
          ['Longest chain', String(state.longestChain)],
        ],
        again: 'Rush again',
      };
    },
    dispose() {
      visuals.dispose();
    },
  };
}
