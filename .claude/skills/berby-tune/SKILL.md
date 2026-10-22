---
name: berby-tune
description: Measure and tune Berby's feel without a browser: the headless sim report (Vix alone, Vix against a stand-in player), the overtaking scenarios, and each game mode's own tuning file with its headless autopilot tests. Use when tuning handling, the rival AI, rubber-banding or overtaking, when a mode feels too easy, too hard or too long, after changing the track, or when phone feedback says a number is off (the tide too slow, the chain too hard, Vix too strong).
---

Everything that shapes feel is a constant in one of a few files, and every one of them can be measured headlessly: `src/sim/` has no Three.js and the modes keep their logic in pure functions. Measure first, change one constant, measure again.

## Ground truth from the phone

Phone tests outrank every headless number. So far (iterations 4 and 5): a second-try player who knows kart games won 2:52.79 with a 56.8 s best lap; Vix alone laps in 57.0 s; the brake needed a band, not a button. Add new phone numbers here when they come in, so the targets stay honest.

## The race

Run: `BERBY_REPORT=1 npx vitest run src/sim/report.test.ts --silent=false` (skipped without the variable so CI never runs it; `--silent=false` because Vitest hides the console output of passing tests). It prints the track figures, Vix alone (lap times, on-road share, max |lateral|, min speed), the banded Vix against a stand-in player 5 % slower (both finish times and the gap, plus the un-banded gap), and the flat-out lap estimate `length / topSpeed`.

| Measure | Target |
|---|---|
| Vix alone, lap time | 56.5–57.5 s: the pace of a flat-out player on a good inside line |
| Vix on-road share | ≥ 97 %, ideally 100 % |
| Banded gap vs the 5 %-slower stand-in | 1–4 s, and under half the un-banded gap |
| Equal AI vs AI from the real grid | finishes within ±2 s (`src/sim/rival.test.ts`) |
| Time to pass a slower kart | about 5 s on the straight, 7 s in the hill curve, no contact (`passScenario` in `src/sim/scenarios.ts`) |
| Player win rate on a first try | 50–60 %, only measurable on a phone |

Levers, all in `src/sim/tuning.ts`:

- Lap time: `PLAYER_TUNING.topSpeed ≈ lap length / 58`; Vix inherits it.
- Vix leaves the road or brakes late: `RIVAL_TUNING.corneringGripFraction` (lower = more careful), `curvePreview`, `planHorizon`. Her line: `insideGain`, `maxLateralTarget`, `lineMargin`, `lineWobbleAmplitude`.
- Races not close: `RUBBER_BAND` (+11 % when 40 m behind, −10 % when 60 m ahead).
- Tailgating or clumsy passes: `OVERTAKE_TUNING` (`approachRange`, `passMargin`, `minRoom`, `blockGap`, `dontBlockOffset`); in a playtest `state().occlusion` should stay near 0.
- Handling feel (phone only): `maxLateralAccel`, `steerResponse` and `steerReturn`, `brakeGripBonus`, `barrierSpeedLoss`.

After a change: `npx vitest run src/sim` stays green (the tests assert ranges, not exact numbers), then re-run the report and compare.

## The modes

Each mode's constants live in its own file with a doc comment per knob, and each mode has headless tests that drive a real race with the autopilot; those tests are the instrument: `npx vitest run src/modes/<id>` (add `--reporter=verbose` to see which case moved).

| Mode | Knobs | Headless reference (autopilot) |
|---|---|---|
| Glam Cup, `src/modes/cup/tuning.ts` | box rows and slots, roll weights by gap, rocket factor and duration, bomb life and pool, missile speed, life and range, spin factor and duration, shield, Vix's hold time | 100 s deterministic race: 12 pickups, 11 uses, 4 hits (`cup.test.ts`); first pickup at about 7.8 s |
| Ghost Lap, `GHOST_TUNING` in `src/modes/ghost/ghost-lap.ts` | record rate, quantization, the ±0.3 s status band | identical laps give a delta within 0.05 s |
| Glitter Rush, `src/modes/rush/tuning.ts` | timer, star spacing and lane runs, gold count and bonus seconds, chain window and the ×2 and ×3 thresholds, respawn | 54 glitter, longest chain 14, 0 gold in 75 s (the autopilot never leaves the racing line) |
| Tide Rush, `src/modes/tide/tuning.ts` | start gap, start speed, step and interval, max speed, warning gap, wave size | a stopped kart is caught at 3.0 s; 14 m/s lasts about 30 s; a clean 21.3 m/s run about 333 s; 24.5 m/s is never caught |
| Hot Seat, `src/modes/hotseat/tuning.ts` | dead-heat window, catch-message seconds, lead deadband and hold, tick spacing | identical laps: "Dead heat!", gap +0.00 |

Reading the references: the autopilot drives the racing line at full speed, so it is an upper bound for a human on glitter and distance and a lower bound on hits taken; a mode whose autopilot number sits far from what the phone reports is the one to tune. Feel a change in a browser afterwards (`/berby-playtest`), then on the phone.
