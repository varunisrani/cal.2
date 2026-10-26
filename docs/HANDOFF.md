# Handoff: state of the Platewise build

Updated: 2026-10-27 01:25 IST (Agent 1, session 3). 69/176 tasks; P00, P01 and P02 complete; the app runs on the
real database. Usage window resets 05:20 IST; waves 8–9 running.
Session 3 works on `claude/sleepy-euler-3qif2i` (started at `main` = d53111e); `main` is not
updated by this session unless the user asks. Session 2 has stopped and pushes nothing more.

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
| Handoff kit | `docs/handoff/builder-rules.md` (builder rules), `docs/handoff/wave2/` (the wave-2 prompts, landed; a pattern for later waves) |

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
| Wave 2 | P00-07 (lint boundaries between layers, the copy rule) | 6c49d15 |
| Wave 2 | P00-09 (scripted fake AI provider, Playwright globalSetup) | 59e57dc |
| Wave 2 | P00-02, P00-03, P00-04 (tokens and six accents, theme runtime, contrast sweep, icon set) | 00a1182 |
| Wave 2 | P01-03..06 (energy, body, water units; locale defaults; number parsing; amount expressions; D-16.67, D-16.68) | 6897aaf |
| Wave 3 | P01-07, P01-08 (nutrient catalogue, goal defaults, pillars; meal times, diary grouping; D-16.69) | ad0109a |
| Wave 3 | P01-09..11 (serving units and scaling, ingredient stretch, recipe split, combining; D-16.72, D-16.73) | 9337e0e |
| Wave 3 | P01-12..14 (goal formulas, maintenance, targets and locks, Plan Ready editing, AI plan validator; D-16.71) | abc2cee |
| Wave 3 | P01-15, P01-16 (profile rules, plan-input signature, Adaptive cadence; D-16.70) | bcf0c83 |
| Wave 4 | P01-17..19 (evidence pack, weight forecast, fasting rules, goal crossing; D-16.74). P01 done | 33b4468 |
| Wave 4 | P04-03 (gauge, pillar, progress bar, stat badge, menu, swipe row, icons; D-16.75; shared cleanup in `src/test/setup.ts`) | 5177b59 |
| Wave 4 | P04-01, P04-02 (buttons, cards, sheets, dialogs, toasts, fields, stepper, segmented, switch, list picker, wheel, date-time) | f98a497 |
| Wave 4 | P02-01..03 (Dexie schema and open safety, record guard and quarantine, live queries and bus; D-16.76) | 49c5a03 |
| Wave 4 | P03-01, P03-02 (AI failure kinds and messages, `ai` partition, fake fetch and wire fixtures) | 58180c2 |
| Wave 4 | P04-04..07 (hash router and sheets, tab bar, theme provider, boot gate, today clock, error boundary, `shell` partition) | f9b70fb |
| Lead fix | Three trap-ledger paths written wrong by f9b70fb; the clean-room file walker skips `.git` | 8655743 |
| Wave 5 | P02-04, P02-05 (settings schema and repository, profile repository) | 9aefd7c |
| Wave 5 | P02-06, P02-07, P02-13 (diary repository, photo store, drafts; `src/data/barcodeKey.ts`, `src/test/blobs.ts`) | 192db24 |
| Wave 5 | P02-08, P02-09 (weight, body fat, water and fasting repositories; D-16.77) | d8caa8a |
| Wave 6 | P02-10, P02-11 (saved meals, Coach messages) | 797e1f1 |
| Wave 6 | P03-05, P03-06 (deadline, transport, retry ladder) | 8227428 |
| Wave 6 | P04-08, P04-09 (diary service, quick start, `src/main.tsx` composition root on the real database, `onboarding` partition) | cfb32cf |
| Wave 6 | P02-12, P02-14 (secrets under a device key, erase everything, persistence and estimates; D-16.78; persistence wired after the first entry) | 86b4ad7 |
| Wave 7 | P02-15 (feature hooks over a DataProvider; `LiveState<T>` convention). P02 done | 322a3f7 |
| Wave 8 | P03-10..12 (image preparation, JSON extraction, food reply parser; reply key constants) | bca540b |
| Wave 8 | P03-07..09 (Gemini, OpenAI-compatible and Anthropic adapters) | 9d8d27d |
| Wave 8 | P03-03, P03-04 (provider catalogue and presets, AI settings and endpoints; adapters take `ProviderId` from the catalogue) | 8b03cfd |
| Wave 8 | P04-10..13 (Home with gauge, pillars and diary; manual entry; swipe-delete rows; tab placeholders; Settings hub; D-16.79) | ea9563c |

