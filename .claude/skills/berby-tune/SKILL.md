---
name: berby-tune
description: Run the headless Berby simulation report (rival alone, rival vs a stand-in player) and interpret lap times, on-road ratio and finish gaps against the design targets, then suggest which constant in src/sim/tuning.ts to change. Use when tuning handling, the rival AI, rubber-banding, or after changing the track layout.
---

The simulation is headless (`src/sim/`, no Three.js), so the race can be measured without a browser.

## Run

```
BERBY_REPORT=1 npx vitest run src/sim/report.test.ts --silent=false
```

`src/sim/report.test.ts` is skipped unless `BERBY_REPORT=1`, so it never runs in CI. `--silent=false` is required: Vitest hides console output from passing tests by default. It prints:

- Track: lap length, checkpoints, tightest radius.
- Rival alone (no rubber band, dt = 1/60, 3 laps): lap times, finish time, on-road share of steps, max |lateral|, min speed.
- Rival (rubber-banded) vs a stand-in player: the stand-in drives the same AI with a 5 % handicap and no rubber band; reports both finish times, the gap, and the gap against an un-banded rival for comparison.
- A clean flat-out lap estimate: `length / PLAYER_TUNING.topSpeed`.

## Targets (from MVP.md and docs/log/002)

| Measure | Target |
|---|---|
| Rival lap time | 55–65 s (about 60) |
| Rival on-road share | ≥ 97 %, ideally 100 % |
| Banded finish gap vs 5 %-slower stand-in | 1–4 s, and under half the un-banded gap |
| Player win rate on a first try | 50–60 % (only measurable on a device; the stand-in gap is the proxy) |

## Levers (all in `src/sim/tuning.ts`)

- Lap time too long/short → `PLAYER_TUNING.topSpeed ≈ lap length / 58`. The rival inherits it.
- Rival leaves the road or brakes too late → `RIVAL_TUNING.corneringGripFraction` (lower = more careful), `curvePreview`, `planHorizon`.
- Rival too good → raise `lineWobbleAmplitude`, lower `corneringGripFraction`; too weak → the reverse.
- Races not close enough → `RUBBER_BAND` (speed bonus when behind, penalty when ahead, and the distance thresholds).
- Handling feel (only on a device): `maxLateralAccel` (grip), `steerResponse`/`steerReturn`, `brakeGripBonus`, `barrierSpeedLoss`.

After any change: `npx vitest run src/sim` must stay green (the tests assert ranges, not exact numbers), then re-run the report and compare.
