# Berby — MVP Design

A mobile-web kart racer with a glam, pastel, fashion-forward look. One player races one AI rival on a sunny Malibu coastal track. Parked ideas live in [IDEAS.md](IDEAS.md).

## Locked decisions

| Area        | Decision                                                      |
|-------------|---------------------------------------------------------------|
| Opponent    | Player vs one AI rival (no backend)                           |
| Platform    | Mobile web / PWA, installable to the home screen              |
| View        | 3D, camera behind the kart, low-poly glossy pastel            |
| Controls    | Auto-gas; hold left/right half of the screen to steer; hold the bottom-center band (brake button inside) to brake |
| Orientation | Landscape only (portrait shows a "rotate your phone" prompt)  |
| Track       | One track: Malibu beach                                       |
| Art         | Shapes built in code + free CC0 low-poly packs (Kenney), recolored in the Berby palette |
| Backend     | **None, ever.** Berby is static files in a browser. All state lives on the device (localStorage / IndexedDB); anything shared travels as a link, QR code or file. |
| Browsers    | Latest Chrome, Edge, Safari and Firefox, mobile and desktop. Differences to respect: Safari has no orientation lock and installs as "standalone" rather than "fullscreen"; Firefox only locks orientation inside fullscreen. |
| Permissions | None requested in the MVP: no motion sensors, notifications, camera or location. Fullscreen is a user-gesture API, not a permission, so the Play button may request it. |

Barbie (Mattel) and Mario Kart (Nintendo) are style references only. Berby uses original characters, names and art.

## Core loop

```
Title screen → Countdown (3-2-1-GO) → Race, 3 laps vs rival → Results → Race again
```

One race takes roughly 3 minutes (about 60 s per lap). No menus, no unlocks, no settings beyond a mute button.

## Gameplay

**Kart handling** — arcade, not simulation. A custom kinematic controller, no physics engine:
- Constant acceleration to a top speed; brake slows and allows a tight turn.
- Steering angle scales with speed so the kart doesn't spin at low speed or oversteer at high speed.
- Off-road (sand) cuts top speed to about 60%, so staying on the asphalt matters.
- Hitting a track barrier bounces the kart back and bleeds speed. Karts can bump each other.

**Rival AI** — follows the track centerline using a look-ahead point and steers toward it. Light rubber-banding keeps the race close: a small speed bonus when behind, a small penalty when far ahead. The player should win roughly 50–60% of the time on the first try.

**Laps and checkpoints** — invisible ordered checkpoints along the track. A lap counts only when every checkpoint is passed in order, which blocks shortcuts and reverse driving.

**Win condition** — first to finish 3 laps. The results screen shows the winner, total time and best lap.

## Track: Malibu Sunset Loop

- A closed loop of about 60 s per lap, with a long seaside straight, a hairpin around a beach café, a sweeping hill curve with an ocean view and a short tunnel of palm trees.
- Built from a Catmull-Rom spline: the road mesh is extruded along it, barriers follow the edges, and checkpoints and scenery are placed by distance along the spline. Changing the track means changing a list of points.
- Scenery: ocean on one side with a simple animated wave shader, sand, palm trees, pastel beach houses, a pink-to-orange sunset sky gradient, a few parked karts and flamingo floaties as set dressing.

## Visual style

- **Palette**: hot pink `#FF4FA3`, bubblegum `#FFB3D9`, lavender `#C9A7FF`, mint `#9FF2D8`, cream `#FFF4E6`, sunset orange `#FF9A5C`.
- Flat/toon-ish shading, one directional light with soft shadows, a subtle outline on the karts. No bloom or post-processing (phone performance).
- **Characters** (placeholder names, originals): **Berby** — the player, pink kart with a heart-shaped spoiler. **Vix** — the rival, lavender kart with a star spoiler.

## Screens and HUD

- **Title**: logo, "Play" button, mute toggle. A full-screen "rotate your phone" overlay while in portrait.
- **Race HUD**: position (1st / 2nd) top-left, lap `x/3` top-right, race timer top-center. Translucent steering zones on the left and right halves, a translucent brake band bottom-center with the brake button inside it (the whole band brakes). Zones fade out after a few seconds of play and reappear on touch.
- **Results**: "You won!" or "Vix won", total time, best lap, "Race again" button.

## Tech stack

- **Vite + TypeScript + Three.js** for rendering; no framework for the UI (plain DOM overlays).
- **Custom kart controller** (see Gameplay); no physics library.
- **PWA**: `vite-plugin-pwa` for the manifest and service worker so the game installs and runs offline after first load.
- **Audio**: Web Audio via Howler. Engine loop pitched to speed, one CC0 music track, UI blips. Unlocked on the first tap (mobile autoplay rules).
- **Performance targets**: 60 fps on an iPhone 12 / Pixel 6 class phone, under 5 MB initial download, under 100k triangles in view.
- **Hosting**: GitHub Pages (HTTPS, which PWA install requires). See "Resolved questions".
- **No server, now or later**: every feature must work from static hosting. Future obstacles (multiplayer, sharing) get solved client-side, case by case.

## Out of scope for the MVP

Power-ups, drift/boost, character and kart customization, multiple tracks, online or local multiplayer, native app builds, accounts, leaderboards. All tracked in [IDEAS.md](IDEAS.md).

## Milestones

1. **Gray-box drive** — kart on a flat loop, touch controls, chase camera, lap and checkpoint counting. Goal: driving feels good on a real phone.
2. **A race** — rival AI, countdown, HUD, results screen, race-again loop.
3. **Malibu dressing** — spline road, barriers, ocean, scenery, sky, palette, the two karts.
4. **Ship** — audio, PWA install and offline, performance pass, testing on iOS Safari, Android Chrome and desktop Chrome / Edge / Safari / Firefox (a Playwright smoke test can cover the WebKit and Firefox engines), deploy.

## Resolved questions

- **Character names**: Berby (player) and Vix (rival) are final. More name ideas for a future roster are in [IDEAS.md](IDEAS.md).
- **Hosting**: GitHub Pages at `https://hielkehoeve.github.io/berby/` (repo `hielkehoeve/berby`). The Vite build uses `base: '/berby/'`, and a GitHub Actions workflow deploys `main` to Pages.
- **Analytics**: none in the MVP. Parked in [IDEAS.md](IDEAS.md).
