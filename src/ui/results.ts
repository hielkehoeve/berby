import { button, el, hide, show } from './dom';
import { formatLapTime } from './format';
import { muteLabel } from './title';

export interface ResultsData {
  won: boolean;
  totalTime: number;
  bestLap: number | null;
}

export interface ResultsScreen {
  element: HTMLElement;
  show(data: ResultsData): void;
  hide(): void;
  setMuted(muted: boolean): void;
}

export interface ResultsHandlers {
  onRaceAgain(): void;
  onToggleMute(): void;
}

export function createResultsScreen(parent: HTMLElement, handlers: ResultsHandlers): ResultsScreen {
  const element = el('section', 'layer results hidden');
  element.setAttribute('aria-label', 'Results');

  const card = el('div', 'card');
  const headline = el('h2', 'headline glam', 'You won!');
  headline.style.margin = '0';
  const stats = el('dl', 'stats');
  const totalLabel = el('dt', undefined, 'Total time');
  const totalValue = el('dd', undefined, '0:00.00');
  const bestLabel = el('dt', undefined, 'Best lap');
  const bestValue = el('dd', undefined, '--');
  stats.append(totalLabel, totalValue, bestLabel, bestValue);
  const again = button('btn', 'Race again', handlers.onRaceAgain);
  card.append(headline, stats, again);

  const mute = button('btn btn-icon mute', muteLabel(false), handlers.onToggleMute);
  mute.setAttribute('aria-label', 'Toggle sound');

  element.append(card, mute);
  parent.appendChild(element);

  return {
    element,
    show(data) {
      headline.textContent = data.won ? 'You won!' : 'Vix won';
      headline.classList.toggle('glam', data.won);
      headline.classList.toggle('glam-lavender', !data.won);
      element.classList.toggle('lost', !data.won);
      totalValue.textContent = formatLapTime(data.totalTime);
      bestValue.textContent = data.bestLap === null ? '--' : formatLapTime(data.bestLap);
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
