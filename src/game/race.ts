/**
 * The race model: two karts, their progress, the clock and the winner. Pure sim integration,
 * no DOM and no Three.js, so it runs in node tests.
 */
import type { KartInput, KartState, RaceProgress, Track, Vec2 } from '../shared/types';
import { forwardToHeading, leftOf } from '../shared/math';
import { createKartState, resolveKartCollision, stepKart } from '../sim/kart';
import { stepRival } from '../sim/rival';
import { createRaceProgress, updateRaceProgress } from '../sim/race';

export type Winner = 'player' | 'rival';

/** Lap count for runs that a mode ends itself (a timer, a chaser); the lap pill then shows the lap only. */
export const UNLIMITED_LAPS = 1_000_000;

export interface RaceOptions {
  /** false parks the rival kart on the grid: no AI, no collisions, no progress (solo modes). */
  rival?: boolean;
}

/** The same track with a different lap count; the geometry and checkpoints are shared. */
export function withLaps(track: Track, laps: number): Track {
  if (laps === track.definition.laps) return track;
  return { ...track, definition: { ...track.definition, laps } };
}

/** Starting grid: meters before the start/finish line, lateral offset (+ = left of travel). */
export const GRID = {
  player: { back: 8, lateral: -2.5 },
  rival: { back: 14, lateral: 2.5 },
} as const;

const COAST_INPUT: KartInput = { steer: 0, throttle: 0, brake: 1 };

export interface GridSlot {
  position: Vec2;
  heading: number;
}

/** A grid slot `back` meters before the start line, `lateral` meters to the left of center. */
export function gridSlot(track: Track, back: number, lateral: number): GridSlot {
  const s = track.sampleAt(track.length - back);
  const left = leftOf(s.tangent);
  return {
    position: { x: s.position.x + left.x * lateral, z: s.position.z + left.z * lateral },
    heading: forwardToHeading(s.tangent),
  };
}

export interface Race {
  readonly track: Track;
  readonly player: KartState;
  readonly rival: KartState;
  readonly playerProgress: RaceProgress;
  readonly rivalProgress: RaceProgress;
  /** Seconds since GO. */
  readonly time: number;
  /** True once the player has crossed the finish line on the last lap. */
  readonly finished: boolean;
  /** Set when finished: whoever crossed the line first. */
  readonly winner: Winner | null;
  /** One fixed step while racing. */
  step(input: KartInput, dt: number): void;
  /** One fixed step after the finish: the player brakes to a stop, the rival keeps driving. */
  coast(dt: number): void;
  /** The player's position, 1 or 2. */
  playerPosition(): 1 | 2;
  bestLap(): number | null;
  totalTime(): number;
}

export function createRace(track: Track, options: RaceOptions = {}): Race {
  const hasRival = options.rival ?? true;
  const p = gridSlot(track, GRID.player.back, GRID.player.lateral);
  const r = gridSlot(track, GRID.rival.back, GRID.rival.lateral);
  const player = createKartState(p.position, p.heading);
  const rival = createKartState(r.position, r.heading);
  const playerProgress = createRaceProgress();
  const rivalProgress = createRaceProgress();
  let time = 0;
  let finished = false;
  let winner: Winner | null = null;

  const stepRivalKart = (dt: number) => {
    // `player` lets Vix plan a pass instead of sitting on the player's bumper.
    stepRival(
      rival,
      track,
      { rivalProgress: rivalProgress.progress, playerProgress: playerProgress.progress, player },
      dt,
    );
  };

  const race: Race = {
    track,
    player,
    rival,
    playerProgress,
    rivalProgress,
    get time() {
      return time;
    },
    get finished() {
      return finished;
    },
    get winner() {
      return winner;
    },
    step(input, dt) {
      if (finished) {
        race.coast(dt);
        return;
      }
      stepKart(player, input, track, dt);
      if (hasRival) {
        stepRivalKart(dt);
        resolveKartCollision(player, rival);
      }
      time += dt;
      updateRaceProgress(playerProgress, player, track, time);
      if (hasRival) updateRaceProgress(rivalProgress, rival, track, time);
      if (playerProgress.finished) {
        finished = true;
        const rivalFirst =
          rivalProgress.finished && (rivalProgress.finishTime ?? Infinity) < (playerProgress.finishTime ?? Infinity);
        winner = rivalFirst ? 'rival' : 'player';
      }
    },
    coast(dt) {
      stepKart(player, COAST_INPUT, track, dt);
      if (hasRival) {
        stepRivalKart(dt);
        resolveKartCollision(player, rival);
      }
      time += dt;
      if (hasRival) updateRaceProgress(rivalProgress, rival, track, time);
    },
    playerPosition() {
      if (!hasRival) return 1;
      if (finished) return winner === 'player' ? 1 : 2;
      if (rivalProgress.finished) return 2;
      return playerProgress.progress >= rivalProgress.progress ? 1 : 2;
    },
    bestLap() {
      const laps = playerProgress.lapTimes;
      return laps.length ? Math.min(...laps) : null;
    },
    totalTime() {
      return playerProgress.finishTime ?? time;
    },
  };
  return race;
}
