# Task: recipe split and combining entries (P01-11) · Phase: 01 · Owner: builder (wt-p01b3)

<!-- Save as platewise/docs/notes/P<nn>/<slug>.md. Write everything above "Compare checklist"
BEFORE writing code, in your own words. Never paste or paraphrase the reference line by line. -->

Read (reference @ `10e14b67`): `A/models/RecipeServings.kt` (all), `A/models/CombinedMeal.kt`
(all), `T/models/RecipeServingsTest.kt` (all), `T/models/CombinedMealTest.kt` (all),
`IT/RecipeServingsTests.swift` (all). Research spec `02-food-logging.md` §3.15 (recipe servings,
combined meal) and §6 R02.6, R02.9; decision D-16.20 in `16-what-we-change.md`. No Evidence ids.

What it does (own words):
- Split into servings: a whole dish with at least two parts and a known weight can be divided
  into 1–50 servings. Splitting adds one named unit "serving" weighing whole ÷ n, put first in the
  unit list so the four-unit cap never drops it, and opens the amount at 1 serving. A row logged
  from a split dish keeps that unit, so it is a portion, not the dish: offering the split again
  would divide the portion (2 servings would log a fifth of what they should), so the control is
  hidden for any draft that already carries a "serving" unit (R02.6). While split, the sheet
  shows a portion; when the person edits a part there, the edited portion is scaled back up into
  a new whole dish, which is divided into the same n again, and the amount row keeps its unit
  with a count that shows exactly the edited portion.
- Combining: two or more diary entries become one entry with one part per original (its known
  weight, or 0 g when the weight is unknown, kept visible as a part, R02.9), totals summed, time,
  day and meal of the latest original, all photos in order without repeats, the first emoji, source
  manual. Optional nutrients and extras are summed when every original knows them and left unknown
  otherwise (D-16.20: our change; the reference drops them all). Notes and product details are
  not carried.

Inputs → outputs:
- `recipe.ts`
  - `SPLIT_MIN = 1`, `SPLIT_MAX = 50`, `clampServings(n)` → a whole number in 1–50.
  - `isLoggedPortion(units)` → true when any unit's id is "serving".
  - `canSplit(draft)` → ≥ 2 lines, a known weight > 0 and not a logged portion.
  - `splitRecipe(draft, n)` → `{draft, shown, servings}`: the draft with the serving unit first
    (replacing an earlier one, other units kept behind it, cap 4), chosen unit "serving" × 1, and
    the `ShownAmount` of one serving; null when the weight is unknown.
  - `keepSplit(draft, nextLines, scale, servings, unit)` → the same shape after a part edit while
    split, or null when no split is active (n ≤ 1), the scale is unusable, fewer than 2 parts are
    left, or the edited portion or the rebuilt whole weighs nothing; the caller then applies the
    edit as an ordinary line change.
- `food/combine.ts`
  - `combinedName(entries, words)` → names joined with " + " (≤ 3), else the first two and
    `words.more(k)`; `words.fallbackName` when no entry has a name.
  - `combineEntries(entries, words)` → a new entry without an id (the store assigns it), or null
    for fewer than two entries.

Files: created `src/domain/servings/recipe.ts`, `src/domain/servings/recipe.test.ts`,
`src/domain/food/combine.ts`, `src/domain/food/combine.test.ts`, this note.

Edge cases / failure modes:
- n outside 1–50, fractional or NaN: clamped to a whole number (NaN → 1).
- A split replaces any earlier "serving" unit, whatever its case or spacing; the dish keeps its
  basis (the values still describe the whole dish), and the split re-runs from the same draft
  when the stepper moves.
- The split's divisor is the draft's known weight (what its values describe), not the part sum.
- `canSplit` on a draft with an unknown weight is false (the serving count is not a recipe
  serving, R02.2).
- `keepSplit` with a grams or other named unit selected keeps that unit; a unit that is no longer
  offered falls back to grams. Nutrients stretch by the new whole weight ÷ the old whole weight.
- Combining: names are trimmed and blank ones skipped; four names → "A + B" + more(2); the latest
  entry wins time and meal (the first of equal times); photo ids from each entry and its parts in
  order, repeats dropped; the emoji is the first non-blank one; the weight is the sum of known
  weights when > 0, else one serving; a nutrient known by only some entries is left unknown;
  entries with no lines still give one part each.

Our design differences / decisions:
- Names are ours (`splitRecipe`, `keepSplit`, `canSplit`, `combineEntries`).
- Nutrients and extras are summed when every combined entry knows them (D-16.20); the reference
  drops them all.
- The words a person sees ("Combined meal", "K more") are parameters filled from the catalogue;
  the " + " joiner stays in the domain.
