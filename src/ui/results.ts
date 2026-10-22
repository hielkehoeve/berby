import { button, el, hide, show } from './dom';
import { muteLabel } from './menu';

export type ResultsTone = 'win' | 'lose' | 'neutral';

/** A card at the end of a run: the modes describe it, the engine shows it. */
export interface ResultsView {
  headline: string;
  tone: ResultsTone;
  /** Label / value rows. */
  rows: [string, string][];
  /** Free lines above the rows (an intermission message). */
  lines?: string[];
  /** Label of the primary button. */
  primary: string;
  /** Whether the "Menu" button is offered. */
  menu: boolean;
}

export interface ResultsScreen {
  element: HTMLElement;
  show(view: ResultsView): void;
  hide(): void;
  setMuted(muted: boolean): void;
}

export interface ResultsHandlers {
  onPrimary(): void;
  onMenu(): void;
  onToggleMute(): void;
}

export function createResultsScreen(parent: HTMLElement, handlers: ResultsHandlers): ResultsScreen {
  const element = el('section', 'layer results hidden');
  element.setAttribute('aria-label', 'Results');

  const card = el('div', 'card');
  const headline = el('h2', 'headline glam', '');
  headline.style.margin = '0';
  const lines = el('div', 'lines');
  const stats = el('dl', 'stats');
  const buttons = el('div', 'buttons');
  const primary = button('btn btn-primary', 'Race again', handlers.onPrimary);
  const menu = button('btn btn-secondary', 'Menu', handlers.onMenu);
  buttons.append(primary, menu);
  card.append(headline, lines, stats, buttons);

  const mute = button('btn btn-icon mute', muteLabel(false), handlers.onToggleMute);
  mute.setAttribute('aria-label', 'Toggle sound');

  element.append(card, mute);
  parent.appendChild(element);

  return {
    element,
    show(view) {
      headline.textContent = view.headline;
      headline.classList.toggle('glam', view.tone !== 'lose');
      headline.classList.toggle('glam-lavender', view.tone === 'lose');
      element.classList.toggle('lost', view.tone === 'lose');
      lines.replaceChildren(...(view.lines ?? []).map((text) => el('p', 'line', text)));
      lines.classList.toggle('hidden', !view.lines?.length);
      stats.replaceChildren(
        ...view.rows.flatMap(([label, value]) => [el('dt', undefined, label), el('dd', undefined, value)]),
      );
      stats.classList.toggle('hidden', view.rows.length === 0);
      primary.textContent = view.primary;
      menu.classList.toggle('hidden', !view.menu);
      element.classList.add('fade-in');
      show(element);
    },
    hide: () => hide(element),
    setMuted(muted) {
      mute.textContent = muteLabel(muted);
      mute.classList.toggle('muted', muted);
    },
  };
}
