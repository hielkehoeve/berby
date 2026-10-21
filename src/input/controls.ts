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
  dispose(): void;
}

export interface ControlsOptions {
  /** The full-screen element whose left and right halves steer. */
  surface: HTMLElement;
  /** The brake button; it handles its own pointers and never counts as a steer touch. */
  brakeButton: HTMLElement;
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

const STEER_LEFT_KEYS = new Set(['ArrowLeft', 'KeyA']);
const STEER_RIGHT_KEYS = new Set(['ArrowRight', 'KeyD']);
const BRAKE_KEYS = new Set(['ArrowDown', 'KeyS', 'Space']);

/**
 * Touch controls: the left half of the screen steers left, the right half steers right, both
 * halves held cancel out, and a brake button sits at the bottom center. Pointer events track
 * each finger by id, so a finger sliding across the middle switches sides and a finger lifted
 * anywhere releases its side. Keyboard works too for desktop development.
 */
export function createControls({ surface, brakeButton }: ControlsOptions): Controls {
  const steerPointers = new Map<number, Side>();
  const brakePointers = new Set<number>();
  const keys: TouchState = { left: false, right: false, brake: false };
  let lastPress = -Infinity;

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
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    steerPointers.set(e.pointerId, sideOf(e.clientX));
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
  const releaseSteer = (e: PointerEvent) => {
    steerPointers.delete(e.pointerId);
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
    else handled = false;
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
  surface.addEventListener('pointerup', releaseSteer);
  surface.addEventListener('pointercancel', releaseSteer);
  brakeButton.addEventListener('pointerdown', onBrakeDown);
  brakeButton.addEventListener('pointerup', releaseBrake);
  brakeButton.addEventListener('pointercancel', releaseBrake);
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
    getTouchState() {
      const t = touchState();
      return { left: t.left || keys.left, right: t.right || keys.right, brake: t.brake || keys.brake };
    },
    dispose() {
      surface.removeEventListener('pointerdown', onSurfaceDown);
      surface.removeEventListener('pointermove', onSurfaceMove);
      surface.removeEventListener('pointerup', releaseSteer);
      surface.removeEventListener('pointercancel', releaseSteer);
      brakeButton.removeEventListener('pointerdown', onBrakeDown);
      brakeButton.removeEventListener('pointerup', releaseBrake);
      brakeButton.removeEventListener('pointercancel', releaseBrake);
      window.removeEventListener('pointerup', onWindowUp);
      window.removeEventListener('pointercancel', onWindowUp);
      window.removeEventListener('blur', clearAll);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      clearAll();
    },
  };
}
