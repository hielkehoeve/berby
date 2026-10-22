---
name: berby-playtest
description: Launch Berby in a headless browser, drive any game mode through the dev hook (autopilot, scripted input, the action button) and report screenshots, console errors, frame rate and results. Use after any change to src/game, src/modes, graphics, UI, input or the sim integration, after parallel agents have all reported, before a build goes to the phone, and whenever the user asks to see or verify the game or a mode running. Also covers analyzing phone screen recordings dropped into playtests/.
---

Berby runs in the browser only, so the way to see a change working is to drive it. The game exposes a dev-only hook, `window.__berby`, that starts modes and reads the state, and the Playwright plugin can script a whole check in one call. The checks below are the ones that found real problems in iterations 4 to 6; adapt them rather than running them by rote.

## Setup

1. Dev server: `curl -s -o /dev/null -w '%{http_code}' http://localhost:5173/berby/`; if not `200`, start `npx vite --port 5173 --strictPort` in the background and poll the curl until it is (no foreground sleep).
2. Nobody else may be editing. Vite reloads the page when a file is saved, which silently resets a running check to the menu (`state()` then shows `phase: 'menu', mode: 'race'`). While subagents are writing code, run their unit tests instead and do the browser pass once every agent has reported.
3. Load the Playwright tools in ONE ToolSearch call: `select:mcp__plugin_playwright_playwright__browser_navigate,mcp__plugin_playwright_playwright__browser_resize,mcp__plugin_playwright_playwright__browser_run_code_unsafe,mcp__plugin_playwright_playwright__browser_take_screenshot,mcp__plugin_playwright_playwright__browser_console_messages,mcp__plugin_playwright_playwright__browser_close`. Navigate to `http://localhost:5173/berby/` and resize to 780×360 (a phone in landscape; 900×450 also works). Screenshots must be saved under the project root: `.playwright-mcp/<name>.png` (gitignored); look at them with the Read tool.
   Fallback only if Playwright is missing: Claude in Chrome (`tabs_context_mcp`, `tabs_create_mcp`, `navigate`, `javascript_tool`, `computer`, `read_console_messages`, `tabs_close_mcp`). If the extension says "not connected" twice, stop and tell the user.

## The hook

`window.__berby` exists only in dev builds (`import.meta.env.DEV`):

| Call | Does |
|---|---|
| `phase` | `'menu'`, `'countdown'`, `'racing'` or `'finished'` |
| `play(modeId)` | starts a mode from the menu without the fullscreen request; ids from `src/modes/registry.ts`: `race` (default), `cup`, `ghost`, `rush`, `tide`, `hotseat` |
| `autopilot(on)` | the rival AI drives the player's kart; it stays on across modes and menu visits, so switch it off when a check ends |
| `input({ steer, brake })` | a fixed input that overrides touch and the autopilot (a braked kart under autopilot really stops); `null` clears it |
| `action()` | presses the mode action button (use an item) |
| `primary()`, `menu()` | the results card's primary button (race again, or the next run after an intermission); back to the menu |
| `state()` | `{ phase, mode, run, time, lap, position, playerSpeed, playerOnRoad, rivalLap, winner, fps, hud, finish, occlusion, positions }`: `hud` is the mode's HUD strings (`left`, `center`, `right`, `status`, `action`), `finish` the results card or intermission once the run ended (`null` before), `fps` a rolling average over the last second, `positions` the world positions of both karts, both views and the camera |

## Scripting a check

Use `browser_run_code_unsafe` with one script per check: it starts the mode, waits on conditions, takes screenshots at the right moment and returns one JSON summary. Many separate `browser_evaluate` calls miss the moments that matter (a pickup, the catch, the card), which last a second. Keep each script under about 90 s and split a long race into consecutive calls. The shape that worked:

```js
async (page) => {
  const out = {};
  await page.evaluate(() => { try { localStorage.removeItem('berby.rush.best'); } catch {} }); // the first-time path
  await page.evaluate(() => window.__berby.play('rush'));
  await page.waitForFunction(() => window.__berby.phase === 'racing', null, { timeout: 8000 });
  await page.evaluate(() => window.__berby.autopilot(true));
  await page.waitForTimeout(3000);
  await page.screenshot({ path: '.playwright-mcp/rush-stars.png' });
  await page.waitForFunction(() => window.__berby.state().finish !== null, null, { timeout: 85000 });
  out.finish = await page.evaluate(() => window.__berby.state().finish);
  await page.evaluate(() => { window.__berby.autopilot(false); window.__berby.menu(); });
  return JSON.stringify(out, null, 1);
}
```

