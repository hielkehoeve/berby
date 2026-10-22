// Headless simulation report for tuning (see .claude/skills/berby-tune/SKILL.md). Prints lap
// times, on-road share and rubber-band gaps on the current Malibu layout. Skipped unless
// BERBY_REPORT=1, so it never slows CI:  BERBY_REPORT=1 npx vitest run src/sim/report.test.ts
import { describe, it } from 'vitest';
import type { KartState, RaceProgress } from '../shared/types';
import { forwardToHeading, leftOf } from '../shared/math';
import { MALIBU } from '../tracks/malibu';
import { createKartState, resolveKartCollision } from './kart';
import { createRaceProgress, updateRaceProgress } from './race';
import { type RivalContext, rivalRubberBandFactor, stepRival } from './rival';
import { type PassResult, passScenario } from './scenarios';
import { buildTrack, curvatureAt } from './track';
import { PLAYER_TUNING, RIVAL_TUNING, RUBBER_BAND } from './tuning';

/** The game's grid slots (src/game/race.ts GRID): meters before the line, lateral offset. */
const GRID_PLAYER = { back: 8, lateral: -2.5 };
const GRID_RIVAL = { back: 14, lateral: 2.5 };

const enabled =
  (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.BERBY_REPORT === '1';

const DT = 1 / 60;
const track = buildTrack(MALIBU);

function gridKart(lateral: number, distanceBeforeLine = 10): KartState {
  const s = track.sampleAt(track.length - distanceBeforeLine);
  const left = leftOf(s.tangent);
  return createKartState(
    { x: s.position.x + left.x * lateral, z: s.position.z + left.z * lateral },
    forwardToHeading(s.tangent),
  );
}

interface Runner {
  name: string;
  kart: KartState;
  progress: RaceProgress;
  context: (other: Runner) => RivalContext;
  onRoadSteps: number;
  maxAbsLateral: number;
  minSpeed: number;
}

function runner(name: string, lateral: number, context: Runner['context']): Runner {
  return {
    name,
    kart: gridKart(lateral),
    progress: createRaceProgress(),
    context,
    onRoadSteps: 0,
    maxAbsLateral: 0,
    minSpeed: Infinity,
  };
}

/** Steps every runner with the rival AI until all have finished; returns the step count. */
function runRace(runners: Runner[], timeLimit = 400): number {
  let t = 0;
  let steps = 0;
  while (t < timeLimit && runners.some((r) => !r.progress.finished)) {
    runners.forEach((r, i) => stepRival(r.kart, track, r.context(runners[(i + 1) % runners.length]), DT));
    if (runners.length === 2) resolveKartCollision(runners[0].kart, runners[1].kart);
    t += DT;
    steps++;
    for (const r of runners) {
      updateRaceProgress(r.progress, r.kart, track, t);
      r.maxAbsLateral = Math.max(r.maxAbsLateral, Math.abs(track.nearest(r.kart.position).lateral));
      if (r.kart.onRoad) r.onRoadSteps++;
      if (t > 10 && !r.progress.finished) r.minSpeed = Math.min(r.minSpeed, r.kart.speed);
    }
  }
  return steps;
}

const f = (n: number, d = 1) => n.toFixed(d);
const laps = (p: RaceProgress) => p.lapTimes.map((l) => f(l)).join(' / ');

describe.skipIf(!enabled)('simulation report', () => {
  it('prints the tuning report for the current Malibu layout', () => {
    const lines: string[] = [];
    const out = (s = '') => lines.push(s);

    let maxCurvature = 0;
    for (let d = 0; d < track.length; d += 1) maxCurvature = Math.max(maxCurvature, Math.abs(curvatureAt(track, d)));

    out('=== Berby simulation report ===');
    out(
      `Track: ${MALIBU.name}, ${f(track.length)} m, ${track.checkpoints.length} checkpoints, tightest radius ${f(1 / maxCurvature)} m`,
    );
    out(
      `Player tuning: topSpeed ${PLAYER_TUNING.topSpeed} m/s (flat-out lap ${f(track.length / PLAYER_TUNING.topSpeed)} s), grip ${PLAYER_TUNING.maxLateralAccel} m/s²`,
    );
    out(
      `Rival tuning: corneringGripFraction ${RIVAL_TUNING.corneringGripFraction}, rubber band +${RUBBER_BAND.maxBonus * 100}% / -${RUBBER_BAND.maxPenalty * 100}%`,
    );
    out();

    const alone = runner('Vix alone', 0, () => ({ rivalProgress: 0, playerProgress: 0 }));
    const aloneSteps = runRace([alone]);
    out(
      `Vix alone (no rubber band, dt 1/60): laps ${laps(alone.progress)} s, finish ${f(alone.progress.finishTime ?? NaN)} s`,
    );
    out(
      `  on road ${f((100 * alone.onRoadSteps) / aloneSteps)}% of steps, max |lateral| ${f(alone.maxAbsLateral)} m (road half-width ${MALIBU.roadWidth / 2}), min speed ${f(alone.minSpeed)} m/s`,
    );
    out();

    // The stand-in player drives the same AI with a permanent 5% handicap and no band.
    const handicap: RivalContext = {
      rivalProgress: (RUBBER_BAND.penaltyRange * 0.05) / RUBBER_BAND.maxPenalty,
      playerProgress: 0,
    };
    const race = (banded: boolean) => {
      const standIn = runner('stand-in', -3, () => handicap);
      const rival = runner('Vix', 3, (other) =>
        banded
          ? { rivalProgress: rival.progress.progress, playerProgress: other.progress.progress }
          : { rivalProgress: 0, playerProgress: 0 },
      );
      runRace([standIn, rival]);
      return { standIn, rival };
    };
    const unbanded = race(false);
    const banded = race(true);
    const gap = (r: { standIn: Runner; rival: Runner }) =>
      (r.standIn.progress.finishTime ?? NaN) - (r.rival.progress.finishTime ?? NaN);
    out(`Stand-in player (same AI, ${f((1 - rivalRubberBandFactor(handicap)) * 100, 0)}% handicap) vs Vix:`);
    out(
      `  without rubber band: Vix ${f(unbanded.rival.progress.finishTime ?? NaN)} s, stand-in ${f(unbanded.standIn.progress.finishTime ?? NaN)} s, gap ${f(gap(unbanded))} s`,
    );
    out(
      `  with rubber band:    Vix ${f(banded.rival.progress.finishTime ?? NaN)} s, stand-in ${f(banded.standIn.progress.finishTime ?? NaN)} s, gap ${f(gap(banded))} s`,
    );
    out();

    // Overtaking: a slower player (same AI, top speed 17 m/s, about a 62 s lap) starts 10 m
    // ahead; Vix is banded and knows where it is. Once on the seaside straight, once in the
    // hill curve. The player's AI ignores Vix, so any contact is the player's doing.
    const passLine = (r: PassResult) =>
      r.passedAt < 0
        ? 'not passed within 30 s'
        : `passed after ${f(r.passedAt)} s, ${r.overlapSteps} overlapping steps, on road ${f(100 * r.onRoad)}%, max |lateral| ${f(r.maxAbsLateral)} m, ${r.fellBehindAfterPass ? 'LOST the place again' : 'stayed ahead'}, ${f(r.finalGap, 0)} m ahead after 30 s`;
    out('Overtaking a slower player (same AI, top speed 17 m/s, starting 10 m ahead):');
    out(`  on the seaside straight: ${passLine(passScenario(track, 20, 17, 0))}`);
    out(`  in the hill curve:       ${passLine(passScenario(track, 640, 17, 0))}`);
    out();

    // Equal AI: a stand-in with the same tuning, no band, no handicap, unaware of Vix, from the
    // player's grid slot; Vix from hers, banded and aware of the stand-in.
    const equalStandIn = runner('stand-in', GRID_PLAYER.lateral, () => ({ rivalProgress: 0, playerProgress: 0 }));
    equalStandIn.kart = gridKart(GRID_PLAYER.lateral, GRID_PLAYER.back);
    const equalRival = runner('Vix', GRID_RIVAL.lateral, (other) => ({
      rivalProgress: equalRival.progress.progress,
      playerProgress: other.progress.progress,
      player: other.kart,
    }));
    equalRival.kart = gridKart(GRID_RIVAL.lateral, GRID_RIVAL.back);
    const equalSteps = runRace([equalStandIn, equalRival]);
    out('Equal stand-in (same AI, no band, no handicap, unaware of Vix) vs Vix from the real grid:');
    out(
      `  Vix ${f(equalRival.progress.finishTime ?? NaN)} s, stand-in ${f(equalStandIn.progress.finishTime ?? NaN)} s, gap ${f((equalStandIn.progress.finishTime ?? NaN) - (equalRival.progress.finishTime ?? NaN))} s (+ = Vix first), Vix on road ${f((100 * equalRival.onRoadSteps) / equalSteps)}%`,
    );
    out();
    out('Targets: Vix lap 55–65 s, on road ≥ 97%, banded gap 1–4 s and under half the unbanded gap.');
    out('Targets (iteration 5): Vix lap 56.5–57.5 s, pass within 12 s and stay ahead, equal-AI gap within ±2 s.');

    console.log(lines.join('\n'));
  });
});
