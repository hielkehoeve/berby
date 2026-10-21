import { describe, expect, it } from 'vitest';
import { formatLapTime, formatRaceTime, ordinal } from './format';

describe('formatRaceTime', () => {
  it('formats m:ss.t', () => {
    expect(formatRaceTime(0)).toBe('0:00.0');
    expect(formatRaceTime(5.27)).toBe('0:05.2');
    expect(formatRaceTime(65.34)).toBe('1:05.3');
    expect(formatRaceTime(599.99)).toBe('9:59.9');
    expect(formatRaceTime(600)).toBe('10:00.0');
  });

  it('never shows negative time', () => {
    expect(formatRaceTime(-3)).toBe('0:00.0');
  });

  it('does not round up to the next tenth', () => {
    expect(formatRaceTime(0.99)).toBe('0:00.9');
    expect(formatRaceTime(0.1)).toBe('0:00.1');
  });
});

describe('formatLapTime', () => {
  it('formats m:ss.hh', () => {
    expect(formatLapTime(58.123)).toBe('0:58.12');
    expect(formatLapTime(61)).toBe('1:01.00');
  });
});

describe('ordinal', () => {
  it('names positions', () => {
    expect(ordinal(1)).toBe('1st');
    expect(ordinal(2)).toBe('2nd');
  });
});
