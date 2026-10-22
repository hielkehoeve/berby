# Iteration 6 — Game modes

**Date**: 2026-10-22
**Goal**: Make the game a lot more fun: five new ways to play, each a game mode the player picks from a main menu, built by five agents in parallel on a shared mode framework.

## The conversation

The iteration-5 build went to the phone. The creator's first feedback was about the brake button again: "Let's make the brake button touch area more like the left and right touch areas. The bottom area of the screen can be used to brake. Keep the button though." That became the brake band that closed iteration 5 (see `005-vix-overtakes.md`). The verdict on Vix as an opponent is still open.

Then the brief for this iteration, in the creator's words: "think of five different ways to make this game a lot more fun. Implement these as game play types on a main menu screen the user can pick. Use subagents to divide the work."

### Choosing the five

What makes a kart racer fun beyond the race itself: surprises on the track, a reason to drive one more lap, pressure, a score to beat, and other people. Against the hard constraints (no server, no permissions, no assets, phones at 60 fps), the five picked were:

| Mode | The fun | Why it fits |
|---|---|---|
| **Glam Cup** 💄 | Item boxes and power-ups in the race against Vix: a lipstick rocket (boost), glitter bombs, a homing kiss missile, a heart shield. Vix uses them too. | The classic kart-racer hook; everything is on-device sim and procedural meshes. |
| **Ghost Lap** 👻 | One flat-out lap against the translucent ghost of your own best, with a live delta. | "Beat yourself" is the strongest single-player loop; the best lap lives in localStorage. The ghost rendering already existed (the tailgating fade). |
| **Glitter Rush** ✨ | Lanes of glitter stars; a 75-second timer; a chain multiplier; gold stars on the risky outside of corners. | A score attack with a different skill (reading lanes) on the same track. |
| **Tide Rush** 🌊 | The tide comes in behind you and gets faster; every braked corner lets it gain. How far can you get? | Pressure and tension; a survival mode without a single new asset. |
| **Hot Seat** 🤝 | Two players, one phone: one lap each, the second player chases the first player's ghost; a verdict card. | Social play with no connection at all, the first multiplayer idea from `IDEAS.md` that needs nothing to be solved. |

The classic race stays as **Race Vix** 🏁, so the menu has six cards.

Ideas considered and parked: drift-and-boost (a handling change rather than a mode; it stays in `IDEAS.md`), a four-kart knockout (the rival AI only knows about one other kart), reverse and mirror tracks (variety, not fun), a checkpoint-dash timer (too close to Tide Rush).

### The framework first, then five agents

A mode touches the state machine, the HUD, the results card and the scene, so five agents editing `game.ts` at once would have collided. Claude built the framework alone first and committed it, then started the agents.

- `src/modes/types.ts` is the contract: a `GameMode` has a menu card and creates a `ModeSession`; a session runs one or more *runs*, each a countdown, a race and an end. Per run the session says how many laps and who the rival kart is (`'ai'`: Vix races; `'ghost'`: the session places the kart each frame, drawn translucent; `'none'`: hidden). Each fixed step the engine moves the karts, then calls the session, which may adjust any kart (a boost holds the speed, a hit spins the heading), end the run itself (a timer, a chaser), describe the HUD (three pills, a status line, an action button) and, at the end, a results card or an intermission followed by another run (pass the phone).
- The engine (`src/game/game.ts`) got a `menu` phase and the run loop; the race model (`src/game/race.ts`) got `withLaps()` and a no-rival option; the controls got an action button and keys (E, Enter, W, Up); the audio got seven short effects for the modes; `src/game/storage.ts` wraps localStorage; `src/modes/shared/recording.ts` records a run at 20 Hz and replays it as a ghost, with a lookup of the time at any progress for live deltas.
- The main menu replaced the title screen: the wordmark over a 3×2 grid of cards, each a mode. The results card is generic (headline, rows, lines, a primary button and Menu).
- Stubs for the five modes exercised every engine path in the browser before the agents started: a timed run that ends itself, the hidden rival, the ghost role, a two-run session with an intermission, the action button.

