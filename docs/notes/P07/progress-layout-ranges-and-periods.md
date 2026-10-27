# Task: Progress layout, ranges and periods (P07-09) · Phase: 07 · Owner: builder (wt-p07s4a, slice S4a)

Read (reference @ `10e14b67`): `A/ui/progress/ProgressScreen.kt` lines 167–657 (the range table
with its window and nutrition-window rules, the page's state: range, period offset keyed on the
range, selected metric with its fallback, the Count-today preference, the order of the sections),
lines 660–900 for the range picker, the period navigator and its label rule and the include-today
row that the main block calls; `A/ui/progress/ProgressViewModel.kt` (what the page observes, the
weigh-in time rule), `A/ui/progress/ProgressMetric.kt` (fixed metric order). Tests:
`T/ui/progress/ProgressRangeTest.kt` (contiguous windows, day counts, All without periods, the
nutrition window ending yesterday and shifting past periods), `T/ui/progress/ProgressMetricTest.kt`
(availability order), `IT/ProgressRangeTests.swift` (the same windows, readings later on the last
day, the year in the label only outside the current year). Research spec `05-home-progress.md`
§3.5.1 (layout), §3.5.2, §3.5.7 (Count today); decisions D-16.44 (no challenge switch), D-16.37.

What it does (own words): the Progress tab, top to bottom: the page title; a place for the weekly
recap (P07-15); a six-way range control (1W, 1M, 3M, 6M, 1Y, All; 1W on every visit, never
stored); under it, except for All, a period row with arrows and a date label ("Oct 20 – 26", the
year only when an end is outside this year); the arrows step whole windows back and forth (forward
is off on the current window) and choosing another range goes back to its current window. A
metric switch (Weight, then Body fat once there is a reading, a profile value or a goal) picks the
card below; when the chosen metric goes away the page shows Weight. Then a place for that metric's
history link (P07-14), the Count today switch (stored, on by default; while off, calories and
averages end yesterday and past periods move back one day with them, and the caption names that
window), and a place for the calorie and averages cards (P07-16). Windows are inclusive local days;
readings count on a day by the half-open instant test from P01-02 (R05.5).

Inputs → outputs:
- `ranges.ts`: `PROGRESS_RANGES`, `RANGE_DAYS`, `DEFAULT_RANGE`; a `PeriodView` {range, offset} with
  `FIRST_VIEW`, `withRange`, `earlier`, `later`, `canGoLater`, `hasPeriods`; `periodWindow(view,
  today)` → `DayWindow`; `nutritionWindow(view, today, countToday)` → `DayWindow`;
  `availableMetrics({readings, profileValue, goal})` → `BodyMetric[]`; `shownMetric(chosen,
  available)`; `readingsIn(readings, window)`; `FIRST_READABLE_DAY` (the first day the page reads
  readings from).
- `RangeBar` {view, today, onChange} → range control + period row; `MetricSwitch` {metrics, value,
  onChange} → a segmented control, nothing when only Weight is offered.
- `ProgressPage` → reads settings (`units.weight`, `progress.countToday`), the profile, every
  weigh-in and body-fat reading up to today; acts through `services.progress`.

Files: created `src/domain/progress/ranges.ts` (+ test), `src/features/progress/RangeBar.tsx`
(+ test), `src/features/progress/MetricSwitch.tsx`, `src/features/progress/ProgressPage.test.tsx`,
`src/features/progress/testing/openProgress.tsx` (test helper), `src/i18n/en/progress.ts`,
`src/services/progress.ts` (+ test); changed `src/features/progress/ProgressPage.tsx` (placeholder
replaced), `src/features/progress/progress.module.css`, shared: `src/i18n/en.ts` (one partition
line), `src/services/context.tsx` (`progress?` in `Services`), `src/main.tsx` (builds the service),
`src/app/Screen.tsx` (Progress loads on first open), `src/app/App.test.tsx` (awaits the lazy page).

Edge cases / failure modes:
- Offset never negative, never fractional; All ignores the arrows.
- Changing to the same range keeps the offset (the control does not report it anyway).
- Count today off with offset 0 ends yesterday; with offset 1 the window is one day earlier than
  the weight window of that period (contiguous with the current nutrition window).
