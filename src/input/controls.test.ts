import { describe, expect, it } from 'vitest';
import { resolveInput, resolveSteer } from './controls';

describe('resolveSteer', () => {
  it('steers left, right, and cancels when both halves are held', () => {
    expect(resolveSteer(false, false)).toBe(0);
    expect(resolveSteer(true, false)).toBe(-1);
    expect(resolveSteer(false, true)).toBe(1);
    expect(resolveSteer(true, true)).toBe(0);
  });
});

describe('resolveInput', () => {
  const none = { left: false, right: false, brake: false };

  it('is auto-gas: full throttle with nothing held', () => {
    expect(resolveInput(none, none)).toEqual({ steer: 0, throttle: 1, brake: 0 });
  });

  it('brake lifts the throttle', () => {
    expect(resolveInput({ ...none, brake: true }, none)).toEqual({ steer: 0, throttle: 0, brake: 1 });
  });

  it('merges touch and keyboard', () => {
    expect(resolveInput({ ...none, left: true }, none).steer).toBe(-1);
    expect(resolveInput(none, { ...none, right: true }).steer).toBe(1);
    expect(resolveInput({ ...none, left: true }, { ...none, right: true }).steer).toBe(0);
    expect(resolveInput(none, { ...none, brake: true }).brake).toBe(1);
  });
});
