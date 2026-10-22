import { describe, expect, it } from 'vitest';
import { formatLapTime } from '../../ui/format';
import { TIDE_TUNING, type TideTuning } from './tuning';
import {
  createTideRun,
  formatDistance,
  formatGap,
  resetTideRun,
  TIDE_EVENT,
  tideGap,
  tideHud,
  tideProgressAt,
  tideResults,
  tideSpeedAt,
  tideStatus,
  tideTravelled,
  unwrapGridDistance,
  updateTideRun,
} from './tide';

const T = TIDE_TUNING;

/** Race time at which a player cruising at `speed` m/s from GO is caught, or null within `limit` s. */
function catchTime(speed: number, limit = 1000, tuning: TideTuning = T): number | null {
  for (let t = 0; t <= limit; t += 0.1) if (tideGap(t, speed * t, tuning) <= 0) return t;
  return null;
}

describe('tideSpeedAt', () => {
  it('starts at startSpeed and ramps by speedStep every rampInterval', () => {
    expect(tideSpeedAt(0)).toBe(15);
    expect(tideSpeedAt(-5)).toBe(15);
    expect(tideSpeedAt(9.99)).toBe(15);
    expect(tideSpeedAt(10)).toBe(15.5);
    expect(tideSpeedAt(60)).toBe(18);
    expect(tideSpeedAt(120)).toBe(21);
  });

  it('caps at maxSpeed', () => {
    expect(tideSpeedAt(180)).toBe(24);
    expect(tideSpeedAt(1000)).toBe(24);
    expect(tideSpeedAt(5, { ...T, startSpeed: 30 })).toBe(24);
  });
});

describe('tideTravelled', () => {
  it('is the closed-form integral of the speed ramp', () => {
    expect(tideTravelled(0)).toBe(0);
    expect(tideTravelled(-1)).toBe(0);
    expect(tideTravelled(5)).toBeCloseTo(75);
    expect(tideTravelled(10)).toBeCloseTo(150);
    expect(tideTravelled(15)).toBeCloseTo(150 + 15.5 * 5);
    // 18 steps to the cap: sum of 15 + 0.5k for k < 18, times 10 s.
    expect(tideTravelled(180)).toBeCloseTo(3465);
    expect(tideTravelled(190)).toBeCloseTo(3465 + 240);
  });

  it('matches a numeric integration of tideSpeedAt', () => {
    for (const tuning of [T, { ...T, speedStep: 0 }, { ...T, startSpeed: 30 }, { ...T, maxSpeed: 24.2 }]) {
      for (const t of [3, 17, 42.5, 100, 179.9, 180.1, 250, 600]) {
        let sum = 0;
        const dt = 0.01;
        for (let s = 0; s < t; s += dt) sum += tideSpeedAt(s + dt / 2, tuning) * Math.min(dt, t - s);
        expect(tideTravelled(t, tuning)).toBeCloseTo(sum, 1);
      }
    }
  });

  it('never decreases', () => {
    let prev = 0;
    for (let t = 0; t < 400; t += 0.37) {
      const d = tideTravelled(t);
      expect(d).toBeGreaterThanOrEqual(prev);
      prev = d;
    }
  });
});

describe('tideGap and tideProgressAt', () => {
  it('starts startGap behind the grid', () => {
    expect(tideGap(0, 0)).toBe(45);
    expect(tideProgressAt(0, -8)).toBe(-53);
    expect(tideProgressAt(10, -8)).toBeCloseTo(-53 + 150);
  });

  it('catches a stopped kart after startGap / startSpeed seconds', () => {
    expect(catchTime(0)).toBeCloseTo(3, 1);
  });

  it('washes out a sloppy driver in the first lap and a clean one after minutes', () => {
    expect(catchTime(14)).toBeCloseTo(30, 0);
    const average = catchTime(17);
    expect(average).toBeGreaterThan(90);
    expect(average).toBeLessThan(120);
    // A clean lap is ~57 s for 1215 m: 21.3 m/s.
    const clean = catchTime(21.3);
    expect(clean).toBeGreaterThan(300);
    expect(clean).toBeLessThan(400);
    // Faster than the capped tide: never caught.
    expect(catchTime(24.5)).toBeNull();
  });

  it('grows first while the player outruns the tide, then shrinks', () => {
    const gaps = [0, 60, 120, 200, 300].map((t) => tideGap(t, 21.3 * t));
    expect(gaps[1]).toBeGreaterThan(gaps[0]);
    expect(gaps[2]).toBeGreaterThan(gaps[1]);
    expect(gaps[3]).toBeLessThan(gaps[2]);
    expect(gaps[4]).toBeLessThan(gaps[3]);
  });
});

describe('unwrapGridDistance', () => {
  it('reads the grid before the line as a small negative progress', () => {
    expect(unwrapGridDistance(1207, 1215)).toBe(-8);
    expect(unwrapGridDistance(5, 1215)).toBe(5);
  });
});

