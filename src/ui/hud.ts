import type { TouchState } from '../input/controls';
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
  show(): void;
  hide(): void;
  update(state: HudState): void;
  /** Show the steering hints (again) for HINT_SECONDS. */
  revealHints(): void;
}

export function createHud(parent: HTMLElement): Hud {
  const element = el('section', 'layer hud hidden');
  element.setAttribute('aria-label', 'Race HUD');

  const top = el('div', 'hud-top');
  const position = el('div', 'hud-position', '1st');
  const timer = el('div', 'hud-timer', '0:00.0');
  const lap = el('div', 'hud-lap', 'Lap 1/3');
  top.append(position, timer, lap);

  const zoneLeft = el('div', 'zone zone-left');
  zoneLeft.appendChild(el('span', 'arrow', '‹'));
  const zoneRight = el('div', 'zone zone-right');
  zoneRight.appendChild(el('span', 'arrow', '›'));

  const brakeButton = el('button', 'brake', 'BRAKE');
  brakeButton.type = 'button';
  brakeButton.setAttribute('aria-label', 'Brake');

  element.append(zoneLeft, zoneRight, top, brakeButton);
  parent.appendChild(element);

  let hintsUntil = 0;
  let lastText = { position: '', timer: '', lap: '' };
  const now = () => performance.now() / 1000;

  const setText = (node: HTMLElement, key: keyof typeof lastText, text: string) => {
    if (lastText[key] === text) return;
    lastText[key] = text;
    node.textContent = text;
  };

  return {
    element,
    brakeButton,
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
    update(state) {
      setText(position, 'position', ordinal(state.position));
      setText(timer, 'timer', formatRaceTime(state.time));
      setText(lap, 'lap', `Lap ${Math.min(state.lap, state.laps)}/${state.laps}`);
      zoneLeft.classList.toggle('active', state.touch.left);
      zoneRight.classList.toggle('active', state.touch.right);
      brakeButton.classList.toggle('active', state.touch.brake);
      element.classList.toggle('hints-hidden', now() > hintsUntil);
    },
  };
}
