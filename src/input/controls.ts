import type { KartInput } from '../shared/types';

/** Which on-screen controls are currently held. For HUD feedback. */
export interface TouchState {
  left: boolean;
  right: boolean;
  brake: boolean;
}

export interface Controls {
  /** The kart input for this step. Auto-gas: throttle is 1 unless braking. */
  getInput(): KartInput;
  /** True while any finger (or key) is down on a control. */
  isTouching(): boolean;
  /** Seconds (performance.now based) of the most recent press start. For HUD hint fading. */
  lastPressTime(): number;
  getTouchState(): TouchState;
  /** True once per press of the action button or key (use an item). Consumed by the fixed step. */
  consumeAction(): boolean;
  dispose(): void;
}

export interface ControlsOptions {
  /** The full-screen element whose left and right halves steer. */
  surface: HTMLElement;
  /** The brake button; it handles its own pointers and never counts as a steer touch. */
  brakeButton: HTMLElement;
  /**
   * The band at the bottom center of the screen: a touch that starts inside it brakes for as
   * long as it is held, the way the halves steer. Its box is read on each touch, so the CSS
   * knobs in styles.css define the hit area. Optional: a surface without one just steers.
   */
  brakeZone?: HTMLElement;
  /** The mode action button (use an item); a press fires once and never counts as a steer touch. */
  actionButton?: HTMLElement;
}

/** Hold left = -1, hold right = +1, both or neither = 0. Pure, for testing. */
export function resolveSteer(left: boolean, right: boolean): number {
  if (left === right) return 0;
  return left ? -1 : 1;
}

/** Combine touch and keyboard into one KartInput. Pure, for testing. */
export function resolveInput(touch: TouchState, keys: TouchState): KartInput {
  const steer = resolveSteer(touch.left || keys.left, touch.right || keys.right);
  const brake = touch.brake || keys.brake ? 1 : 0;
  return { steer, throttle: brake ? 0 : 1, brake };
}

type Side = 'left' | 'right';
export type Region = Side | 'brake';

