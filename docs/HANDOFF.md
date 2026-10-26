# Handoff: state of the Platewise build

Updated: 2026-10-26 (lead agent, session 1). Work paused by the user after the plan landed; build wave 1 had not landed.

## Where things are

| Item | State |
|---|---|
| Repository | `varunisrani/cal.2`, branch `main` (moved from the `platewise/` folder of `varunisrani/Ai1`, branch `claude/elegant-cannon-peaxt4`, with its history). Paths in the plan docs that start with `platewise/` now mean the repository root |
| Reference | `~/reference/fud-ai` at `10e14b67116c52b515d2389621266e32b3a99840` (re-clone and check out that commit if the container was reset) |
| REA | `~/rea-lab/rea` wraps `npx -y rea-agents@6.8.0` on Node 24.22.1 (`nvm install 24.22.1` if missing). Evidence and captures live in `~/rea-lab/`; nothing of it is in the repo |
| Plan | `docs/plan/` (start at `README.md` once the planner lands it) |

## Done

| Stage | What landed | Commits |
|---|---|---|
| 0 Intake | Decisions (`docs/plan/00-decisions.md`) | 9f076fa |
| 1 Research | Seven behavioural specs, 5,784 lines, 162 numbered traps, all overlap-checked (`docs/plan/research/`) | f70d055 … 588e438, 3cbc936 |
| 2 Clean room | Protocol, REA workflow, AGENTS.md, notices; guards in `tooling/checks` (86 unit tests) | c739f45, 98b7385 |
| 3 Plan | Architecture (`04`), what-we-change with 48 decisions (`16`) | c4e9439, 8aa4b28 |
| P00 | Skeleton (React 19, TS 6, Vite 8, Vitest 5, Playwright 1.63, pnpm), smoke e2e | 9f076fa, f6e38c0 |

## In progress

Nothing. The plan has landed: `docs/plan/` holds 11 phase files (P00–P10, 176 tasks), the
traps ledger and the acceptance map. Decisions D-16.1 to D-16.66 are confirmed. CI is
`.github/workflows/ci.yml`.

## Next

1. Wave 1 (no shared files): P00 S1 (P00-08 clock and ids, P00-01 CI refinements, P00-10 bundle
   budget), P00 S2 (P00-02..04 tokens, theme, icons), P00 S3 (P00-05/06 i18n), and P01 wave A
   (P01-01/02 domain types and dates). A first attempt at the three P00 slices was stopped
   unfinished when the user paused the build, and nothing of it landed. Start them again from
   the phase file.
2. Then the remaining P00 slices, P01 wave B, P02 and P03, in waves of up to four builders, then
   P04 walking skeleton (Demo 1) and P05–P10.

## How to resume

- Builder rules: `/root/wt/builder-rules.md` (outside the repo; copy from the skill template if
  lost). Worktrees go under `/root/wt/`, patches under `/root/wt/patches/`.
- Full loop (from `platewise/`): `pnpm lint && pnpm fmt:check && pnpm typecheck && pnpm test`,
  `pnpm build && pnpm exec playwright test --output /root/wt/e2e-<slug>`,
  `PLATEWISE_REF=~/reference/fud-ai pnpm check --require-ref`.
- The repo root's `.gitignore` is a Python one. `platewise/.gitignore` re-includes `lib/` and
  similar names; check `git check-ignore -v <path>` when a builder's file is missing from a patch.
