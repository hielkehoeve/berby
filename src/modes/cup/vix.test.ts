import { describe, expect, it } from 'vitest';
import { buildTrack } from '../../sim/track';
import { MALIBU } from '../../tracks/malibu';
import { CUP_TUNING } from './tuning';
import { isStraight, vixWantsToUse, type VixSituation } from './vix';

const base: VixSituation = { item: null, heldFor: 1.5, holdTime: 1, straight: false, gap: 0 };
const t = CUP_TUNING.vix;

describe('vixWantsToUse', () => {
  it('does nothing with empty hands', () => {
    expect(vixWantsToUse({ ...base, item: null })).toBe(false);
  });

  it('holds every item for its hold time first', () => {
    for (const item of ['rocket', 'missile', 'bomb', 'shield'] as const) {
      expect(vixWantsToUse({ ...base, item, heldFor: 0.5, holdTime: 1.5, straight: true, gap: 10 })).toBe(false);
    }
  });

  it('raises the shield as soon as the hold time is over', () => {
    expect(vixWantsToUse({ ...base, item: 'shield', heldFor: 1.2 })).toBe(true);
    expect(vixWantsToUse({ ...base, item: 'shield', heldFor: 0.9 })).toBe(false);
  });

  it('fires the rocket on a straight only', () => {
    expect(vixWantsToUse({ ...base, item: 'rocket', straight: false })).toBe(false);
    expect(vixWantsToUse({ ...base, item: 'rocket', straight: true })).toBe(true);
  });

  it('fires the missile when the player is ahead within range', () => {
    expect(vixWantsToUse({ ...base, item: 'missile', gap: 20 })).toBe(true);
    expect(vixWantsToUse({ ...base, item: 'missile', gap: t.missileRange })).toBe(true);
    expect(vixWantsToUse({ ...base, item: 'missile', gap: t.missileRange + 1 })).toBe(false);
    expect(vixWantsToUse({ ...base, item: 'missile', gap: 0 })).toBe(false);
    expect(vixWantsToUse({ ...base, item: 'missile', gap: -10 })).toBe(false);
  });

  it('drops the bomb when the player is behind within range', () => {
    expect(vixWantsToUse({ ...base, item: 'bomb', gap: -10 })).toBe(true);
    expect(vixWantsToUse({ ...base, item: 'bomb', gap: -t.bombRange })).toBe(true);
    expect(vixWantsToUse({ ...base, item: 'bomb', gap: -t.bombRange - 1 })).toBe(false);
    expect(vixWantsToUse({ ...base, item: 'bomb', gap: 0 })).toBe(false);
    expect(vixWantsToUse({ ...base, item: 'bomb', gap: 10 })).toBe(false);
  });

  it('uses anything after the maximum hold, whatever the situation', () => {
    expect(vixWantsToUse({ ...base, item: 'rocket', straight: false, heldFor: t.maxHold })).toBe(true);
    expect(vixWantsToUse({ ...base, item: 'missile', gap: 500, heldFor: t.maxHold + 1 })).toBe(true);
  });
});

describe('isStraight', () => {
  const track = buildTrack(MALIBU);

  it('is true on the seaside straight and false in the turns', () => {
    expect(isStraight(track, 100)).toBe(true);
    // Turn 1 (control points 3-5 start ~190 m in) and the café hairpin.
    let straightInTurn = 0;
    for (let d = 200; d < 260; d += 10) if (isStraight(track, d)) straightInTurn++;
    expect(straightInTurn).toBe(0);
  });

  it('looks ahead: the end of the straight is not straight', () => {
    // A point whose next 30 m run into turn 1.
    expect(isStraight(track, 185)).toBe(false);
  });
});
