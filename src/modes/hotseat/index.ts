/** Hot Seat: two players, one phone, one lap each. STUB: the agent building the mode replaces this file. */
import type { GameMode, ModeSession } from '../types';
import { formatLapTime } from '../../ui/format';

export const HOTSEAT_MODE: GameMode = {
  info: {
    id: 'hotseat',
    name: 'Hot Seat',
    icon: '🤝',
    tagline: 'Two players, one phone. One lap each, best lap wins.',
  },
  create: () => createHotSeatSession(),
};

function createHotSeatSession(): ModeSession {
  const times: number[] = [];
  let run = 1;
  return {
    setup: () => ({ laps: 1, rival: 'none' }),
    startRun(_race, n) {
      run = n;
    },
    step() {},
    isOver: () => false,
    hud: () => ({ left: `Player ${run}` }),
    render() {},
    finish(race) {
      times.push(race.totalTime());
      if (times.length < 2) {
        return {
          kind: 'intermission',
          headline: 'Pass the phone',
          lines: [`Player 1: ${formatLapTime(times[0])}`, 'Player 2, your turn.'],
          button: "I'm ready",
        };
      }
      const [a, b] = times;
      return {
        kind: 'results',
        headline: `Player ${b < a ? 2 : 1} wins!`,
        won: null,
        rows: [
          ['Player 1', formatLapTime(a)],
          ['Player 2', formatLapTime(b)],
        ],
        again: 'Rematch',
      };
    },
    dispose() {},
  };
}
