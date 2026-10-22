/** Tide Rush: outrun the rising tide for as long as you can. STUB: the agent building the mode replaces this file. */
import type { GameMode } from '../types';
import { UNLIMITED_LAPS } from '../../game/race';

const SECONDS = 20;

export const TIDE_MODE: GameMode = {
  info: {
    id: 'tide',
    name: 'Tide Rush',
    icon: '🌊',
    tagline: 'The tide is coming in behind you. How far can you get?',
  },
  create: () => ({
    setup: () => ({ laps: UNLIMITED_LAPS, rival: 'none' }),
    startRun() {},
    step() {},
    isOver: (race) => race.time >= SECONDS,
    hud: () => ({ left: '🌊 -- m', right: '0 m' }),
    render() {},
    finish(race) {
      return {
        kind: 'results',
        headline: 'Washed out!',
        won: null,
        rows: [['Distance', `${Math.round(race.playerProgress.progress)} m`]],
        again: 'Run again',
      };
    },
    dispose() {},
  }),
};