Then five agents, one per mode, each owning only `src/modes/<id>/`, briefed with the contract, the APIs they may use, the budgets (draw calls, no per-frame allocations) and a test requirement, and told not to start browsers: the orchestrator runs the browser checks after integration.

## Results

The five agents reported within about fifteen minutes of each other. An import audit confirmed that none of them touched a file outside its folder (the only imports beyond the allowed set are type-only imports of the audio interface), and the full check passed with 207 tests, up from 67 when the agents started. Three agents independently asked for the same small engine nicety, a valid race progress on the grid before the first step; it went in while they were still working, with all of their tests passing against it.

**Glam Cup** (`src/modes/cup/`, 36 tests): twelve item boxes in four rows, four items with their own effects and visuals (instanced boxes with outline shells, instanced bombs, one homing heart, a shield ring per kart; 3 to 6 draw calls, 6k triangles, no per-frame allocations), items rolled by the gap to the other kart, a spin-out that is exactly one turn in 0.8 s, and a pure decision function for Vix's item use with tests. In the browser: a Heart Shield at 7.8 s, `USE 💖` on the action button, "Shield up", then "Vix dropped a bomb!", "Vix fired a missile!" and "Shield broke!" within the first thirty seconds, at 120 fps on the Mac.

**Ghost Lap** (`src/modes/ghost/`, 17 tests): one lap from a standing start, the run recorded at 20 Hz, the best kept in localStorage (30 KB per lap) with an in-memory fallback when storage is off, the ghost sampled into one reused kart state, a live delta with a hysteresis band on the "Ghost ahead" / "You're ahead" status. In the browser: first lap "New best!" at 0:58.68, second lap the translucent ghost exactly on the player with `+0.00`, a one-second brake made it `+1.65` with "Ghost ahead".

**Glitter Rush** (`src/modes/rush/`, 43 tests): 96 glitter stars every 12 m in seeded lane runs that only ever move to a neighbouring lane, ten gold stars on the outside of the six corners, a binary-search window so only nearby stars are tested each step, two instanced meshes of extruded stars (2 draw calls), the chain multiplier and the clock bonuses. In the browser the autopilot's racing line collected 54 glitter with a longest chain of 14 (×2), the status lines "×2!" and "Chain lost" appeared, and the card read "New best!".

**Tide Rush** (`src/modes/tide/`, 24 tests): the tide as a closed-form function of time (15 m/s, +0.5 m/s every 10 s, capped at 24), a curling wave front with a foam cap and a flooded ribbon rewritten from track samples every frame (2 draw calls), bests in whole meters. In the browser a kart holding the brake from GO was washed out at 2.6 s with the wave sweeping through the camera as a translucent wash during the coast; the autopilot's clean run had the gap at 137 m after 20 s.

**Hot Seat** (`src/modes/hotseat/`, 19 tests): run 1 solo, the intermission card, run 2 against Player 1's ghost with a live delta, a verdict card with the gap and the fastest run ever driven on the phone. In the browser: "Pass the phone", run 2 with the ghost on the grid slot and "Catch Player 1!", a braked start showing `+1.94`.

Two things found by the browser pass rather than the tests: the dev hook's autopilot overrode scripted input, so a mode check that braked the kart did nothing until the override was given precedence; and the main-menu cards shared a CSS class with the results card, which stretched them off the grid until they got their own class.

Numbers: the bundle grew from 644 to 677 kB (170 to 183 kB gzipped); each mode adds between zero and six draw calls on top of the scene's 36; every mode ran at the Mac's 120 fps cap. The remaining open point from iteration 5 is unchanged: the creator's verdict on Vix as an opponent.

## Status

Pushed to `main` and deployed; `iteration/006-game-modes` marks the state. GitHub dropped the push event for the commit (no workflow started on either workflow although the remote head was right), so the deploy was dispatched by hand for the same commit. The end-of-iteration skill-creator question got a "Yes" this time: the three Berby skills were rewritten from this iteration's evidence (the per-mode browser routine with its reference numbers, the page-reload trap while agents edit, the per-mode tuning files, and how agent reports are condensed into this journal), without the skill-creator's full eval loop, which was offered separately. Next is the phone test of the six modes: which ones are fun, which need tuning, and whether the action button and the brake band sit under the thumbs.
