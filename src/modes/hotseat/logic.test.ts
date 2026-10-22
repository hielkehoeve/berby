import { describe, expect, it } from 'vitest';
import { createGhostState, createRecorder } from '../shared/recording';
import {
  bestEver,
  formatSigned,
  headline,
  intermissionCard,
  isRunTime,
  liveDelta,
  resultsCard,
  updateLead,
  verdict,
} from './logic';
import { HOTSEAT_TUNING } from './tuning';

const DEAD_HEAT = HOTSEAT_TUNING.deadHeat;

describe('verdict', () => {
  it('names the faster player', () => {
    expect(verdict(60, 58.5, DEAD_HEAT)).toEqual({ winner: 2, gap: 1.5 });
    expect(verdict(58.5, 60, DEAD_HEAT)).toEqual({ winner: 1, gap: 1.5 });
  });

  it('calls a dead heat within the tolerance, including an exact tie', () => {
    expect(verdict(60, 60, DEAD_HEAT).winner).toBeNull();
    expect(verdict(60, 60.01, DEAD_HEAT).winner).toBeNull();
    expect(verdict(60.01, 60, DEAD_HEAT).winner).toBeNull();
    expect(verdict(60, 60.011, DEAD_HEAT).winner).toBe(1);
  });

  it('has a headline per outcome', () => {
    expect(headline(verdict(60, 59, DEAD_HEAT))).toBe('Player 2 wins!');
    expect(headline(verdict(59, 60, DEAD_HEAT))).toBe('Player 1 wins!');
    expect(headline(verdict(60, 60, DEAD_HEAT))).toBe('Dead heat!');
  });
});

describe('formatSigned', () => {
  it('shows a sign and two decimals', () => {
    expect(formatSigned(1.234)).toBe('+1.23');
    expect(formatSigned(-0.416)).toBe('-0.42');
    expect(formatSigned(0)).toBe('+0.00');
    expect(formatSigned(-0.004)).toBe('+0.00');
    expect(formatSigned(65.5)).toBe('+65.50');
    expect(formatSigned(0.095)).toBe('+0.10');
  });
});

/** A recording of a kart at 20 m/s from the grid (progress -10) for `seconds`. */
function straightRun(seconds: number) {
  const r = createRecorder(20);
  const kart = createGhostState();
  for (let i = 0; i <= seconds * 60; i++) {
    const t = i / 60;
    kart.position.z = -20 * t;
    r.record(t, kart, -10 + 20 * t);
  }
  return r.finish(seconds);
}

describe('liveDelta', () => {
  const rec = straightRun(10);

  it('is negative when ahead of the recording and positive when behind', () => {
    // Progress 30 was reached by the recording at t = 2.
    expect(liveDelta(rec, 30, 1.5)).toBeCloseTo(-0.5, 1);
    expect(liveDelta(rec, 30, 2.7)).toBeCloseTo(0.7, 1);
    expect(liveDelta(rec, 30, 2)).toBeCloseTo(0, 1);
  });

  it('counts the time as lost on the grid and when reversing past the first sample', () => {
    expect(liveDelta(rec, -10, 1.5)).toBe(1.5);
    expect(liveDelta(rec, -40, 3)).toBe(3);
    expect(Number.isFinite(liveDelta(rec, -1e6, 3))).toBe(true);
  });

  it('compares against the finish time past the end of the recording', () => {
    expect(liveDelta(rec, 1e6, 12.5)).toBeCloseTo(2.5, 6);
  });
});

describe('updateLead', () => {
  const band = 0.15;

  it('holds the lead inside the deadband and switches outside it', () => {
    expect(updateLead('level', 0.1, band)).toBe('level');
    expect(updateLead('level', -0.2, band)).toBe('ahead');
    expect(updateLead('ahead', 0.1, band)).toBe('ahead');
    expect(updateLead('ahead', 0.16, band)).toBe('behind');
    expect(updateLead('behind', -0.1, band)).toBe('behind');
    expect(updateLead('behind', -0.16, band)).toBe('ahead');
  });
});

describe('bestEver', () => {
  it('takes the fastest of the stored best and the runs, ignoring garbage', () => {
    expect(bestEver(57.2, 58, 59)).toBe(57.2);
    expect(bestEver(60, 58, 59)).toBe(58);
    expect(bestEver(null, 58, 59)).toBe(58);
    expect(bestEver('57', 58, 59)).toBe(58);
    expect(bestEver(NaN, 58, 59)).toBe(58);
    expect(bestEver(-1, 58, 59)).toBe(58);
    expect(bestEver(0, 58, 59)).toBe(58);
    expect(bestEver({ time: 50 }, 58, 59)).toBe(58);
    expect(bestEver(undefined)).toBe(Infinity);
  });

  it('validates run times', () => {
    expect(isRunTime(58.1)).toBe(true);
    expect(isRunTime(Infinity)).toBe(false);
    expect(isRunTime('58')).toBe(false);
  });
});

describe('cards', () => {
  it('hands the phone over with Player 1 time', () => {
    expect(intermissionCard(58.68)).toEqual({
      kind: 'intermission',
      headline: 'Pass the phone',
      lines: ['Player 1: 0:58.68', 'Player 2, beat that!'],
      button: "I'm ready",
    });
  });

  it('shows both times, the gap and the best ever, with a neutral headline about the players', () => {
    const card = resultsCard(58.68, 57.45, 57.45, DEAD_HEAT);
    expect(card).toEqual({
      kind: 'results',
      headline: 'Player 2 wins!',
      won: null,
      rows: [
        ['Player 1', '0:58.68'],
        ['Player 2', '0:57.45'],
        ['Gap', '+1.23'],
        ['Best ever', '0:57.45'],
      ],
      again: 'Rematch',
    });
    expect(resultsCard(58.68, 58.675, 50, DEAD_HEAT).headline).toBe('Dead heat!');
    expect(resultsCard(57.0, 58.0, 57.0, DEAD_HEAT).headline).toBe('Player 1 wins!');
  });
});
