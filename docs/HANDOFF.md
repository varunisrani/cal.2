# Handoff: state of the Platewise build

Updated: 2026-10-27 06:20 IST (Agent 1, session 3). 103/176 tasks; P00–P04 complete; the app runs on the
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
| REA | `~/rea-lab/rea` wraps `npx -y rea-agents@6.8.0` on Node 24.22.1 (no nvm here: `npm install --prefix ~/rea-lab/node24 node@24.22.1`, and the wrapper puts `~/rea-lab/node24/node_modules/node/bin` first on PATH). Evidence and captures live in `~/rea-lab/`; nothing of it is in the repo |
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
| Wave 9 | P03-13, P03-14 (unit choices, parts breakdown, plan/goal/label readers) | 265c9b7 |
| Wave 9 | P03-15, P03-16 (food prompts and reply contract; plan, evidence, nutrient-goal and fit-check prompts) | 257f9e3 |
| Wave 9 | P04-14 (walking-skeleton e2e and parity scenario, **Demo 1**; REA run `ev_c3bb14174fc42289d23b57c70cf7fc53ff404f6c6ec6b25b7ab42e95b35d6020`: 27/27 steps, no page errors). P04 done | 3d521f9 |
| Wave 9 | P05-01..03 (wizard state machine; steps Welcome to Reminders; D-16.80) | 21565b4 |
| Wave 9 | P07-10, P07-11 (line and bar charts, chart maths; D-16.81) | 7fbe51e |
| Wave 9 | P03-17, P03-18 (client pipeline; food and planning tasks with unit repair) | 10a5f62 |
| Wave 9 | P03-19 (gated browser CORS probe). P03 done | 83ee202 |
| Wave 9 | P05-06, P05-13, P05-14 (Plan ready, methods page, goal-reached dialog) | 8456a60 |
| Wave 9 | P05-04 (AI access step, provider form, `aiSetup` service; D-16.82) | f6bd162 |
| Wave 9 | P06-02, P06-03 (photo storage, capture sheet and drafts) | a66e465 |
| Wave 9 | P05-08, P05-09 (rebuild and tune-up services, wired; `aiAccess`, `browserFetch`) | 0478616 |
| Wave 9 | P06-15, P06-16 (Open Food Facts and FoodData Central clients) | 57b504a |
| Wave 9 | P06-04, P06-05 (analysis service and overlay, describe sheet; one shared drafts repository) | de1e2fe |
| Wave 10 | P06-01 (add menu, wired to capture, describe and the overlay; Demo 1 opens the Describe page) | 9a83eee |
| Wave 10 | P05-10 (Settings › Personal info; `profileEdits` service) | d855e53 |
| Wave 10 | P05-11, P05-12 (Settings › Goals and nutrition; nutrient goals editor; `targetEdits` service) | c69fd91 |
| Wave 10 | P06-06..08 (review sheet, serving card and amount field, nutrition rows and micronutrients) | d9ae5fc |
| Wave 9 | P05-05, P05-07 (Building plan, completion; the wizard replaces the quick start; Demo 1 walks it; REA run `ev_829b1eb8aacac4a1ed4274063ad3dcda8914060a1afa189e9bb794e6474a84dc`: 50/50 steps, no page errors) | c1f0bd3 |

## In progress

Window reset at 05:20 IST (next reset 10:20 IST). Four builders (prompts in `docs/handoff/wave10/`):
- P06 S3b (P06-14 scanner, P06-17 lookup order and label memory), base 48a1f56 (staged P06-01), `/root/wt/wt-p06s3b`.
- P06 S4b (P06-12 reuse lists, P06-13 copy a day; `analysis.openForReview`), base 9a83eee, `/root/wt/wt-p06s4b`.
- P05-15 (onboarding and goals e2e, `plan-ok` script), base b0022df (staged P05-11/12), `/root/wt/wt-p05s5`.
- P06 S2b (P06-09 ingredients card and recipe split, P06-10 fit check; `ingredientIntake` service), base
  ef8c0c9 (staged P06-06..08), `/root/wt/wt-p06s2b`.