## In progress

Four builders (prompts in `docs/handoff/wave9/`):
- P03 S4b (P03-13/14 readers), base 7a6e065, `/root/wt/wt-p03s4b`.
- P03 S5 (P03-15/16 prompts and contract), base 7a6e065, `/root/wt/wt-p03s5`.
- P05 S1 (P05-01..03 wizard state machine and steps), base c0b38bb, `/root/wt/wt-p05s1`.
- P04-14 walking-skeleton e2e and parity scenario (**Demo 1**), base 19fb709, `/root/wt/wt-p04s6`. After
  landing, the lead runs `parity/walking-skeleton.platewise.json` once through REA (install
  `rea-agents@6.8.0` outside the repo on Node 24 per "Where things are").
Landed this window: bca540b, 9d8d27d, 8b03cfd, ea9563c (latest full loop: unit 2303 passed + 2
expected-fail in 146 files, check 6/6, bundle 135.93 kB, e2e 1/1). If this container is gone, re-create
the worktrees at their bases and relaunch the same prompts. **Progress: 69/176 tasks** (P00 10/10, P01
19/19, P02 15/15, P03 12/19, P04 13/14, P05 0/15).

**Open for the user:** the OpenRouter attribution URL (`ATTRIBUTION_URL` in
`src/ai/adapters/openaiCompat.ts`) is the project's repository URL until Platewise has a site; and
whether to fast-forward `main` to the work branch.

## Next

1. Land waves 8–9 as they return (see In progress).
2. Then: P04-14 walking-skeleton e2e and parity scenario (= **Demo 1**, after P04 S5), P03 wave C
   (P03-17 client, P03-18 tasks, P03-19 CORS probe; after P03 S2, S4b, S5), P05 onboarding and goals,
   P06–P10.

## Notes for later waves (from wave-1 and wave-2 builders; put them in the prompts)

- From wave 8 (Home): data-ui hooks for e2e and parity: `home.add`, `home.add.manual`, `home.gauge`,
  `home.summary`, `home.pillar.<key>`, `home.diary`, `home.diary.empty`, `home.meal.<meal>[.totals]`,
  `manual`, `manual.{name,energy,protein,carbs,fat,fibre,meal,save,cancel}`, `manual.mealPicker.<meal>`,
  `entry.row` (keyboard delete `entry.row.delete`), dialog `entry.delete` with `.confirm`/`.cancel`,
  `settings.category.<id>`, `settings.back`. `src/test/screenHarness.tsx` renders a tab screen over real
  repositories. The settings registry holds page components and is empty until P05-10. Follow-ups: the
  router restores scroll before late data draws (a re-apply after data is needed); no meal/flame/food
  icons; no photo hook yet (P06).
- From wave 8 (AI catalogue and settings): `decodeAiSettings` is ready for the `ai.settings` row of
  `src/data/settingsSchema.ts` (plug it in when P05 S2 / P09 use it); the preset-upgrade marker lives in
  `meta.presetUpgradeVersion` (the caller saves settings when `changed` and stores the version); an empty
  standby slot means the provider's default address. Several default models reason by default (GPT-6,
  grok-4.3, Anthropic 5.5): with the 1 024-token cap the client (P03-17) or adapters may need each
  vendor's low/no-reasoning switch; re-check in the P10-12 live check, with DeepSeek/Cerebras vision.
