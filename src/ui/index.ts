import './styles.css';
import { PALETTE_CSS } from '../shared/palette';
import type { ModeId, ModeInfo } from '../modes/types';
import { el } from './dom';
import { createMenuScreen, type MenuScreen } from './menu';
import { createHud, type Hud } from './hud';
import { createCountdown, type Countdown } from './countdown';
import { createResultsScreen, type ResultsScreen } from './results';

export interface Ui {
  root: HTMLElement;
  menu: MenuScreen;
  hud: Hud;
  countdown: Countdown;
  results: ResultsScreen;
  /** Shown by CSS while a touch device is in portrait. */
  rotate: HTMLElement;
  setMuted(muted: boolean): void;
}

export interface UiHandlers {
  /** The cards on the main menu, in order. */
  modes: readonly ModeInfo[];
  /** A mode card was tapped. */
  onPick(id: ModeId): void;
  /** The primary button on the results card: race again, or the next run after an intermission. */
  onPrimary(): void;
  /** Back to the main menu from the results card. */
  onMenu(): void;
  onToggleMute(): void;
}

/** Builds every overlay. Layer order, bottom to top: HUD, countdown, results, menu, rotate. */
export function createUi(container: HTMLElement, handlers: UiHandlers): Ui {
  applyPalette();

  const root = el('div', 'ui');
  root.id = 'ui';
  container.appendChild(root);

  const hud = createHud(root);
  const countdown = createCountdown(root);
  const results = createResultsScreen(root, handlers);
  const menu = createMenuScreen(root, handlers.modes, handlers);

  const rotate = el('section', 'rotate');
  rotate.appendChild(el('div', 'phone'));
  rotate.appendChild(el('div', 'message', 'Rotate your phone'));
  rotate.appendChild(el('div', 'hint', 'Berby races in landscape.'));
  root.appendChild(rotate);

  return {
    root,
    menu,
    hud,
    countdown,
    results,
    rotate,
    setMuted(muted) {
      menu.setMuted(muted);
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
