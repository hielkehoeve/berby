---
name: berby-log
description: Write or update docs/log/NNN-*.md, Berby's public build journal, one entry per iteration. Use at the start of an iteration (the brief and the plan), whenever results land, at the end of an iteration, when agents' reports need condensing into the record, or when the user asks to log the conversation. It also holds the end-of-iteration skill-creator question.
---

The journal (`docs/log/`) is public: one markdown file per iteration so other people can follow how the game was made, which questions were asked, what was decided and why. The convention is in `docs/log/README.md`; the entries for iterations 1 to 6 set the tone.

## When to write

An entry grows during the iteration rather than being written at the end:

1. At the start: the creator's brief (quoted), the questions and answers, the design decisions and the plan (a table of work streams when agents build in parallel). Write it before the agents start; it doubles as the orchestrator's own plan.
2. When results land: a Results section with what was built and how it was verified.
3. At the close: the Status, the commit and the branch. If the iteration continues (iteration 5 got the brake band after the first phone look), update the same file; a new number starts only with a new brief.

## Shape

`# Iteration N — Title`, `**Date**: YYYY-MM-DD` (the iteration's main day; turn "yesterday" and "this morning" into dates), `**Goal**: one line`, then:

- `## The conversation`: the creator's messages verbatim (inline quotes or `> **Creator**:` blocks; trim chat noise only), each followed by what was answered and decided and why. Sub-headings are fine when a decision deserves one ("Choosing the five"). Keep Claude's side summarized, never transcribed.
- `## Results`: one paragraph per work stream, the orchestrator's own verification as its own paragraph, and a short list of things found by testing rather than by the tests (those are the lessons). Numbers belong here: test counts, lap times, draw calls, bundle size, frame rate.
- `## Status`: where things stand, the branch, and what the next iteration starts with. Open questions carry forward explicitly ("the verdict on Vix is still open").

An `## Artifacts` list is optional; files and decisions usually read better inside Results.

## Condensing agent reports

Agents report in 300 to 400 words each, with absolute paths, internal ids and self-assessment. In the journal each becomes one paragraph: what the stream does, the one or two design choices worth knowing, the numbers it measured, the test count. Drop the paths (repo-relative only), the ids, and claims the orchestrator did not verify; when the browser pass contradicted a report, the journal says what was observed. Operational detail that would puzzle a reader of the git history gets one line (a dropped GitHub push event and the manual deploy, a page reload that broke a check).

## Privacy pass

Before finishing, the file must contain none of: email addresses, API keys or tokens, passwords, absolute home-directory paths (`/Users/...`, `/home/...`, `~`), LAN IP addresses, third-party personal data. Check with:
`grep -nE '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}|/(Users|home)/|[0-9]{1,3}(\.[0-9]{1,3}){3}' docs/log/NNN-*.md`
The GitHub handle `hielkehoeve` and the Pages URL are public by design. Run the same grep over `.claude/skills` and `CLAUDE.md` when they changed; they are public too.

## Closing an iteration

1. Don't rewrite history: when an earlier Status promised something this iteration delivered, the new entry reports it.
2. Commit the entry with the work (`docs:`, or inside the `feat:` commit), push, and create `iteration/NNN-short-title` at the resulting commit (see `CLAUDE.md` "Workflow"); if a follow-up commit closes the iteration, move the branch to it.
3. Ask the creator whether to run `/skill-creator` on all berby skills (`.claude/skills/berby-*`) to refine them from how this iteration went. Ask every time; don't assume last time's answer. When the answer is yes, the session itself is the evidence: rewrite the skills from what worked and what went wrong, and offer the skill-creator's full eval loop (fresh agents with and without the skill, a review viewer) separately, since it needs the dev server and a browser and only pays off when the creator wants to invest in it.
