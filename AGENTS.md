# Platewise — rules for agents and contributors

Platewise is a clean-room rebuild of the open-source calorie tracker **Fud AI**
(`apoorvdarshan/fud-ai`, MIT) as a mobile-first installable web app. Same features and flows,
none of the original's code, text or assets.

## The reference

- Lives **outside** this repo at `~/reference/fud-ai` (override with `PLATEWISE_REF`), pinned at
  `10e14b67116c52b515d2389621266e32b3a99840`. Read-only: never build, edit, copy or vendor it.
- REA (Reverse Engineer Anything) output lives in `~/rea-lab/` and never enters the repo; cite
  `ev_…` ids only. See `docs/plan/02-rea-workflow.md`.

## The loop for every task (`docs/plan/01-clean-room-protocol.md`)

1. **Read** the research spec (`docs/plan/research/`), then the reference files the phase file
   lists, then its tests.
2. **Note**: write `docs/notes/P<nn>/<slug>.md` from `docs/notes/_template.md` before any code.
3. **Rewrite** with the reference closed, in our own words, names and structure.
4. **Compare**: reopen the reference, close every gap in our own way, tick the checklist.
5. **Check**: tests + `pnpm check --require-ref` (+ the parity scenario for UI flows).

## Never

- Copy reference code, comments, docs, UI copy beyond 1–4 word labels, **AI prompt text**, tests,
  fixtures, colours, icons, illustrations or screenshots.
- Use the reference's names in product code (`src/`, `e2e/`, `tooling/`, `public/`, `scripts/`,
  `parity/`, config). The list is `tooling/checks/banned-patterns.json`; `pnpm check:banned`
  enforces it. Reference names may appear only in `README.md`, `AGENTS.md`, `CLAUDE.md`,
  `THIRD_PARTY_NOTICES.md` and `docs/`.

## Commands (from the repository root)

```bash
pnpm install --frozen-lockfile
pnpm dev                     # app on http://localhost:5173
pnpm typecheck && pnpm lint && pnpm fmt:check
pnpm test                    # unit (Vitest)
pnpm build && pnpm e2e       # browser tests (Playwright, mobile viewport)
PLATEWISE_REF=~/reference/fud-ai pnpm check --require-ref   # clean-room guards
```

## Commits

`platewise(<task ids>): <user-visible effect>`, a body with what and why, then
`Reference: <what was matched, behaviour only>`, `Task note: <path>`, and
`Verified: <exact counts from runs on this head>`. One slice per commit. Never claim a test passed
that you did not run.
