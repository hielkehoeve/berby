/**
 * Hot Seat: two players, one phone, no connection. Player 1 drives a lap, passes the phone,
 * Player 2 drives the same lap against Player 1's ghost, and the faster run wins.
 *
 * Run 1 is recorded with the shared recorder; in run 2 the recording is sampled at the race
 * time for the ghost kart and at the player's progress for the live delta on the right pill.
 * The session keeps the fastest run ever driven on this phone in localStorage.
 */
import type { KartState } from '../../shared/types';
import type { GameAudio } from '../../audio/audio';
import type { Race } from '../../game/race';
import { loadJson, saveJson } from '../../game/storage';
import type { GameMode, ModeHud, ModeSession } from '../types';
import { createGhostState, createRecorder, sampleRecording, type Recording } from '../shared/recording';
import { HOTSEAT_TEXT, HOTSEAT_TUNING, type HotSeatTuning } from './tuning';
import { bestEver, formatSigned, intermissionCard, liveDelta, resultsCard, updateLead, type Lead } from './logic';

export const HOTSEAT_MODE: GameMode = {
  info: {
    id: 'hotseat',
    name: 'Hot Seat',
    icon: '🤝',
    tagline: 'Two players, one phone. One lap each, best lap wins.',
  },
  create: (ctx) => createHotSeatSession(ctx.audio),
};

/** The session for one pair of runs. `audio` is only used for the 'tick' on a change of lead. */
export function createHotSeatSession(
  audio: Pick<GameAudio, 'sfx'>,
  tuning: HotSeatTuning = HOTSEAT_TUNING,
): ModeSession {
  const recorder = createRecorder(tuning.recordHz);
  const ghostState = createGhostState();
  /** The one HUD object the engine reads every frame; its strings change only when a value does. */
  const hud: ModeHud = { left: HOTSEAT_TEXT.player[0], right: HOTSEAT_TEXT.noDelta };
  let run = 1;
  /** Player 1's run, the ghost of run 2 (null until run 1 is finished). */
  let player1: Recording | null = null;
  const times: number[] = [];
  /** The live delta of run 2, seconds, negative when Player 2 is ahead. */
  let delta = 0;
  /** The delta the right pill currently shows, in hundredths, so the string is rebuilt only on a change. */
  let shownHundredths = NaN;
  let lead: Lead = 'level';
  /** Race time until which the status line stays up. */
  let statusUntil = 0;
  let lastTick = -Infinity;

  const chasing = () => run === 2 && player1 !== null;

  function showDelta() {
    const hundredths = Math.round(delta * 100);
    if (hundredths === shownHundredths) return;
    shownHundredths = hundredths;
    hud.right = formatSigned(delta);
  }

  function announceLead(race: Race) {
    hud.status = lead === 'ahead' ? HOTSEAT_TEXT.ahead : HOTSEAT_TEXT.behind;
    statusUntil = race.time + tuning.leadHoldSeconds;
    if (race.time - lastTick < tuning.tickSpacing) return;
    lastTick = race.time;
    audio.sfx('tick');
  }

  return {
    setup: (n) => ({ laps: tuning.laps, rival: n >= 2 ? 'ghost' : 'none' }),

    startRun(race, n) {
      run = n;
      // No sample yet: the race's progress is only valid after its first step (on the grid it
      // still reads 0 instead of about -8, and the recorder keeps progress non-decreasing).
      recorder.reset();
      delta = 0;
      shownHundredths = NaN;
      lead = 'level';
      lastTick = -Infinity;
      hud.left = HOTSEAT_TEXT.player[Math.min(n, HOTSEAT_TEXT.player.length) - 1];
      if (chasing()) {
        showDelta();
        hud.status = HOTSEAT_TEXT.catch;
        statusUntil = tuning.catchSeconds;
      } else {
        hud.right = HOTSEAT_TEXT.noDelta;
        hud.status = undefined;
        statusUntil = 0;
      }
    },

    step(race) {
      recorder.record(race.time, race.player, race.playerProgress.progress);
      if (chasing()) {
        delta = liveDelta(player1 as Recording, race.playerProgress.progress, race.time);
        showDelta();
        const next = updateLead(lead, delta, tuning.leadDeadband);
        if (next !== lead) {
          lead = next;
          // Changes during the catch window are tracked silently; the message is already up.
          if (race.time >= tuning.catchSeconds) announceLead(race);
        }
      }
      if (hud.status !== undefined && race.time >= statusUntil) hud.status = undefined;
    },

    isOver: () => false,

    hud: () => hud,

    render() {},

    ghost(race): KartState | null {
      return chasing() ? sampleRecording(player1 as Recording, race.time, ghostState) : null;
    },

    finish(race) {
      const time = race.totalTime();
      const recording = recorder.finish(time);
      times.push(time);
      if (run === 1) {
        player1 = recording;
        return intermissionCard(time);
      }
      // Run 2 is recorded too (cheap, symmetric), but only Player 1's run is replayed.
      const stored = loadJson<unknown>(tuning.bestKey, null);
      const best = bestEver(stored, times[0], times[1]);
      if (best !== stored && Number.isFinite(best)) saveJson(tuning.bestKey, best);
      return resultsCard(times[0], times[1], best, tuning.deadHeat);
    },

    dispose() {},
  };
}
