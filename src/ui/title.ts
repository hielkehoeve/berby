import { button, el, hide, show } from './dom';

export interface TitleScreen {
  element: HTMLElement;
  show(): void;
  hide(): void;
  setMuted(muted: boolean): void;
}

export interface TitleHandlers {
  onPlay(): void;
  onToggleMute(): void;
}

export function muteLabel(muted: boolean): string {
  return muted ? '🔇' : '🔊';
}

export function createTitleScreen(parent: HTMLElement, handlers: TitleHandlers): TitleScreen {
  const element = el('section', 'layer title fade-in');
  element.setAttribute('aria-label', 'Title');

  const wordmark = el('h1', 'wordmark glam', 'Berby');
  wordmark.style.margin = '0';
  const tagline = el('p', 'tagline', 'Malibu Sunset Loop · 3 laps · you vs Vix');
  tagline.style.margin = '0';
  const play = button('btn btn-play', 'Play', handlers.onPlay);
  const hint = el(
    'p',
    'hint',
    'Auto-gas. Hold the left or right half of the screen to steer, tap the bottom button to brake.',
  );
  hint.style.margin = '0';
  const mute = button('btn btn-icon mute', muteLabel(false), handlers.onToggleMute);
  mute.setAttribute('aria-label', 'Toggle sound');

  element.append(wordmark, tagline, play, hint, mute);
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
