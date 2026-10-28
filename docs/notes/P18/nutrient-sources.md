# Task: Nutrient sources (P18-01) · Phase: 18 · Owner: builder (wt-p18s1, slice S1)

<!-- Save as platewise/docs/notes/P<nn>/<slug>.md. Write everything above "Compare checklist" BEFORE
writing code, in your own words. Never paste or paraphrase the reference line by line. -->

Read (reference @ `10e14b67`): `android/.../ui/home/NutritionDetailSheet.kt` (behaviour only: the
detail list sums each nutrient over the day, a food without the figure adding nothing; no row opens
anything, and no screen says which foods a nutrient came from). The reference has no such feature,
so there is nothing else to read. Ours: the P18 phase file (Goal, D-16.105); research spec
`05-home-progress.md` §3.2.4 (the detail sheet); `src/features/home/{HomePage,DaySummary,PillarRow,
SugarLine,DayNutrientsSheet,dayNutrients,EntryRow,energy,DaySwipe}.ts(x)` and their tests;
`src/features/log/EntryEditor.tsx` and `review/MoreNutrition.tsx` (the editor already lists every
nutrient of the entry: energy and macros, then the 23 nutrients and 8 sports compounds under
Micronutrients, a dash for an unknown one); `src/domain/model.ts` (`NutrientValues`, `ExtraValues`: a
missing key is unknown, never zero); `src/domain/nutrients/{catalogue,goalDefaults,pillars,sugar}.ts`;
`src/i18n/en/home.ts`, `src/i18n/en.ts`; `src/ui/{Pillar,Sheet,tokens.css}`; `e2e/home-progress.spec.ts`
and `e2e/support.ts` (the barcode fixture carries a sugar figure). No REA evidence for this task.

What it does (own words): for the shown day and one nutrient (calories, protein, carbs, fat, any
of the 23 optional nutrients, any of the 8 sports compounds) a sheet lists the foods that gave it,
largest first: each food's emoji, name, meal and time, its amount and its share of the day's total
with a thin bar. Above the list, the total, against the goal ("22 g of 112 g goal") or the limit
("32 g of 50 g limit", with "8 g over" in the warning colour past it) when one is set, alone when
not. Foods without a figure for that nutrient are never counted as 0: they are left out of the
total and the list and counted apart under it ("2 foods have no fibre figure"). A day with nothing
to list says so. A food opens its entry in the existing editor, which already lists all of that
food's nutrients (so no extra view is needed). The sheet opens from each nutrient row of All
nutrients, from the Sugar line (straight to Sugar, no longer to All nutrients), and from a
nutrient pillar (water is not food, so its pillar and row open nothing). It lets a person see,
for example, that the juice gave most of the day's sugar.

Inputs → outputs:
- `src/domain/nutrients/sources.ts` (new, pure): `sourcesOfDay(entries, nutrient)` →
  `{ foods, withoutFigure, total, sources }`: `total` sums the foods with a figure (null when no
  food has one); `sources` are the foods with an amount above 0, largest first (ties: the earlier
  food first, then the id), each `{ entry, amount, share }` with `share = amount / total`.
  `nutrient` is `'kcal'` or a catalogue id. A figure is a finite number ≥ 0 (the rule `sugar.ts`
  already uses, now exported from there as `figure`); kcal and the macros always have one unless
  stored broken. `sourceGoal(nutrient, targets, goals)` → `{ amount, kind }` or null: the day's
  energy or macro target (`target`), the optional goal with its kind from `GOAL_SPECS` (`limit` or
  `target`), null for a goal of 0 and for the two fats that never have one.
