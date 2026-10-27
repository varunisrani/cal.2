# Handoff: state of the Platewise build

Updated: 2026-10-28 00:20 IST (Agent 1, session 3). v1.0 complete: 176/176 tasks, release commit 1fa1f1b; P11
(Android app and Health Connect, at the user's request) complete at 6e80369; polish at 27e5604.
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
| Wave 10 | P05-15 (onboarding and goals e2e, Demo 2; `e2e/support.ts`). P05 done | 289332c |
| Wave 10 | P06-12, P06-13 (reuse lists, copy a day; `openForReview`, `savedMeals` service) | 1e3db66 |
| Wave 10 | P06-14, P06-17 (barcode scanner, lookup order, label memory; zxing in its own chunk) | 26e1c99 + cfd46c7 |
| Wave 10 | P06-10, P06-09 (fit check sheet; ingredients card and recipe split, then its barcode and reuse sources; D-16.83) | d72f291 + d78c140 |
| Wave 10 | Lazy-loading groundwork (tab screens, Settings pages, review and overlay, the AI layer on first use) | ff6e147 |
| Wave 10 | P07-09, P07-12 (Progress layout, ranges, weight card, Log weight) | 63a79c7 |
| Wave 10 | P07-01, P07-02 (week bar, selected day, day swipe) | cad5f93 |
| Wave 9 | P05-05, P05-07 (Building plan, completion; the wizard replaces the quick start; Demo 1 walks it; REA run `ev_829b1eb8aacac4a1ed4274063ad3dcda8914060a1afa189e9bb794e6474a84dc`: 50/50 steps, no page errors) | c1f0bd3 |
| Wave 10 | P07-13, P07-14 (body-fat card and logging; history sheets) | 2b1a1c3 |
| Wave 10 | P06-18 (product block, ingredient label with bold allergens, allergen line; lead: the draft codec keeps `markedIngredients`) | c447eaf |
| Wave 10 | P07-03, P07-04 (gauge and pillars in full; the day's nutrients sheet and pillar picker; `homePrefs` service) | 630e227 |
| Wave 11 | P07-16 (calories card and averages; cancellable sliced computation) | b2f9de2 |
| Wave 11 | P07-15 (weekly recap; D-16.84; plan cell corrected: 1 799 kcal is outside ±10 % of 2 000) | dc6c909 |
| Wave 11 | P07-06 (water menu page, custom amount, water settings and presets editor; Settings › Tracking & reminders; `water` service) | c3b9f43 |
| Wave 11 | P08-04, P08-12, P08-13 (coach history, prompt chips, Markdown replies and copy; D-16.85) | d18dd7a |
| Wave 11 | P08-05..07 (chat wires with tool calling: OpenAI-compatible, Anthropic, Gemini; `askRound`) | 29d15b9 |
| Wave 11 | P08-01..03 (coach context and system prompt, six nutrition tools, tool-result limiter) | 0a3cbdb |
| Wave 11 | P07-07 (fasting service, start sheet, editor, settings; paused dialog in review, manual, copy a day) | 3458a92 |
| Wave 11 | P06-11 (entry editor; `updateEntry`, `toggleSaved`, `reprocess` service) | 9357cad |
| Wave 12 | P09-12 (backup archive codec: our stored-ZIP writer and reader, safe names, content hash) | 0130532 |
| Wave 12 | P09-08 (reminder engine: schedule, engine, ports; wired but silent until P09-09) | 419266c |
| Wave 12 | P08-08, P08-09 (coach chat engine; Coach session) | 0695274 |
| Wave 12 | P07-05, P07-08 (diary sort, water and fast rows; the + menu's water and fasting entries; `panel` menu entries) | a1dd707 |
| Wave 12 | P06-19 (selection bar and combine; row tap → entry editor; saved heart) | c068426 |
| Wave 12 | P09-10, P09-11 (diary export and import; `transferRepo`) | d8b3864 |
| Wave 12 | P08-10, P08-11 (Coach page and composer; `Menu` gains `disabled`) | 75bdb01 |
| Lead fix | FastEditor "ended elsewhere" test waits for its toast (a loaded-machine flake) | 2ed6962 |
| Wave 13 | P09-07 (AI providers page and the food-database key; `AiSettingsEdits`) | 27596b1 |
| Wave 13 | P09-02, P09-04, P09-06 (App settings and units, Tab bar, Product details; `appSettings` service) | bcfa20d |
| Wave 13 | P09-17, P09-18 (service worker and update flow; manifest, install prompt, CSP) | 9abd7b0 |
| Wave 13 | P09-13 (backup and restore; `backupRepo`; GIF/HEIC photos go in as JPEG copies) | d8fcdfc |
| Wave 13 | P06-20 (logging e2e, Demo 3: nine scenarios, routed food databases, no stray network). P06 done | 73c3788 |
| Wave 13 | P09-05 (Add-menu editor; `setMenuLayout`, `resetMenuLayout`) | 78db379 |
| Wave 14 | P10-13 (user docs in `docs/user/`) | ec065f0 |
| Wave 14 | P09-16 (About, licences and credits; `src/config/links.ts`; notices script and plugin) | 451dfa3 |
| Wave 14 | P08-14 (Coach e2e, Demo 5). P08 done | c5ae25b |
| Wave 14 | P09-09, P09-03 (notifications section and notifier; meal times editor) | 3072da8 |
| Wave 14 | P09-01 (Settings hub and load gate; sub-pages nested; update dot) | d60ebb6 |
| Wave 14 | P09-14 (restore from a backup file on Welcome) | 9055c15 |
| Wave 14 | P07-17 (Home and Progress e2e, Demo 4). P07 done | e370445 |
| Wave 14 | P09-15 (Your data page, storage card, persistence nudges; `photoRepo.clearThumbs`) | 465e353 |
| Wave 15 | P10-09, P10-10, P10-12 (security review with planted-key tests and the CSV formula fix; similarity report; gated live check, skipped without keys) | 0ed03fa |

Waves 15–16 (2026-10-27, Agent 1 session 3), each after a passing full loop:
4deddf0 P10-01..04 parity (14/14 REA flows, obligations ledger, D-16.86/87) · 0767cd1 P09-19 settings/data/offline e2e
(P09 complete) · 0ee2a33 P10-05/06 acceptance strict pass and traps ledger (`pnpm ledger:gaps`) · 77c587f K9
damaged-data notice and the security fixes S-3, S-5..S-9, S-12, S-15 (D-16.88) · 73aedfb P10-07/08/11 accessibility
pass (axe), shipped inventory, browser matrix (`check --strict` green) · **1fa1f1b P10-14 release prep, version 1.0.0:
the v1.0 release commit** (unit 5154 passed + 2 expected-fail, check 6/6 with --strict, bundle 235.96 kB, e2e 47 + 1
skipped by design). **All 176 planned tasks are done.** No tag or GitHub release (only when the user asks).

## In progress

**v1.0 is complete (1fa1f1b).** Open items on the release checklist (`docs/internals/release-checklist-v1.0.md`):
WebKit and Firefox runs (not installed in this container), the manual device rows, S-4 host headers once a host is
chosen. Follow-ups still open: `sw.ts` has no `notificationclick` handler; onboarding has its own notification ask;
`diaryRepo.clear()` could replace Clear diary's full-range rewrite; nothing listens to `db.ts`'s reload-needed message;
a small stored photo keeps its own bytes (and any location data) in backups; the Coach draws Markdown `##` as h4
(moderate axe heading-order); the parity data flow lacks export, Back up now and erase; REA captures record typed
password values (scenarios type only made-up keys).

**Android APK (21:35 IST, the user asked for one):** a debug APK of 1.0.0 was built outside the repo (Capacitor 7.6.9
shell in the lead's scratchpad, Android SDK at `scratchpad/apk/sdk`, Maven Central via Google's mirror because Central
answers 429 here) and sent to the user with the web build as a zip. No emulator here (no KVM): not run on a device.

**03:35 IST:** landed 705f448 P13 S2 (Coach reads Health Connect), 61f16d7 P13 S1 (kg only), fbe4a70 P12-01..04 (orange
redesign) after one stacked loop (unit 5337 + 2 expected-fail, strict 6/6, bundle 237.55 kB, e2e 47 + 1 skipped). P13 S3
(notifications + your own reminders) is in the loop in `/root/wt/verify`; S4 (Coach chat UI + propose_reminder) builds
in `/root/wt/wt-p13s4` on a local base (073c8e4) holding everything else. Under heavy builder load HomePage tests time
out at 5 s (they pass alone): run the loop when builders are quiet, or stack slices.
**P13 (the user asked 01:45 IST):** kg only (D-16.91), Coach reads Health Connect (D-16.94), reminders as Android
notifications plus custom reminders made by hand or through the Coach (D-16.92, D-16.93), and an easier Coach chat.
Plan `docs/plan/phases/P13-kg-coach-health-reminders.md`. Wave A builders running at b9a3f7a: S1 kg only
(`/root/wt/wt-p13s1`), S2 Coach × Health Connect (`wt-p13s2`), S3 notifications and custom reminders (`wt-p13s3`);
prompts in `docs/handoff/wave19/`. Wave B after P12/S2/S3 land: S4 the Coach chat UI and `propose_reminder`. 1.1.0
(P12-05) ships with P12 and P13 together.
**P12 (the user asked 01:30 IST, 2026-10-28):** an orange redesign (light: white and orange; dark: charcoal and
orange; orange the default accent, D-16.90) and the official 1.1.0 release with an APK. Plan
`docs/plan/phases/P12-orange-redesign-and-1.1.md`; the design builder (P12-01..04) runs in `/root/wt/wt-p12s1`
(prompt `docs/handoff/wave18/w18-p12s1.txt`); the lead does P12-05 (version 1.1.0, CHANGELOG, checklist, APK with
versionCode 2). No tag unless the user asks.
**P11 polish (01:22 IST):** 27e5604 Progress total burn and distance, no "Turn on reminders" button inside the app, a
timer for held-back write-back (full loop: unit 5292 passed + 2 expected-fail, strict 6/6, bundle 237.72 kB, e2e 47 + 1
skipped by design). The APK built from 27e5604 was sent to the user. Nothing is left that does not need the user:
waiting on their device test, `main`, the attribution URL, and any tag or 1.1.0 release.
**P11 complete (00:20 IST, 2026-10-28):** 344e4ca P11-05 (Android user guide, CHANGELOG 1.1.0 unreleased, naming,
59 Android licence notices shown on Credits inside the app) and 6e80369 the follow-ups (future-dated write-back held back
until its time, total burn and distance on Home, reminders copy in the app; ACC-M11-8/9). Full loop: unit 5279 passed +
2 expected-fail, check 6/6 with --strict, bundle 237.67 kB, e2e 47 + 1 skipped by design. The APK built from 6e80369 was
sent to the user. Open: the owner's device test (release checklist A4/A5); follow-ups from the notes: a timer for a
held-back record, hiding onboarding's "Turn on reminders" in the app, Progress's activity card shows only steps and
active calories; 1.1.0 is unreleased (version stays 1.0.0 until the owner asks).
Earlier: **P11 status (23:35 IST):** P11-01/02 landed as e62b917 (Android shell, Kotlin Health Connect plugin, 62 JVM tests;
`ANDROID_HOME=<sdk> PLATEWISE_MAVEN_MIRROR=1 pnpm android:apk`), P11-03/04 as 1ccefe1 (sync, activity table, Settings →
Health Connect, Home activity card and goal + burned, Progress steps and burn; ACC-M11-1..7, strict green; bundle
237.51 kB). The Health Connect debug APK built from 1ccefe1 was sent to the user (same debug key as the first APK).
P11-05 (docs, CHANGELOG 1.1.0, naming, Android licence notices) is with a builder in `/root/wt/wt-p11s3` (base cbc7a27,
prompt `docs/handoff/wave17/w17-p11s3.txt`).
**P11 (the user asked 21:50 IST): Android app and Health Connect** — `docs/plan/phases/P11-android-and-health-connect.md`
(D-16.89 replaces D-16.4 on Android; plugin contract in the phase file). Wave 17: S1 = P11-01/02 native shell and Kotlin
plugin (`docs/handoff/wave17/w17-p11s1.txt`), S2 = P11-03/04 web service, data and UI (`w17-p11s2.txt`); S3 = P11-05
docs and ledgers after both land. When P11 lands: rebuild the APK with `pnpm android:apk` and send it to the user.

**Open for the user:** the OpenRouter attribution URL (`ATTRIBUTION_URL` in `src/ai/adapters/openaiCompat.ts`) is the
project's repository URL until Platewise has a site; whether to fast-forward `main` to the work branch; a tag or
release for 1.0.0 only if they ask.

## Next

1. Land wave 12 as it returns; then P08-10/11; then the three e2e tasks; then P09 (settings, data, platform)
   and P10 (hardening and release).
2. Landing helpers: `/root/wt/commit-landing.sh <msg>` (one slice) and `/root/wt/land-multi.sh <base> <sha>
   <msg> ...` (several stacked slices from one loop, one commit each); both refuse unless the loop log ends
   with `ci=0` and check fmt, check and lint again before pushing.
3. Follow-ups noted by builders, not yet done (the shared list formatter landed in a37c20d): unused
   catalogue keys `log.manual.paused` and `reuse.copyDay.paused.*` (the paused dialog replaced them);
   `diaryRepo.update` does not refuse an edit during a fast (check against R05.1's intent); copy a day's
   End fast and log is two writes (a list-taking `endFastAndAdd` would make it one); the
   gauge says "No goal set" while the pillars say "No goal"; energy and nutrient unit words used from
   the `home` partition by Progress (a shared units partition); unify the three AI-setup readers; lazy onboarding and Home sheets; a shared nutrients
   partition; `data/barcodeKey` re-exporting the domain barcode key; the water service has no delete
   yet (P07-05's swipe-delete adds `deleteLog`); "water off" is two settings writes (no multi-key
   update); a plain state update after an IndexedDB write waits for `until`'s act to end, so screen
   tests that wait for toasts can hang under load (the water tests use a `settle` helper in
   `src/features/water/testing/openWater.tsx`; a shared one in `src/test/` would fix it for all).
   P07-08: `WaterMenuPage` takes `onCustom` so the + menu can close and Home can show
   `CustomWaterSheet` (a sheet drawn inside the menu popup closes with it).

## Notes for later waves (from wave-1 and wave-2 builders; put them in the prompts)

- From wave 8 (Home): data-ui hooks for e2e and parity: `home.add`, `home.add.manual`, `home.gauge`,
  `home.summary`, `home.pillar.<key>`, `home.diary`, `home.diary.empty`, `home.meal.<meal>[.totals]`,
  `manual`, `manual.{name,energy,protein,carbs,fat,fibre,meal,save,cancel}`, `manual.mealPicker.<meal>`,
  `entry.row` (keyboard delete `entry.row.delete`), dialog `entry.delete` with `.confirm`/`.cancel`,
  `settings.category.<id>`, `settings.back`. `src/test/screenHarness.tsx` renders a tab screen over real
  repositories. The settings registry holds page components and is empty until P05-10. Follow-ups: the
  router restores scroll before late data draws (a re-apply after data is needed); no meal/flame/food
  icons; no photo hook yet (P06).
- From wave 10 (lazy loading): new Settings pages register as `page: onDemand(() => import('./x/XPage').then((m) => m.XPage))`;
  services that ask a model import `src/ai/tasks/*` with `await import(...)` at send time (a static import puts
  the AI layer back in the start-up download: fitCheck and ingredientIntake did, fixed at landing); tests wait
  for lazy pieces with `untilLoaded()` or load the module in a `beforeAll`. Follow-ups: lazy onboarding (about
  −16 kB), Home's sheets on first open, a Rolldown chunk group for the many small shared chunks, and Retry after
  a failed chunk fetch (Chrome keeps it failed until reload). Initial JS 201.26 kB after P06 landed.
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
- Full loop (repository root): `PLATEWISE_REF=/root/reference/fud-ai bash scripts/ci-local.sh` (while builders
  run e2e or REA, give the lead's loop its own ports: `PLATEWISE_E2E_PORT=4290 PLATEWISE_FAKE_AI_PORT=4390`)
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
- Never commit a landing before reading `ci=0` at the end of `/root/wt/verify-ci.log`: 26e1c99 went out with
  its loop failed at lint (a duplicate `case` from the merge) because the commit step did not check it;
  cfd46c7 fixed it. Landing commits now go through `/root/wt/commit-landing.sh <message-file>`: it refuses
  unless the log ends with `ci=0`, fills `{UNIT} {FILES} {BUNDLE} {E2E}` in the Verified line from the log,
  commits on `/root/wt/verify.base`, rebases, runs fmt, check and lint, and only then pushes.
- 21565b4's message says 135.93 kB; the real initial JS after the wizard was 137.89 kB (its catalogue
  keys load at start-up). 7fbe51e's message corrects it.
- `.gitignore` is the package's own now (the old monorepo's Python ignore file is gone); still check
  `git check-ignore -v <path>` when a builder's file is missing from a patch.
