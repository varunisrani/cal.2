# Task: Parity scenarios: food and Home; Progress, Coach, settings and data (P10-01, P10-02) · Phase: 10 · Owner: builder (wt-p10s1)

<!-- Save as platewise/docs/notes/P<nn>/<slug>.md. Write everything above "Compare checklist"
BEFORE writing code, in your own words. Never paste or paraphrase the reference line by line. -->

Read (reference @ `10e14b67`): the rows' "Read in reference" column names the reference
observations in `~/rea-lab/parity/fud-ai/<flow>.md` and the store screenshots they cite. Neither
existed on this machine (`~/rea-lab/captures/` is empty: the contact sheets of the intake were not
re-created in session 3), so this task writes the observations first, outside the repo, from the
research specs (each flow's spec section, which already marks reference claims `[obs]`/`[inf]`)
and the reference files those sections name (file maps of specs 01, 02, 04, 05, 06), and cites no
screenshot. Specs read: 01 §3.4–3.6, 02 §3.4–3.5, §3.7–3.9, §3.11–3.12, §3.15–3.17, 04 §3.1–3.6,
05 §3.2–3.7, 06 §3.2–3.3, §3.13, §3.15, §3.17. Our docs: `02-rea-workflow.md` §4–5, the P04-14
note (the scenario template), Demo 1's two REA runs in `docs/HANDOFF.md`, the e2e specs (the hooks
and the flows they drive), and REA's `capture_browser_scenario` input schema from the
`rea-agents@6.8.0` package (outside the repo).

What it does (own words): thirteen files, one per flow, each REA's declarative browser-scenario
input. A run opens a fresh browser on the built app and walks a person's path through one area
using only `data-ui` hooks: set up through the wizard (with the fake AI as the Custom provider when
the flow asks the AI), then log by hand, by photo, by description, by typed barcode digits, from
Recent; edit, combine and copy a day; log water and run a fast that pauses logging; move between
days; log and delete weights and body fat and read the ranges and the recap; talk to the Coach
(a tool round, then a Reset over a pending reply); change units, accent and AI standbys; restore a
backup on Welcome. Every step waits for what a person would see before the next one, so the run
itself proves the flow; REA records screenshots, the accessibility tree and the URL after each
step, and page errors and network events across the run, for the comparison (P10-04).

Inputs → outputs: the built app under `vite preview`, the fake AI and the fixture desk of the
runner (P10-03) → per scenario an Evidence record (`ev_…`) in `~/rea-lab/parity/platewise/` with
every step `completed` and no page error, or the step that failed.

Files: created `parity/{onboarding,log-manual,log-photo,log-describe,log-barcode,reuse,
edit-combine-copy,water-fasting,home-days}.platewise.json` (P10-01) and
`parity/{progress,coach,settings,data}.platewise.json` (P10-02), this note. `data-ui` hooks added
to components only where a step has nothing to hold on to (listed in the status).

Edge cases / failure modes:
- REA has no clock: runs happen on the real date and time, so no step names a meal, a date or a
  weekday. Rows are found inside any `home.meal.*` section; days are reached with the week bar's
  arrow keys from today's tile (`aria-current="date"`), so last week and yesterday work on any
  day, also on the first day of a week.
- REA has no reload, drag, long-press or file action. A reload is a `goto` to the start address;
  the day swipe and swipe-to-delete use their keyboard twins (the week bar's arrows, a row's
  delete button); a combine starts from the row's Select button (keyboard focus shows it); a
  photo or a backup file is picked by the runner's fixture desk, which answers the browser's file
  chooser (P10-03); the app's own file input is what the step clicks.
- Every run starts with an empty browser profile: each scenario sets up through the wizard
  first. Flows that need the AI pick the Custom provider at the fake's canonical address
  (`http://127.0.0.1:4320/v1`) and a typed model id; the runner rewrites the address when it
  serves the fake elsewhere.
- Open Food Facts, its image host and FoodData Central are never reached: the fixture desk answers
  them from `e2e/fixtures` (our product, a not-found reply, no FDC hits); any other host off
  loopback is refused, so a run never depends on the internet.
