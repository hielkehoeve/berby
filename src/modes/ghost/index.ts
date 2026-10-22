/** Ghost Lap: a solo lap against the ghost of your best. STUB: the agent building the mode replaces this file. */
import type { GameMode } from '../types';
import { formatLapTime } from '../../ui/format';

export const GHOST_MODE: GameMode = {
  info: { id: 'ghost', name: 'Ghost Lap', icon: '👻', tagline: 'One flat-out lap against the ghost of your best.' },
  create: () => ({
    setup: () => ({ laps: 1, rival: 'ghost' }),
    startRun() {},
    step() {},
    isOver: () => false,
    hud: () => ({ left: 'Ghost' }),
    render() {},
    ghost: () => null,
    finish(race) {
      return {
        kind: 'results',
        headline: 'Lap done',
        won: null,
        rows: [['Your lap', formatLapTime(race.totalTime())]],
      };
    },
    dispose() {},
  }),
};
