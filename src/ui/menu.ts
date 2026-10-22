import type { ModeId, ModeInfo } from '../modes/types';
import { button, el, hide, show } from './dom';

export interface MenuScreen {
  element: HTMLElement;
  show(): void;
  hide(): void;
  setMuted(muted: boolean): void;
}

export interface MenuHandlers {
  onPick(id: ModeId): void;
  onToggleMute(): void;
}

export function muteLabel(muted: boolean): string {
  return muted ? '🔇' : '🔊';
}

/** The main menu: the wordmark and one card per game mode. Tapping a card starts that mode. */
export function createMenuScreen(parent: HTMLElement, modes: readonly ModeInfo[], handlers: MenuHandlers): MenuScreen {
  const element = el('section', 'layer menu fade-in');
  element.setAttribute('aria-label', 'Main menu');

  const head = el('header', 'menu-head');
  const wordmark = el('h1', 'wordmark glam', 'Berby');
  wordmark.style.margin = '0';
  const tagline = el('p', 'tagline', 'Malibu Sunset Loop · pick a game');
  tagline.style.margin = '0';
  head.append(wordmark, tagline);

  const cards = el('div', 'cards');
  for (const info of modes) {
    const card = button('mode-card', '', () => handlers.onPick(info.id));
    card.dataset.mode = info.id;
    card.setAttribute('aria-label', `${info.name}: ${info.tagline}`);
    card.append(
      el('span', 'card-icon', info.icon),
      el('span', 'card-name', info.name),
      el('span', 'card-tagline', info.tagline),
    );
    cards.appendChild(card);
  }

  const hint = el(
    'p',
    'hint',
    'Auto-gas. Hold the left or right side of the screen to steer, the bottom middle to brake.',
  );
  hint.style.margin = '0';
  const mute = button('btn btn-icon mute', muteLabel(false), handlers.onToggleMute);
  mute.setAttribute('aria-label', 'Toggle sound');

  element.append(head, cards, hint, mute);
  parent.appendChild(element);

  return {
    element,
    show: () => show(element),
    hide: () => hide(element),
    setMuted(muted) {
      mute.textContent = muteLabel(muted);
      mute.classList.toggle('muted', muted);
    },
  };
}
