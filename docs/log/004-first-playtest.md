# Iteration 4 — First playtest

**Date**: 2026-10-21
**Goal**: See the game run in a browser end to end, then hand it to the creator for the first test on a phone.

## The conversation

The creator installed the Playwright and skill-creator plugins (the suggestions from iteration 3; frontend-design was already installed) and added a process rule:

> **Creator**: Add a note to ask at the end of each iteration if the skill-creator should be run for all berby skills

Added to `CLAUDE.md` and as the closing step of `/berby-log`, so the question comes up every time an iteration is logged.

With Playwright available, Claude switched `/berby-playtest` to it (the Chrome extension was still unreachable) and ran the first scripted race in a headless Chromium at a landscape-phone viewport: title screen → Play → countdown → three laps with Berby on the dev autopilot → results → race again. Everything held: HUD position, lap and timer matched the game state at every sample; 120 fps from the grid to the finish on the development Mac; no console errors or Three.js warnings; Berby finished in 2:56.72 with a best lap of 0:58.31, 100% on road, speeds between 15.8 and 21 m/s, the same numbers as the headless simulation report.

One screenshot looked wrong: the kart in front of the chase camera had Vix's lavender body and star spoiler, with Berby's pink outfit and blonde hair showing above it. Before Claude could finish reasoning about a swapped view, the creator read the picture correctly:

> **Creator**: Vix was touching Berby's bumper, which might confuse us which character the camera is following.

Measured through the dev hook: the camera sits 8.3 m behind Berby, and Vix sits 2.7–5 m behind Berby, inside the camera's line of sight; both kart views track their race states exactly. No bug, but a presentation problem: the rubber band matches Vix's speed to the player's and her line is the same centerline the autopilot drives, so she parks on the player's bumper.

Asked how to handle it (AI that sets up a pass, ghosting of karts that block the view, both, or wait), the creator chose to **leave it for now** and test on a phone first. Parked in `IDEAS.md`.

## Artifacts

- `CLAUDE.md` and `.claude/skills/berby-log` — the end-of-iteration skill-creator question.
- `.claude/skills/berby-playtest` — Playwright first, Chrome extension as fallback.
- `src/game/game.ts` — the dev hook now also reports the world positions of both karts, both views and the camera.
- `IDEAS.md` — the tailgating finding with its two fixes.
- `.gitignore` — Playwright's screenshot folder.

## Status

Browser playtest passed. Next: the creator plays on a phone (the live Pages build is the right target: production build, installable, no server) and reports how steering, braking, the camera and the race against Vix feel, and whether a first try is winnable. That feedback drives the handling and AI tuning in iteration 5.
