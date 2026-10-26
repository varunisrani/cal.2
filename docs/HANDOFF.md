# Handoff: state of the Platewise build

Updated: 2026-10-26 23:35 IST (Agent 2). Waves 1 and 2 landed (16/176 tasks; P00 complete). The user started the new
session as **Agent 2** (Account 2) and gave it the turn; Agent 1 session 2 has stopped (routines off,
pushes nothing more). Agent 2 holds the lock (`ACTIVE`) and works on `main`.

## New session: start here

1. Re-create the machine state (a fresh container has none of it):
   - `git clone https://github.com/apoorvdarshan/fud-ai.git /root/reference/fud-ai && git -C
     /root/reference/fud-ai checkout 10e14b67116c52b515d2389621266e32b3a99840` (outside the repo).
   - `pnpm install --frozen-lockfile` at the repository root.
   - `mkdir -p /root/wt/patches /root/rea-lab/{evidence,parity,captures}`; copy
     `docs/handoff/builder-rules.md` to `/root/wt/builder-rules.md` (builders read it there); copy
     `extract-patch.sh` and `land-patches.sh` from the clean-room-rebuild skill's `scripts/` to
     `/root/wt/`.
2. Verify the snapshot before anything else: `pnpm lint && pnpm fmt:check && pnpm typecheck` and
   `PLATEWISE_REF=/root/reference/fud-ai pnpm check --require-ref`. Session 2 left it green (local
   full loop and GitHub CI run 5 on dc4efdd). Write the result under "Resume notes" below.
3. Set the lock and status: `.agents/turn.json` `{turn: AGENT_1, status: ACTIVE}`, `.agents/agent-1.json`
   `state: ACTIVE` with your own usage reading; add a row to `.agents/usage-log-agent-1.md`; push with
   `.agents/agent-sync.sh`.
