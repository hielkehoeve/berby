/**
 * Ghost Lap: one flat-out lap from a standing start against the ghost of your best lap, saved on
 * the device. The run is recorded every step; a new best replaces the ghost for the next session.
 */
import type { GameAudio } from '../../audio/audio';
import type { Race } from '../../game/race';
import { formatLapTime } from '../../ui/format';
import type { GameMode, ModeHud, ModeSession } from '../types';
import { createGhostState, createRecorder, quantize, sampleRecording } from '../shared/recording';
import {
  createBestStore,
  formatDelta,
  ghostDelta,
  GHOST_TUNING,
  STATUS,
  updateStanding,
  type BestRun,
  type BestStore,
  type Standing,
} from './ghost-lap';

/** One store for the page: its in-memory copy carries a best across sessions when storage is off. */
const bestStore = createBestStore();

export const GHOST_MODE: GameMode = {
  info: { id: 'ghost', name: 'Ghost Lap', icon: '👻', tagline: 'One flat-out lap against the ghost of your best.' },
  create: (ctx) => createGhostSession(bestStore, ctx.audio),
};

export function createGhostSession(store: BestStore, audio: Pick<GameAudio, 'sfx'>): ModeSession {
  const best = store.load();
  const recorder = createRecorder(GHOST_TUNING.recordHz);
  const ghostState = createGhostState();
  // One HUD object, mutated in place; the formatted best never changes during the session.
  const hud: ModeHud = { left: best ? `👻 ${formatLapTime(best.time)}` : '👻 no ghost yet', right: '--', status: '' };
  let standing: Standing = 'even';
  /** The delta pill is rebuilt only when its hundredths change. */
  let shownHundredths = NaN;
  /** Set once the player crosses the line: the lap time and whether it beats the best. */
  let result: { time: number; isBest: boolean } | null = null;

  function complete(race: Race) {
    if (!result) {
      const time = race.totalTime();
      result = { time, isBest: !best || time < best.time };
    }
    return result;
  }

  /** Seconds behind the ghost (negative: ahead). Zero before the first step, frozen after the line. */
  function delta(race: Race): number {
    if (!best || race.time <= 0) return 0;
    if (result) return result.time - best.time;
    return ghostDelta(best.recording, race.playerProgress.progress, race.time);
  }

  return {
    setup: () => ({ laps: 1, rival: 'ghost' }),
    startRun() {
      recorder.reset();
      standing = 'even';
      result = null;
      shownHundredths = NaN;
      hud.right = '--';
      hud.status = '';
    },
    step(race) {
      // Not before the first step: the progress is only initialised once the race has stepped.
      recorder.record(race.time, race.player, race.playerProgress.progress);
      if (race.finished) complete(race);
    },
    isOver: () => false,
    hud(race) {
      if (best) {
        const d = delta(race);
        const h = Math.round(d * 100);
        if (h !== shownHundredths) {
          shownHundredths = h;
          hud.right = formatDelta(d);
        }
        if (!result) standing = updateStanding(standing, d);
      }
      if (result) hud.status = result.isBest ? STATUS.record : best && result.time > best.time ? STATUS.behind : '';
      else hud.status = STATUS[standing];
      return hud;
    },
    render() {},
    ghost(race) {
      // Hidden during the countdown: on the grid the ghost sits inside the player's kart.
      if (!best || race.time <= 0) return null;
      return sampleRecording(best.recording, race.time, ghostState);
    },
    finish(race) {
      const { time, isBest } = complete(race);
      const lap = formatLapTime(time);
      if (!best || isBest) {
        const run: BestRun = { time, recording: quantize(recorder.finish(time), GHOST_TUNING.decimals) };
        // False when storage is off: the card still shows, the ghost is just gone next visit.
        store.save(run);
        audio.sfx('bonus');
        return {
          kind: 'results',
          headline: 'New best!',
          won: true,
          rows: [
            ['Your lap', lap],
            ['Previous best', best ? formatLapTime(best.time) : '--'],
          ],
          again: 'Go again',
        };
      }
      return {
        kind: 'results',
        headline: 'Lap done',
        won: null,
        rows: [
          ['Your lap', lap],
          ['Best lap', formatLapTime(best.time)],
          ['Gap', formatDelta(time - best.time)],
        ],
        again: 'Go again',
      };
    },
    dispose() {},
  };
}