Real clicks for the UI: `page.locator('.mode-card[data-mode="cup"]').click()`, `page.locator('.results .btn-primary').click()`. Touch controls: `page.mouse.move(x, y)` then `page.mouse.down()` on the HUD, and read the `active` class on `.zone-left`, `.zone-right`, `.zone-brake` and `.brake`; `page.locator('.zone-brake').boundingBox()` gives the band's geometry. A `waitForFunction` that times out usually means the page reloaded (see Setup) or the autopilot was left on by an earlier check.

## What to check

The classic run: screenshot the menu, `play('race')`, `autopilot(true)`, screenshots when `lap` changes (the hairpin and the palm tunnel are the heaviest scenery), the results card, `primary()` once to verify the reset, `menu()`. About three minutes.

Per mode, with the reference numbers from iteration 6 under the autopilot on this Mac. A deviation is a finding to explain, not necessarily a bug:

| Mode | Check | Reference |
|---|---|---|
| `cup` | `hud.action` appears after the first box row and `action()` fires it; status lines from Vix ("Vix fired a missile!") within 30 s; results rows Items used and Hits landed | first pickup at about 7.8 s (the row at 130 m) |
| `ghost` | first run "New best!"; `primary()` then the ghost kart on the player with `right` near `+0.00`; `input({ brake: 1 })` for a second gives a positive delta and "Ghost ahead" | lap 0:58.68, about 30 KB in `berby.ghost.best` |
| `rush` | the score rises on the center lane, `×2` from a chain of 10, the run ends at `0:00.0`, "New best!" | 54 glitter, longest chain 14 in 75 s |
| `tide` | countdown HUD `🌊 45 m`; `input({ brake: 1 })` from GO: caught, the wave through the camera during the coast, "Washed out!"; a clean run's gap grows | caught at 2.6 s; gap 137 m after 20 s |
| `hotseat` | run 1 ends in "Pass the phone"; `primary()` starts run 2 with the ghost on the grid slot; a brake makes the delta positive | lap 0:58.68 |

Clear the mode's `berby.<mode>.best` key first when the first-time path matters. The status line shows one message at a time, so a warning can hide behind an intro message: wait for the state, not for the string. After every mode: `menu()` and a screenshot of the menu to confirm the mode's objects are gone (dispose). A new mode needs its row here: the check that proves its loop and the number a healthy run produces.

## Phone recordings

The creator can screen-record the game on a phone and drop the file into `playtests/` (gitignored). Then:

1. `chmod +x scripts/analyze-recording.sh` once, then `scripts/analyze-recording.sh playtests/<file>.mp4` (needs ffmpeg). It prints codec, resolution, frame rate and duration, extracts frames at 2 per second into `playtests/<file>/frames/`, and lists freezes of 100 ms or more.
2. Read the frames with the Read tool (frame N is at t = (N−1)/2 s). Look at: where the kart sits on the road through the hairpin and the palm tunnel, whether Vix blocks the view, the HUD and the mode's status line, the brake band, the action button and the thumbs, the rotate overlay in portrait, the results card.
3. Treat each freeze as a finding with its timestamp; match it to what was on screen in the nearest frames.
4. Frames cannot tell you what a control felt like or whether hints faded: ask the creator rather than inferring it (iteration 4's guess about the hints was wrong). Audio can't be judged from frames either.

## Report

- Console: `browser_console_messages` at level `warning` with `all: true`. Any error, and any Three.js warning, is a finding.
- Frame rate from `state().fps` at three points; the Mac caps at 120, below 50 is a finding since phones are slower.
- Outcome per check: the numbers against the references above, and whether the HUD strings matched `state().hud`.
- Visual findings from the screenshots (z-fighting, clipping, unreadable HUD, camera through walls, leftover mode objects on the menu).
- Switch the autopilot off, close the browser (`browser_close`), and stop the dev server if this skill started it (`pkill -f "vite --port 5173"`).
