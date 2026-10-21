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

## The phone test

> **Creator**: Can you watch a video screen capture of the game I record on my phone?

Not as a video, but as frames: the creator installed ffmpeg, recorded a race on an Android phone in Chrome from the live Pages build, and dropped the file into the gitignored `playtests/` folder. `scripts/analyze-recording.sh` probed it (185 s, 60 fps, H.264), extracted a frame every half second and ran ffmpeg's freeze detector; a duplicate-frame count over the racing section gave the effective frame rate.

**Results**: the portrait "rotate your phone" overlay, the gesture-based fullscreen and landscape lock, the countdown, HUD, race and results card all worked in the browser tab. 60 fps for the whole race (9,915 unique frames in the 165 s racing window) and no hitch of 100 ms or more between the start and the results; the only stall sits in the countdown right after the fullscreen switch and is most likely the screen recorder, since the countdown digit visibly changed during it. The creator won in 2:52.79 with a best lap of 0:56.78, faster than Vix's best (58.4 s): she sat on the player's bumper through the first corners, then dropped out of frame for good. Two cosmetic notes: the HUD timer overlaps the start arch's banner text on the grid, and Android's fullscreen toast covers the brake button for the first seconds.

> **Creator**: My second try, but I've played other kart games. I did brake in some corners. The button was a pinch out of reach but it is workable for now. The kart is very responsive. Camera is good. [Audio] good enough.

(Claude had guessed from the frames that the steering hints never disappeared; the creator corrected that: they do fade after a few seconds. Frames sampled twice a second can't tell "always visible" from "re-shown on every new press".)

## Status

Both playtests passed; handling, camera and audio are accepted as they are. Iteration 5 takes the three things the test surfaced: Vix should be a real opponent for an experienced player (she finished well behind a 56.8 s lap), the tailgating happens with a human too, and the brake button wants to sit a pinch closer to the thumb. Branch `iteration/004-first-playtest` marks this state.
