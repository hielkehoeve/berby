import { el, hide, replay, show } from './dom';

export interface Countdown {
  element: HTMLElement;
  /** Show a value ("3", "2", "1", "GO") with the pop animation. */
  show(label: string): void;
  hide(): void;
}

export function createCountdown(parent: HTMLElement): Countdown {
  const element = el('section', 'layer countdown hidden');
  element.setAttribute('aria-live', 'assertive');
  const number = el('div', 'number glam');
  element.appendChild(number);
  parent.appendChild(element);

  return {
    element,
    show(label) {
      number.textContent = label;
      number.classList.toggle('glam', label !== 'GO');
      number.classList.toggle('glam-lavender', label === 'GO');
      show(element);
      replay(number, 'pop');
    },
    hide: () => hide(element),
  };
}
