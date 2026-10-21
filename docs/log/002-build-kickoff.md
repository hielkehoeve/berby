# Iteration 2 — Build kickoff: contract first, then three agents in parallel

**Date**: 2026-10-21
**Goal**: Start building the MVP with parallel work streams for graphics, the rival AI and the tech stack.

## The conversation

> **Creator**: Lets begin. Start sub agents for graphics model, ai model and the tech stack.

Three agents editing one project at the same time only works if they can't trample each other, so Claude did the shared groundwork first, alone:

1. `git init`, `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `.gitignore`.
2. A **frozen contract** in `src/shared/`: `types.ts` (track definition, sampled track, kart input and state, race progress), `math.ts` (coordinate helpers) and `palette.ts`. The contract fixes the conventions everyone depends on: Y up, ground on the XZ plane, heading 0 faces −Z so `mesh.rotation.y === heading`, positive steer turns right and *decreases* heading.
3. **Compiling stubs** for every module boundary (`src/sim/track.ts`, `kart.ts`, `rival.ts`, `race.ts`, `src/graphics/world.ts`, `kart-mesh.ts`, `camera.ts`, `src/tracks/malibu.ts`) with the exported signatures each agent must keep. A first rough Malibu layout went into the track file.
4. `npm install` once, up front (Three.js 0.186, Howler 2.2, Vite 8, TypeScript 7, Vitest 5, vite-plugin-pwa 2), because concurrent installs in one directory corrupt `node_modules`. Then a typecheck to confirm a green baseline.

While that was going on, the creator answered the open questions from iteration 1:

> **Creator**: "Final names for the player and rival characters": Berby and Vix are good names. Can you give me a list of idea's?
> 
> "Where to host the game (and whether a domain already exists)." Lets start with a github pages (my user is https://github.com/hielkehoeve)
> 
> "Should the MVP collect any analytics (e.g. races started/finished)?" No, but that is a good idea (add).

> **Creator**: start any number of subagents when this is useful

Decisions recorded in `MVP.md`: Berby and Vix are final; hosting is GitHub Pages at `hielkehoeve.github.io/berby` (so the Vite build uses `base: '/berby/'` and a GitHub Actions workflow deploys `main`); no analytics in the MVP. Name ideas for a future roster and a lightweight analytics idea went into `IDEAS.md`.

Two small contract additions before launch, so the agents would not need to coordinate: `stepRival()` as the single call the game loop makes for the rival (rubber-banding can then live entirely inside the sim), and optional `background`, `fog` and a `focus` position on the world object (so the graphics stream owns the sky and shadows, and the game loop just wires them).

Then three agents were launched in parallel, each with its own folders and the instruction to keep the stub signatures, never touch `src/shared/`, and not to run `npm install`:

| Agent | Owns | Builds |
|---|---|---|
| **Simulation** | `src/sim/` | Closed centripetal Catmull-Rom spline with arc-length sampling; arcade kart controller (bicycle model, speed-dependent steering lock, sand slowdown, barriers, kart bumps); Vix's AI (pure-pursuit look-ahead, braking for curvature, rubber-banding); checkpoint and lap tracking; Vitest tests including a headless "Vix drives 3 laps alone" race. No Three.js in the sim so tests run in Node. |
| **Graphics** | `src/graphics/`, `src/tracks/` | The Malibu world (road ribbon with curbs, barriers, animated ocean, sunset sky dome, palms, beach houses, the café at the hairpin, start arch), the two stylized karts (heart spoiler for Berby, star for Vix), chase camera, lighting; a `preview.html` harness for visual checks. |
| **Tech stack** | tooling, `src/engine/`, `src/input/`, `src/ui/`, `src/audio/`, `src/game/`, `src/main.ts` | Vite + PWA config with the Pages base path, deploy workflow, fixed-timestep game loop, touch zones and brake button with keyboard fallback, title / HUD / countdown / results overlays, synthesized engine audio, README, and the integration that makes it a playable race. |

> **Creator**: Also: Log our conversations per iteration to markdown files so we can place them in github for other people to read. Keep sensitive data (email, keys, passwords) private.

Which is why this folder exists; see `docs/log/README.md` for the convention and the privacy rule.

> **Creator**: Suggest any skill which can help you build this game. I got no clue which you could need.

Claude listed the Claude Code skills it would use (browser automation for playtesting, code review, a `CLAUDE.md` via `init`, hooks, a permission allow-list, deep research for iOS PWA quirks) and three project-specific skills worth creating later: `berby-playtest` (scripted lap with screenshots and console errors), `berby-tune` (headless sim runs that report lap times and the win margin) and `berby-log` (writes these journal entries with the privacy checklist). The creator approved. The first piece, done right away because it must exist before the first commit: a secret scanner (`scripts/check-secrets.sh`) that blocks a commit when staged files contain email addresses, API keys, tokens, private keys, passwords or home-directory paths. It runs both as a git pre-commit hook and as a Claude Code hook on `git commit`.

> **Creator**: Note, though. that this game should be a browser game (PWA) without any server. Not now, not later. We might bump into obstacles when adding more features but we will tackle those bumps and find a solution to each of them.

Recorded as a locked decision in `MVP.md`. The parked ideas were reworded to fit: multiplayer becomes peer-to-peer over WebRTC with the connection offer passed as a link or QR code, ghost races travel as links, analytics becomes an on-device stats screen.

> **Creator**: The game should be playable on the latest versions of Chrome, Edge, Safari, FireFox. We might ask for some permissions later on, but none for now.

Also locked in `MVP.md`, with the browser differences that matter (Safari: no orientation lock, "standalone" instead of "fullscreen" when installed; Firefox: orientation lock only inside fullscreen) and the rule that nothing permission-gated (motion sensors, notifications, camera, location) goes into the MVP. Tilt steering moved to `IDEAS.md` for that reason.

## Artifacts

- Project scaffold and the frozen contract in `src/shared/`.
- `MVP.md` updated with the resolved questions; `IDEAS.md` with name ideas and the analytics idea.
- `docs/log/` — this journal.

## Results

All three agents finished within about 40 minutes of each other, and their pieces fit together on the first try because of the contract: typecheck clean, 55 tests passing across the streams, production build at 169 kB gzipped (the 5 MB budget is far away).

**Simulation** (`src/sim/`): a closed centripetal Catmull-Rom spline sampled every 0.5 m, so lookups are O(1); a kinematic bicycle model whose steering lock shrinks with speed (grip-limited, 44 m minimum turn radius at top speed); sand at 60% speed; barriers that bleed speed on impact and turn the nose along the wall so the kart peels off; kart bumps that exchange speed. Vix drives pure-pursuit toward a look-ahead point offset to the inside of corners, brakes for curvature up to 70 m ahead, and follows a slow sinusoidal wobble so the line isn't perfect; rubber-banding gives ±8% top speed depending on the gap. Lap tracking is wrap-aware and reverse-proof. Measured on Malibu: Vix alone laps in 58–60 s and never leaves the road; a 5%-slower stand-in player finishes 1.8 s behind a banded Vix versus 7.5 s behind an unbanded one. All tuning lives in `src/sim/tuning.ts`.

**Graphics** (`src/graphics/`, `src/tracks/`): the Malibu layout was re-laid to 35 control points (1214 m, minimum radius 25 m): seaside straight with the ocean on the left, a right sweeper, the café hairpin, the long hill curve, a south leg and the palm tunnel. Everything is procedural: sky dome with sun disc and matching fog, animated ocean with foam, road ribbon with pink/white curbs and dashes, striped walls, ~130 instanced palms, beach houses, the café with striped awning, umbrellas, flamingo floaties, a lifeguard tower, a start arch with a "BERBY" banner. Berby (hot pink, blonde ponytail with a bow, heart spoiler) and Vix (lavender, dark bob, star spoiler) are merged toon meshes with outline shells, about 3k triangles each; wheels steer and spin, bodies lean. The chase camera damps position and yaw, widens its field of view with speed and slides to open up the inside of turns. 36 draw calls, ~75k triangles.

**Tech stack**: Vite + PWA (manifest, icons rasterized from an SVG, offline precache), the Pages deploy workflow plus a CI workflow for pull requests, a fixed 60 Hz loop that pauses when the tab is hidden, pointer-based steering zones and a brake button with keyboard fallback, title / HUD / countdown / results overlays with safe-area insets and a portrait "rotate" overlay, a Web Audio engine hum and jingles with mute persisted on the device, and the race state machine that wires it all.

**Seams found during integration** (all small): the renderer asked for a soft shadow-map type that Three 0.186 removed; the camera now snaps to the grid at race start instead of swooping over from the title orbit; the engine sound scales with the sim's real top speed (21 m/s) instead of a guessed 30; a stale lap-length comment.

**Also this iteration**: the secret scanner and its two hooks (git pre-commit and Claude Code), and the no-server / four-browsers / no-permissions constraints in `MVP.md`.

## Status

Playable build on disk; first browser playtest, `CLAUDE.md`, the permission allow-list and the first commit follow in iteration 3.
