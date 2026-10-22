import { describe, expect, it } from 'vitest';
import { resolveInput, resolveSteer, touchRegion } from './controls';

describe('resolveSteer', () => {
  it('steers left, right, and cancels when both halves are held', () => {
    expect(resolveSteer(false, false)).toBe(0);
    expect(resolveSteer(true, false)).toBe(-1);
    expect(resolveSteer(false, true)).toBe(1);
    expect(resolveSteer(true, true)).toBe(0);
  });
});

describe('touchRegion', () => {
  const band = { left: 200, right: 600, top: 240, bottom: 360 };

  it('splits the screen into halves when there is no brake band', () => {
    expect(touchRegion(100, 300, 800, null)).toBe('left');
    expect(touchRegion(700, 300, 800, null)).toBe('right');
    expect(touchRegion(400, 300, 800, null)).toBe('right');
  });

  it('brakes inside the band, edges included, and steers around it', () => {
    expect(touchRegion(400, 300, 800, band)).toBe('brake');
    expect(touchRegion(200, 240, 800, band)).toBe('brake');
    expect(touchRegion(600, 360, 800, band)).toBe('brake');
    expect(touchRegion(199, 300, 800, band)).toBe('left');
    expect(touchRegion(601, 300, 800, band)).toBe('right');
    // Above the band is the road ahead: still steering.
    expect(touchRegion(300, 239, 800, band)).toBe('left');
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