- From wave 7 (hooks): every hook returns `LiveState<T>`; none suspends; `useSettings(keys)` returns
  only the named keys (compared by content); `useTargets(today?)` → missing | corrupt | ok {profile,
  formula, targets} (pass `useToday()`); `DataSources` holds read methods only; screens import types
  (`LiveState`, `ProfileRead`) from `src/data/hooks`. To count runs of an async repository read with
  `countRuns`, wrap it in `Dexie.Promise.resolve(...)`.
- From wave 6:
  - Secrets/erase/storage (P02-12/14): device key in meta (`wrapKey`); slot names match
    `/^[a-z0-9][a-z0-9._-]{0,63}$/`; `WrapKeyChangedError` for a save racing a key change; erase returns
    erased | blocked (with `finished`) | failed; `closeOnErase(db, onErased, bus?)` is not wired yet (boot
    should, with the erase notice taking priority over reload-needed); P09 leaves secrets quarantine
    rows out of exports and backups; the P10 service worker names caches `platewise-*`; read secrets from
    services, not inside a live query. Typed arrays read back from fake-indexeddb fail `instanceof
    Uint8Array` in tests: check binary fields structurally.
  - Diary service: `logEntry(draft, {loggedAt, meal, source, photoIds?})` → `logged | fastActive | ignored`;
    one log gate per service, delete gated per id; storage errors reject and reopen the gate.
    `Services = {diary, onboarding, clock}` via `ServicesProvider` / `useServices` (src/services/context.tsx).
    `startWithDefaults` stores units explicitly, so a later browser-language change never flips them.
    `main.tsx` renders twice (skeleton, then inside the provider). Initial JS is 121 kB gzip now (the
    data layer loads at start-up): consider lazy chunks for later features to keep headroom.
  - Saved meals: `move(from, to)` takes positions (an id-based move would be safer for P06-12);
    Home can build the saved-ids set from `list()` instead of `isSaved` per row.
  - Coach store: order = time, then a stored sequence, then id; `append(message, generation)` stores
    nothing after a reset (P08-09); the repository assigns ids, the caller passes `at`.
  - AI transport: `startDeadline({timeoutSeconds, cancel})` throws for a non-positive timeout (the
    30–600 s clamp and 180 s default belong to P03-04); P03-03 adds a self-hosted flag per provider for
    `attemptCapMs`; P03-17 creates one Deadline per action and calls `end()`.
  - Nothing listens yet for the bus messages `reload-needed` or `erase` (a shell follow-up).
- From waves 4–5 (shell and repositories):
  - Shell (P04-04..07): `src/app/ports.ts` = `ReadStore<T>` (undefined = not loaded),
    `ShellSettings {appearance, accent, hiddenTabs}`, `BootState {status: openError | needsOnboarding |
    ready}`; adapters must return the same snapshot object until something changes. `App` props
    `{ports, router, clock?, appState?, onReload?}`; tab screens are placeholders in
    `src/app/Screen.tsx`. History: leaving Home pushes, Back goes Home first; sheets never come back
    by Forward or reload; a screen whose data arrives late calls `router.applyScroll()`. A home icon
    is drawn locally in TabBar (move it to `src/ui/icons`). Until settings load the theme is System.
  - Settings (P02-04): 40 keys of 17-naming §1.3; `alerts.goalReached` defaults off (the in-app
    dialog does not depend on it); `menu.layout` and `ai.settings` are plain records until P06 and
    P03-04 plug in decoders; `HIDEABLE_TABS`, `PRODUCT_FIELDS`, `ACCENTS`, `APPEARANCES` live in the
    schema (a test keeps the last two equal to `src/ui`); unit defaults take a `locale` option.
  - Profile (P02-05): `update` throws `ProfileUnavailableError` (missing | corrupt); `save` throws
    `WriteBlockedError` when the safety copy fails.
  - Diary (P02-06): `update`/`remove`/`combine` return the photo ids they dropped: services pass them
    to `photoRepo.releaseIfUnused`; full `prune()` at start-up and after import/restore (it skips photos
    younger than 10 min). `RESTORING_FLAG` exported from `photoRepo.ts` for P09. `combine` refuses fewer
    than 2 originals or a missing one. P06-17 reuses `src/data/barcodeKey.ts`.
  - Weight/fasts (P02-08/09): `goal-reached` is posted to this tab only; `FASTING_ON_KEY` in
    `fastRepo.ts` equals the schema key; boot calls `fastRepo.settleOnOpen(now)` and restore (P09-13)
    after writing; P05-10 calls `addWeighIn` before `withWeight`.
