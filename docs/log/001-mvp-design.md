# Iteration 1 — MVP design

**Date**: 2026-10-21
**Goal**: Turn a one-line idea into a minimal, buildable MVP design.

## The conversation

> **Creator**: We are going to build a mobile friendly car racing game - Mario Cart meets Barbie style - called Berby, in which 2 parties race against each other on racing tracks all over the world. Let's start with a MVP design, ask me some questions.

Claude flagged one thing before asking anything: Barbie (Mattel) and Mario Kart (Nintendo) belong to other companies. They work as the *vibe* (glam, pink and pastel, chaotic kart fun), but Berby needs its own original characters, names and art.

Then four questions about the decisions that change the build the most:

| Question | Answer |
|---|---|
| What does "2 parties race against each other" mean for the MVP? | **Player vs AI rival.** Fastest way to prove the game is fun, no servers. (Online 1v1, async ghost races and same-device play were the alternatives.) |
| Which platform? | **Mobile web / PWA.** Runs from a link, installs to the home screen, no app-store review. |
| Camera and visual style? | **3D, behind the kart**, low-poly glossy pastel. |
| Which features are essential: power-ups, drift + boost, character and kart styling, a world tour of tracks? | > **Creator**: Let's store these ideas in a file for later as the MVP should be a minimal product. |

That answer set the tone for the project: the MVP stays minimal and everything else is parked in `IDEAS.md` rather than built. Claude created that file with the four features plus the unchosen multiplayer and native-app options, and asked a second round:

| Question | Answer |
|---|---|
| Controls on a phone? | **Auto-gas + tap zones**: the kart accelerates by itself, hold the left or right half of the screen to steer, small brake button. |
| Orientation? | **Landscape.** |
| The one MVP track: where in the world? | **Malibu beach.** Sunny coastal road, palm trees, pink sunset. |
| Where do the 3D models come from? | **Code + free CC0 packs**, recolored in the Berby palette; real art can be swapped in later. |

## Artifacts

- `MVP.md` — the design: locked decisions, the core loop (title → countdown → 3 laps vs rival → results → race again), kart handling, rival AI with light rubber-banding, checkpoint-based lap counting, the Malibu Sunset Loop track, the palette, screens and HUD, the tech stack (Vite + TypeScript + Three.js, PWA, Howler), performance targets, four milestones.
- `IDEAS.md` — parked features.
- Two original placeholder characters: **Berby** (player, pink kart, heart spoiler) and **Vix** (rival, lavender kart, star spoiler).

## Open at the end of the iteration

- Final character names.
- Hosting.
- Whether the MVP should collect analytics.

**Status**: design done, ready to build.