At landing: AddMenu's METHODS_NOT_BUILT_YET and HomePage's `choose` take lines from S3b and S4b; `Services`,
`main.tsx`, `App.tsx`, `en.ts` take lines from several slices; merge by hand.
Next after these land: a lazy-loading slice (initial JS 206.57 kB of 250 kB): tab screens and Settings category
pages through React.lazy, the logging sheets (capture, describe, review, scan, reuse, copy day) loaded on first
open, and the AI layer (client, adapters, prompts, tasks) through a dynamic import in the services that ask a
model; `pnpm check:bundle` must show the drop. Then P06-18, P06 wave C (P06-11, P06-19, P06-20), P07.
Landed this window: bca540b, 9d8d27d, 8b03cfd, ea9563c, 265c9b7, 257f9e3, 3d521f9, 21565b4, 7fbe51e (+ a0911d2
restoring a prompt it dropped), 10a5f62, 83ee202, 8456a60, f6bd162, a66e465, 0478616, 57b504a, c1f0bd3, de1e2fe
(latest full loop: unit 3046 passed + 2 expected-fail in 199 files, check 6/6, bundle 183.50 kB, e2e 2/2). If this
container is gone, re-create the worktrees at their bases and relaunch the same prompts. **Progress:
103/176 tasks** (P00 10/10, P01 19/19, P02 15/15, P03 19/19, P04 14/14, P05 14/15, P06 10/20, P07 2/17).

**Open for the user:** the OpenRouter attribution URL (`ATTRIBUTION_URL` in
`src/ai/adapters/openaiCompat.ts`) is the project's repository URL until Platewise has a site; and
whether to fast-forward `main` to the work branch.

## Next

1. Land waves 8–9 as they return (see In progress).
2. Next window (after the 05:20 IST reset): launch the four wave 10 prompts at the head; P06 S3b after P06
   S4a lands; then P05-15 e2e, P06 S4b (P06-12 reuse, P06-13 copy day, P06-18 product block / allergen line /
   label text), P06 S2b (P06-09/10), P06 wave C (P06-11, P06-19, P06-20); the rest of P07; P08–P10.

## Notes for later waves (from wave-1 and wave-2 builders; put them in the prompts)

- From wave 8 (Home): data-ui hooks for e2e and parity: `home.add`, `home.add.manual`, `home.gauge`,
  `home.summary`, `home.pillar.<key>`, `home.diary`, `home.diary.empty`, `home.meal.<meal>[.totals]`,
  `manual`, `manual.{name,energy,protein,carbs,fat,fibre,meal,save,cancel}`, `manual.mealPicker.<meal>`,
  `entry.row` (keyboard delete `entry.row.delete`), dialog `entry.delete` with `.confirm`/`.cancel`,
  `settings.category.<id>`, `settings.back`. `src/test/screenHarness.tsx` renders a tab screen over real
  repositories. The settings registry holds page components and is empty until P05-10. Follow-ups: the
  router restores scroll before late data draws (a re-apply after data is needed); no meal/flame/food
  icons; no photo hook yet (P06).
- Similarity findings for the P10-10 report (`docs/internals/similarity-report-v1.0.md`): P03-15/16, one
  activity-table line of a prompt rewritten by its builder; P05-12, the nutrient-name list in
  `src/i18n/en/goals.ts` shared a 13-word run in the reference's order and was rewritten in our model's order.
- From wave 10: the review sheet's typed slots (`ReviewSlots`: savedLabelNotice, allergenLine, productBlock,
  ingredients, fitCheck) are filled in `AnalysisReview`; the review is not on the router's sheet stack (Back
  never closes it) and edits are not kept across a reload. Nutrient names exist in both the `goals` and the
  `review` partitions: a shared nutrients partition would serve Home too. `profileEdits` repeats the wizard's
  target rule and wheel holds (move them into src/domain). Testing Library's `until` helpers deadlock after a
  click that raises a toast (the review tests use a local `settle`): a shared helper would help.
