// Lap and checkpoint tracking (MVP.md "Laps and checkpoints").
//
// A checkpoint is passed when the kart's centerline distance crosses the checkpoint distance
// moving forward (wrap-around aware) while the kart is inside the barriers. Checkpoints must be
// passed in order; crossing the start/finish line (checkpoint 0) completes a lap only when every
// other checkpoint has been passed. Reverse crossings un-pass the checkpoint again, so driving
// backwards never gains anything.
//
// Karts start a few meters BEFORE the line, so the first forward crossing of checkpoint 0 only
// starts lap 1. Progress is laps completed * length + distance along the lap, unwrapped relative
// to the last passed checkpoint, so it is continuous across the line and about -10 on the grid.
//
// Lap 1 is timed from the first update (the race clock start), later laps from line to line, so
// the lap times add up to finishTime. Crossing times are interpolated between steps.
import type { KartState, RaceProgress, Track } from '../shared/types';
import { clamp, wrapDistance } from '../shared/math';

interface RaceBookkeeping {
  prevDistance: number;
  prevTime: number;
  /** -1 before the start line has been crossed, then the number of completed laps. */
  lapsDone: number;
  /** Race-time at which each lap started; lapStarts[0] is the race start. */
  lapStarts: number[];
}

/** Private bookkeeping per RaceProgress, kept off the frozen contract type. */
const books = new WeakMap<RaceProgress, RaceBookkeeping>();

/** Slack beyond the barriers within which a crossing still counts, in meters. */
const BARRIER_SLACK = 0.5;

/** Wrap a distance difference along the loop into [-length/2, length/2). */
function signedWrap(d: number, length: number): number {
  return d - length * Math.floor((d + length / 2) / length);
}

export function createRaceProgress(): RaceProgress {
  return { lap: 1, nextCheckpoint: 0, progress: 0, lapTimes: [], finished: false };
}

/** Update a kart's race progress. raceTime is the elapsed race time in seconds. */
export function updateRaceProgress(p: RaceProgress, kart: KartState, track: Track, raceTime: number): void {
  if (p.finished) return;
  const n = track.checkpoints.length;
  const length = track.length;
  const laps = track.definition.laps;
  const { sample, lateral } = track.nearest(kart.position);
  const dist = sample.distance;

  let book = books.get(p);
  if (!book) {
    book = { prevDistance: dist, prevTime: raceTime, lapsDone: -1, lapStarts: [raceTime] };
    books.set(p, book);
  }

  const inside = Math.abs(lateral) <= track.definition.barrierOffset + BARRIER_SLACK;
  const delta = signedWrap(dist - book.prevDistance, length);
  const stepTime = raceTime - book.prevTime;

  if (inside && delta > 0) {
    // Forward: pass checkpoints[next] while it lies in [prev, prev + delta).
    for (let guard = 0; guard < n && !p.finished; guard++) {
      const cp = track.checkpoints[p.nextCheckpoint];
      const ahead = wrapDistance(cp - book.prevDistance, length);
      if (ahead >= delta) break;
      const crossTime = book.prevTime + stepTime * (ahead / delta);
      if (p.nextCheckpoint === 0) {
        book.lapsDone++;
        if (book.lapsDone >= 1) {
          p.lapTimes.push(crossTime - book.lapStarts[book.lapStarts.length - 1]);
          book.lapStarts.push(crossTime);
        }
        if (book.lapsDone >= laps) {
          p.finished = true;
          p.finishTime = crossTime;
        }
      }
      p.nextCheckpoint = (p.nextCheckpoint + 1) % n;
    }
  } else if (inside && delta < 0) {
    // Reverse: un-pass checkpoints[next - 1] while it lies in (prev + delta, prev].
    for (let guard = 0; guard < n; guard++) {
      const index = (p.nextCheckpoint - 1 + n) % n;
      const behind = wrapDistance(book.prevDistance - track.checkpoints[index], length);
      if (behind <= 0 || behind > -delta) break;
      if (index === 0) {
        if (book.lapsDone >= 1) {
          p.lapTimes.pop();
          book.lapStarts.pop();
        }
        book.lapsDone--;
      }
      p.nextCheckpoint = index;
    }
  }

  // Progress: unwrap the distance relative to the last passed checkpoint.
  const last = track.checkpoints[(p.nextCheckpoint - 1 + n) % n];
  p.progress = book.lapsDone * length + last + signedWrap(dist - last, length);
  p.lap = clamp(book.lapsDone + 1, 1, laps);

  book.prevDistance = dist;
  book.prevTime = raceTime;
}