/** The box of the brake band in viewport pixels (a DOMRect will do). */
export interface ZoneRect {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/** Where a touch starting at (x, y) lands: in the brake band, else the left or right half. Pure. */
export function touchRegion(x: number, y: number, viewportWidth: number, brakeZone: ZoneRect | null): Region {
  if (brakeZone && x >= brakeZone.left && x <= brakeZone.right && y >= brakeZone.top && y <= brakeZone.bottom) {
    return 'brake';
  }
  return x < viewportWidth / 2 ? 'left' : 'right';
}

const STEER_LEFT_KEYS = new Set(['ArrowLeft', 'KeyA']);
const STEER_RIGHT_KEYS = new Set(['ArrowRight', 'KeyD']);
const BRAKE_KEYS = new Set(['ArrowDown', 'KeyS', 'Space']);
const ACTION_KEYS = new Set(['ArrowUp', 'KeyW', 'KeyE', 'Enter']);

/**
 * Touch controls: the left half of the screen steers left, the right half steers right, both
 * halves held cancel out, and a band at the bottom center (with the brake button inside it)
 * brakes. A touch is classified where it starts: a steering finger sliding across the middle
 * switches sides but never starts braking, a braking finger keeps braking wherever it slides,
 * and a finger lifted anywhere releases what it held. Keyboard works too for desktop development.
 */
export function createControls({ surface, brakeButton, brakeZone, actionButton }: ControlsOptions): Controls {
  const steerPointers = new Map<number, Side>();
  const brakePointers = new Set<number>();
  const keys: TouchState = { left: false, right: false, brake: false };
  let lastPress = -Infinity;
  let actionPresses = 0;

  const sideOf = (clientX: number): Side => (clientX < window.innerWidth / 2 ? 'left' : 'right');
  const touchState = (): TouchState => {
    let left = false;
    let right = false;
    for (const side of steerPointers.values()) {
      if (side === 'left') left = true;
      else right = true;
    }
    return { left, right, brake: brakePointers.size > 0 };
  };
  const notePress = () => {
    lastPress = performance.now() / 1000;
  };

  // --- Steering surface ---
  const onSurfaceDown = (e: PointerEvent) => {
    if (brakeButton.contains(e.target as Node)) return;
    if (actionButton?.contains(e.target as Node)) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const region = touchRegion(e.clientX, e.clientY, window.innerWidth, brakeZone?.getBoundingClientRect() ?? null);
    if (region === 'brake') brakePointers.add(e.pointerId);
    else steerPointers.set(e.pointerId, region);
    notePress();
    try {
      surface.setPointerCapture(e.pointerId);
    } catch {
      /* capture is best-effort */
    }
    e.preventDefault();
  };
  const onSurfaceMove = (e: PointerEvent) => {
    if (!steerPointers.has(e.pointerId)) return;
    steerPointers.set(e.pointerId, sideOf(e.clientX));
  };
  const releaseSurface = (e: PointerEvent) => {
    steerPointers.delete(e.pointerId);
    brakePointers.delete(e.pointerId);
  };

  // --- Brake button ---
  const onBrakeDown = (e: PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    brakePointers.add(e.pointerId);
    notePress();
    try {
      brakeButton.setPointerCapture(e.pointerId);
    } catch {
      /* best-effort */
    }
    e.preventDefault();
    e.stopPropagation();
  };
  const releaseBrake = (e: PointerEvent) => {
    brakePointers.delete(e.pointerId);
  };

  // --- Action button: a press, not a hold ---
  const onActionDown = (e: PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    actionPresses++;
    notePress();
    e.preventDefault();
    e.stopPropagation();
  };

  // A pointer can end anywhere (or be taken by the browser): listen at the window too.
  const onWindowUp = (e: PointerEvent) => {
    steerPointers.delete(e.pointerId);
    brakePointers.delete(e.pointerId);
  };
  const clearAll = () => {
    steerPointers.clear();
    brakePointers.clear();
    keys.left = keys.right = keys.brake = false;
  };

  // --- Keyboard ---
  const onKey = (down: boolean) => (e: KeyboardEvent) => {
    let handled = true;
    if (STEER_LEFT_KEYS.has(e.code)) keys.left = down;
    else if (STEER_RIGHT_KEYS.has(e.code)) keys.right = down;
    else if (BRAKE_KEYS.has(e.code)) keys.brake = down;
    else if (ACTION_KEYS.has(e.code)) {
      if (down && !e.repeat) actionPresses++;
    } else handled = false;
    if (handled) {
      if (down && !e.repeat) notePress();
      e.preventDefault();
    }
  };
  const onKeyDown = onKey(true);
  const onKeyUp = onKey(false);

  surface.style.touchAction = 'none';
  brakeButton.style.touchAction = 'none';
  surface.addEventListener('pointerdown', onSurfaceDown);
  surface.addEventListener('pointermove', onSurfaceMove);
  surface.addEventListener('pointerup', releaseSurface);
  surface.addEventListener('pointercancel', releaseSurface);
  brakeButton.addEventListener('pointerdown', onBrakeDown);
  brakeButton.addEventListener('pointerup', releaseBrake);
  brakeButton.addEventListener('pointercancel', releaseBrake);
  if (actionButton) {
    actionButton.style.touchAction = 'none';
    actionButton.addEventListener('pointerdown', onActionDown);
  }
  window.addEventListener('pointerup', onWindowUp);
  window.addEventListener('pointercancel', onWindowUp);
  window.addEventListener('blur', clearAll);
  document.addEventListener('visibilitychange', () => document.hidden && clearAll());
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);

  return {
    getInput: () => resolveInput(touchState(), keys),
    isTouching: () => steerPointers.size > 0 || brakePointers.size > 0 || keys.left || keys.right || keys.brake,
    lastPressTime: () => lastPress,
    consumeAction() {
      if (actionPresses === 0) return false;
      actionPresses = 0;
      return true;
    },
    getTouchState() {
      const t = touchState();
      return { left: t.left || keys.left, right: t.right || keys.right, brake: t.brake || keys.brake };
    },
    dispose() {
      surface.removeEventListener('pointerdown', onSurfaceDown);
      surface.removeEventListener('pointermove', onSurfaceMove);
      surface.removeEventListener('pointerup', releaseSurface);
      surface.removeEventListener('pointercancel', releaseSurface);
      brakeButton.removeEventListener('pointerdown', onBrakeDown);
      brakeButton.removeEventListener('pointerup', releaseBrake);
      brakeButton.removeEventListener('pointercancel', releaseBrake);
      actionButton?.removeEventListener('pointerdown', onActionDown);
      window.removeEventListener('pointerup', onWindowUp);
      window.removeEventListener('pointercancel', onWindowUp);
      window.removeEventListener('blur', clearAll);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      clearAll();
    },
  };
}
