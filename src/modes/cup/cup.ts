/**
 * The Glam Cup simulation on top of the race: item boxes, pickups, the four items, spin-outs
 * and Vix's use of her items. Pure: no Three.js, no DOM, no audio. stepCup() runs once per
 * fixed step after the race moved the karts and fills state.events with what happened, which
 * the session turns into sounds and HUD lines. Nothing here allocates per step unless an
 * event occurs.
 */
import type { KartState, KartVariant, Track } from '../../shared/types';
import { TAU, clamp, forwardToHeading, headingToForward, wrapAngle, wrapDistance } from '../../shared/math';
import { PLAYER_TUNING } from '../../sim/tuning';
import type { Race } from '../../game/race';
import { layoutBoxes, rollItem, type BoxPlacement, type ItemKind } from './items';
import { CUP_TUNING } from './tuning';
import { isStraight, vixWantsToUse, type VixSituation } from './vix';

export type Side = KartVariant;

/** A box that was never taken. */
const NEVER = -Infinity;

/** Item-related state of one kart (the kart itself lives in the Race). */
export interface ItemKart {
  held: ItemKind | null;
  /** Race time of the pickup. */
  heldSince: number;
  /** Seconds Vix wants to hold the item before using it (unused for the player). */
  holdTime: number;
  /** Race time until which the rocket holds the speed up. */
  boostUntil: number;
  /** Seconds of spin-out left (0 = not spinning). */
  spinLeft: number;
  /** Race time until which the kart cannot be hit. */
  graceUntil: number;
  shield: boolean;
  itemsUsed: number;
  /** Bombs and missiles of this kart that connected with the other kart (spin or shield break). */
  hitsLanded: number;
}

export interface Bomb {
  active: boolean;
  x: number;
  z: number;
  droppedAt: number;
  owner: Side;
}

export interface Missile {
  active: boolean;
  x: number;
  z: number;
  heading: number;
  owner: Side;
  firedAt: number;
}

export type CupEvent =
  | { kind: 'pickup'; who: Side; item: ItemKind }
  | { kind: 'use'; who: Side; item: ItemKind }
  | { kind: 'spin'; who: Side; by: Side }
  | { kind: 'shieldBreak'; who: Side; by: Side }
  | { kind: 'fizzle'; who: Side };

export interface CupState {
  readonly boxes: BoxPlacement[];
  /** Per box: race time at which it is back (NEVER = never taken); available while time >= respawnAt. */
  readonly respawnAt: number[];
  readonly player: ItemKart;
  readonly rival: ItemKart;
  /** Fixed pool of CUP_TUNING.bomb.max slots. */
  readonly bombs: Bomb[];
  /** One missile at a time: firing while one flies replaces it. */
  readonly missile: Missile;
  /** What happened in the last step, oldest first. Cleared at the start of every step. */
  readonly events: CupEvent[];
  random: () => number;
}

function createItemKart(): ItemKart {
  return {
    held: null,
    heldSince: 0,
    holdTime: 0,
    boostUntil: 0,
    spinLeft: 0,
    graceUntil: 0,
    shield: false,
    itemsUsed: 0,
    hitsLanded: 0,
  };
}

function resetItemKart(k: ItemKart): void {
  Object.assign(k, createItemKart());
}

export function createCupState(track: Track, random: () => number = Math.random): CupState {
  const boxes = layoutBoxes(track);
  return {
    boxes,
    respawnAt: boxes.map(() => NEVER),
    player: createItemKart(),
    rival: createItemKart(),
    bombs: Array.from({ length: CUP_TUNING.bomb.max }, () => ({
      active: false,
      x: 0,
      z: 0,
      droppedAt: 0,
      owner: 'player' as Side,
    })),
    missile: { active: false, x: 0, z: 0, heading: 0, owner: 'player', firedAt: 0 },
    events: [],
    random,
  };
}

/** Back to the grid: every box up, hands empty, nothing on the road. */
export function resetCupState(state: CupState): void {
  state.respawnAt.fill(NEVER);
  resetItemKart(state.player);
  resetItemKart(state.rival);
  for (const b of state.bombs) b.active = false;
  state.missile.active = false;
  state.events.length = 0;
}

