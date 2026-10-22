# Iteration 5 — Vix overtakes

**Date**: 2026-10-22
**Goal**: Act on the phone test: make Vix a real opponent who passes instead of tailgating, bring the brake button within reach, and clear two cosmetic items.

## The conversation

Iteration 4 closed with the creator's phone feedback: the kart is very responsive, the camera is good, the audio good enough, the brake button "a pinch out of reach but workable", and a 2:52.79 win with a 56.8 s best lap on a second try by someone who has played other kart games. Vix's best lap was 58.4 s, and in the first corners she sat on the player's bumper, hiding Berby from the chase camera, before dropping out of sight for good.

Asked what iteration 5 should cover, the creator picked all four items the test surfaced: Vix as a real opponent, the tailgating fix, the brake button placement, and the cosmetics (the HUD timer over the start-arch banner, the deploy workflow's action versions). The end-of-iteration skill-creator question got a "not this time".

Three agents again, with disjoint folders, after two stubs were wired first so nobody had to wait on anybody: `kartOcclusion(camera, player, other)` in `src/graphics/camera.ts` and `KartView.setGhost(amount)`, called every frame from `src/game/game.ts`.

| Stream | Work |
|---|---|
| **Simulation** | Vix laps ~57 s like a flat-out player (cornering grip, tighter inside line, less wobble); a stronger rubber band both ways so weaker players still get a close race; overtaking behaviour: when close behind, move to the side with room, pass, blend back; never ram. `RivalContext` gains an optional `player` so she knows where the player is. New tests: time-to-pass a slow player, an equal-AI race finishing within ±2 s. |
| **Graphics** | The occlusion test (is Vix between the camera and Berby, within a kart's width of the line of sight?) and the fade (opacity down to ~0.25, smoothed, no shader churn), plus a preview pose to check it. |
| **UI / tech** | Brake button raised to ~15% of the viewport height with a 1.6× invisible hit area, tunable via a CSS variable; translucent pills behind the HUD labels; GitHub Actions bumped to the current majors. |

## Results

All three streams landed within about 25 minutes of each other; the full check passed first time with 58 tests.

**Vix** (`src/sim/`): she now laps 57.0 s alone (was 58.4), 100% on road, by driving a much tighter inside line (the grip fraction alone was worth only 0.7 s). The rubber band is +11% when 40 m or more behind and −10% when 60 m or more ahead. Overtaking is stateless: on the approach she picks the side opposite the player's offset, holds it while alongside, blends back once 7 m clear, and stays 1.5 m off the line while the player is close behind; if she is boxed in she lifts and brakes rather than ram. Headless: she passes a slower kart in 4.7 s on the straight and 6.5 s in the hill curve with no contact; an equal-AI race from the real grid finishes with her 1.1 s behind. Her context now receives the player's state from `src/game/race.ts`.

**Fade** (`src/graphics/`): `kartOcclusion()` scores how squarely a kart sits on the camera→player line (smooth edges, no allocations), and `setGhost()` eases the kart to 25% opacity and back (the outline fades out first), with the solid↔translucent material switch happening only on transitions; the translucent shader variant is compiled once at startup so the first fade never hitches. Verified in the preview harness: occlusion 1.00 with Vix 3.5 m behind, 0.50 at 1.5 m to the side, Berby fully readable through her, draw calls unchanged.

**UI / deploy**: the brake button sits at 15% of the viewport height (`--brake-offset`), above Android's fullscreen toast, with an invisible hit area 1.6× the circle; the HUD labels got translucent pills; the workflows moved to checkout v7, setup-node v7, configure-pages v6, upload-pages-artifact v5 and deploy-pages v5, all Node 24. A real mouse click on Play was also verified to start a race (a side question raised during the work), and the AudioContext construction is now guarded so a failing audio stack can never block the Play button.

**Playwright runs**: with Berby braked to a stop on the straight, Vix was 26 m clear two seconds later and the −10% penalty then let Berby close from 48 m to 25 m over 17 s; from the grid she passed a stationary Berby on her own side of the road. In both runs the occlusion value stayed at 0: the passing behaviour keeps her out of the camera's line of sight, so the fade is the safety net rather than the fix.

## Status

Pushed to `main` for the phone test: the brake button reach, whether Vix now feels like an opponent, and whether her passes look right. The `iteration/005` branch follows the creator's verdict.
