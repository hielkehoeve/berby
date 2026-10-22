/** Race Vix: the classic three-lap race against the AI rival. */
import type { GameMode, ModeSession } from '../types';
import { formatLapTime } from '../../ui/format';

export const RACE_MODE: GameMode = {
  info: { id: 'race', name: 'Race Vix', icon: '🏁', tagline: 'Three laps against Vix. First across the line wins.' },
  create: (ctx) => createRaceSession(ctx.track.definition.laps),
};

export function createRaceSession(laps: number): ModeSession {
  return {
    setup: () => ({ laps, rival: 'ai' }),
    startRun() {},
    step() {},
    isOver: () => false,
    hud: () => ({}),
    render() {},
    finish(race) {
      const won = race.winner === 'player';
      const best = race.bestLap();
      return {
        kind: 'results',
        headline: won ? 'You won!' : 'Vix won',
        won,
        rows: [
          ['Total time', formatLapTime(race.totalTime())],
          ['Best lap', best === null ? '--' : formatLapTime(best)],
        ],
      };
    },
    dispose() {},
  };
}