export function itemKartOf(state: CupState, who: Side): ItemKart {
  return who === 'player' ? state.player : state.rival;
}

function kartOf(race: Race, who: Side): KartState {
  return who === 'player' ? race.player : race.rival;
}

function otherOf(who: Side): Side {
  return who === 'player' ? 'rival' : 'player';
}

/** The other kart's progress minus this kart's, meters (> 0: this kart is behind). */
export function gapBehind(race: Race, who: Side): number {
  const p = race.playerProgress.progress;
  const r = race.rivalProgress.progress;
  return who === 'player' ? r - p : p - r;
}

/** True while the box is up. */
export function boxAvailable(state: CupState, index: number, time: number): boolean {
  return time >= state.respawnAt[index];
}

/** The rocket's target speed. */
export function boostSpeed(): number {
  return PLAYER_TUNING.topSpeed * CUP_TUNING.rocket.speedFactor;
}

/**
 * A bomb or missile reaches a kart. Returns true when it connected (a spin-out or a shield
 * break); false when the kart was spinning or in its grace and nothing happened.
 */
function hitKart(state: CupState, race: Race, who: Side, by: Side, time: number): boolean {
  const me = itemKartOf(state, who);
  if (me.spinLeft > 0 || time < me.graceUntil) return false;
  const kart = kartOf(race, who);
  if (me.shield) {
    me.shield = false;
    me.graceUntil = time + CUP_TUNING.spin.grace;
    state.events.push({ kind: 'shieldBreak', who, by });
  } else {
    kart.speed *= CUP_TUNING.spin.speedFactor;
    me.spinLeft = CUP_TUNING.spin.duration;
    me.graceUntil = time + CUP_TUNING.spin.duration + CUP_TUNING.spin.grace;
    state.events.push({ kind: 'spin', who, by });
  }
  if (by !== who) itemKartOf(state, by).hitsLanded++;
  return true;
}

function dropBomb(state: CupState, who: Side, kart: KartState, time: number): void {
  // A free slot, else the oldest bomb.
  let slot = state.bombs[0];
  for (const b of state.bombs) {
    if (!b.active) {
      slot = b;
      break;
    }
    if (b.droppedAt < slot.droppedAt) slot = b;
  }
  const fwd = headingToForward(kart.heading);
  slot.active = true;
  slot.x = kart.position.x - fwd.x * CUP_TUNING.bomb.dropBehind;
  slot.z = kart.position.z - fwd.z * CUP_TUNING.bomb.dropBehind;
  slot.droppedAt = time;
  slot.owner = who;
}

function fireMissile(state: CupState, race: Race, who: Side, kart: KartState, time: number): void {
  // Out of range: the kiss is blown into the air.
  if (gapBehind(race, who) > CUP_TUNING.missile.maxGap) {
    state.events.push({ kind: 'fizzle', who });
    return;
  }
  const m = state.missile;
  const fwd = headingToForward(kart.heading);
  m.active = true;
  m.x = kart.position.x + fwd.x * CUP_TUNING.missile.launchAhead;
  m.z = kart.position.z + fwd.z * CUP_TUNING.missile.launchAhead;
  m.heading = kart.heading;
  m.owner = who;
  m.firedAt = time;
}

/** Use the item a kart holds. Returns false when its hands are empty. */
export function useItem(state: CupState, race: Race, who: Side): boolean {
  const me = itemKartOf(state, who);
  const item = me.held;
  if (item === null) return false;
  const time = race.time;
  const kart = kartOf(race, who);
  me.held = null;
  me.itemsUsed++;
  switch (item) {
    case 'rocket':
      me.boostUntil = time + CUP_TUNING.rocket.duration;
      kart.speed = Math.max(kart.speed, boostSpeed());
      break;
    case 'shield':
      me.shield = true;
      break;
    case 'bomb':
      dropBomb(state, who, kart, time);
      break;
    case 'missile':
      fireMissile(state, race, who, kart, time);
      break;
  }
  state.events.push({ kind: 'use', who, item });
  return true;
}