- Steps that wait on the AI (plan, analysis, Coach) get longer timeouts (30 s) than plain UI steps
  (10 s); a slow reply that must be cut off by Reset is the fake's 60 s delay, never reached.
- Text in selectors only where the value is data the scenario typed (a food name, an amount),
  never catalogue copy, so a wording change cannot break a run.
- The data page (P09-15, Settings › Your data: export, backup, clear, erase) is not on this base:
  `data.platewise.json` covers the restore on Welcome (a backup file the runner makes with our own
  backup writer, and a refused file); its export, backup and erase steps are left for the lead to
  add once P09-15 lands.

Our design differences / decisions:
- Same `browser`, `environment` and `capture` blocks as `walking-skeleton.platewise.json` (the
  template), unchanged; `start_url` the canonical preview address. A scenario file is pure REA
  input (REA refuses unknown keys), so what the runner must prepare for a flow (fake AI replies,
  files for the chooser) lives in the runner's table, keyed by the scenario's name.
- Step ids say what happens in the flow (`fast.start`, `review.log`), dotted like our hooks.
- Our hooks only: `[data-ui="…"]`, plus our own state attributes on hooked elements
  (`data-step`, `aria-checked`, `aria-current`, `data-running`, `disabled`).
- Where an e2e already proves exact numbers, the scenario only waits for the screen a person
  would see next; numbers it checks are the ones it typed (a row's energy after an edit).

Tests we will write:
- Each scenario through the real REA CLI with the runner: every step completed, no page error.
- The runner's static check over every scenario file (P10-03 unit test): every step has a
  `timeout_ms`, every locator is a `data-ui` CSS selector, step ids unique, blocks identical to
  the template.

Compare checklist (filled after the rewrite; reopened the observations' files: the onboarding
view model and plan step, `MealSchedule.kt`, the Android sort order (`PreferencesStore.kt`,
`HomeViewModel.kt`) and iOS onboarding's sort seeding, `KeyStore.kt` masking, and the store
screenshots `ios/01-day-at-a-glance.png` against our Home capture):
- [x] Every scenario completes through the real REA with no page error: the final run of
      `pnpm parity` (14/14 flows, Evidence ids in `docs/internals/parity-report-v1.0.md`).
- [x] Every file passes the static rules (hooks only, a `timeout_ms` per step, no sleeps, the
      template's blocks) (`scripts/parity.test.ts > checkScenario > passes every scenario file in
      parity/, each with its FIXTURES entry`).
- [x] Defaults of the wizard match the reference (male, 25 years, moderate, maintain, body fat
      unknown) and Home's regions match the store screenshot (week strip, gauge with eaten and left,
      four pillars, meal sections with Sort in the first header, floating tab bar and +)
      (`onboarding` and `log-manual` captures).
- [x] Default meal times are the reference's (05:00 / 12:00 / 18:00 / 23:00): the 11:4x entries of
      the runs sat under Breakfast (`log-manual` capture).
- [x] During a fast the + menu drops every food entry and keeps water and fasting, as the reference
      does (`water-fasting` > `fast.no-food`).
- Deliberate differences: every one is classified in `parity/ledger/obligations.json` (D-ids); two
  had none and are recorded as D-16.86 (accent-blind food search) and D-16.87 (the Select button as the
  long-press's keyboard twin).
- Not taken: the day swipe and the long-press themselves (REA has no drag or hold: the keyboard
  twins stand in, and e2e drives the gestures); the data page's export, backup and erase (P09-15 is
  not on this base); the review's time-driven meal (ACC-D7-1) needs a past date that REA can only
  type as a literal.

## Status

Done (2026-10-27). Thirteen scenarios, every one passing through the real REA with the runner.
Hooks: no hook added; one renamed for a bug (`reuse.saved` on saved rows → `reuse.saved.row`,
`src/features/log/reuse/ReuseSheet.tsx`, one attribute; see the obligations note). Handed on to
the lead: the data page steps of `data.platewise.json` once P09-15 lands.
