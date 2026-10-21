---
name: berby-playtest
description: Launch Berby in Chrome, drive a race with the dev autopilot or the keyboard, and report screenshots, console errors, frame rate and race results. Use after changes to the game loop, graphics, UI or sim integration, or when the user asks to see the game running.
---

## Setup

1. Dev server: if `curl -s -o /dev/null -w '%{http_code}' http://localhost:5173/berby/` is not `200`, start `npx vite --port 5173 --strictPort` in the background and wait for it.
2. Load the Chrome tools in ONE ToolSearch call: `select:mcp__claude-in-chrome__tabs_context_mcp,mcp__claude-in-chrome__tabs_create_mcp,mcp__claude-in-chrome__tabs_close_mcp,mcp__claude-in-chrome__navigate,mcp__claude-in-chrome__computer,mcp__claude-in-chrome__javascript_tool,mcp__claude-in-chrome__read_console_messages,mcp__claude-in-chrome__resize_window`.
3. `tabs_context_mcp` (createIfEmpty), then `tabs_create_mcp`, `resize_window` to 900×450 (a landscape phone shape), `navigate` to `http://localhost:5173/berby/`. If the extension reports "not connected" twice, stop and tell the user; don't keep retrying.

## Drive

The game exposes a dev-only hook, `window.__berby` (only when `import.meta.env.DEV`):

- `__berby.phase` — `'title' | 'countdown' | 'racing' | 'finished'`.
- `__berby.play()` — same as tapping Play (unlocks audio, starts the countdown).
- `__berby.autopilot(true|false)` — the player kart is driven by the rival AI; `false` returns control to touch/keyboard.
- `__berby.input({ steer, brake })` — override the player input for scripted moves (`null` clears it).
- `__berby.state()` — `{ phase, time, lap, position, playerSpeed, playerOnRoad, rivalLap, fps }`; `fps` is a rolling average over the last second.
- `__berby.raceAgain()` — tap "Race again" on the results screen.

A standard run: screenshot the title → `__berby.play()` → wait 4 s → screenshot (GO banner / grid) → `__berby.autopilot(true)` → poll `__berby.state()` every ~10 s until `phase === 'finished'` (about 3 minutes; take a screenshot at the hairpin and the palm tunnel when `lap` changes) → screenshot the results card → `__berby.raceAgain()` once to verify the reset.

For handling checks, use `__berby.input({steer: 1, brake: 0})` for a second, then `null`, and watch `playerSpeed`/`playerOnRoad`; keyboard events through the `computer` tool cannot be held down, so prefer the hook.

## Report

- `read_console_messages` with `onlyErrors: true` plus pattern `warn|error|THREE` for Three.js warnings. Any error is a finding.
- Frame rate from `state().fps` at three points (grid, mid-race, finish); below 50 on this Mac is a finding since phones are slower.
- Race outcome: who won, total time, best lap, and whether lap/position/timer in the HUD matched `state()`.
- Visual findings from the screenshots (z-fighting, clipping, unreadable HUD, camera through walls).
- Close the tab with `tabs_close_mcp`, and stop the dev server if this skill started it.