function stepKartEffects(state: CupState, race: Race, who: Side, dt: number, time: number): void {
  const me = itemKartOf(state, who);
  const kart = kartOf(race, who);
  if (me.spinLeft > 0) {
    const d = Math.min(dt, me.spinLeft);
    kart.heading = wrapAngle(kart.heading + (TAU * d) / CUP_TUNING.spin.duration);
    me.spinLeft -= d;
  }
  if (time < me.boostUntil) kart.speed = Math.max(kart.speed, boostSpeed());
}

function stepBombs(state: CupState, race: Race, time: number): void {
  const t = CUP_TUNING.bomb;
  const r2 = t.radius * t.radius;
  for (const b of state.bombs) {
    if (!b.active) continue;
    if (time - b.droppedAt > t.life) {
      b.active = false;
      continue;
    }
    for (const who of SIDES) {
      if (who === b.owner && time < b.droppedAt + t.ownerGrace) continue;
      const k = kartOf(race, who);
      const dx = k.position.x - b.x;
      const dz = k.position.z - b.z;
      if (dx * dx + dz * dz <= r2 && hitKart(state, race, who, b.owner, time)) {
        b.active = false;
        break;
      }
    }
  }
}

function stepMissile(state: CupState, race: Race, dt: number, time: number): void {
  const m = state.missile;
  if (!m.active) return;
  const t = CUP_TUNING.missile;
  if (time - m.firedAt > t.life) {
    m.active = false;
    state.events.push({ kind: 'fizzle', who: m.owner });
    return;
  }
  const target = kartOf(race, otherOf(m.owner));
  const want = forwardToHeading({ x: target.position.x - m.x, z: target.position.z - m.z });
  const turn = clamp(wrapAngle(want - m.heading), -t.turnRate * dt, t.turnRate * dt);
  m.heading = wrapAngle(m.heading + turn);
  const fwd = headingToForward(m.heading);
  m.x += fwd.x * t.speed * dt;
  m.z += fwd.z * t.speed * dt;
  const dx = target.position.x - m.x;
  const dz = target.position.z - m.z;
  if (dx * dx + dz * dz <= t.radius * t.radius) {
    hitKart(state, race, otherOf(m.owner), m.owner, time);
    m.active = false;
  }
}

function stepPickups(state: CupState, race: Race, time: number): void {
  const t = CUP_TUNING.boxes;
  const r2 = t.pickupRadius * t.pickupRadius;
  for (const who of SIDES) {
    const me = itemKartOf(state, who);
    if (me.held !== null) continue;
    const k = kartOf(race, who);
    for (let i = 0; i < state.boxes.length; i++) {
      if (!boxAvailable(state, i, time)) continue;
      const p = state.boxes[i].position;
      const dx = k.position.x - p.x;
      const dz = k.position.z - p.z;
      if (dx * dx + dz * dz > r2) continue;
      state.respawnAt[i] = time + t.respawn;
      me.held = rollItem(gapBehind(race, who), state.random());
      me.heldSince = time;
      me.holdTime = CUP_TUNING.vix.holdMin + state.random() * (CUP_TUNING.vix.holdMax - CUP_TUNING.vix.holdMin);
      state.events.push({ kind: 'pickup', who, item: me.held });
      break;
    }
  }
}

const vixView: VixSituation = { item: null, heldFor: 0, holdTime: 0, straight: false, gap: 0 };

function stepVix(state: CupState, race: Race, time: number): void {
  const me = state.rival;
  if (me.held === null) return;
  vixView.item = me.held;
  vixView.heldFor = time - me.heldSince;
  vixView.holdTime = me.holdTime;
  vixView.gap = race.playerProgress.progress - race.rivalProgress.progress;
  vixView.straight =
    me.held === 'rocket' && isStraight(race.track, wrapDistance(race.rivalProgress.progress, race.track.length));
  if (vixWantsToUse(vixView)) useItem(state, race, 'rival');
}

const SIDES: readonly Side[] = ['player', 'rival'];

/** One fixed step, after race.step() moved the karts. Fills state.events. */
export function stepCup(state: CupState, race: Race, dt: number): void {
  state.events.length = 0;
  const time = race.time;
  for (const who of SIDES) stepKartEffects(state, race, who, dt, time);
  stepBombs(state, race, time);
  stepMissile(state, race, dt, time);
  stepPickups(state, race, time);
  stepVix(state, race, time);
}
