# Task: Sugar on Home (P16-01) · Phase: 16 · Owner: builder (wt-p16s1, slice S1)

<!-- Save as platewise/docs/notes/P<nn>/<slug>.md. Write everything above "Compare checklist" BEFORE
writing code, in your own words. Never paste or paraphrase the reference line by line. -->

Read (reference @ `10e14b67`): the reference has no sugar line on Home. Read for behaviour only:
`android/.../ui/home/NutritionDetailSheet.kt` (its detail list sums sugar and added sugar over the
day, a food without the figure adding nothing, with the optional goal after it) and
`android/.../ui/home/HomeScreen.kt` (sugar shows on a single food's result card, nowhere on the
day's summary). Ours: the P16 phase file (Goal, D-16.98); `src/features/home/{HomePage,DaySummary,
PillarRow,DayNutrientsSheet,dayNutrients}.ts(x)` and their tests; `src/domain/model.ts`
(`NutrientValues`: a missing key means unknown, never zero); `src/domain/nutrients/{goalDefaults,
pillars,catalogue}.ts` (Sugar is a 50 g limit, 0 = off); `src/data/settingsSchema.ts`;
`src/services/homePrefs.ts`; `src/services/coach/{context,snapshot}.ts` and `context.test.ts` (I6);
`src/i18n/en/home.ts`; `src/ui/{tokens.css,Switch.tsx,ProgressBar.tsx}`; `docs/user/getting-started.md`.
No REA evidence for this task.

What it does (own words): Home shows, under the pillars of the shown day, how much sugar the day's
food holds against the Sugar limit from Settings › Nutrient goals: "Sugar", "32 g of 50 g" and a
thin bar. Past the limit the bar is full and in the warning colour, with "8 g over" in that colour.
With the limit turned off (0) it shows the grams alone and no bar. Sugar is only known for foods
that carry a figure (the analysis, a label or a barcode may give one; a manual entry never does),
so the line never treats a missing figure as 0 g: when some foods lack it, it adds "from 4 of 6
foods"; when no food has one it says "No sugar figures" instead of a number. When any food carries
an added-sugar figure it adds "12 g added". A day with no food shows no line at all. A tap opens All
nutrients. While Sugar is one of the chosen pillars the line is hidden (the pillar already shows
it), and a "Sugar on Home" switch in All nutrients (setting `home.sugarLine`, on by default) turns
it off. The Coach's facts for a turn (I6) gain today's sugar and the limit, with the same honesty:
how many of today's entries had a figure when not all did, and never a 0 for unknown.

Inputs → outputs:
- `src/domain/nutrients/sugar.ts` (new, pure): `sugarOfDay(entries)` → `{ foods, withFigure,
  grams, addedGrams }`: `grams` is the sum over the foods that have a sugar figure (null when none
  has), `addedGrams` the sum over the foods that have an added-sugar figure (null when none has). A
  figure is a finite number ≥ 0 in `nutrients.sugar` / `nutrients.addedSugar`.
- `src/features/home/SugarLine.tsx` (new) + `home.module.css`: the line, drawn by `DaySummary`
  under `PillarRow` when `home.sugarLine` is on, Sugar is not among the shown pillars, and the day
  has food. A `<button>` (opens All nutrients) named by its visible words in reading order; the bar
  is drawing only (`aria-hidden`), the words carry the numbers. Hooks: `home.sugar`,
  `home.sugar.amount`, `home.sugar.bar`, `home.sugar.over`, `home.sugar.coverage`,
  `home.sugar.added`; `data-over` on the line past the limit.
- `DayNutrientsSheet`: a "Sugar on Home" switch (`home.nutrients.sugarLine`) in the Home pillars
  section, under Choose pillars; HomePage stores it through `homePrefs.setSugarLine` (a toast when
  the write fails, as the sort order does).
- `src/data/settingsSchema.ts`: `home.sugarLine`, a flag, default on.
- Coach: `CoachSnapshot.sugarLimitG` (the Sugar goal at send time; missing reads as the default,
  as an unset setting does) and one "Sugar:" bullet in "Today so far" from `sugarOfDay`.
- Strings: `home.sugar.*`, `home.nutrients.sugarLine*`.

Files: created `src/domain/nutrients/sugar.ts` (+ test), `src/features/home/SugarLine.tsx` (+
test); changed `src/features/home/{DaySummary,DayNutrientsSheet,HomePage}.tsx`, `home.module.css`,
`nutrients.module.css` and their tests, `src/i18n/en/home.ts`, `src/data/settingsSchema.ts` (+
test), `src/services/coach/context.ts` (the sugar lines) and `context.test.ts`,
`docs/user/getting-started.md`. Shared, the smallest change each: `src/services/homePrefs.ts` (+
test: `setSugarLine`), `src/services/coach/snapshot.ts` (+ test: the limit copied at send time; the
context cannot know the person's limit otherwise).

Edge cases / failure modes:
- A food without a sugar figure never counts as 0 g; a day where no food has one says "No sugar
  figures", never "0 g".
- A figure of 0 is a figure (a glass of water's label says 0 g): it counts toward "from n of m".
- NaN, Infinity or a negative stored figure counts as no figure.
- Limit 0 (turned off): grams alone, no bar, no "over".
- Exactly at the limit: "50 g of 50 g", full bar, not over. Compared as shown (one decimal), like
  the pillars, so the words and the bar agree.
- Added sugar shown when any food has an added figure, even "0 g added".
- Sugar chosen as a pillar (any of the first four): no line; the switch stays in the sheet.
- Water, fasts and walks never count (they are not food entries).
- The day changes (week bar, swipe): the line follows the shown day.
- The switch write fails: a toast, the stored value stays.

Our design differences / decisions:
- No line at all on a day with no food (the gauge already says nothing is eaten); chosen over a
  quiet "0 g" so an empty day stays empty.
- "from n of m foods" counts food entries; added sugar has no coverage note of its own (most foods
  never carry the figure, so the note would always show; the line says "added" only where known).
- The Coach line counts entries, as the rest of "Today so far" does; it leaves added sugar to
  `food_log`, which already gives it per entry.
- The bar takes the warning colour (`--danger`) past the limit, as the fit check's "over" does.
- Strings kept few (the catalogue is in the start-up download): the name and "over" are the Sugar
  pillar's, the grams alone `amount.g`, a failed switch write App settings' "That change wasn't
  saved"; the Coach line gives the grams and the limit and leaves the comparison to the model.

Tests we will write:
- `src/domain/nutrients/sugar.test.ts`: sums only over foods with a figure; counts; 0 is a figure;
  NaN/negative are not; no foods; added sugar only when present.
- `src/features/home/SugarLine.test.tsx`: under, at, over (bar full, warning, "8 g over"), limit
  off, partial, no figures, added, accessible name for each state, the tap.
- `DaySummary.test.tsx`: drawn under the pillars; hidden while Sugar is a pillar; hidden with the
  switch off; hidden on a day without food.
- `DayNutrientsSheet.test.tsx`: the switch shows the stored value and reports a change.
- `HomePage.test.tsx`: the line for the shown day, the tap opens All nutrients, the switch stores
  `home.sugarLine` and the line goes.
- `src/data/settingsSchema.test.ts`: the key, default on, reader.
- `src/services/homePrefs.test.ts`, `src/services/coach/snapshot.test.ts`: the writes and the copy.
- `src/services/coach/context.test.ts`: under, over, limit off, partial, none, nothing logged.
- `e2e/home-progress.spec.ts`: "No sugar figures" after a manual entry; the switch hides the line.

Compare checklist (filled after the rewrite; reopened `NutritionDetailSheet.kt`, `HomeScreen.kt`):
- [x] A food without a sugar figure never counts as 0 g: sums over the foods with a figure, counted
      apart; NaN, Infinity and negatives are no figure; 0 g is one (tested in
      `src/domain/nutrients/sugar.test.ts` > sugarOfDay (D-16.98)).
- [x] The line's states: under, at, over (bar full, warning colour, "8 g over"), limit off (grams
      alone, no bar), partial ("from n of m foods"), no figures, added sugar, nothing without food,
      the tap, the accessible name in reading order (tested in
      `src/features/home/SugarLine.test.tsx` > SugarLine (D-16.98)).
- [x] Under the pillars, above All nutrients; hidden while Sugar is one of the shown pillars, with
      the switch off, and on a day without food; the limit from Nutrient goals (tested in
      `src/features/home/DaySummary.test.tsx` > DaySummary Sugar line (D-16.98)).
- [x] The Sugar on Home switch in All nutrients, under Choose pillars (tested in
      `src/features/home/DayNutrientsSheet.test.tsx` > has the Sugar on Home switch …).
- [x] Home end to end: the shown day's line, a tap opens that day's All nutrients, the switch stores
      `home.sugarLine` and the line goes and comes back; hidden while Sugar is a pillar (tested in
      `src/features/home/HomePage.test.tsx` > HomePage: the Sugar line (D-16.98);
      `e2e/home-progress.spec.ts` > chooses pillars from All nutrients … > the Sugar line step).
- [x] `home.sugarLine`, default on, a flag (tested in `src/data/settingsSchema.test.ts`); the write
      (tested in `src/services/homePrefs.test.ts` > setSugarLine (D-16.98)).
- [x] The Coach's facts: today's grams and the limit, how many entries had a figure when not all
      did, "not known" instead of 0 g, nothing logged, no limit set, the person's own limit, an unset
      one read as 50 g (tested in `src/services/coach/context.test.ts` > coachContext: today's sugar
      against the Sugar limit (D-16.98)); the limit copied at send time (tested in
      `src/services/coach/snapshot.test.ts` > copies the Sugar limit …).
- Deliberate differences: the reference shows a day's sugar only in its detail list (a food
  without the figure adds nothing there, silently), never on the day's summary. Platewise adds the
  Sugar line with its honesty about missing figures (D-16.98). The All nutrients sheet's Sugar row
  keeps its existing sum (unchanged here).
- Not taken: nothing; the reference has no such line, switch or Coach fact.

Bundle (the lead's note): initial JS 245.88 → 246.70 kB gzip (+0.82): the line's component about
0.36, `sugarOfDay` 0.11, the wiring, the switch and the CSS names about 0.27, strings 0.10. Trimmed
on the way (strings reused from the pillar and App settings, four CSS classes instead of ten, the
button named by its own words instead of a label of ids; an `aria-label` was tried and axe's
label-content-name-mismatch refused it). Fetching the line on demand would save about 0.4 more but makes it
appear after the rest of the summary (Suspense reveal), shifting the page on every start; left
eager, for the lead to decide. The Coach's facts are in a lazy chunk (no start-up cost).

## Status

Done (2026-10-28). Lines outside the task's files (shared): `src/services/homePrefs.ts` (+ test:
`setSugarLine`) and `src/services/coach/snapshot.ts` (+ test: `sugarLimitG`, the Sugar goal at send
time, optional so the existing fixtures stand), both needed because Home's switch must be stored
and the Coach's facts must know the person's limit; `e2e/logging.spec.ts` (one line: the combine
test centres the Toast row before its long-press, as `home-progress.spec.ts` already does, since
the Sugar line moved the row under the tab bar). Follow-ups for the lead: the naming table
(`docs/plan/17-naming.md` §1.3) gains `home.sugarLine`; `docs/user/coach.md` (S2's) may mention
that the Coach sees today's sugar; acceptance rows under a new F14.