- From wave 4 so far:
  - Data layer (P02-01..03): no db singleton (boot owns it); `openDb` options `name`, `indexedDB`,
    `IDBKeyRange`, `steps`, `bus`; a transaction using `writeOne`/`removeRows`/`keepAside` includes
    `GUARD_TABLES`; deletes through `removeRows`; reads schedule quarantine copies on a 0 ms timer
    (`settleQuarantine` in tests); `openTestDb` and `countRuns` in `src/test/db.ts`; jsdom Blobs do not
    survive fake-indexeddb (P02-07, P02-11); nothing clears `meta.unreadableData` yet (K9 dismiss).
    Bus messages: `{type:'goal-reached', kg}`; `post(msg, 'this-tab')`; listeners get `(msg, fromOtherTab)`.
    Codec decisions: unknown entry source reads as `manual`; a Coach message with an unknown role and a
    fast with an invalid stored end are unreadable; negative required numbers are unreadable.
  - AI errors (P03-01/02): keys `ai.failure.<kind>` and `ai.hint.keyMayBeRefused` (a cancel has no
    message); P03-05 passes `stoppedBy` to `fromNetwork`; P03-17 maps exceptions from outside fetch to
    `generic`; check `error.name`, never `instanceof DOMException`; fakeFetch imports vitest, so keep it
    out of app code (a lint rule could enforce it). Copy calls the page "AI settings".
  - UI tests: `src/test/setup.ts` runs Testing Library's `cleanup` after every test (per-file
    `afterEach(cleanup)` lines are now redundant). user-event with fake timers needs
    `vi.stubGlobal('jest', { advanceTimersByTime: (ms) => vi.advanceTimersByTime(ms) })` and
    `userEvent.setup({ advanceTimers: … })`; a shared helper in `src/test/` would help.
  - Primitives: `data-ui` is a required typed prop; built-in parts derive hooks (`<ui>.done`,
    `.scrim`, `.cancel`, `.confirm`, `.decrease`, `.increase`, `.date`, `.time`). The app must sit
    inside `ToastProvider`. No multi-line Field yet (Coach, custom instructions). SwipeRow has
    `disabled` (P06 selection mode) and right-to-left support; the trailing favourite swipe is P06's.
    Gauge launch animation is P07-03 (R05.18). Icons: 25 in `src/ui/icons`.
  - Fasting: P02-04 decodes the default fast goal with `decodeFastGoal`; P07-07 maps the `overlap`
    and `active` refusals to its message. `formatFast` returns text (supersedes an older note).
  - Evidence pack: workout, measurement and energy inputs are not declared yet (no model types);
    add them as optional fields of the input object later.
- From wave 3 (P01-07..16):
  - Goals API: `formulaPlan(profile, today)`, `bmr/tdee/estimateMaintenance(…, today)`;
    `checkPlan(values, formulaPlan(profile, today))` returns a Result naming the failed step;
    `setKcal`/`setMacro` set locks themselves and return a new profile, or `null` when refused;
    `PLAN_WHEELS` serves Plan Ready (P05-06) and the Settings goals page (P05-11). Test fixtures:
    `src/domain/goals/__fixtures__/profiles.ts`. Integer helpers `div`/`floorMod` live in
    `src/domain/goals/integers.ts`.
  - P05-06: if protein and fat alone exceed kcal, `editPlan` sets carbs 0 and the plan holds more
    energy than its kcal: cap the protein and fat wheels or show it.
  - Weigh-ins: P02-08 must evaluate `crossesGoal` before `withWeight` clears a contradicted
    target. Only the Settings weight save calls `withWeight` (as in the reference); Progress
    weigh-ins only sync the weight (P05-10, P02-08).
  - Cadence: `settle` returns the next state and the next profile together; P05-09 writes both in
    one transaction. P02-04 decodes the tune-up switch ("on when never set") and the kept plan
    (`null` = nothing kept, `{}` = an all-automatic plan). Single flight and "onboarding done" are
    inputs to `plan`.
  - Signature key: a JSON array starting with format number 1; a missing, non-string, empty or
    other-format baseline is seeded silently.
  - Words the domain does not own: `unitLabel(unit, count, {one, other})` and
    `combineEntries(entries, {fallbackName, more})` take catalogue words as parameters;
    `combineEntries` returns an entry without an id (the repository assigns it) and null for
    fewer than 2. `draftAsLine` (ingredients.ts) serves P06-09. Ask `canSplit` of the draft as it
    opened. Combine's removal of the originals and the fasting block are P02-06 / P06-19.
  - Pillars: store the list as an array (`decodePillars` also reads comma text). `pillarGoal`
    reads macros from effective targets, the rest from optional goals.
  - `groupDiary` takes one tagged `DiaryRow` list; same-time rows keep their given order; section
    totals come back rounded.

