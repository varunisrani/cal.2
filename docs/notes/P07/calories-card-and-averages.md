# Task: Calories card and averages (P07-16) · Phase: 07 · Owner: builder (wt-p07s4d, slice S4d)

Read (reference @ `10e14b67`): `A/ui/progress/ProgressScreen.kt` lines 1497–1970 (the calorie
section with its header average and empty text, the bar chart already rebuilt in P07-11, the
window statistics: how days are bucketed, which days get a bar, the two denominators, which
nutrients are listed, the loading row, and the average row with its thin bar and minimum width).
Test: `T/ui/progress/ProgressRangeTest.kt` `excludingTodayKeepsAPartialDayOutOfTheAverages`
(today's breakfast-only day is in the bars and the protein mean with Count today on, out of both
with it off). Research spec `05-home-progress.md` §3.5.1 (order of the cards), §3.5.7; traps
R05.17 (denominators, absent days, the shifted window) and R05.4 (food only).

What it does (own words): under the Count today switch, Progress shows what was eaten over the
nutrition window (the period, ending yesterday when Count today is off). The Calories card lists
one bar per day whose food adds up to more than 0 kcal; a day without food, or with only 0 kcal
food, gets no bar at all. Its header shows "Avg" with the whole-number mean of those days (the
remainder dropped) in kcal or kJ; with no such day a short message replaces the chart. The macro
card shows protein, carbs and fat as the average per logged day (a day with any food entry, even
one of 0 kcal) against the day's targets, each with a thin bar. The nutrient card does the same
for every other nutrient Home can show as a pillar (the 21 goal nutrients and the 8 sports
compounds), leaving out a nutrient whose average is under 0.05 when its goal is 0; with goal 0 the
amount shows alone. Only diary entries count: water and fasts live in their own stores and never
reach these numbers (R05.4). The numbers are worked out in a task that gives the page a turn
between slices; a newer window, entry list or goal list cancels the older task. Before any result
exists a loading card shows; once one is shown it stays, under a small spinner, until the newer
result replaces it.

Inputs → outputs:
- `averages.ts`: `windowNutrition({ entries, window, goals, keys? })` → `{ calorieDays: [{day,
  kcal}], averageKcal | null, loggedDays, macros: {protein, carbs, fat}, nutrients: [{key,
  average, goal}] }`; `windowNutritionSteps(same)` → a generator that does the same one day per
  step and returns the result (the cancellable form).
- `useNutritionStats.ts`: `runInSlices(steps, onDone, options?)` → cancel function (slices of about
  8 ms on `setTimeout`, cancel stops between slices); `useNutritionStats(input | null)` →
  `{ stats | null, stale }`.
- `NutritionCards` {window} → reads the window's entries (`useEntriesBetween`), the targets
  (`useTargets(today)`) and `units.energy` + `goals.nutrients`; renders the loading card, an error
  card, or `CaloriesCard` + two `AveragesCard`s with a spinner while stale.
- `CaloriesCard` {days, averageKcal, goalKcal, unit} → header with Avg, `BarChart` or the empty
  message. `AveragesCard` {title, rows: [{key, name, average, goal, unit}]} → rows of name,
  "avg / goal" text and a thin bar.

Files: created `src/domain/progress/averages.ts` (+ test), `src/features/progress/
useNutritionStats.ts` (+ test), `src/features/progress/NutritionCards.tsx` (+ test),
`src/features/progress/CaloriesCard.tsx` (+ test), `src/features/progress/AveragesCard.tsx`
(+ test), `src/features/progress/nutrition.module.css`; changed `src/features/progress/
ProgressPage.tsx` (the nutrition slot becomes `NutritionCards`) and `src/i18n/en/progress.ts`
(additive keys).

Edge cases / failure modes:
- A day with entries summing to 0 kcal: no bar, not in Avg, but a logged day for the averages.
- Days 1 800 and 2 200 kcal with an empty day between: two bars, Avg 2 000; 1 800 and 2 201 → 2 000
  (remainder dropped, never rounded up).
