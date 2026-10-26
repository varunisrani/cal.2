# Handoff: state of the Platewise build

Updated: 2026-10-27 01:24 IST (Agent 2). P00 and P01 complete; 52/176 tasks. The user started the new
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
| Wave 3 | P01-07, P01-08 (nutrient catalogue, goal defaults, pillars; meal times, diary grouping) | 33408fc |
| Wave 3 | P01-09..11 (serving units and scaling, ingredient lines, recipe split, combine) | 4d6b9ec |
| Wave 3 | P01-12..16 (formulas, targets and locks, plan validator, profile rules, adaptive cadence) | 1e67ebe |
| Wave 4 | P03-01, P03-02 (AI failure kinds, classification and messages; fake fetch and wire fixtures) | 731fc23 |
| Wave 5 | P01-17..19 (evidence pack, weight forecast, fasting rules, goal crossing); **P01 done** | 20c0983 |
| Wave 4 | P04-01, P04-02 (UI primitives: buttons, sheets, dialogs, toasts, inputs, wheels, date-time fields) | bd36cd2 |
| Wave 6 | P03-05, P03-06 (deadline, transport, retry ladder) | 916b62f |
| Wave 4 | P02-01..03 (schema and safe open, record guard and quarantine, live queries and bus) | e61199b |
| Wave 6 | P03-03, P03-04 (provider catalogue and presets; AI settings, roles, standbys, server addresses) | 4ef228a |
| Wave 6 | P04-03 (gauge, pillar, progress bar, stat badge, menu, swipe row, icon set) | cbdd6c8 |
| Wave 7 | P02-04, P02-05 (settings schema and repository, profile repository) | 31694df |
| Wave 7 | P02-06, P02-07, P02-13 (diary repository, photo store and cleanup, drafts) | 6ee9257 |
| Wave 7 | P02-08, P02-09 (weight, body-fat, water and fasting repositories; lead cross-repo test) | 0c64ce7 |
| Wave 7 | P02-10, P02-11 (saved meals, Coach messages) | dc092de |
| Wave 7 | P04-08, P04-09 (diary service with one log at a time; temporary quick start) | 002fde4 |

## In progress

- Landed since wave 3: P03 A (731fc23), P01 C (20c0983), P04 S1 (bd36cd2), P03 S1 (916b62f),
  P02 S0 (e61199b), P03 S2 (4ef228a), P04 S2 (cbdd6c8), P02 S1 (31694df), P02 S2 (6ee9257),
  P02 S3 (0c64ce7), P02 S4 (dc092de), P04 S4 (002fde4; ci-local on that head: unit 1812/1812 + 1
  expected fail in 117 files, check 6/6, bundle 71.14 kB, e2e 1/1). **Progress: 52/176 tasks**
  (P00 10/10, P01 19/19, P02 12/15, P03 6/19, P04 5/14).
- Running (each in `/root/wt/wt-<slice>`, prompt in `docs/handoff/wave7/`): P04 S3 (P04-04..07 app
  shell + `src/services/appData.ts`, base 4c1c65d) and P02 S5 (P02-12/14 secrets, erase, storage,
  base 71e00bb).
- At P04 S3 land time: wire `<QuickStart onStart={quickStartAction({db, profile, settings},
  navigator.language)} onDone={() => navigate('#/home')} />` into the onboarding route (memoised
  per AppData), create the diary service once in the shell, keep the e2e smoke heading; both
  slices add a line to `src/i18n/en.ts` (merge by hand).
- If this session dies, the worktrees and patches are gone with the container: relaunch the
  unlanded slices from their prompts.

## Next

