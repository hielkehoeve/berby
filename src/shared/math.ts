// Small math helpers shared by all modules. Frozen alongside shared/types.ts.
import type { Vec2 } from './types';

export const TAU = Math.PI * 2;

/** Unit forward vector for a heading. heading 0 faces -Z, matching Three.js. */
export function headingToForward(heading: number): Vec2 {
  return { x: -Math.sin(heading), z: -Math.cos(heading) };
}

/** Inverse of headingToForward. */
export function forwardToHeading(forward: Vec2): number {
  return Math.atan2(-forward.x, -forward.z);
}

/** Unit vector 90° to the left of a direction, viewed from above (Y up). */
export function leftOf(dir: Vec2): Vec2 {
  return { x: dir.z, z: -dir.x };
}

/** Wrap an angle to (-PI, PI]. */
export function wrapAngle(a: number): number {
  return a - TAU * Math.floor((a + Math.PI) / TAU);
}

/** Wrap a distance along a loop of the given length into [0, length). */
export function wrapDistance(d: number, length: number): number {
  return ((d % length) + length) % length;
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}
