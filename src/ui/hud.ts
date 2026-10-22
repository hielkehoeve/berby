import type { TouchState } from '../input/controls';
import type { ModeHud } from '../modes/types';
import { el, hide, show } from './dom';
import { formatRaceTime, ordinal } from './format';

/** Seconds the steering hints stay visible after the race starts or after a touch. */
export const HINT_SECONDS = 3;

export interface HudState {
  /** 1-based race position. */
  position: number;
  lap: number;
  laps: number;
  /** Race time in seconds. */
  time: number;
  touch: TouchState;
}

export interface Hud {
  /** The full-screen touch surface. Attach the steering controls to it. */
  element: HTMLElement;
  brakeButton: HTMLButtonElement;
  /** The brake band at the bottom center; the controls read its box to classify touches. */
  brakeZone: HTMLElement;
  /** The mode action button on the right edge; hidden unless the mode gives it a label. */
  actionButton: HTMLButtonElement;
  show(): void;
  hide(): void;
  /** Refresh the labels; `mode` overrides the pills and adds a status line and the action button. */
  update(state: HudState, mode?: ModeHud): void;
  /** Show the steering hints (again) for HINT_SECONDS. */
  revealHints(): void;
}

export function createHud(parent: HTMLElement): Hud {
  const element = el('section', 'layer hud hidden');
  element.setAttribute('aria-label', 'Race HUD');

  const top = el('div', 'hud-top');
  const position = el('div', 'hud-pill hud-position', '1st');
  const timer = el('div', 'hud-pill hud-timer', '0:00.0');
  const lap = el('div', 'hud-pill hud-lap', 'Lap 1/3');
  top.append(position, timer, lap);
  const status = el('div', 'hud-pill hud-status hidden', '');

  const zoneLeft = el('div', 'zone zone-left');
  zoneLeft.appendChild(el('span', 'arrow', '‹'));
  const zoneRight = el('div', 'zone zone-right');
  zoneRight.appendChild(el('span', 'arrow', '›'));

  const zoneBrake = el('div', 'zone zone-brake');

  const brakeButton = el('button', 'brake', 'BRAKE');
  brakeButton.type = 'button';
  brakeButton.setAttribute('aria-label', 'Brake');

  const actionButton = el('button', 'action hidden', '');
  actionButton.type = 'button';
  actionButton.setAttribute('aria-label', 'Action');

  element.append(zoneLeft, zoneRight, zoneBrake, top, status, brakeButton, actionButton);
  parent.appendChild(element);

  let hintsUntil = 0;
  let lastText = { position: '', timer: '', lap: '', status: '', action: '' };
  const now = () => performance.now() / 1000;

  const setText = (node: HTMLElement, key: keyof typeof lastText, text: string) => {
    if (lastText[key] === text) return;
    lastText[key] = text;
    node.textContent = text;
  };

  return {
    element,
    brakeButton,
    brakeZone: zoneBrake,
    actionButton,
    show() {
      show(element);
    },
    hide() {
      hide(element);
    },
    revealHints() {
      hintsUntil = now() + HINT_SECONDS;
      element.classList.remove('hints-hidden');
    },
    update(state, mode = {}) {
      // Endless runs have a huge lap count; show the lap alone unless the mode says otherwise.
      const laps = state.laps > 99 ? `Lap ${state.lap}` : `Lap ${Math.min(state.lap, state.laps)}/${state.laps}`;
      setText(position, 'position', mode.left ?? ordinal(state.position));
      setText(timer, 'timer', mode.center ?? formatRaceTime(state.time));
      setText(lap, 'lap', mode.right ?? laps);
      const statusText = mode.status ?? '';
      setText(status, 'status', statusText);
      status.classList.toggle('hidden', statusText === '');
      const actionText = mode.action ?? '';
      setText(actionButton, 'action', actionText);
      actionButton.classList.toggle('hidden', actionText === '');
      zoneLeft.classList.toggle('active', state.touch.left);
      zoneRight.classList.toggle('active', state.touch.right);
      zoneBrake.classList.toggle('active', state.touch.brake);
      brakeButton.classList.toggle('active', state.touch.brake);
      element.classList.toggle('hints-hidden', now() > hintsUntil);
    },
  };
}