- Label across New Year shows both years; a window wholly in this year shows none.
- A reading late on the last day of the window is inside it (R05.5).
- Body fat chosen, then the profile value, goal and readings all go: the page falls back to
  Weight and stays there when body fat returns.
- Reads still loading: the title and grey blocks only, no numbers (as Home, R05.12); a failed read
  shows one message card.
- Midnight while open: `useToday()` moves, so the windows and the label move with it.

Our design differences / decisions:
- Names and structure are ours (range ids `week`, `month`, `quarter`, `half`, `year`, `all`;
  `PeriodView`; `FIRST_VIEW`).
- No destination switch above the recap (D-16.44). No Workouts or Steps metrics (later phases).
- The metric switch is not drawn while Weight is the only metric (a one-choice control tells
  nothing; the weight card has its own heading). Decision for the lead below.
- The range resets to 1W whenever the tab screen mounts again (tab screens unmount on a switch);
  "not persisted" is kept, session memory across tab switches is not added.
- Every reading is read once (from `FIRST_READABLE_DAY` to today) and windows filter in memory:
  the latest-overall badge, the body-fat availability and the window all come from one read per
  store.
- Slots for the next slices are named components in `ProgressPage.tsx` that render nothing yet.

Tests we will write:
- `ranges.test.ts`: day counts; 1M offset 1 ends 30 days before today; windows contiguous for
  every range at offsets 0–3; `withRange` resets the offset; `earlier`/`later` clamp, All has no
  periods; Count today off ends yesterday and shifts offset windows (the reference's dates, our
  own test); availability order and each body-fat trigger; fallback to weight; `readingsIn` keeps a
  21:00 reading on the last day (R05.5).
- `RangeBar.test.tsx`: the 1W label for today; the back arrow on 1M shows the previous 30 days and
  its label (ACC-G1-1); forward disabled at offset 0 and enabled after a step back; a range change
  resets the offset; All hides the period row; the year only across years.
- `ProgressPage.test.tsx`: loading shows no numbers; Body fat hidden without data and offered with
  a goal only (ACC-G2-1); a vanished body-fat metric falls back to Weight; Count today is on by
  default, stored when switched, and its caption names the shifted window; 1W is the default and
  is not stored.
- `src/services/progress.test.ts`: `setCountToday` and `setWeightUnit` store their settings.

Compare checklist (filled after the rewrite; reopened `ProgressScreen.kt` 167–900,
`ProgressMetric.kt`, `ProgressRangeTest.kt`, `ProgressMetricTest.kt`, `ProgressRangeTests.swift`):
- [x] ranges of 7, 30, 90, 180, 365 and 3 650 days, 1W first (`ranges.test.ts > ranges and periods >
      covers 7, 30, 90, 180, 365 and 3 650 days, opening on the week`; `RangeBar.test.tsx > RangeBar >
      opens on 1W with the dates of the last seven days and no year`)
- [x] inclusive window ending today, stepped back by whole windows, contiguous at every offset
      (`ranges.test.ts > ranges and periods > ends the 1M window one step back 30 days before today`,
      `> gives every range its day count and contiguous windows as the offset grows`; `RangeBar.test.tsx
      > RangeBar > shows the previous 30 days and their dates after the back arrow on 1M (ACC-G1-1)`)
- [x] offset back to 0 on a range change (`ranges.test.ts > ranges and periods > starts a new range on
      its current window and keeps the view for the same range`; `RangeBar.test.tsx > RangeBar > goes
      back to the current window when the range changes`)
- [x] forward off at offset 0, never past the current window (`ranges.test.ts > ranges and periods >
      steps forward only from a past window, and never past the current one`; `RangeBar.test.tsx >
      RangeBar > keeps the forward arrow off on the current window and turns it on after a step back`)
- [x] no periods for All (`ranges.test.ts > ranges and periods > has no periods for All: the arrows
      change nothing and the window ends today`; `RangeBar.test.tsx > RangeBar > has no period row for
      All`)
- [x] the year in the label only when an end is outside this year (`RangeBar.test.tsx > RangeBar >
      writes the year only when an end of the window lies outside this year`, `> writes both years for
      a week across New Year`)