- No food in the window: the empty message, no Avg; macros 0 against their goals; no nutrient rows.
- Entries outside the window (a caller passing more): left out.
- A missing optional nutrient on an entry counts 0; a non-finite amount counts 0.
- A goal of 0 for a macro (no profile): the amount without "/ goal"; the bar shows only its
  minimum.
- Average over the goal: the bar is full, never wider.
- kJ: Avg is the whole kcal mean shown in kJ; bars and goal line in kJ.
- Count today off: the window ends yesterday, so today's partial day is in neither the bars nor
  any average (ACC-G9-1).
- Range, period, Count today, entries or goals change while a task runs: the old task stops at
  its next slice and never shows; the old numbers stay under the spinner meanwhile.
- A read fails: an error card in place of the nutrition cards; the rest of the page stays.

Our design differences / decisions:
- Names, words, layout and structure are ours. The statistics are a pure generator in the domain,
  driven by a small slice runner in the feature (no worker): the web page has no cheap second
  thread here, and a few-millisecond slice keeps input responsive while a newer request cancels
  the older between slices.
- Days are the entries' stored day keys (the day the entry belongs to), as everywhere else in the
  app, rather than re-deriving them from the timestamp.
- The nutrients are listed in the order of Home's pillar picker (P07-04) so the app reads one way.
- The thin bar's minimum visible width is the bar's own thickness (a round dot), set in CSS.
- Average amounts are written like Home's: one decimal only when not whole.

Tests we will write:
- `averages.test.ts`: 1 800 and 2 200 with a gap → two calorie days and Avg 2 000; the remainder is
  dropped; a 0 kcal day is a logged day without a bar; macros divide by logged days, not window
  days (ACC-G11-1, R05.17); nutrients listed unless under 0.05 with goal 0, goal-less ones shown
  without a goal, extras included, macros and the goal-less fats never listed; entries outside the
  window left out; Count today off excludes today's partial day through `nutritionWindow`
  (ACC-G9-1, R05.17); the stepped form gives the same result one day per step.
- `useNutritionStats.test.ts`: the runner runs in slices and a cancel stops it between slices
  without reporting; the hook shows only the newest input's numbers when a newer one arrives
  before the older finishes; old numbers stay, marked stale, until the new ones are in.
- `CaloriesCard.test.tsx`: Avg 2 000 and two bars for 1 800 / 2 200 with a missing day; kJ; the
  empty message; the goal line.
- `AveragesCard.test.tsx`: "avg / goal" text, the amount alone with goal 0, the bar's share capped
  at full and still drawn at 0.
- `NutritionCards.test.tsx` (over the test database): the loading card before the first result;
  water logs and a fast on a food-free day change no average and add no bar (R05.4); Count today
  off on the Progress page takes today's partial day out (ACC-G9-1); a spinner over the old
  numbers while a new window is read.

Decisions for the lead:
- Cooperative slices on the main thread instead of a worker (see above). The finished result is
  kept in a small store read through `useSyncExternalStore`, like the live reads, so it lands the
  same way in the app and in screen tests.
- Without a readable profile the macro card still shows (amounts alone) and the calorie chart has
  no goal line; the reference hides the macro card and draws a 2 000 kcal fallback goal, which
  R05.12 rules out. Only reachable with an unreadable profile, since onboarding comes first.

Compare checklist (filled after the rewrite; reopened `ProgressScreen.kt` 1497–1970, its
nutrition block around lines 360–380 and 505–565 for the call site and card order, and the macro
value formatter it uses):
- [x] only days with energy > 0 get a bar; a day of 0 kcal food is absent from the bars and Avg
      (`averages.test.ts > windowNutrition > calorie history (R05.17) > gives a day of 0 kcal food
      no bar and leaves it out of Avg, but counts it as logged`; `CaloriesCard.test.tsx >
      CaloriesCard > shows Avg 2,000 kcal and two bars for 1 800 and 2 200 with a missing day
      between (R05.17)`)
