/** Glitter Rush: collect as much glitter as you can before the timer runs out. STUB: the agent building the mode replaces this file. */
import type { GameMode } from '../types';
import { UNLIMITED_LAPS } from '../../game/race';

const SECONDS = 20;

export const RUSH_MODE: GameMode = {
  info: {
    id: 'rush',
    name: 'Glitter Rush',
    icon: '✨',
    tagline: 'Grab every glitter star you can before time runs out.',
  },
  create: () => ({
    setup: () => ({ laps: UNLIMITED_LAPS, rival: 'none' }),
    startRun() {},
    step() {},
    isOver: (race) => race.time >= SECONDS,
    hud: (race) => ({ left: '✨ 0', right: `${Math.max(0, SECONDS - race.time).toFixed(1)} s` }),
    render() {},
    finish() {
      return { kind: 'results', headline: "Time's up!", won: null, rows: [['Glitter', '0']], again: 'Rush again' };
    },
    dispose() {},
  }),
};
