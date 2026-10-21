# Berby

A mobile-web kart racer with a glam, pastel look. You race one AI rival, Vix, over three laps
of the Malibu Sunset Loop. Landscape only, auto-gas: hold the left or right half of the screen
to steer and tap the button at the bottom to brake. Built with Vite, TypeScript and Three.js,
installable as a PWA and playable offline after the first load.

The design is in [MVP.md](MVP.md); parked ideas are in [IDEAS.md](IDEAS.md).

## Run it

Node 24 (see `.nvmrc`).

```sh
npm ci
npm run dev        # dev server, also reachable on the LAN
npm test           # vitest (node environment, src/**/*.test.ts)
npm run typecheck  # tsc --noEmit
npm run lint       # oxlint
npm run format     # prettier --write
npm run check      # typecheck + lint + format check + tests + build, what CI runs
npm run build      # typecheck + vite build into dist/
npm run preview    # serve dist/ (LAN too), with the service worker active
```

After cloning, enable the pre-commit secret scan once: `git config core.hooksPath .githooks`.

Everything is served under the `/berby/` base path (the GitHub Pages URL), so the dev server
lives at `http://localhost:5173/berby/`, not at `/`.

### On a phone

1. Put the phone on the same Wi-Fi as your computer.
2. `npm run dev` prints a `Network:` address such as `http://192.168.1.20:5173/berby/`. Open it
   on the phone.
3. Turn the phone sideways. Portrait shows a "rotate your phone" overlay.

`npm run build && npm run preview` serves the production build the same way, with the service
worker, so you can test install ("Add to Home Screen") and offline play. The dev server has no
service worker. Fullscreen and orientation lock need HTTPS or `localhost` on Android Chrome;
iOS Safari supports neither for web pages, which is fine, the game just runs in the tab.

Desktop keys for development: arrows or A/D steer, down arrow, S or Space brake.

## Deploy

Pushing to `main` runs `.github/workflows/deploy.yml`: `npm ci`, `npm test`, `npm run build`,
then the `dist/` folder is published to GitHub Pages at
<https://hielkehoeve.github.io/berby/>. The repository's Pages source must be set to
"GitHub Actions" once. Pull requests run `.github/workflows/ci.yml` (test + build only).

`vite.config.ts` sets `base: '/berby/'` and the PWA manifest's `start_url`, `scope` and `id` to
match; change all of them together if the game ever moves.

## Module map

```
src/
  shared/    The contract between modules: types.ts (Track, KartState, KartInput,
             RaceProgress...), math.ts (headings, wrapping, lerp), palette.ts (the colors)
  sim/       Headless simulation, no Three.js: track.ts (Catmull-Rom spline track), kart.ts
             (arcade kart controller), rival.ts (AI + rubber-banding), race.ts (laps and
             checkpoints), tuning.ts (every feel constant), report.test.ts (tuning report)
  graphics/  Three.js: world.ts (road, ocean, sky, scenery, lights), kart-mesh.ts (the karts),
             camera.ts (chase camera), materials.ts (toon materials, shapes, helpers),
             preview.ts (dev harness, served as /berby/preview.html)
  tracks/    malibu.ts (control points), malibu-scenery.ts (what sits where along the track)
  engine/    renderer.ts (WebGLRenderer, pixel ratio, resize), loop.ts (fixed 60 Hz step,
             render every frame, pause when hidden), clock.ts
  input/     controls.ts (touch halves + brake button + keyboard -> KartInput),
             gestures.ts (no zoom / selection / pull-to-refresh)
  ui/        Plain DOM overlays: title, hud, countdown, results, the rotate prompt, styles.css
  audio/     audio.ts (Web Audio synth: engine hum, beeps, stings, mute), samples.ts (Howler
             wrapper for future sample playback, loaded lazily)
  game/      race.ts (race model: grid, stepping, ranking, winner), game.ts (state machine,
             integration, the window.__berby dev hook), fullscreen.ts
  main.ts    Bootstrap: service worker, gesture suppression, createGame()
public/      Icons and other static files. All 3D content is procedural; there are no models.
scripts/     check-secrets.sh (blocks commits containing secrets or personal data),
             post-edit.sh (Claude Code hook: format + typecheck after edits)
docs/log/    The build journal: one entry per iteration of the conversation that built Berby
```

### Game flow

```
title --Play--> countdown (3 s, karts frozen) --GO--> racing --player finishes--> finished
  ^                                                                                 |
  +------------------------------- Race again ---------------------------------------+
```

Each fixed step while racing: `stepKart(player, input)`, `stepRival(rival, {progress})`,
`resolveKartCollision`, `updateRaceProgress` for both. The race ends when the player crosses the
finish line on lap 3; Vix wins if she crossed it first. Each rendered frame: kart views,
chase camera, `world.update`, HUD, engine sound.
