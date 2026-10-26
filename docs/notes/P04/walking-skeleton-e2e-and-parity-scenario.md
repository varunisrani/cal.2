# Task: Walking-skeleton e2e and parity scenario, Demo 1 (P04-14) · Phase: 04 · Owner: builder (wt-p04s6, wave C)

Read (reference @ `10e14b67`): none. The flow is our own (the phase row lists no reference file):
it strings together screens that already landed (P04-01..13) and proves them end to end. Our own
docs read: the P04-14 row and "Done when" (Demo 1) in `docs/plan/phases/P04-shell-and-walking-skeleton.md`;
`docs/plan/02-rea-workflow.md` §4 (scenario files) and §5 (rules); `docs/internals/acceptance-map.md`
(ACC-D2-1, "Review: P04-14"); the landed code for the hooks and names (`QuickStart.tsx`,
`HomePage.tsx`, `DaySummary.tsx`, `Diary.tsx`, `EntryRow.tsx`, `ManualSheet.tsx`, `SwipeRow.tsx`,
`Dialog.tsx`, `Gauge.tsx`, `Menu.tsx`) and the catalogue partitions (`src/i18n/en/*.ts`). REA's
input shape: the `capture_browser_scenario` tool schema of `rea-agents@6.8.0`, read from the
package unpacked in scratch space outside the repo (nothing of it enters the repo).

What it does (own words): two files drive the same first-run story a person would try on a phone.
A fresh browser opens the app, taps "Start with defaults", lands on Home with nothing eaten, opens
"+", chooses Enter manually, types "Toast" and 250 kcal and saves. The entry shows up in one meal
section and the gauge reads 250. After a reload it is all still there (stored, not just drawn).
Swiping the row (or its keyboard delete button) asks first; confirming removes it and the diary is
back to its empty card. The Playwright spec checks every step on the Pixel 7 profile; the REA
scenario is the same flow written as REA's declarative input, so a parity run (P10-03) can record
it with screenshots, the accessibility tree, the URL, page errors and network events.

Inputs → outputs:
- `e2e/walking-skeleton.spec.ts` → one Playwright test over the built app (`vite preview`), Pixel 7
  (`devices['Pixel 7']`) with the scenario's locale (en-US), zone (UTC) and reduced motion, the
  page clock started at 08:30 so the meal is breakfast; passes or names the failing step.
- `parity/walking-skeleton.platewise.json` → a `capture_browser_scenario` input: launch mode,
  start URL `http://127.0.0.1:4173/` (the preview port), Pixel 7 viewport, an ordered list of
  steps each with a `step_id` and a `timeout_ms`; REA completes every step or reports which one
  failed.

Files: created `e2e/walking-skeleton.spec.ts`, `parity/walking-skeleton.platewise.json` (new
`parity/` folder at the root), this note.

Edge cases / failure modes:
- The meal depends on the clock: the spec installs the page clock at 08:30 UTC with the browser
  in UTC (time keeps flowing from there, so timers run normally) and asserts the Breakfast
  section by its hook and name. REA cannot set the clock, so the scenario waits for the
  entry row inside any `home.meal.*` section without naming the meal.
- The reload must reach the stored data, not a cached render: the spec uses `page.reload()`; REA
  has no reload action, so the scenario navigates to the start URL again (the address has a hash
  at that point, so it is a real document load, not a hash change).