describe('updateTideRun', () => {
  it('starts with the full gap and the intro line, even before the first step', () => {
    const run = createTideRun();
    expect(run.gap).toBe(45);
    expect(run.caught).toBe(false);
    expect(tideHud(run)).toEqual({ left: '🌊 45 m', right: '0 m', status: 'The tide is rising…' });
  });

  it('tracks the gap and the distance', () => {
    const run = createTideRun();
    expect(updateTideRun(run, 10, 200, 1)).toBe(TIDE_EVENT.none);
    expect(run.gap).toBeCloseTo(45 + 200 - 150);
    expect(run.distance).toBe(200);
    expect(tideHud(run)).toEqual({ left: '🌊 95 m', right: '200 m', status: '' });
  });

  it('warns once each time the gap enters the warning zone', () => {
    const run = createTideRun();
    // t = 2: tide at 30 m. Distance 0 → gap 15 (safe), -4 → 11 (warn), 5 → 20, -5 → 10.
    expect(updateTideRun(run, 2, 0, 1)).toBe(TIDE_EVENT.none);
    expect(updateTideRun(run, 2, -4, 1)).toBe(TIDE_EVENT.warn);
    expect(run.inWarning).toBe(true);
    expect(updateTideRun(run, 2, -4.5, 1)).toBe(TIDE_EVENT.none);
    expect(updateTideRun(run, 2, 5, 1)).toBe(TIDE_EVENT.none);
    expect(run.inWarning).toBe(false);
    expect(updateTideRun(run, 2, -5, 1)).toBe(TIDE_EVENT.warn);
    expect(tideHud(run).left).toBe('⚠️ 10 m');
  });

  it('shows the lap message briefly, unless the warning is up', () => {
    const run = createTideRun();
    updateTideRun(run, 50, 1000, 1);
    expect(updateTideRun(run, 57, 1216, 2)).toBe(TIDE_EVENT.lap);
    expect(tideStatus(run)).toBe('Lap 2!');
    updateTideRun(run, 57 + T.lapMessageSeconds - 0.1, 1220, 2);
    expect(tideStatus(run)).toBe('Lap 2!');
    updateTideRun(run, 57 + T.lapMessageSeconds, 1221, 2);
    expect(tideStatus(run)).toBe('');
    // Driving backwards over the line and forwards again is not a new lap.
    updateTideRun(run, 58, 1210, 1);
    expect(updateTideRun(run, 59, 1216, 2)).toBe(TIDE_EVENT.none);
    // The warning beats the lap message: t = 100: tide at 1725 m; distance 1690 → gap 10.
    expect(updateTideRun(run, 100, 1690, 3)).toBe(TIDE_EVENT.lap | TIDE_EVENT.warn);
    expect(tideStatus(run)).toBe('Faster!');
  });

  it('ends the run when the gap reaches zero and freezes', () => {
    const run = createTideRun();
    updateTideRun(run, 2.9, 0, 1);
    expect(run.caught).toBe(false);
    expect(updateTideRun(run, 3, 0, 1)).toBe(TIDE_EVENT.caught);
    expect(run.caught).toBe(true);
    expect(run.caughtAt).toBe(3);
    expect(tideHud(run)).toEqual({ left: '⚠️ 0 m', right: '0 m', status: 'Washed out!' });
    expect(updateTideRun(run, 4, 100, 2)).toBe(TIDE_EVENT.none);
    expect(run.time).toBe(3);
    expect(run.distance).toBe(0);
    resetTideRun(run);
    expect(run.caught).toBe(false);
    expect(run.gap).toBe(45);
  });

  it('keeps the intro line for the first seconds', () => {
    const run = createTideRun();
    updateTideRun(run, 2.9, 30, 1);
    expect(tideStatus(run)).toBe('The tide is rising…');
    updateTideRun(run, 3, 31, 1);
    expect(tideStatus(run)).toBe('');
  });
});

describe('HUD formatting', () => {
  it('rounds the gap and switches to the warning icon under warnGap', () => {
    expect(formatGap(24.4)).toBe('🌊 24 m');
    expect(formatGap(12)).toBe('🌊 12 m');
    expect(formatGap(11.9)).toBe('⚠️ 12 m');
    expect(formatGap(8.4)).toBe('⚠️ 8 m');
    expect(formatGap(-3)).toBe('⚠️ 0 m');
  });

  it('rounds the distance to 10 m and never shows a negative one', () => {
    expect(formatDistance(0)).toBe('0 m');
    expect(formatDistance(123)).toBe('120 m');
    expect(formatDistance(125)).toBe('130 m');
    expect(formatDistance(-7)).toBe('0 m');
    expect(formatDistance(1234.5, { ...T, distanceRounding: 1 })).toBe('1235 m');
  });
});

describe('tideResults', () => {
  it('celebrates a new best and saves the distance in whole meters', () => {
    const r = tideResults(1234.6, 65.4, 1000);
    expect(r.headline).toBe('New best!');
    expect(r.won).toBe(true);
    expect(r.newBest).toBe(true);
    expect(r.best).toBe(1235);
    expect(r.rows).toEqual([
      ['Distance', '1235 m'],
      ['Time survived', formatLapTime(65.4)],
      ['Best distance', '1235 m'],
    ]);
  });

  it('is neutral when the best stands', () => {
    const r = tideResults(800, 40, 1000);
    expect(r.headline).toBe('Washed out!');
    expect(r.won).toBeNull();
    expect(r.newBest).toBe(false);
    expect(r.best).toBe(1000);
    expect(r.rows[2]).toEqual(['Best distance', '1000 m']);
  });

  it('counts a first run as a best, but not a run of nothing', () => {
    expect(tideResults(50, 5, 0).newBest).toBe(true);
    expect(tideResults(0, 3, 0).newBest).toBe(false);
    expect(tideResults(-2, 3, 0).rows[0]).toEqual(['Distance', '0 m']);
  });
});
