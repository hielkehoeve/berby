import './styles.css';
import { PALETTE_CSS } from '../shared/palette';
import { el } from './dom';
import { createTitleScreen, type TitleScreen } from './title';
import { createHud, type Hud } from './hud';
import { createCountdown, type Countdown } from './countdown';
import { createResultsScreen, type ResultsScreen } from './results';

export interface Ui {
  root: HTMLElement;
  title: TitleScreen;
  hud: Hud;
  countdown: Countdown;
  results: ResultsScreen;
  /** Shown by CSS while a touch device is in portrait. */
  rotate: HTMLElement;
  setMuted(muted: boolean): void;
}

export interface UiHandlers {
  onPlay(): void;
  onRaceAgain(): void;
  onToggleMute(): void;
}

/** Builds every overlay. Layer order, bottom to top: HUD, countdown, results, title, rotate. */
export function createUi(container: HTMLElement, handlers: UiHandlers): Ui {
  applyPalette();

  const root = el('div', 'ui');
  root.id = 'ui';
  container.appendChild(root);

  const hud = createHud(root);
  const countdown = createCountdown(root);
  const results = createResultsScreen(root, handlers);
  const title = createTitleScreen(root, handlers);

  const rotate = el('section', 'rotate');
  rotate.appendChild(el('div', 'phone'));
  rotate.appendChild(el('div', 'message', 'Rotate your phone'));
  rotate.appendChild(el('div', 'hint', 'Berby races in landscape.'));
  root.appendChild(rotate);

  return {
    root,
    title,
    hud,
    countdown,
    results,
    rotate,
    setMuted(muted) {
      title.setMuted(muted);
      results.setMuted(muted);
    },
  };
}

/** Copy the shared palette into CSS custom properties so the DOM and the 3D scene agree. */
function applyPalette(): void {
  const s = document.documentElement.style;
  s.setProperty('--hot-pink', PALETTE_CSS.hotPink);
  s.setProperty('--bubblegum', PALETTE_CSS.bubblegum);
  s.setProperty('--lavender', PALETTE_CSS.lavender);
  s.setProperty('--mint', PALETTE_CSS.mint);
  s.setProperty('--cream', PALETTE_CSS.cream);
  s.setProperty('--sunset', PALETTE_CSS.sunsetOrange);
}
