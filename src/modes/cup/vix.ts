/**
 * When Vix uses the item she holds. A pure decision on a small view of the race, so it is
 * tested without a track or a kart; the session fills the view each step.
 */
import type { Track } from '../../shared/types';
import { curvatureAt } from '../../sim/track';
import type { ItemKind } from './items';
import { CUP_TUNING } from './tuning';

export interface VixSituation {
  item: ItemKind | null;
  /** Seconds she has held the item. */
  heldFor: number;
  /** Seconds she wants to hold it at least (rolled at the pickup). */
  holdTime: number;
  /** The road ahead of her is straight (see isStraight). */
  straight: boolean;
  /** Player progress minus hers, meters: > 0 the player is ahead. */
  gap: number;
}

/** True when Vix should use her item now. */
export function vixWantsToUse(s: VixSituation, t = CUP_TUNING.vix): boolean {
  if (s.item === null) return false;
  if (s.heldFor < s.holdTime) return false;
  if (s.heldFor >= t.maxHold) return true;
  switch (s.item) {
    case 'shield':
      return true;
    case 'rocket':
      return s.straight;
    case 'missile':
      return s.gap > 0 && s.gap <= t.missileRange;
    case 'bomb':
      return s.gap < 0 && -s.gap <= t.bombRange;
  }
}

/** The centerline is straight at `distance` and over the next straightLookahead meters. */
export function isStraight(track: Track, distance: number, t = CUP_TUNING.vix): boolean {
  const half = t.straightLookahead / 2;
  return (
    Math.abs(curvatureAt(track, distance)) < t.straightCurvature &&
    Math.abs(curvatureAt(track, distance + half)) < t.straightCurvature &&
    Math.abs(curvatureAt(track, distance + t.straightLookahead)) < t.straightCurvature
  );
}
