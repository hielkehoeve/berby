# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Berby is a mobile-web kart racer (player vs an AI rival, one Malibu track) built with Vite + TypeScript + Three.js and shipped as a PWA on GitHub Pages. The design is in `MVP.md`; parked ideas go in `IDEAS.md` instead of into scope.

## Commands

- `npm run check` — typecheck + tests + build. Run it before committing.
- Single test: `npx vitest run src/sim/kart.test.ts` or `npx vitest run -t "name"`.
- `npm run lint` / `npm run format` (ESLint flat config, Prettier).
- `npm run dev` serves `http://localhost:5173/berby/` — the base path is part of the URL; `/` redirects. The server is on the LAN too, for phones.
- Graphics-only preview: `npx vite --port 5174` then open `/berby/preview.html` (dev only, excluded from builds).

## Hard rules

- No server, ever. Static hosting, state on the device (localStorage / IndexedDB), sharing via links, QR codes, files or peer-to-peer. Never propose a backend or an analytics endpoint; present the client-side alternative instead.
- Targets: latest Chrome, Edge, Safari, Firefox, mobile and desktop. Request no permissions (no motion sensors, notifications, camera, location). Fullscreen on the Play tap is fine.
- Barbie and Mario Kart are style references only; characters, names and art are original.
- The base path `/berby/` appears four times in `vite.config.ts` (`base`, PWA `id`, `start_url`, `scope`); change them together.

## Architecture conventions

- `src/shared/types.ts` and `math.ts` are the contract between `sim`, `graphics` and `game`. They were frozen while three agents built in parallel; now change them only together with every implementer, never ad hoc.
- `src/sim/` is headless: no Three.js, no DOM, tests run in Node. Every feel constant lives in `src/sim/tuning.ts` (`PLAYER_TUNING.topSpeed ≈ lap length / 58`).
- Coordinates: Y up, ground is the XZ plane, heading 0 faces −Z (`mesh.rotation.y === heading`), positive steer turns right and decreases heading, positive lateral is left of travel. Meters, seconds, radians.
- Graphics is fully procedural (no asset files). Budget: ~36 draw calls, under 100k triangles. The renderer uses `PCFShadowMap` (the soft variant no longer exists in Three 0.186), no tone mapping, no post-processing.
- `TrackDefinition` carries only geometry; per-track scenery lives in `src/tracks/<track>-scenery.ts`.
- Karts start a few meters before the start line, so `nextCheckpoint` begins at 0 and `progress` is negative on the grid.

## Workflow

- Commit directly to `main` (every push deploys to Pages). Conventional Commits: `feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `test:`.
- Each iteration ends with a journal entry `docs/log/NNN-short-title.md` (convention in `docs/log/README.md`; `/berby-log` writes it) and a branch `iteration/NNN-short-title` at the resulting commit, so anyone can check out the state after each iteration.
- The journal is public: never include email addresses, tokens, keys, passwords or home-directory paths; use repo-relative paths.
- Hooks: `scripts/check-secrets.sh` blocks a commit whose staged files contain secrets or personal data (git pre-commit via `core.hooksPath .githooks`, plus a Claude Code hook on `git commit`). After each edit, Prettier formats the file and `tsc` reports type errors.
- Skills: `/berby-tune` (headless sim report for handling and AI tuning), `/berby-playtest` (drive a lap in a browser and report), `/berby-log`.
- At the end of each iteration, after the journal entry, ask the creator whether to run `/skill-creator` on all berby skills (`.claude/skills/berby-*`) to refine them from how the iteration went.