- [x] Avg = integer mean over those days, remainder dropped, taken in kcal then shown in the
      display unit (`averages.test.ts > … > gives 1 800 and 2 200 with an empty day between two
      bars and Avg 2 000`, `> drops the remainder of the mean instead of rounding it up`;
      `CaloriesCard.test.tsx > CaloriesCard > shows the average, the bars and the goal in kJ, the
      mean taken in kcal first`)
- [x] empty message without food; goal line at the calorie goal (`CaloriesCard.test.tsx >
      CaloriesCard > says no food was logged, with no average and no chart, when no day has
      energy`, `> draws the calorie goal as the dashed goal line`)
- [x] macro and nutrient averages divide by days with any food entry (`averages.test.ts > … >
      averages per logged day (ACC-G11-1, R05.17) > divides the macros by the days with food, not
      by the days of the window`; `NutritionCards.test.tsx > NutritionCards > divides the averages
      by the days with food, not by the days of the period (ACC-G11-1)`)
- [x] every other pillar nutrient, sports compounds included; listed unless average < 0.05 with
      goal 0; nothing listed without a logged day (`averages.test.ts > … > averages every other
      pillar nutrient, sports compounds too, by logged days`, `> leaves a nutrient off only when its
      average is under 0.05 and its goal is 0`, `> has no history, no Avg and zero averages without
      food`)
- [x] "avg / goal" with one decimal only when not whole, the amount alone with goal 0; the bar's
      share capped at full, 0 without a goal, still drawn (`AveragesCard.test.tsx > AveragesCard >
      names the card and lists each average against its goal with a bar filled by the share`,
      `> writes the amount alone without a goal and still draws the bar, at its minimum`, `> fills
      the bar no further than full when the average is over the goal`)
- [x] Count today off leaves today's partial day out of bars and averages (`averages.test.ts > … >
      Count today (ACC-G9-1, R05.17) > leaves today's partial day out of the bars and every
      average when it is not`; `NutritionCards.test.tsx > NutritionCards > takes out the partial
      today when Count today is turned off on the page (ACC-G9-1, R05.17)`)
- [x] food only: water and fasts never count (`NutritionCards.test.tsx > NutritionCards > counts
      food only: water and a fast on a day without food add no bar and change no average
      (R05.4)`)
- [x] a newer window, entries or goals cancel the running computation; old results never show
      over newer ones (`useNutritionStats.test.ts > runInSlices > stops a cancelled run between
      slices and never reports it`; `useNutritionStats.test.ts > useNutritionStats > cancels the
      older run for a newer input: only the newer numbers ever show`)
- [x] loading card with nothing to show; a small spinner at the first card's corner over shown
      numbers (`NutritionCards.test.tsx > NutritionCards > shows a loading card until the first
      numbers are in`, `> keeps the shown numbers under a spinner while a newer window is read and
      worked out`; `useNutritionStats.test.ts > useNutritionStats > keeps the older numbers, marked
      stale, until the newer run ends`)
- [x] card order: Calories, macro averages, nutrient averages (only with rows) (`NutritionCards.tsx`;
      seen in `NutritionCards.test.tsx > … > counts food only …`)
- Deliberate differences: slices on the main thread, not a background thread; the reference
  clears its numbers at every recompute (so its spinner rarely shows), ours keeps them under the
  spinner as the row asks; days are the entries' stored day keys; nutrients in Home's picker order
  (the reference's own order runs fibre … HMB); the bar's minimum is its own thickness (8 px, a
  round dot) instead of 6; amounts that round to a whole number show without ".0"; the macro card
  and no fallback goal without a profile (above).
- Not taken: the reference's gradient bars and shadows (flat accent, D-16.1); a second loading row
  inside the card.

## Status

Done (2026-10-27). `averages.ts`, the slice runner and hook, the three cards and the loading and
error states are in; `ProgressPage.tsx` mounts `NutritionCards` in place of its nutrition slot
(the recap slot is left for P07-15). No lines changed outside the task's files beyond that and the
additive `progress` keys. Handed on: the lead records the trap and acceptance `Test:` lines.
