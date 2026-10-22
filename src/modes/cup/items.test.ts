import { describe, expect, it } from 'vitest';
import { buildTrack } from '../../sim/track';
import { MALIBU } from '../../tracks/malibu';
import { ITEM_KINDS, layoutBoxes, pickWeighted, rollItem, rollWeights, type ItemKind } from './items';
import { CUP_TUNING } from './tuning';

const track = buildTrack(MALIBU);

describe('rollWeights', () => {
  it('leans to rockets and missiles when behind and to bombs and shields when ahead', () => {
    const behind = rollWeights(100);
    const ahead = rollWeights(-100);
    expect(behind).toEqual(CUP_TUNING.roll.behind);
    expect(ahead).toEqual(CUP_TUNING.roll.ahead);
    expect(behind.rocket + behind.missile).toBeGreaterThan(behind.bomb + behind.shield);
    expect(ahead.bomb + ahead.shield).toBeGreaterThan(ahead.rocket + ahead.missile);
  });

  it('blends linearly through level', () => {
    const level = rollWeights(0);
    for (const kind of ITEM_KINDS) {
      expect(level[kind]).toBeCloseTo((CUP_TUNING.roll.ahead[kind] + CUP_TUNING.roll.behind[kind]) / 2, 6);
    }
    const half = rollWeights(CUP_TUNING.roll.range / 2);
    expect(half.rocket).toBeGreaterThan(level.rocket);
    expect(half.rocket).toBeLessThan(CUP_TUNING.roll.behind.rocket);
  });
});

describe('pickWeighted', () => {
  it('walks the weights in ITEM_KINDS order and never falls off the end', () => {
    const w = { rocket: 1, missile: 1, bomb: 1, shield: 1 };
    expect(pickWeighted(w, 0)).toBe('rocket');
    expect(pickWeighted(w, 0.26)).toBe('missile');
    expect(pickWeighted(w, 0.51)).toBe('bomb');
    expect(pickWeighted(w, 0.76)).toBe('shield');
    expect(pickWeighted(w, 1)).toBe('shield');
    expect(pickWeighted(w, -1)).toBe('rocket');
  });

  it('skips zero-weight items', () => {
    const w = { rocket: 0, missile: 0, bomb: 0, shield: 5 };
    for (const r of [0, 0.3, 0.999]) expect(pickWeighted(w, r)).toBe('shield');
  });

  it('matches the weights over many rolls', () => {
    const counts: Record<ItemKind, number> = { rocket: 0, missile: 0, bomb: 0, shield: 0 };
    const n = 4000;
    for (let i = 0; i < n; i++) counts[rollItem(1000, (i + 0.5) / n)]++;
    const total = Object.values(CUP_TUNING.roll.behind).reduce((a, b) => a + b, 0);
    for (const kind of ITEM_KINDS) {
      expect(counts[kind] / n).toBeCloseTo(CUP_TUNING.roll.behind[kind] / total, 2);
    }
  });
});

describe('layoutBoxes', () => {
  const boxes = layoutBoxes(track);

  it('puts three boxes on each of four rows, on the asphalt, clear of the start', () => {
    expect(boxes).toHaveLength(12);
    for (const b of boxes) {
      const { sample, lateral } = track.nearest(b.position);
      expect(sample.distance).toBeCloseTo(b.distance, 0);
      expect(lateral).toBeCloseTo(b.lateral, 1);
      expect(Math.abs(lateral)).toBeLessThan(MALIBU.roadWidth / 2 - 1);
      expect(b.distance).toBeGreaterThanOrEqual(60);
    }
    const rows = new Set(boxes.map((b) => b.distance));
    expect([...rows]).toEqual(CUP_TUNING.boxes.rows);
  });

  it('spreads the boxes across the road, 3.5 m apart', () => {
    const d = Math.hypot(boxes[0].position.x - boxes[1].position.x, boxes[0].position.z - boxes[1].position.z);
    expect(d).toBeCloseTo(3.5, 5);
  });
});
