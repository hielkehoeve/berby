/**
 * Every feel constant of Glam Cup in one place: where the item boxes sit, how an item is rolled,
 * what each item does, how a spin-out plays out, and when Vix uses what she holds.
 * Units: meters, seconds, radians, m/s.
 */
export const CUP_TUNING = {
  boxes: {
    /** Centerline distances of the four rows, one every ~300 m, all well past the 60 m after the line. */
    rows: [130, 430, 730, 1030],
    /** Lateral offsets of the three boxes in a row, + = left of travel (the road is 12 m wide). */
    laterals: [-3.5, 0, 3.5],
    /** Edge of a cube. */
    size: 1.1,
    /** Height of a cube's centre above the road, and how far it bobs. */
    height: 1.0,
    bob: 0.12,
    /** Seconds a taken box stays gone, and the pop-in after it returns. */
    respawn: 4,
    popIn: 0.35,
    /** A kart within this distance of a box centre takes it (with empty hands). */
    pickupRadius: 1.6,
  },
  roll: {
    /** Progress gap to the other kart at which the weights reach their extreme (a rubber band through items). */
    range: 30,
    /** Weights when well behind: catch-up items. */
    behind: { rocket: 40, missile: 35, bomb: 10, shield: 15 },
    /** Weights when well ahead: defence. */
    ahead: { rocket: 15, missile: 10, bomb: 40, shield: 35 },
  },
  rocket: {
    /** The kart is held at topSpeed * speedFactor for `duration` seconds; overspeedDecel pulls it back after. */
    speedFactor: 1.35,
    duration: 2.2,
  },
  bomb: {
    /** Dropped this far behind the kart's centre. */
    dropBehind: 2,
    /** Seconds a bomb lies on the road; dropping a 7th removes the oldest. */
    life: 20,
    max: 6,
    /** A kart within this distance of a bomb triggers it... */
    radius: 1.5,
    /** ...except the dropper during this first second. */
    ownerGrace: 1,
    /** Visual: radius of the sphere. */
    size: 0.42,
  },
  missile: {
    speed: 45,
    /** Seconds in flight before it fizzles. */
    life: 3,
    /** Hits when this close to the target. */
    radius: 1.5,
    /** Fizzles at launch when the target is further ahead than this (progress meters). */
    maxGap: 60,
    /** Homing turn rate, rad/s (45 m/s at 4 rad/s is an 11 m turn circle). */
    turnRate: 4,
    /** Launched this far ahead of the kart's centre, at this height. */
    launchAhead: 2.5,
    height: 0.9,
  },
  spin: {
    /** Speed kept on the hit, and the seconds in which the kart turns one full circle. */
    speedFactor: 0.35,
    duration: 0.8,
    /** Seconds after the spin (or after a shield break) in which the kart cannot be hit again. */
    grace: 0.6,
  },
  shield: {
    /** Visual: ring radius and height above the road. */
    radius: 1.7,
    height: 0.75,
  },
  /** Seconds a status line stays on the HUD. */
  statusSeconds: 1.5,
  vix: {
    /** She holds an item for a random time in [holdMin, holdMax] before considering it... */
    holdMin: 1,
    holdMax: 2,
    /** ...and uses it whatever the situation after this long. */
    maxHold: 10,
    /** A rocket wants a straight: |curvature| below this (a radius above ~165 m) here and over the look-ahead. */
    straightCurvature: 0.006,
    straightLookahead: 30,
    /** The missile is fired when the player is ahead within this (progress meters)... */
    missileRange: 50,
    /** ...and the bomb dropped when the player is behind within this. */
    bombRange: 25,
  },
};
