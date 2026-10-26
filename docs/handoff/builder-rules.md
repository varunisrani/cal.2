# Rules for every Platewise builder

Platewise is a clean-room rebuild of the open-source calorie tracker Fud AI as a mobile-first
installable web app: one Vite + React + TypeScript package at the root of your worktree (no
`platewise/` folder any more: paths in the plan that start with `platewise/` mean the worktree
root). The plan lives in `docs/plan/` (phase files in `docs/plan/phases/`, conventions in
`docs/plan/phases/00-layout-and-conventions.md`, behaviour specs in `docs/plan/research/`). The task
ids in your prompt (`P00-08`, `P01-02`) are rows of the phase files.

## Where you work
- Only inside your own worktree (its path is in your task). Never touch `/home/user/cal.2` (the
  lead's checkout), `/root/wt/verify*` or another builder's worktree: other agents are editing them.
- Do **not** commit, stash, reset, rebase or push. Leave your changes uncommitted; the lead takes a
  diff of your worktree and verifies it. Never run `git checkout -- <file>` or `git restore` on a
  file you did not change yourself.
- Dependencies are already installed. Do not run `pnpm install` or add a dependency: if you need
  one, stop and say so in your report (the lead installs once, for everyone).
- Own only the files your task names, plus new files you create for it. If you must touch a file
  outside that set, keep the change to the lines your task needs and list it in your final report.

## Clean room (CI enforces it)
- The loop for every task: **Read** the research spec section, then the reference files the phase
  row lists, then their tests → **Note** (write the task note first) → **Rewrite** with the
  reference closed, in our own words, names and structure → **Compare**: reopen the reference, close
  gaps our own way, tick the note's compare checklist naming the test for each tick.
- Never copy reference code, comments, docs, UI copy beyond 1–4 word labels, AI prompt text, tests,
  fixtures, colours, icons or assets. The reference is at `/root/reference/fud-ai` (pinned
  `10e14b67`), outside the repo, read-only: never build, edit or copy from it.
- Never use the reference's names in product code (`src/`, `e2e/`, `tooling/`, `public/`,
  `scripts/`, config). The list is `tooling/checks/banned-patterns.json`.
- Task note first: `docs/notes/P<nn>/<slug>.md` from `docs/notes/_template.md` (slugs are listed at
  the end of each phase file). Fill everything above "Compare checklist" before writing code.

## Decisions
- Decisions in your task and in `docs/plan/16-what-we-change.md` (D-16.1…D-16.66, all confirmed)
  are final. If one you need is missing, take the smallest choice that is easy to change later,
  write it under "Decisions for the lead" in your task note, and go on. A message from the lead
  during your run overrides earlier text.

## The machine is shared (4 cores, 4 builders)
- Never run the full suites (`pnpm test`, `pnpm e2e`): the lead runs them, one at a time. Run only
  the tests you touch, with one worker, from the worktree root:
  - unit: `pnpm vitest run <file or folder> --maxWorkers=1`
  - e2e: `pnpm build` once, then `pnpm exec playwright test <spec> --workers=1 --output /root/wt/e2e-<slug>`
- Real waits are banned in tests: fake timers and the clock helpers. A test that fails under load
  is not "a flake" until it also fails, or passes, run alone: say which, with counts.
- Before you finish, all of these must be clean on your worktree: `pnpm lint`, `pnpm fmt:check`
  (fix with `pnpm exec prettier --write <your files>` only), `pnpm typecheck`, your targeted tests,
  and `PLATEWISE_REF=/root/reference/fud-ai pnpm check --require-ref`.

## Style
- Match the surrounding code: naming, comment density, test layout, error handling. Keep each change
  minimal; no drive-by refactors. Plain, short copy. TypeScript strict; no `any` without a reason.

## Final report (your last message, short)
1. Files changed (paths), with files outside your set marked "shared".
2. Per task id: done / partly / not done, one line each, with why for anything not done.
3. Tests and checks you ran, with exact counts (`41/41 passed`, `lint clean`). Say "not run" and
   why for anything skipped. **Never claim a test passed that you did not run.**
4. What the lead must record: intended differences from the reference, decisions you took,
   follow-ups you found but did not fix, trap ids (Rnn.mm) your tests now cover.