- The swipe: the spec drags the row with the pointer (mouse pointer events; SwipeRow reads
  pointer events, so this is the gesture's own path) past the threshold, and also opens the same
  question from the keyboard delete button. REA has no drag action, so the scenario presses Enter
  on the keyboard delete button (`press` focuses it first, which also slides the row aside).
- A pointer drag that stops short would ask nothing; the drag goes from near the trailing edge
  to near the leading edge, more than the 72 % cap, so the release is always past the threshold.
- Uncaught page errors fail the spec (collected from the first load to the end), matching the
  parity pass rule (no uncaught page error).
- Number formatting: `en-US` is set explicitly, so "250" and the gauge's text do not depend on
  the machine's language. The gauge's status line depends on the default goal, so the spec checks
  only that the gauge's description starts with the eaten amount.
- No real sleeps: every wait is a locator expectation (spec) or a `wait_for` step (scenario).

Our design differences / decisions:
- Copy is read through the catalogue (`en` plus the message renderer from `src/i18n`), never typed
  into the spec; the translator `t()` itself is not imported because it reads Vite's
  `import.meta.env`, which Playwright's loader does not provide.
- Locators: roles and accessible names first, `data-ui` hooks for structure (meal sections,
  gauge, diary, dialog actions); no CSS classes. In the scenario every locator is a `css`
  attribute selector on `data-ui` (REA's `test_id` kind reads `data-testid`, which we do not use).
  Two scenario steps use Playwright's `:text-is()` inside the gauge hook to wait for the eaten
  amount ("0", then "250"): data, not catalogue copy.
- The scenario's `environment` and `capture` blocks are the template every later
  `parity/*.platewise.json` copies unchanged: 412 × 839 at 2.625 (Pixel 7's viewport), `en-US`,
  `UTC`, light, reduced motion, service workers blocked; after each step a screenshot, the
  accessibility tree and the URL; page errors and network events recorded; bodies and header
  values not kept.
- REA's environment has no mobile or touch flags, so the scenario is the Pixel 7 viewport in a
  desktop Chromium, not a full device emulation (the spec has the full device profile).
- `browser.executable_path` is the Chromium this machine's Playwright installed
  (`/opt/pw-browsers/chromium-1243/chrome-linux64/chrome`): REA's schema requires an absolute
  path. The runner (P10-03) may override it.

Decisions for the lead:
- The scenario's environment and capture blocks above become the shared template (02 §4 says
  "identical"); P10-01/02 copy them.
- The scenario pins this machine's Chromium path; when P10-03 lands, the runner should inject the
  path instead (or the lead updates it when Playwright's browser build changes).

Tests we will write:
- `e2e/walking-skeleton.spec.ts > walking skeleton (Demo 1) > a manual entry lands under its meal,
  moves the gauge, survives a reload and is deleted only after confirming (ACC-D2-1)`: the whole
  flow above, three runs in a row (`--repeat-each=3`), alone, one worker.
- The scenario JSON validated against the `capture_browser_scenario` input schema of
  `rea-agents@6.8.0` (JSON Schema 2020-12) plus REA's own extra rules (unique step ids, the
  reserved start step id, declared secrets), and our rules (a `timeout_ms` on every step, only
  `data-ui` locators, a loopback base URL) with a throwaway script in scratch space. The lead runs
  it once through REA.

Compare checklist (filled after the rewrite; no reference file applies: the flow is ours, so
each tick names the step of `e2e/walking-skeleton.spec.ts > walking skeleton (Demo 1) > a manual
entry lands under its meal, moves the gauge, survives a reload and is deleted only after
confirming (ACC-D2-1)` that proves it):
- [x] Quick start → Home with 0 eaten (steps "a fresh load offers the quick start", "Home opens
      with nothing eaten")
- [x] "+" → Enter manually → "Toast", 250 kcal → the entry under its meal, the gauge at 250
      (ACC-D2-1; steps "\"+\" → Enter manually → Toast, 250 kcal → Save", "the entry is under
      breakfast and the gauge reads 250"). The meal follows the clock: run without the page clock
      (19:37 UTC) the same spec fails on the Breakfast section, so the frozen morning is what
      places it.
- [x] Reload keeps the entry, its meal and the gauge (step "after a reload it is still there")
- [x] The keyboard delete button and the swipe both ask; Cancel keeps the entry; Delete leaves
      the empty card and the gauge at 0 (steps "the keyboard delete button asks first; Cancel
      keeps the entry", "a swipe asks too; confirming leaves the empty diary")
- [x] No uncaught page error through the whole flow (the closing assertion)
- [x] The scenario validates against REA 6.8.0's `capture_browser_scenario` input schema and
      REA's extra rules, and keeps our rules (scratch script; a mutated copy is rejected). Its 26
      steps were also replayed with the same Playwright calls REA's action code makes against
      `vite preview`: all complete, no page error, and the `reload` step loads a new document.
      The lead's run through REA itself is still to do.
- Deliberate differences: none against the reference (no reference flow); the scenario differs
  from the spec where REA cannot follow (clock, reload, drag, device flags), as listed above.
- Not taken: running the scenario through REA (the lead does it once); the parity runner
  (P10-03).

## Status

Done (2026-10-26). Created the spec, the scenario (new `parity/` folder) and this note; nothing
changed outside them. The lead runs the scenario once through REA and replaces ACC-D2-1's
`Review: P04-14` line with the spec's `Test:` line.