- From wave 9 (analysis, P06 S1b): `analysis.start(kind, inputs)`; `armedLabel` on photo inputs (P06-17
  passes the hand-off; `fromSavedLabel` is always false until then); the barcode is stamped onto
  `draft.product` (P06-17 may replace that helper); `closeReview()` serves Log and Cancel for P06-06 and
  photos are released only through `releaseIfUnused`; the overlay flag follows the state, so the tab bar is
  back behind the failure dialog. `analysis.restore()` runs after the first render in main.tsx. Not mounted
  yet: `<AnalysisOverlay />` (P06-01 mounts it), `CaptureSheet.onAnalyse` → `analysis.start('photo', …)`
  and the describe sheet (P06-01), the review from `reviewReady` (P06-06).
- From wave 9 (Building plan and completion, P05 S3b): `buildPlan({profile, today, units, cancel?})`;
  three readers of the stored AI setup exist: `createAiAccess` (`src/services/aiAccess.ts`, used by
  rebuild and tune-up), `storedAiAccess` in `planBuilder.ts` (settings nullable: null = formulas at once)
  and a private `aiAccess` in `analysis.ts`. Unify them on `createAiAccess` (its `configured` flag stands in
  for the null row) in a small lead task or the next slice that touches one of them. `complete(answers, {now, restored?})`: `restored`
  skips weigh-in, body fat, tune-up defaults and sort mode (P09-14 can narrow it); `units.energy` is not
  written at completion; the rebuild baseline is not stored at completion (the Goals page seeds it on
  first open). The notification permission request lives in `OnboardingRoute.tsx` until P09-09. Dexie
  starts live queries with `setTimeout(…, 0)`: with fake timers fake only setTimeout, setInterval and
  Date and step them (`untilShownOnFakeTimers` in the onboarding tests; a shared helper would help).
  ACC-B9-1's "Progress shows the first weigh-in" half waits for P07's Progress page.
- From wave 9 (rebuild and tune-up, P05 S3c): `createRebuildService` / `createTuneUpRunner` take one
  `PlanServiceDeps` (`src/services/goals/planRequest.ts`); outcomes are kinds and numbers (P05-11 words
  them and calls `turnOn` / `turnOff`). A tune-up that applies also stores the rebuild baseline. Each
  request gets its own deadline from the timeout setting. `useFakeTime` fakes `setImmediate` and stalls
  fake-indexeddb: service tests fake only setTimeout/setInterval/Date (a shared helper would help).
  Cross-tab writes of profile, kept plan and check day are separate transactions.
- From wave 9 (barcode clients, P06 S3a): OFF identifies the app with `app_name=Platewise` (OFF and its
  image host send `Access-Control-Allow-Origin: *`); OFF timeout 30 s, FDC 15 s; both have a never-shown
  `cancelled` kind; FDC also returns `noKey`, `invalid`, `notFound`. The gram parsing and tag cleaning
  live in `src/services/barcode/product.ts` (the row named `src/domain/food/productText.ts`; move it
  there if another caller needs it). For P06-17: call `downloadProductPhoto` after `lookupOff`, pass
  `unnamed` from the catalogue, map `keyRefused` to its own message, and mark `ingredientsMarkup` with
  P06-18's function.
- Initial JS is 164.05 kB: the tune-up loads the whole AI client at start-up. Before the bundle nears
  250 kB, load the AI layer (client, adapters, prompts, tasks) with a dynamic import on first use.
- From wave 9 (AI client and tasks, P03 S6): `complete(request, deps)` returns the validated value
  (or the trimmed text); `withDeadline` and `withNotes` are exported. The compact re-ask note goes at the
  end of the prompt (the notes for the AI stay in the system part). An incomplete Custom role fails as
  `model` or `invalidUrl` before any request and skips the standby; a stopped deadline starts no
  standby; all photos are prepared at the food size (P08 may add a Coach size). A mangled repair list
  reaches the standby; an empty one changes nothing. Planning tasks take the prompt builders' inputs and
  a `deps.deadline`. For P10-12: the re-ask keeps the same token cap, so a model that reasons by default
  can be cut twice (only OpenRouter gets `effort: low`).
