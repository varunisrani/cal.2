# Task: recipe split and combining entries (P01-11) · Phase: 01 · Owner: builder (wt-p01b3)

<!-- Save as platewise/docs/notes/P<nn>/<slug>.md. Write everything above "Compare checklist"
BEFORE writing code, in your own words. Never paste or paraphrase the reference line by line. -->

Read (reference @ `10e14b67`): `A/models/RecipeServings.kt` (all), `A/models/CombinedMeal.kt`
(all), and the gallery photo list of `A/models/FoodEntry.kt` (`allImageFilenames`, because a
combined line carries each entry's photos); tests `T/models/RecipeServingsTest.kt`,
`T/models/CombinedMealTest.kt`, `IT/RecipeServingsTests.swift`; research spec
`02-food-logging.md` §3.15 (recipe servings, combined meal) and §6 R02.6, R02.9, §7 Q8; decision
D-16.20; traps ledger rows R02.6, R02.9; acceptance row ACC-D14-1. No Evidence ids.

What it does (own words): **Split into servings.** A meal with at least two lines and a known
weight can be divided into N equal servings (1–50). The split adds a named `serving` unit of
total ÷ N grams, replacing any earlier one and placed first so the four-unit cap never drops it,
and selects one of it. A meal that already holds a `serving` unit is a logged portion (a re-log of
a split recipe): splitting it again would divide the portion instead of the pot, so the control is
not offered. While a split is active, line edits are made on the portion on screen; the edited
lines are multiplied back up into a whole recipe, the header and nutrients follow the line-change
rules, the recipe is divided into the same N again, and the unit the person had picked stays with
its count recomputed so the amount on screen is exactly the edited portion. **Combine entries.**
Two or more diary entries become one meal: each entry becomes one line (its known weight, or 0 g
kept visible when the weight is unknown), the name joins up to three names with " + " (more than
three: the first two and a "K more" tail; no names: the catalogue's fallback), time, day and meal
come from the latest entry, photos are gathered in order without repeats, the first emoji wins,
the source is manual and the weight is the sum of the known weights when above 0. Every optional
nutrient and extra is summed when all entries know it and stays unknown otherwise (D-16.20); notes
and product info are not carried.

Inputs → outputs:
- `isLoggedPortion(units)` → boolean; `canSplit(draft)` → boolean.
- `clampServings(n)` → whole number 1–50.
- `splitRecipe(draft, n)` → `RecipeSplit {draft, servings, unit, quantity}` or `null` (unknown
  weight).
- `applySplitLineChange(draft, nextLines, scale, current: {servings, unit})` → `RecipeSplit` or
  `null` (no active split, broken scale, or nothing left to split: the caller then uses
  `applyLineChange`).
- `combineEntries(entries, names: {fallback, more(k)})` → the combined entry without an id (the
  service gives it one).

Files: created `src/domain/servings/recipe.ts`, `recipe.test.ts`, `src/domain/food/combine.ts`,
`src/domain/food/combine.test.ts`, this note.

Edge cases / failure modes:
- Split 2 kg into 8 → `serving` 250 g first, chosen with count 1 (ACC-D14-1); n 0 → 1, 80 → 50,
  2.6 → 3, NaN → 1; an earlier "Serving" unit is replaced, a `cup` unit is kept after it; five
  units → the serving plus the first three others.
- `canSplit`: one line, unknown weight (servings basis), a grams basis of 0, or a `serving` unit
  already present → false (R02.6).
- Split line edit: n ≤ 1, scale ≤ 0 or NaN, an edited portion weighing nothing, or fewer than two
  lines left → `null`. Grams picked → quantity = portion grams; a unit no longer offered → grams.
- Combine: fewer than 2 entries throws a `RangeError` (the Combine button needs two); names are
  trimmed and blank ones skipped; equal times keep the first entry's meal; an entry's photos
  include its lines' photos; an emoji of "" counts as none; no known weight → a servings basis of
  1, never 0 g; sodium summed only when every entry knows it; extras likewise.

Our design differences / decisions:
- Names are ours (`splitRecipe` per the glossary, `canSplit`, `applySplitLineChange`,
  `combineEntries`).
- The split returns the unit to show (`PickerUnit`) and its quantity, and also writes them into the
  draft's chosen unit and count, so a saved split reopens on one serving.
- The " + K more" tail and the fallback name come from the caller (catalogue text), so the domain
  holds no English copy.
- D-16.20: optional nutrients and extras are summed when every combined entry knows them (the
  reference drops them all).
- `canSplit` judges the draft as the sheet received it; a split made in the sheet itself does not
  hide the control (the sheet tracks its own N).

Tests we will write:
- `recipe.test.ts`: split values and order, clamp, replacement of an earlier serving unit, unit
  cap; `canSplit` cases and the logged portion (R02.6); a split line edit keeps N and shows the
  edited portion (R02.6), keeps a picked unit or grams, returns null without an active split.
- `combine.test.ts`: names (2, 3, 4, none), latest time and meal, photos, emoji, source, lines with
  0 g for unknown weights (R02.9), weight sum, nutrient and extra sums (D-16.20, R02.9), notes and
  product not carried, fewer than two entries refused.

Compare checklist (filled after the rewrite; reopened `A/models/RecipeServings.kt`,
`A/models/CombinedMeal.kt`, `T/models/RecipeServingsTest.kt`, `T/models/CombinedMealTest.kt`,
`IT/RecipeServingsTests.swift`):
- [x] Split: serving of total ÷ N first, one selected, the whole recipe kept as the base (tested in
  `src/domain/servings/recipe.test.ts > splitRecipe > splits a 2 kg pot into 8 with a 250 g
  serving unit first, one serving selected`); an earlier serving replaced, others after it (`>
  replaces an earlier serving unit and keeps the others after it`); cap of four keeps the serving
  (`> puts the serving first so the four-unit cap keeps it`); clamp 1–50 (`> clamps the servings
  to whole numbers from 1 to 50`); stepper again re-divides the recipe (`> re-divides the whole
  recipe when the stepper moves again, never the serving`); unknown weight (`> has nothing to
  split when the weight is unknown`).
- [x] Eligibility: two lines and a known weight (`canSplit > needs at least two lines and a known
  weight`); a logged portion keeps its serving unit, is not split again and logs 2 servings as 2
  portions (`> is not offered for a portion logged from a split recipe (R02.6)`); serving unit
  matched by id, other units allowed (`> recognises a serving unit by id, and nothing else, as a
  logged portion`).
- [x] Line edit while split: whole recipe rebuilt, same N, picked unit kept, shown amount equals
  the edited portion, kcal of the portion unchanged (`applySplitLineChange > keeps the servings
  and shows exactly the edited portion after a line edit (R02.6)`); two servings and grams picks
  (`> keeps a picked count of servings, or grams, with the edited amount`); unit no longer offered
  (`> falls back to grams when the picked unit is no longer offered`); no active split, scale 0 or
  NaN, one line left, no weight (`> gives no split without an active split, with a broken scale
  or with nothing left to split`).
- [x] Combined name: two, three, four and more, blank names, fallback
  (`src/domain/food/combine.test.ts > combinedName > joins two or three names with " + "`, `>
  shortens four or more names to the first two and a count of the rest`, `> trims names, skips
  blank ones, and uses the fallback when none is left`).
- [x] Totals, latest time and meal, source manual, no id (`combineEntries > sums kcal and macros
  and takes time, day and meal from the latest entry`, `> keeps the first entry when the latest
  time is shared`).
- [x] One line per entry, 0 g for an unknown weight; weight sum or one serving (`> makes one line
  per entry, with 0 g for an unknown weight so the line stays visible (R02.9)`, `> weighs the sum
  of the known weights, and is one serving when no weight is known`).
- [x] Photos with line photos, in order, no repeats; first emoji (`> gathers photos in order
  without repeats, lines included, and keeps the first emoji`).
- [x] Nutrients and extras summed only when every entry knows them (`> sums a nutrient when every
  entry knows it and keeps it unknown when one lacks it (D-16.20, R02.9)`); notes, product,
  units and chosen unit dropped (`> leaves out notes, product info, units and the chosen unit of
  the originals`); fewer than two refused (`> refuses fewer than two entries`).
- Deliberate differences: D-16.20 (nutrients and extras summed where all entries know them; the
  reference drops them); the "K more" tail and fallback name come from the caller; an empty emoji
  counts as none; the split caps the units at four at once (the reference caps on reopen); the
  split result also records the picked unit and count on the draft.
- Not taken: health-store origin on the combined entry (no health stores in v1); the sheet's
  stepper and the Home selection (P06-09, P06-19).

## Decisions for the lead

- Named `splitRecipe` (glossary 17 §1.6) where the phase row says `split`; the edit-while-split
  rule is `applySplitLineChange(draft, nextLines, scale, {servings, unit})`, which returns `null`
  when the caller should use `applyLineChange` (no split, or nothing left to split).
- `canSplit` must be judged on the draft as the sheet received it (or as the last plain line
  change left it): the sheet's own split adds a serving unit, which `canSplit` would read as a
  logged portion. P06-09 should keep the control while its own split is active.
- `combineEntries(entries, {fallback, more})` returns the entry without an `id`; P06-19's service
  adds the id and passes catalogue text for the fallback name and the "K more" tail. Fewer than
  two entries throw a `RangeError` (a caller bug: Combine is enabled at two).
- A combined meal whose entries all have unknown weights gets a basis of one serving (the
  reference leaves the weight empty, which reviews as one serving too).
- Extra exports: `MIN_SERVINGS`, `MAX_SERVINGS`, `clampServings`, `isLoggedPortion`,
  `RecipeSplit`, `ActiveSplit`, `combinedName`, `CombineNames`, `CombinedEntry`.

## Status

Done (2026-10-26). `recipe.ts` (13 tests) and `combine.ts` (11 tests), all passing; nothing
outside the slice's files changed. Traps covered: R02.6, R02.9; acceptance row ACC-D14-1.