- `src/features/home/SourcesSheet.tsx` (new, fetched on first open) + `sources.module.css`.
  Hooks: `sources`, `sources.body` (with `data-nutrient`), `sources.day`, `sources.total`, `sources.over`,
  `sources.list`, `sources.row` (each, a button), `sources.row.bar`, `sources.noFigure`,
  `sources.empty`, `sources.done` (the sheet's Done).
- Openers: `DayNutrientsSheet` rows become buttons (`onOpenSources`), except water; `PillarRow`'s
  nutrient pillars get a button on their name whose hit area covers the pillar (`onOpen`);
  `DaySummary` gains `onShowSources` (pillars and the Sugar line); `HomePage` holds which nutrient
  the sheet shows (sheet id `sources`) and opens the entry editor from it.
- Strings: a new partition `src/i18n/en/sources.ts` (`sources.*`), added to `src/i18n/en.ts` here
  only so this worktree types and tests (D-16.55 leaves that line to the lead): at landing the lead
  registers it with S0's on-demand mechanism instead, from the sheet's chunk. The openers add no strings:
  each button is named by the words it shows.

Files: created `src/domain/nutrients/sources.ts` (+ test), `src/features/home/SourcesSheet.tsx`
(+ test), `src/features/home/sources.module.css`, `src/features/home/entryIcons.ts` (the tile's
icon per way of logging, moved out of `EntryRow.tsx` so the sheet's chunk does not import the row),
`src/i18n/en/sources.ts`; changed `src/domain/nutrients/sugar.ts` (exports its figure rule),
`src/features/home/{HomePage,DaySummary,PillarRow,DayNutrientsSheet,EntryRow,SugarLine}.tsx`,
`home.module.css`, `nutrients.module.css` and their tests,
`e2e/home-progress.spec.ts`, `docs/user/getting-started.md`. Shared: `src/i18n/en.ts` (one import,
one line), `docs/internals/acceptance-map.md` (the one HomePage test renamed because the Sugar line
now opens Sugar's sources).

Edge cases / failure modes:
- A food without a figure is never 0: not in the total, not listed, counted apart; a day where no
  food has a figure shows no total at all, only the count and the empty words.
- A figure of 0 is a figure: it counts toward the total (so the total can honestly read 0 g) but
  the food is not listed (it gave nothing).
- NaN, Infinity or a negative stored value counts as no figure.
- A day with no food: the empty words, no total, no count.
- Shares are of the day's total over the foods with a figure, so they add up to 100 %.
- Ties in amount: the earlier food first, then by id, so the order never jumps.
- Energy in the person's unit (kcal or kJ), with the day's energy target including counted burn.
- A goal of 0 (off, the sports compounds' default) and the goal-less fats: the total alone.
- At a limit exactly: not over. Compared as shown (one decimal), like the pillars and the line.
- Water is not a food nutrient: its pillar and its All nutrients row open nothing.
- A swipe that ends on a pillar changes the day and opens nothing (DaySwipe eats that click).
- The sheet over All nutrients: Done goes back to All nutrients; the editor over the sheet: Save,
  Cancel or Delete go back to the sheet, which follows the change at once.
- A reload with the sheet on the history stack but no nutrient remembered: nothing is drawn (as
  the editor does).

Our design differences / decisions:
- Title "{name} by food" ("Sugar by food", "Calories by food"); the day under it as All nutrients
  writes it. Chosen over "Sources of …", which reads badly with "Calories".
- The no-figure count names the nutrient in the sentence ("2 foods have no fibre figure"): the name
  is the pillar's, with its first letter lower-cased when the second letter is lower case ("Vitamin
  C" → "vitamin C"; "HMB", "L-arginine" stay). The catalogue is English only (N-3); a language with
  other rules would give the sheet its own names.
- Each list row is one button named by its words in reading order (name, amount, meal and time,
  share); the share bar is drawing only. A pillar's button holds its name only (the group keeps its
  name and description), with the hit area and focus ring over the whole pillar.
- The Sugar line now opens Sugar's sources (D-16.105 replaces the D-16.98 tap to All nutrients);
  the Sugar on Home switch stays in All nutrients.
- Over is shown only past a limit (warning colour, like the Sugar line); a target has no "left" or
  "reached" here: the pillars and the gauge already say that.
- Strings kept few: a title, two "of" lines, the count, the empty line and the meal-and-time line;
  amounts reuse Home's unit words, "over" the pillars' words, the day All nutrients' "Today".

Tests we will write:
- `src/domain/nutrients/sources.test.ts`: largest first with shares; no figure never 0 (counted
  apart; NaN, Infinity, negative); a 0 figure counts but is not listed; no figure at all → null
  total; ties; kcal, macros, a nutrient, a sports compound; `sourceGoal` for energy, a macro, a
  limit, a target, a goal of 0, a goal-less fat, no targets.
- `src/features/home/SourcesSheet.test.tsx`: title and day; the list (emoji, name, meal and time,
  amount, share, bar width) in order; the total against a goal, a limit, over a limit, none; the
  no-figure count (one, several) and the empty words; energy in kJ; a row opens its entry;
  accessible names.
- `DayNutrientsSheet.test.tsx`: every nutrient row is a button that opens its sources; water opens
  nothing.
- `PillarRow.test.tsx`, `DaySummary.test.tsx`: a pillar opens its nutrient's sources; water's does
  not; the Sugar line opens Sugar's.
- `HomePage.test.tsx`: from the Sugar line, a pillar and All nutrients the sheet shows the shown
  day's foods; a food opens its editor and Cancel comes back to the sheet.
- `e2e/home-progress.spec.ts`: a barcode product (with a sugar figure) and a food entered by hand;
  tap the Sugar line, see the product with its sugar and "1 food has no sugar figure", open it.

Compare checklist (filled after the rewrite; reopened `NutritionDetailSheet.kt`, `HomeScreen.kt`):
- [x] The day's total of a nutrient is the sum over its foods, for the shown day (tested in
      `src/domain/nutrients/sources.test.ts` > sourcesOfDay (D-16.105) > lists the foods that gave
      the nutrient, largest first, with each share of the total).
- [x] A food without a figure is never counted as 0: out of the total and the list, counted apart;
      NaN, Infinity and negatives are no figure; 0 is a figure but not a source (tested in
      `sources.test.ts` > never counts a food without a figure as 0 …, has no total, rather than
      0 …, counts a figure of 0 …, takes a figure that is not a finite amount …; and
      `src/features/home/SourcesSheet.test.tsx` > never counts a food without a figure as 0 …).
- [x] Energy, the macros, the optional nutrients and the sports compounds; energy in kcal or kJ
      against the day's target (tested in `sources.test.ts` > reads energy in kcal, the macros …;
      `SourcesSheet.test.tsx` > shows energy in the person's unit against the day's target).
- [x] The goal or limit: a target "of … goal", a limit "of … limit" with "over" in the warning
      colour past it (as shown), none for a goal of 0, the goal-less fats or no profile (tested in
      `sources.test.ts` > sourceGoal (D-16.105); `SourcesSheet.test.tsx` > says how far over a limit
      …, is not over exactly at the limit …, reads the total against a goal to reach …, shows the
      total alone without a goal …).
- [x] The list: emoji or the logging icon, name, meal and time, amount, share and its bar, largest
      first; one button per food named by its words; a row opens its entry; the day; the empty
      words (tested in `SourcesSheet.test.tsx` > lists the foods that gave the nutrient …, lists no
      food that gave 0 …, says nothing was counted on a day without food, names the day …, opens a
      food's entry from its row, and closes with Done).
- [x] Openers: every nutrient row of All nutrients (not water) (tested in
      `src/features/home/DayNutrientsSheet.test.tsx` > opens a nutrient's sources from its row …);
      a nutrient pillar, anywhere on it, keeping the group's name and description (not water)
      (tested in `PillarRow.test.tsx` > names each nutrient's pillar with a button …;
      `DaySummary.test.tsx` > opens a nutrient's sources from its pillar …); the Sugar line straight
      to Sugar (tested in `DaySummary.test.tsx` > opens Sugar's sources on a tap, not All nutrients).
- [x] Home end to end: from a pillar, the shown day's foods; a food opens the editor over the sheet
      and Cancel comes back; from All nutrients for yesterday, Done goes back to All nutrients; the
      Sugar line opens Sugar's sources (tested in `src/features/home/HomePage.test.tsx` > HomePage:
      nutrient sources (D-16.105) > both tests; HomePage: the Sugar line (D-16.98) > shows the shown
      day's sugar, opens Sugar's sources from it (D-16.105) …; `e2e/home-progress.spec.ts` > shows
      which foods gave the day its sugar from the Sugar line, and opens one in the editor
      (D-16.105), and the Sugar line step of > chooses pillars from All nutrients …).
- Deliberate differences: the reference has no sources at all: its detail rows and its pillars
  open nothing (only View More opens the detail sheet), and its sums count a missing figure as 0
  silently. Platewise adds the Sources sheet with its openers (D-16.105) and the honest count of
  foods without a figure. The Sugar line's tap moves from All nutrients to Sugar's sources.
- Not taken: nothing from the reference (no such feature there).

Bundle: initial JS 249.30 → 249.68 kB gzip (+0.38): the strings 0.10 (the `sources` partition, in
the catalogue chunk until the lead registers it on demand), the openers and Home's wiring 0.28. The
sheet itself is its own chunk (1.6 kB JS + 0.8 kB CSS gzip). Importing the tile icons from
`EntryRow.tsx` made the bundler split `icons`, `display.module` and `text` out of the entry chunk
(+0.10 more); the small `entryIcons.ts` avoids that.

## Status

Done (2026-10-28). Lines outside the task's files (shared): `src/i18n/en.ts` (the `sources`
partition, one import and one line, so the worktree types and tests; the lead moves it to S0's
on-demand registration at landing) and `docs/internals/acceptance-map.md` (one test renamed: the
Sugar line's HomePage test now opens Sugar's sources). Follow-ups for the lead: acceptance rows under
a new F15; CHANGELOG lines; D-16.105 into `docs/plan/16-what-we-change.md` (it is only in the P18
phase file); the a11y e2e (`e2e/a11y.spec.ts`, not this slice's) could run axe over the sheet.