- Lint boundaries (P00-07): test files (`*.test.ts[x]`, `src/test/**`) are exempt from rules 2-5;
  `e2e/**`, `scripts/**`, `tooling/**` are not exempt from the IndexedDB/Dexie rule (exempt `e2e/**`
  there if a spec ever needs IndexedDB). `window/globalThis/self.fetch` are caught too. **P03-02**:
  `src/ai/testing/fakeFetch.ts` is not on the fetch allow-list: inject fetch, or add
  `src/ai/testing/**` to the allow-list in `eslint.config.js`. Not caught: dynamic `import()` of dexie
  or repositories; `aria-valuetext/-description/-roledescription` literals.
- Copy rule: every `.tsx` in `src/{app,ui,features}` (tests exempt): JSX text with a letter and literal
  aria-label/title/placeholder/alt fail. `src/main.tsx` is outside it.
- Fake AI (P00-09): `startFakeAiServer()` gives `url` = origin; the Custom provider base URL is
  `${url}/v1`. Specs reach it at `http://127.0.0.1:${PLATEWISE_FAKE_AI_PORT ?? 4320}` (no client helper
  yet: add one with the first spec that drives it, P05-15 or P06-20). Script files are
  `{description, replies}`, unknown keys refused; `POST /__script` rewinds but keeps recorded requests,
  `POST /__reset` clears both; a delayed reply is still sent after a reset (P08-14 relies on it). The
  food scripts use the P03-15 reply keys (red lentil soup, 410 kcal, 420 g): if P03-15 changes the
  contract, update `food-ok`, `busy-then-ok`, `cut-then-ok`. `coach-tool` calls `food_log` for
  2026-10-19..25. No streaming, no Gemini/Anthropic formats.
- Theme (P00-02..04): the P04 theme provider owns `applyTheme`'s unsubscribe and replaces the
  `applyTheme(DEFAULT_THEME)` call in `src/main.tsx`. A light-mode device sees the dark default until
  `main.tsx` runs: an inline head script fixes it (P04 or P09-18). The web manifest listing the icons
  is not built yet. `PAGE_COLOURS` in `src/ui/tokens.ts` must equal the CSS and `index.html`
  theme-color (a test enforces it). CSS imports are blank in Vitest: read tokens with
  `src/test/tokenSheet.ts`. Labels: `appearance.accent.*`, `appearance.mode.{system,light,dark}`.
