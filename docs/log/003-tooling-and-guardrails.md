# Iteration 3 — Tooling and guardrails

**Date**: 2026-10-21
**Goal**: Give the project the setup that keeps later iterations fast and safe: a `CLAUDE.md`, lint and format tooling, hooks, project skills, and a scripted way to playtest.

## The conversation

The creator had approved the tooling plan in iteration 2 ("Your suggestion sounds great."). Claude ran `/init` and asked the questions the code can't answer:

| Question | Answer |
|---|---|
| Which `CLAUDE.md`? | **Project `CLAUDE.md`**, shared in the repo. |
| Also skills and hooks? | **Skills + hooks.** |
| How do changes reach `main`? | **Commit directly to `main`, plus a branch for each iteration's result.** Every push to `main` deploys to GitHub Pages; the branch marks the state at the end of an iteration so anyone can check it out. |
| Commit message style? | **Conventional Commits** (`feat:`, `fix:`, `docs:`, `chore:`…). |
| The repo has no linter or formatter; set up ESLint + Prettier? | **Yes.** |

A survey agent read the manifests, README, workflows and hooks first, and found a few README slips (the module map missed several files; it mentioned a `public/models` folder that doesn't exist; `npm run check` was undocumented), which were fixed.

**ESLint didn't fit.** The repo is on TypeScript 7, the native compiler, which has no JavaScript compiler API; `typescript-eslint` requires one and pins TypeScript below 6.1, so the install refused. Rather than downgrade TypeScript, Claude paired Prettier with **oxlint**, which runs the same ESLint and TypeScript rule families natively. One Prettier pass reformatted 23 files; typecheck and tests stayed green.

**The Chrome extension was unreachable** when Claude tried to open the game for a first playtest ("Browser extension is not connected", twice), although the graphics agent had used it successfully earlier in the session. The playtest moved to the next iteration; meanwhile the dev server was reachable on the local network, so a phone could already open the game.

## Artifacts

- `CLAUDE.md` — commands, hard rules (no server, four browsers, no permissions, original IP), architecture conventions (contract, headless sim, coordinates, graphics budget), workflow (direct to `main`, Conventional Commits, iteration branches and journal, hooks, skills).
- **Hooks**: `scripts/post-edit.sh` formats every edited file with Prettier and, for TypeScript files, runs `tsc --noEmit` and feeds errors back to Claude; `.claude/settings.json` wires it as a PostToolUse hook next to the secret scanner, and carries a permission allow-list for the read-only commands (`tsc`, `vitest`, `oxlint`, `prettier --check`, the secret scan).
- **Skills** in `.claude/skills/`: `berby-log` (writes these entries, privacy checklist included), `berby-tune` (runs the headless simulation report and maps results to constants in `src/sim/tuning.ts`), `berby-playtest` (drives a race in Chrome through a dev-only `window.__berby` hook and reports screenshots, console errors and frame rate).
- `src/sim/report.test.ts` — the simulation report behind `/berby-tune`, skipped unless `BERBY_REPORT=1`. Current numbers: Malibu 1214 m, tightest radius 28 m; Vix alone 60.2 / 58.4 / 58.4 s, 100% on road; a 5%-slower stand-in finishes 1.8 s behind a rubber-banded Vix versus 7.5 s behind an un-banded one, all inside the targets.
- `src/game/game.ts` — the `window.__berby` dev hook (`play`, `autopilot`, `input`, `state` with fps, `raceAgain`), present only in dev builds.
- `.oxlintrc.json`, `.prettierrc`, `.prettierignore`, new `lint` / `format` / `format:check` scripts, and `npm run check` now runs typecheck, lint, format check, tests and build.

## Status

The project is ready for its first commit on `main` and the `iteration/003-tooling-and-guardrails` branch, then the GitHub repository and Pages. First browser playtest as soon as the extension reconnects.