- From wave 9 (AI access, P05-04): `ai.settings` reads as `AiSettings | null` (null = not set up; use
  `?? DEFAULT_AI_SETTINGS`); "Set up later" stores null and removes every AI provider key (the `fdc` slot
  stays); the choice is saved on each complete edit (WizardPage owns Continue); the step lists the 14
  providers that read photos (the form shows all 16 with `use="text"` for P09); the terms box writes
  `onboarding.termsAccepted`; key-page addresses in `keyPages.ts` were written from memory: open them in
  the P10-12 live check; a typed server address saves on every valid keystroke (debounce later).
- From wave 9 (Plan ready, methods, goal dialog): the protein/fat/kcal wheel limits live in `planWheel`
  (PlanReady.tsx); move them to `src/domain/goals/planEdit.ts` if P05-11 needs them. `bmr()` keeps its
  coefficients inline (methodsFigures.ts reads them by evaluating it): export named constants when a
  domain slice is open. `src/test/screenHarness.tsx` has no bus yet. The Settings registry imports its
  pages eagerly, so the methods page is in the initial chunk (142.32 kB now): make category pages lazy
  before the bundle gets close to 250 kB.
- From wave 9 (CORS probe): `scripts/ai-cors-probe/page.ts` references the DOM lib, so the whole
  Node-side typecheck (tooling, e2e, scripts) sees DOM types; a Node file using a DOM global is not a
  type error there. The probe's origin is loopback http, not the deployed https origin.
- From wave 9 (charts): the inspector is pointer-only (the hidden table serves keyboard and screen
  readers; a keyboard inspector is a follow-up); the Progress cards must import the charts from the lazy
  Progress chunk; callers pass display-unit values and formatters.
- From wave 9 (wizard, P05 S1): P05-07 renders `WizardPage` with `today` and `requestNotifications` and
  completes from `wizardProfile(state)`, `remindersOn(state)` and `state.units` (via `onStateChange`);
  on a granted reminder answer turn on `remind.master` and the three meal reminders at their defaults.
  Steps open with `StepHeader` and take `StepProps`; Building plan reads `state.buildRun` and dispatches
  `planBuilt` for that run; drop the `onboarding.wizard.pending.*` keys once all late steps exist.
  `BODY_FAT_WHEEL` (3–60 %, 0.5) lives in `wizard.ts` for now: move it next to `WEIGHT_WHEEL` in
  `src/domain/units/body.ts` when a domain slice is open. Unit words (kg, lb, cm, ft, in, %) are in the
  onboarding partition until a shared units partition exists.
- From wave 9 (Demo 1, P04-14): the parity scenario's `environment` and `capture` blocks are the template
  P10-01/02 copy unchanged; `browser.executable_path` is this machine's
  `/opt/pw-browsers/chromium-1243/chrome-linux64/chrome` (REA requires an absolute path): the P10-03 runner
  fills it in. REA has no clock, reload or drag actions (the scenario uses any meal section, a `goto`
  and keyboard delete). REA runs: serve `dist/` with `vite preview --host 127.0.0.1 --port 4173
  --strictPort`, then `~/rea-lab/rea capture-browser-scenario <file> --format json`.
- From wave 9 (prompts): every builder in `src/ai/prompts/` returns `{ system, prompt }` without the
  notes for the AI (the client appends them, D-16.24); `compactRetryNote(maxTokens, 'json' | 'prose')`
  is in `shared.ts`; the label scan is the photo request plus a hint (D-16.62); the fit check keeps the
  newest 12 meals; the kJ line is in the plan and fit-check prompts only. The prompt limits and plan keys
  come from the readers (`MAX_UNIT_CHOICES`, `MAX_PARTS`, `PLAN_REPLY_KEYS`).
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
- Stage on a verify worktree created at a recorded base (`/root/wt/verify.base`); commit with `git reset
  --soft <that base>`, then `git rebase origin/<branch>` before pushing. A soft reset to a remote head
  that moved after the worktree was made records the newer commits' files as deleted (7fbe51e dropped a
  prompt file that way; a0911d2 restored it). Check `git show --name-status` for `D` lines before pushing.
- 21565b4's message says 135.93 kB; the real initial JS after the wizard was 137.89 kB (its catalogue
  keys load at start-up). 7fbe51e's message corrects it.
- `.gitignore` is the package's own now (the old monorepo's Python ignore file is gone); still check
  `git check-ignore -v <path>` when a builder's file is missing from a patch.