- Units (P01-03..06): types `EnergyDisplayUnit`, `WeightDisplayUnit`, `HeightDisplayUnit`,
  `WaterDisplayUnit` with setting values `kcal`/`kJ`, `kg`/`lb`, `cm`/`ftIn`, `ml`/`flOz`.
  `formatQuantity`/`formatMacro`/`plainText` write a dot and no grouping (input fields only); screens
  use `formatNumber` or `src/i18n/format.ts`. Energy fields parse with `parseLocaleNumber` (grouped
  reader). Unit labels, "kg/wk", the ′ ″ marks, the AI kJ prompt line and the quick-add summary copy
  are not built (P03/P09 and UI). Native digits (ar-EG, fa-IR) are not read.

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
- Durations: UI uses `formatDuration(minutes)` from `src/i18n/format.ts` ("16h 30m").
- Names fixed by `src/domain/model.ts` (P01-07 and the P03 reply contract use them): nutrient keys
  such as `fibre`, `monounsaturatedFat`, `polyunsaturatedFat`; extras `arginine`, `betaAlanine`,
  `betaine`, `carnitine`, `citrulline`, `creatine`, `hmb`, `taurine`; `NutritionDraft` is the base of
  `DiaryEntry` and `SavedMeal`; saved targets are one `saved: Partial<Targets>`; photos one ordered
  `photoIds` list; `DayKey` is a string alias; a malformed day key throws `RangeError`.
- P02-02 and P03-12 codecs: make a grams basis only when grams is finite and above 0; read a
  missing meal as `other`.
- Time-zone tests: `inTimeZone(tz, fn)` from `src/test/time.ts`; vitest runs in America/New_York.

## Usage guard

One agent (Agent 1); no second account. `.agents/turn.json` (lock), `.agents/agent-1.json` (status)
and `.agents/usage-log-agent-1.md` (one row per check, IST) follow the skill's two-agent protocol, so
a second agent can join with `.agents/wait-for-turn.sh AGENT_2`. Bands: below 75 % builders allowed;
75–89 % no new builders, small tasks only, this page after every step; at 88 % read stop builders,
save unfinished slices as patches under `.agents/wip/`, update this page, state `STOPPED_90`, push,
and wait for the reset (the auto-continue routine resumes). Measured in session 2: three builders
moved usage about 0.5 %/min (+8 points in 17 min); the lead alone about 0.

## Handoff history

| # | When (IST) | From → to | Tasks | Why | State left |
|---|---|---|---|---|---|
| 1 | 2026-10-26 19:25 | Agent 1 session 2 → Agent 1 new session | 7/176 | The user moved Agent 1 to a new session with a fresh usage window (session 2 at 76 %) | Head green and pushed to `main` and the work branch; nothing in flight, no patches; wave 2 prompts in `docs/handoff/wave2/` |

## Resume notes

- 2026-10-26 19:30 IST, Agent 1 session 3 (work branch `claude/sleepy-euler-3qif2i`, created at
  d53111e = `main`). Fresh container: re-cloned the reference at 10e14b6, `pnpm install
  --frozen-lockfile`, `/root/wt/{patches,builder-rules.md,extract-patch.sh,land-patches.sh}` and
  `/root/rea-lab/{evidence,parity,captures}` re-created. REA wrapper and Node 24 not re-installed
  (not needed for wave 2). On d53111e: lint, fmt:check, typecheck clean; `check --require-ref` 6/6
  PASS (similarity 122 files, banned 24 patterns, assets 0, licences 8, traps 162, acceptance 152).
  Usage 0 % (reading 19:27), window resets 2026-10-27 00:20 IST. Lock set to ACTIVE.

## How to resume

- Builder rules: `/root/wt/builder-rules.md` (outside the repo; copy from the skill template if
  lost). Worktrees go under `/root/wt/`, patches under `/root/wt/patches/`.
- Full loop (repository root): `PLATEWISE_REF=/root/reference/fud-ai bash scripts/ci-local.sh`
  (install, lint, fmt, typecheck, unit, check --require-ref, build, bundle budget, e2e). The
  Playwright install step is a no-op here: chromium-1243 is already in `/opt/pw-browsers`.
- Landing: `extract-patch.sh` / `land-patches.sh` (copies in `/root/wt/`, from the skill's
  `scripts/`), verify worktree `/root/wt/verify`, then cherry-pick `-n` onto the newest remote head
  with one message file per slice. Gate every push on the real exit code of `pnpm fmt:check` and
  `pnpm check --require-ref` (store `$?`); never pipe a gating command into `grep` before `&&`, which
  hid a failing traps check once (fixed by 8655743).
- `.gitignore` is the package's own now (the old monorepo's Python ignore file is gone); still check
  `git check-ignore -v <path>` when a builder's file is missing from a patch.