1. Land P04 S3 (wire QuickStart) and P02 S5; then P02-15 hooks, P03 wave B S3–S5, P04 wave B (P04-10..13 screens) and C (P04-14 e2e),
   P04 S3 (app shell) and S4 (diary service, quick start), toward the walking skeleton (Demo 1),
   then P05–P10.

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
- Forecast and trackers (P01-17..19): food days come from the entry's stored `dayKey`, readings
  from `dayKeyOf(at)`; confidence reasons are counts (P03-16 writes the sentences); the shared
  window helpers live in `forecast/evidence.ts`; `startFast` takes the new id; `endNow` names its
  fast and refuses with `ended`/`missing`; fast length text comes from `formatDuration` (domain
  returns `splitMinutes`). The domain parts of R05.3 (P02-09) and R01.11 (P02-08) are tested in
  `src/domain/trackers`.
- Goals (P01-12..16): the plan's example reply 2 000 / 150 / 215 / 61 is implausible for the
  default profile (protein allowed 78–146 g, fat 21–63 g, kcal 1 226–4 904); fake-AI plan scripts
  (P05-15) and P03-14/P05 tests on the default profile must stay inside those ranges.
  `checkPlan(reply, formulaPlan)` requires the formula plan; the lock engine locks on edit;
  `applyPlan` is in `goals/locks.ts`, `sameProfile` in `profile/profile.ts`, `remainderCarbs` in
  `goals/formulas.ts` (P05-05). The domain parts of R01.4, R01.5, R01.12, R01.14 are tested in
  `src/domain/adaptive` and `src/domain/profile`; their rows stay owned by P05 for the runner and UI.
  Fixtures: `src/domain/goals/__fixtures__/profiles.ts` (FIXTURE_TODAY 2026-10-26).
- Servings (P01-09..11): picker ids `'g'` and `'servings'`; P06-08 keeps a typed kcal fraction
  until Log; P06-06 records the picked unit with `withChoice`; P06-09 judges `canSplit` on the
  draft as received; `combineEntries` throws a RangeError for fewer than 2 entries and takes the
  fallback name and "+ K more" text from the caller.
- Nutrients and meals (P01-07/08): group ids `sugarsAndFats`, `minerals`, `vitamins`, `sports`
  (P05-12); `readPillars` takes a string or a list (P02-04 picks the storage); section totals are
  whole grams and absent without food; follow-ups: pillar day totals (P07-03/P07-16), seed the
  `newestFirst` sort after onboarding, the vitamin D IU text in the UI.
- Lint rule 2: screens (`src/app`, `src/ui`, `src/features`) never import `**/data/db` or
  `**/data/repos`; they use services (`src/services/**`, which may) and data hooks. The shell's
  data lives in `src/services/appData.ts` (P04 S3) behind a React context.
- Repositories (P02-08..11): weight/body-fat/water/fast and saved-meal/Coach repos are factories
  (`createWeightRepo`, `createFastRepo`, …; `savedMealsRepo(db)`, `coachRepo(db)`). The Settings
  fasting switch must call `fastRepo.setTracking`; `settleOnOpen(now)` runs at start-up and after a
  restore; `goal-reached` reaches other tabs (the dialog owner checks the origin); unsaving returns
  the meals so the caller releases their photos; `copyInOwnTx` in `guard.ts` still passes a
  non-async arrow to a transaction (works today; same shape as the async pitfall).