- [x] nutrition window ends yesterday without today and past periods shift by the same day; the
      caption names it, All has no dates (`ranges.test.ts > nutritionWindow > ends yesterday when today
      does not count, and moves past periods back by the same day`; `ProgressPage.test.tsx >
      ProgressPage > counts today by default, stores the switch, and names the window it leaves while
      off`)
- [x] Count today stored, on by default (same page test; `src/services/progress.test.ts > settings >
      stores whether today counts`)
- [x] a reading late on the last day counts (R05.5) (`ranges.test.ts > readingsIn > keeps a reading
      logged at 21:00 on the last day and leaves out the day before the first (R05.5)`)
- [x] metric order and body-fat triggers: a reading, a profile value, a goal (`ranges.test.ts > metrics
      > offers only weight with no body-fat reading, profile value or goal`, `> offers body fat after
      weight for a reading, a profile value or only a goal`; `ProgressPage.test.tsx > ProgressPage >
      offers no Body fat without a reading, a profile value or a goal (ACC-G2-1)`, `> offers Body fat
      after Weight once only a body-fat goal exists (ACC-G2-1)`, `> offers Body fat for a stored
      reading`)
- [x] a vanished metric falls back to Weight and stays there (`ranges.test.ts > metrics > shows the
      chosen metric while offered and falls back to weight when it goes`; `ProgressPage.test.tsx >
      ProgressPage > falls back to Weight for good when the chosen body-fat metric goes away`)
- [x] the range is not stored (`ProgressPage.test.tsx > ProgressPage > opens on 1W again at the next
      visit: the range is not stored`)
- [x] no number before the reads are in; a failed read shows one message (`ProgressPage.test.tsx >
      ProgressPage > draws the title and no number until every weigh-in is read`, `> shows a message
      instead of the cards when a read fails`)
- [x] section order: recap, range, periods, metric switch, metric card, history, Count today,
      nutrition (slots for P07-13..16 in `ProgressPage.tsx`; read by eye against the reference's list)
- Deliberate differences: no destination switch (D-16.44) and no Workouts or Steps metrics (later
  phases); the metric switch is not drawn while Weight is the only metric; the range control and
  the period row are one component; our own copy for the arrows and the Count today caption (one
  sentence naming the window instead of "scope · dates"); the range resets to 1W each time the tab
  screen mounts; the page waits for every read before drawing numbers.
- Not taken: the foreground epoch (only steps and the recap use it: P07-15 re-reads today); the
  steps and workouts reads; the nutrition computation and its loading card (P07-16).

## Decisions for the lead

- `src/i18n/en.ts`: the `progress` partition (import and `enPartitions` line) is added in this
  diff; merge it with the other slices' lines.
- `src/app/Screen.tsx`: this diff loads the Progress screen with `React.lazy` so the charts stay
  out of the initial chunk; the lazy-loading slice (`wt-lazy`) rewrites the same file for every
  tab with `onDemand` and a skeleton: take theirs, `ProgressPage` stays a named export.
  `src/app/App.test.tsx > App > shows the goal-reached dialog over a tab screen…` now waits for the
  lazy page (one line).
- `src/features/settings/SettingsHub.test.tsx > tab placeholders > give Progress and Coach a page
  titled with the tab name` renders `<ProgressPage />` without any provider; the real page needs
  them, so that test fails until `ProgressPage` (import and the two Progress assertions) is taken
  out of it (Progress's heading is covered by `ProgressPage.test.tsx`). Settings is outside this
  slice, so the line is left to the lead.
- Metric switch hidden while Weight is the only metric (smallest choice, one line to change).
- "Every reading" is read by day window from `FIRST_READABLE_DAY` (1900-01-01) to today, because
  the hooks read by day; a `useAllWeighIns` / `useAllBodyFat` hook in `src/data/hooks.ts` would say
  it directly (follow-up; `src/data` is import-only here).

## Status

Done (2026-10-27). `ranges.ts`, `RangeBar`, `MetricSwitch`, the page with its slots, the
`progress` partition and the progress service are in, with tests. Lines changed outside the
slice's files: `src/i18n/en.ts` (one partition), `src/services/context.tsx` (`progress?`),
`src/main.tsx` (builds the service), `src/app/Screen.tsx` (Progress through `React.lazy`),
`src/app/App.test.tsx` (waits for the lazy page). Handed on: the slots to P07-13..16; the
SettingsHub test line to the lead (above).
