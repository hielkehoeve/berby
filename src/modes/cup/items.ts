/**
 * The four Glam Cup items, the position-weighted roll that hands one out, and where the item
 * boxes stand on the track. Pure: no Three.js, no DOM.
 */
import type { Track, Vec2 } from '../../shared/types';
import { clamp, forwardToHeading, leftOf, lerp } from '../../shared/math';
import { CUP_TUNING } from './tuning';

export type ItemKind = 'rocket' | 'missile' | 'bomb' | 'shield';

export const ITEM_KINDS: readonly ItemKind[] = ['rocket', 'missile', 'bomb', 'shield'];

export const ITEMS: Record<ItemKind, { name: string; emoji: string }> = {
  rocket: { name: 'Lipstick Rocket', emoji: '💄' },
  missile: { name: 'Kiss Missile', emoji: '💋' },
  bomb: { name: 'Glitter Bomb', emoji: '✨' },
  shield: { name: 'Heart Shield', emoji: '💖' },
};

export type ItemWeights = Record<ItemKind, number>;

/**
 * Roll weights for a kart whose progress gap to the other kart is `gap` meters (> 0: it is
 * behind). Behind leans to rockets and missiles, ahead to bombs and shields, blended linearly
 * over ±roll.range.
 */
export function rollWeights(gap: number, t = CUP_TUNING.roll): ItemWeights {
  const u = clamp(gap / t.range, -1, 1) * 0.5 + 0.5;
  return {
    rocket: lerp(t.ahead.rocket, t.behind.rocket, u),
    missile: lerp(t.ahead.missile, t.behind.missile, u),
    bomb: lerp(t.ahead.bomb, t.behind.bomb, u),
    shield: lerp(t.ahead.shield, t.behind.shield, u),
  };
}

/** Pick an item from weights with one uniform random number in [0, 1). */
export function pickWeighted(weights: ItemWeights, random: number): ItemKind {
  let total = 0;
  for (const kind of ITEM_KINDS) total += weights[kind];
  let r = clamp(random, 0, 0.999999) * total;
  for (const kind of ITEM_KINDS) {
    r -= weights[kind];
    if (r < 0) return kind;
  }
  return ITEM_KINDS[ITEM_KINDS.length - 1];
}

/** The item a box hands to a kart with the given progress gap (> 0: behind). */
export function rollItem(gap: number, random: number): ItemKind {
  return pickWeighted(rollWeights(gap), random);
}

export interface BoxPlacement {
  position: Vec2;
  /** Centerline distance of the row. */
  distance: number;
  /** Lateral offset in the row, + = left of travel. */
  lateral: number;
  /** Track heading at the row, so the boxes can face along the road. */
  heading: number;
}

/** The item boxes of a track: rows across the road at fixed centerline distances. */
export function layoutBoxes(track: Track, t = CUP_TUNING.boxes): BoxPlacement[] {
  const boxes: BoxPlacement[] = [];
  for (const distance of t.rows) {
    const s = track.sampleAt(distance);
    const left = leftOf(s.tangent);
    const heading = forwardToHeading(s.tangent);
    for (const lateral of t.laterals) {
      boxes.push({
        position: { x: s.position.x + left.x * lateral, z: s.position.z + left.z * lateral },
        distance,
        lateral,
        heading,
      });
    }
  }
  return boxes;
}