- Repositories (P02-04..07, 13): every `transact()` body must be an `async` function (a plain arrow
  returning another promise loses Dexie's transaction after a few awaits) — consider documenting
  or enforcing it in `db.ts`. Two shapes exist: settings and profile are factories
  (`createSettingsRepo(db, {bus, clock})`, `createProfileRepo(db)`), diary, photos and drafts are
  namespace functions with `db` first (`import * as diaryRepo`); P02-15 hooks hide the difference.
  Expected states are values (`'updated' | 'missing' | 'unreadable'`, `'combined' | 'stale'`).
  Settings `ai.settings` and `menu.layout` are opaque records until wired to `decodeAiSettings`
  and the add-menu reader (one line each in `SETTINGS`). `alerts.goalReached` defaults on. The
  accent/appearance lists are repeated in `settingsSchema.ts` (a test keeps them equal to
  `src/ui`). `barcodeKeyOf` moves to `src/domain/food/barcode.ts` with P06-17. The generic
  `update` callback needs typed values or `as const`.
- Data core (P02-01..03): repositories write only through `transact()` (it adds quarantine and
  meta); `writeOne` refuses a row its codec cannot read; codecs in `src/data/codecs.ts`; test
  helpers `src/test/{db,live,factories}.ts`. Fake timers stall Dexie: data tests use real timers
  and wait on events. Blobs in tests: `testBlob` + `isBlobLike`. Follow-ups: add
  `additionalHooks: '(useLive)'` to the exhaustive-deps rule; the `unreadableData` flag is never
  cleared yet (K9 banner task); P02-05 update refuses a corrupt read; P02-14 wipe is the only
  `deleteDatabase` caller; the cross-tab test names Dexie's channel `x-storagemutated-1`.
- AI catalogue and settings (P03-03/04): preset ids were read from vendor page summaries on
  2026-10-26 (not live calls); P03-19's probe and P10 confirm them. `hidesKeyRefusal` in the
  catalogue mirrors `HIDES_REFUSED_KEY` in `errors.ts` (a test keeps them equal). APIs:
  `roleFor(settings, {images})`, `standbyFor`/`standbyProblem`, `targetProblem` (`noServer`,
  `noModel`, `noKey`), `KeyRing = {providerId: key}`, `loadAiSettings(raw, marker)` returns the
  new preset marker, `checkServerUrl` refusal codes (`empty`, `notUrl`, `scheme`, `credentials`,
  `plainHttp`). P09-07: turning a standby on with default provider and model gives `sameAsRole`;
  the picker moves it to the next preset. Copy for key hints and address refusals is P05-04/P09-07.
- AI transport (P03-05/06): `send(url, init, {deadline, attemptCapMs?, provider?, keySent?,
  fetch?})`, `startDeadline({timeoutMs, cancel?})` in ms (caller converts `timeoutSec`); one
  deadline per action, `dispose()` at the end; `attemptCapFor('fixed'|'userServer')`. P03-17 sends
  everything through `sendWithRetry` and checks `deadline.throwIfStopped()` between steps.
- Display primitives (P04-03): Gauge and Pillar are groups named by their heading with the
  drawing hidden from screen readers; Menu hooks `<hook>`, `<hook>.menu`, rows
  `<hook>[.<page>].<id>`, Back `<hook>.<page>.back`, `onSelect` runs after focus returns;
  SwipeRow needs `deleteLabel`, `deleteButton` "always" (default) or "focus" (P04-12 picks);
  `Icon({name, label?, size?})` with `ICON_NAMES` (kebab-case, includes `home`). Not built yet:
  menu typeahead, RTL arrow swap, fill-from-zero on app open (R05.18).
- UI primitives (P04-01/02): `data-ui` is a required prop, parts are `<hook>.<part>`; disabled and
  busy controls use `aria-disabled`; form sheets (P04-11) pass `dismissable={false} hideDone`;
  P04-07 mounts `ToastProvider` once; weight wheels round tenths (R05.10, P05/P07 callers); no
  multi-line field yet (P06 Describe, P08 Composer); `src/ui/stylesheets.test.ts` lists the CSS
  modules it checks (add new ones). Helpers: `src/ui/modal.ts`, `src/ui/primitives.ts`.
- AI errors (P03-01/02): `fromNetwork(err, {stoppedBy, online, provider, keySent})`; P03-05 passes
  `stoppedBy` so a cap is never read as a cancel. The key-hint provider list is in `errors.ts`
  (P03-03 may move it to the catalogue). Details are capped at 600 characters; `redactKeys` masks
  keys of 8+ characters (P08-09). Messages name "Settings › AI providers" and "Give up after": if
  P09 renames them, update `src/i18n/en/ai.ts`. `createFakeFetch()` fails a test on an unmatched
  or used-up request even when the code swallows it (`takeProblems()` to collect on purpose).
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
