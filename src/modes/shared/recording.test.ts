import { describe, expect, it } from 'vitest';
import {
  createGhostState,
  createRecorder,
  isRecording,
  positionAt,
  quantize,
  sampleRecording,
  timeAtProgress,
} from './recording';

function drive(seconds: number, hz = 20) {
  const rec = createRecorder(hz);
  const kart = createGhostState();
  const dt = 1 / 60;
  let t = 0;
  let progress = -10;
  for (let i = 0; i < seconds * 60; i++) {
    // A straight line north at 20 m/s, turning slowly.
    kart.position.x = 0.1 * t;
    kart.position.z = -20 * t;
    kart.heading = 0.05 * t;
    rec.record(t, kart, progress);
    t += dt;
    progress += 20 * dt;
  }
  return { rec: rec.finish(t), recorder: rec };
}

describe('recorder', () => {
  it('samples at the requested rate from 60 Hz steps', () => {
    const { rec } = drive(5);
    expect(rec.hz).toBe(20);
    expect(rec.x.length).toBeGreaterThanOrEqual(99);
    expect(rec.x.length).toBeLessThanOrEqual(101);
    expect(rec.time).toBeCloseTo(5, 3);
    expect(rec.z[20]).toBeCloseTo(-20, 1);
  });

  it('keeps the progress non-decreasing and can be reset', () => {
    const r = createRecorder(20);
    const kart = createGhostState();
    r.record(0, kart, 5);
    r.record(0.1, kart, 3);
    r.record(0.2, kart, 9);
    expect(r.finish(0.2).p).toEqual([5, 5, 9]);
    r.reset();
    expect(r.length).toBe(0);
  });
});

describe('replay', () => {
  it('interpolates position, heading and speed between samples', () => {
    const { rec } = drive(3);
    const out = createGhostState();
    sampleRecording(rec, 1.025, out);
    expect(out.position.z).toBeCloseTo(-20.5, 1);
    expect(out.heading).toBeCloseTo(0.05 * 1.025, 2);
    expect(out.speed).toBeCloseTo(20, 0);
    const p = positionAt(rec, 1.025, { x: 0, z: 0 });
    expect(p.z).toBeCloseTo(out.position.z, 6);
  });

  it('clamps outside the run', () => {
    const { rec } = drive(2);
    const out = createGhostState();
    sampleRecording(rec, -1, out);
    expect(out.position.z).toBeCloseTo(0, 6);
    sampleRecording(rec, 99, out);
    expect(out.position.z).toBeCloseTo(rec.z[rec.z.length - 1], 6);
    expect(out.speed).toBe(0);
  });

  it('takes the short way round a heading wrap', () => {
    const rec = { hz: 1, x: [0, 0], z: [0, 0], h: [Math.PI - 0.1, -Math.PI + 0.1], p: [0, 1], time: 1 };
    const out = createGhostState();
    sampleRecording(rec, 0.5, out);
    expect(Math.abs(Math.abs(out.heading) - Math.PI)).toBeLessThan(1e-9);
  });
});

describe('timeAtProgress', () => {
  it('finds when the run reached a progress, interpolated', () => {
    const { rec } = drive(4);
    // progress = -10 + 20 t, so progress 30 is at t = 2.
    expect(timeAtProgress(rec, 30)).toBeCloseTo(2, 1);
    expect(timeAtProgress(rec, -50)).toBe(0);
    expect(timeAtProgress(rec, 1e9)).toBe(rec.time);
  });
});

describe('storage helpers', () => {
  it('quantizes and validates', () => {
    const { rec } = drive(1);
    const q = quantize(rec);
    expect(q.x.every((v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-9)).toBe(true);
    expect(isRecording(q)).toBe(true);
    expect(isRecording(null)).toBe(false);
    expect(isRecording({ hz: 20, time: 1, x: [1], z: [1], h: [0], p: [0] })).toBe(false);
    expect(JSON.stringify(q).length).toBeLessThan(2000);
  });
});
