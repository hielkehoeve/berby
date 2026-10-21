import { registerSW } from 'virtual:pwa-register';
import { suppressBrowserGestures } from './input/gestures';
import { createGame } from './game/game';

// Service worker: precaches the build so the game runs offline and updates itself silently.
try {
  registerSW({ immediate: true });
} catch {
  /* no service worker support (or dev server) */
}

suppressBrowserGestures();

const app = document.getElementById('app');
if (!app) throw new Error('Missing #app container');

try {
  createGame(app).start();
} catch (err) {
  console.error(err);
  const message = document.createElement('div');
  message.className = 'fatal';
  message.textContent = 'Berby needs WebGL to run. Try a recent version of Safari or Chrome.';
  app.appendChild(message);
}