- `combineEntries` returns null instead of throwing for fewer than two entries, and returns the
  entry without an id (ids come from the store's id source).
- The split returns the draft and the shown amount instead of a quantity text; the sheet formats
  the count with `formatQuantity`.

Tests we will write:
- recipe: split a 2 kg pot into 8 → 250 g serving first, count 1 (ACC-D14-1); an earlier
  "Serving" unit is replaced and the others follow; the cap of four keeps the serving; clamp 0 → 1,
  80 → 50; `canSplit` needs two lines, a known weight and no serving unit; a re-logged portion
  cannot split again (R02.6); logging one serving and reopening keeps the serving unit; a part edit
  while split keeps n, shows the edited portion's grams with count 1 (R02.6); two servings selected
  and grams selected keep their unit; no split, a bad scale or one part left → null.
- combine: 2 names "A + B", 3 names, 4 names "A + B + 2 more", blank names, none → fallback;
  totals, latest time and meal; photos de-duplicated in order; first emoji; source manual; sodium
  summed when both know it, unknown when one lacks it (D-16.20, R02.9); an unknown-weight entry
  contributes a visible 0 g line and the weight is the known sum (R02.9); all unknown → one
  serving; notes and product dropped; fewer than two entries → null.

Compare checklist (filled after the rewrite; reopened `A/models/RecipeServings.kt`,
`A/models/CombinedMeal.kt`, `T/models/RecipeServingsTest.kt`, `T/models/CombinedMealTest.kt`,
`IT/RecipeServingsTests.swift`):
- [x] Stepper 1–50 (`src/domain/servings/recipe.test.ts > clampServings > holds the stepper to
  whole numbers from 1 to 50`, `> splitRecipe > clamps the servings count`).
- [x] Split: a serving of total ÷ n first, replacing an earlier one, others after it, one serving
  selected (`recipe.test.ts > splitRecipe > splits a 2 kg pot into 8: a 250 g serving first,
  selected with count 1`, `> replaces an earlier serving unit and keeps the others after it`,
  `> puts the serving first so the four-unit cap keeps it`, `> refuses a draft whose weight is
  unknown`).
- [x] Eligibility: two parts, a known weight above 0, not a logged portion (R02.6)
  (`recipe.test.ts > canSplit > needs two lines and a known weight above 0`, `> refuses a re-logged
  portion, which would divide the portion again (R02.6)`).
- [x] A logged serving keeps its unit, so re-logging 2 servings is twice the portion
  (`recipe.test.ts > canSplit > refuses a re-logged portion, which would divide the portion again
  (R02.6)`).
- [x] Part edits while split: scaled back to a whole dish, same n, unit kept, count shows the
  edited portion; re-splitting divides the whole dish (`recipe.test.ts > keepSplit > keeps n and
  shows the edited portion when a line of a split recipe changes (R02.6)`, `> keeps two selected
  servings and recomputes their count`, `> keeps grams when grams were selected`, `> is null without
  an active split, with a bad scale or with one line left`).
- [x] Combined name (`src/domain/food/combine.test.ts > combinedName > joins two or three names
  with " + "`, `> lists the first two and how many more past three`, `> trims names, skips blank
  ones and falls back to the caller name for none`).
- [x] Combined entry: one part per entry, nested parts not expanded, totals, latest time and meal,
  photos de-duplicated, first emoji, source manual, weight from known parts
  (`combine.test.ts > combineEntries > sums the totals and takes time, day and meal from the latest
  entry`, `> picks the first of two entries logged at the same latest time`, `> keeps every photo
  once, in order, and the first emoji`, `> adds a visible 0 g line for an unknown-weight entry and
  sums the known weights (R02.9)`, `> falls back to one serving when no entry has a known weight`,
  `> needs at least two entries`).
- [x] Nutrients summed only when every entry knows them; notes and product not carried
  (`combine.test.ts > combineEntries > sums sodium when both entries know it and leaves it unknown
  when one lacks it (D-16.20, R02.9)`, `> carries no notes, product details, units or chosen unit`).
- Deliberate differences: nutrients and extras are summed where every entry knows them (D-16.20;
  the reference drops them); "Combined meal" and "K more" are caller words; fewer than two entries
  give null instead of an error; the result has no id (the store assigns one); the split divides
  the draft's known weight (what its values describe); the split keeps the four-unit cap itself;
  the split and the kept split return a `ShownAmount` instead of quantity text; part names and the
  emoji are trimmed / non-blank; the health-store origin is not carried (no health stores in v1).
- Not taken: the stepper and the selection UI (P06-09, P06-19); removing the originals in the
  same write and the fasting block (P02-06 / P06-19); serialisation round trips (P02 codecs).

## Decisions for the lead

- `combineEntries(entries, {fallbackName, more})`: besides the fallback name, the "K more" tail is
  a caller word too (it is English copy); the " + " joiner stays in the domain.
- `combineEntries` returns the entry without an id (`CombinedEntry = Omit<DiaryEntry, 'id'>`);
  the repository adds one from its id source.
- `splitRecipe` divides the draft's known weight (its basis), not the sum of its parts: the values
  describe the basis, so one serving is exactly 1/n of them.
- `canSplit` must be asked of the draft as it opened; the working copy after a split holds its own
  serving unit and would read as a logged portion. `splitRecipe` itself replaces an earlier serving
  unit, so the stepper can re-run it on the working copy.
- The glossary names the function `splitRecipe` (the phase row says `split`); followed the
  glossary.

## Status

Done (2026-10-26). `src/domain/servings/recipe.ts` (12 tests) and `src/domain/food/combine.ts`
(12 tests) are in place, all passing. Nothing outside the slice's files changed. Traps covered:
R02.6, R02.9; acceptance ACC-D14-1.
