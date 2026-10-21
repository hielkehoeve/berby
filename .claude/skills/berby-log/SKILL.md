---
name: berby-log
description: Write or update the docs/log entry for the current iteration of the Berby build journal. Use at the end of an iteration, when an in-progress iteration gets its results, or when the user asks to log the conversation.
---

Berby's build journal (`docs/log/`) is public: one markdown file per iteration so other people can follow how the game was made. Convention: `docs/log/README.md`.

## Steps

1. `ls docs/log` to find the next number (`NNN`, zero-padded) or the in-progress file to update. One file per iteration; an iteration is one round of work that moves the project (design pass, build phase, QA round, …).
2. Write `docs/log/NNN-short-title.md` with these sections:
   - `# Iteration N — Title`, then `**Date**: YYYY-MM-DD` and `**Goal**: one line`.
   - `## The conversation`: the creator's messages quoted verbatim as `> **Creator**: …` (trim only chat noise), each followed by what Claude answered, decided and why. Decision tables are welcome. Keep Claude's side summarized, not transcribed.
   - `## Artifacts`: files, decisions, open questions that came out of it.
   - `## Results` (when the work has landed): what was built, what was verified (commands run, numbers measured), seams found.
   - `## Status`: one line on where things stand and what the next iteration starts with.
3. Mention the iteration branch if one was created (`iteration/NNN-short-title`, see `CLAUDE.md` "Workflow").
4. Privacy pass before finishing — the file must contain none of: email addresses, API keys or tokens, passwords, absolute home-directory paths (`/Users/...`, `/home/...`, `~`), LAN IP addresses, customer or third-party personal data. Paths are repo-relative. Check with:
   `grep -nE '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}|/(Users|home)/|[0-9]{1,3}(\.[0-9]{1,3}){3}' docs/log/NNN-*.md`
   The GitHub handle `hielkehoeve` and the Pages URL are fine (public by design).
5. If an earlier entry's "Status" promised something this iteration delivered, don't rewrite history: the new entry reports it.