4. Arm the usage guard for **your** session (session 2's routines were bound to session 2 and are off):
   a `send_later` check-in (30 min below 75 %, 10 min from 75 % with builders running) and one hourly
   auto-continue `create_trigger` bound to your session. Prompts: the skill's
   `assets/routine-prompts.md`. Times in IST.
5. Launch wave 2: four worktrees `/root/wt/wt-{p00s2,p00s4,p00s5,p01b1}` detached at the branch head,
   install each sequentially, replace `<BASE>` in `docs/handoff/wave2/w2-*.txt` with the short sha,
   and launch one builder per prompt in the background. Prompts and owned paths do not overlap except
   `src/i18n/en.ts` (S2 adds `appearance`, S4 may add `shell`: one line each, merge by hand).
6. Then land, verify (`bash scripts/ci-local.sh`) and push as below, and continue with "Next".

## Where things are

| Item | State |
|---|---|
| Repository | `varunisrani/cal.2`; `main` = `claude/focused-brahmagupta-9l3emz` (session 2's work branch) at the commit that carries this page. Push to the branch your session names, or `main` when the user says so; never force-push. Moved from the `platewise/` folder of `varunisrani/Ai1`, branch `claude/elegant-cannon-peaxt4`, with its history. Paths in the plan docs that start with `platewise/` now mean the repository root |
| Reference | `~/reference/fud-ai` at `10e14b67116c52b515d2389621266e32b3a99840` (re-clone and check out that commit if the container was reset) |
| REA | `~/rea-lab/rea` wraps `npx -y rea-agents@6.8.0` on Node 24.22.1 (`nvm install 24.22.1` if missing). Evidence and captures live in `~/rea-lab/`; nothing of it is in the repo |
| Plan | `docs/plan/` (start at `README.md`) |
| Handoff kit | `docs/handoff/builder-rules.md` (builder rules), `docs/handoff/wave2/` (the four wave-2 prompts, ready to launch) |

## Done

| Stage | What landed | Commits |
|---|---|---|
| 0 Intake | Decisions (`docs/plan/00-decisions.md`) | 9f076fa |
| 1 Research | Seven behavioural specs, 5,784 lines, 162 numbered traps, all overlap-checked (`docs/plan/research/`) | f70d055 … 588e438, 3cbc936 |
| 2 Clean room | Protocol, REA workflow, AGENTS.md, notices; guards in `tooling/checks` (86 unit tests) | c739f45, 98b7385 |
| 3 Plan | Architecture (`04`), what-we-change with 48 decisions (`16`) | c4e9439, 8aa4b28 |
| P00 | Skeleton (React 19, TS 6, Vite 8, Vitest 5, Playwright 1.63, pnpm), smoke e2e | 9f076fa, f6e38c0 |
| Wave 1 | P00-08, P00-01, P00-10 (clock, ids, test time, CI pinned + `scripts/ci-local.sh`, bundle budget) | 4b31214 |
| Wave 1 | P01-01, P01-02 (domain records, day keys and windows) | e081191 |
| Wave 1 | P00-05, P00-06 (catalogue, typed `t()`, catalogue lint, Intl helpers) | 4ffda80 |
| Wave 2 | P00-07 (lint boundaries and the copy rule) | b7d7ec4 |
| Wave 2 | P00-09 (scripted fake AI provider, Playwright globalSetup) | 09c9f45 |
| Wave 2 | P01-03..06 (energy, body, water units, locale defaults, number parsing, amount expressions) | c16190d |
| Wave 2 | P00-02..04 (tokens, six accents, theme runtime, contrast sweep, icon set); **P00 done** | 4d279e6 |

## In progress

Wave 3, launched 2026-10-26 23:50 IST by Agent 2: three builders (P01 wave B S2, S3, S4) in
`/root/wt/wt-{p01b2,p01b3,p01b4}`, prompts in `docs/handoff/wave3/` (base filled in at launch).
Nothing landed from it yet. If this session dies, relaunch wave 3 from those prompts.

Last verified head: `4d279e6` (wave 2, **16/176 tasks**; P00: 10/10, P01: 6/19).

## Next

1. Land wave 3 (P01 wave B S2, S3, S4), then P01 wave C (S5 = P01-17..19, after S2 and S4).
2. Then P02, P03, P04 walking skeleton (Demo 1) and P05–P10.

## Open questions for the user

- Decimal parsing (P01-06, as specified): a lone comma is read as a decimal mark, so "1,000" typed
  in en-US reads as 1, not 1000 ("0,5" reads 0.5). Changing it means running the comma step only
  when the locale's decimal mark is a comma. Kept as specified until the user decides.

## Notes for later waves (from wave-1 builders; put them in the prompts)

- P00-09 (S5): Playwright's default `testMatch` also matches `*.test.ts`, so set
  `testMatch: '**/*.spec.ts'` (or a `testIgnore`) or `pnpm e2e` runs the Vitest files in
  `e2e/fake-ai/`. The reporter is `list` only; add `html` (open: never) if the CI upload should hold
  a report.
- P00-07 (S4): allow `src/domain` → `src/lib` imports (`src/lib` imports nothing; P01-14 returns a
  `Result`). Node-only test helpers declare a minimal `process` type, because `tsconfig.app.json`
  has no Node types: keep it that way.
- Catalogue partitions (D-16.55 detail): a partition exports a tree rooted at its area
  (`x = { x: {…} }`); landing one = `import { x } from './en/x'` plus `x` in `enPartitions` in
  `src/i18n/en.ts` (the lead does it). `TKey` from `src/i18n/t.ts` types a key in props and tables
  (e.g. the accent labels of P00-02). Plurals follow English rules; numbers the browser locale.
- Durations: UI uses `formatDuration(minutes)` from `src/i18n/format.ts` ("16h 30m"); P01-19's
  fast helper should return numbers, not text.
- Names fixed by `src/domain/model.ts` (P01-07 and the P03 reply contract use them): nutrient keys
  such as `fibre`, `monounsaturatedFat`, `polyunsaturatedFat`; extras `arginine`, `betaAlanine`,
  `betaine`, `carnitine`, `citrulline`, `creatine`, `hmb`, `taurine`; `NutritionDraft` is the base of
  `DiaryEntry` and `SavedMeal`; saved targets are one `saved: Partial<Targets>`; photos one ordered
  `photoIds` list; `DayKey` is a string alias; a malformed day key throws `RangeError`.
- P02-02 and P03-12 codecs: make a grams basis only when grams is finite and above 0; read a
  missing meal as `other`.
- Time-zone tests: `inTimeZone(tz, fn)` from `src/test/time.ts`; vitest runs in America/New_York.
- From wave 2: Vitest empties every CSS import (also `?raw`): tests read CSS from disk
  (`src/ui/testing/tokenSheet.ts`). P04-06's ThemeProvider calls `applyTheme` and must call the
  returned stop in its cleanup (a new call on the same root already replaces the old listener).
- Lint (P00-07): boundaries apply to `src/**` only; test files are exempt from rules 2–5. When ui
  primitives with text props (`label`, `aria-valuetext`) land, add those props to the copy rule's
  attribute list in `eslint.config.js`. `scripts/lint-fixtures/` is excluded from lint and from
  `tsconfig.node.json`.
- Fake AI (P00-09): specs find the server at `PLATEWISE_FAKE_AI_URL` (the app's base URL is that
  plus `/v1`); give each concurrent builder its own `PLATEWISE_E2E_PORT` and
  `PLATEWISE_FAKE_AI_PORT`. P03-15's builder checks the food scripts against its reply contract.
- Units (P01-03..06): type names `EnergyMeasure`, `WeightMeasure`, `HeightMeasure`,
  `WaterMeasure` (each with a `*_MEASURES` list and an `is*` guard for P02-04); `parseEnergy`
  returns the display-unit value (store `fromDisplay`); quick-add amounts are a number array;
  `formatQuantity`/`formatMacro` never group.

## Usage guard

Two agents: Agent 1 (Account 1, session 2 stopped at 76 %, `READY`) and Agent 2 (Account 2, this
session, holds the turn). `.agents/turn.json` (lock), `.agents/agent-1.json` (status)
and `.agents/usage-log-agent-1.md` (one row per check, IST) follow the skill's two-agent protocol, so
a second agent can join with `.agents/wait-for-turn.sh AGENT_2`. Bands: below 75 % builders allowed;
75–89 % no new builders, small tasks only, this page after every step; at 88 % read stop builders,
save unfinished slices as patches under `.agents/wip/`, update this page, state `STOPPED_90`, push,
and wait for the reset (the auto-continue routine resumes). Measured in session 2: three builders
moved usage about 0.5 %/min (+8 points in 17 min); the lead alone about 0.

## Handoff history

| # | When (IST) | From → to | Tasks | Why | State left |
|---|---|---|---|---|---|
| 1 | 2026-10-26 19:25 | Agent 1 session 2 → new session (taken by Agent 2 at 23:05) | 7/176 | The user moved the work to a new session with a fresh usage window (session 2 at 76 %); the user named it Agent 2 | Head green and pushed to `main` and the work branch; nothing in flight, no patches; wave 2 prompts in `docs/handoff/wave2/` |

## Resume notes

- 2026-10-26 23:05 IST, Agent 2 (new session, Account 2, usage 1 %): fresh container. Re-cloned the
  reference at `10e14b67`, `pnpm install --frozen-lockfile` (6.5 s), made `/root/wt` and
  `/root/rea-lab`, copied the builder rules and landing scripts. Verified `d53111e`: lint clean,
  fmt:check clean, typecheck clean, `check --require-ref` 6/6 PASS (similarity 123 files, banned 24
  patterns, traps 162, acceptance 152). **Matches** what session 2 reported. Lock → `AGENT_2 ACTIVE`;
  wave 2 launched next.

## How to resume

- Builder rules: `/root/wt/builder-rules.md` (outside the repo; copy from the skill template if
  lost). Worktrees go under `/root/wt/`, patches under `/root/wt/patches/`.
- Full loop (repository root): `PLATEWISE_REF=/root/reference/fud-ai bash scripts/ci-local.sh`
  (install, lint, fmt, typecheck, unit, check --require-ref, build, bundle budget, e2e). The
  Playwright install step is a no-op here: chromium-1243 is already in `/opt/pw-browsers`.
- Landing: `extract-patch.sh` / `land-patches.sh` (copies in `/root/wt/`, from the skill's
  `scripts/`), verify worktree `/root/wt/verify`, then cherry-pick `-n` onto the newest remote head
  with one message file per slice.
- `.gitignore` is the package's own now (the old monorepo's Python ignore file is gone); still check
  `git check-ignore -v <path>` when a builder's file is missing from a patch.
