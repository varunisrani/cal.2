# Task: ingredient lines and nutrient stretch (P01-10) · Phase: 01 · Owner: builder (wt-p01b3)

<!-- Save as platewise/docs/notes/P<nn>/<slug>.md. Write everything above "Compare checklist"
BEFORE writing code, in your own words. Never paste or paraphrase the reference line by line. -->

Read (reference @ `10e14b67`): `A/models/MealIngredient.kt` (all), `A/models/IngredientPortion.kt`
(all), `A/models/MealMicronutrientStretch.kt` (all), `T/models/IngredientPortionTest.kt` (all),
`T/models/MealMicronutrientStretchTest.kt` (all), `IT/MealMicronutrientStretchTests.swift` (all).
Research spec `02-food-logging.md` §3.15 (shape, line editor, applying a line change) and §6 R02.4
and R02.5. No Evidence ids.

What it does (own words): a meal can be broken into parts (ingredient lines), each with a weight,
whole kcal and macro grams, and no other nutrients. Whenever the parts change (one added, edited
or removed), the meal's energy and macros become the sums of the parts as the sheet shows them,
and its other nutrients and extras, which only exist at meal level, are stretched by how much the
meal's weight changed: new part grams ÷ old part grams. They are never rebuilt from the parts,
because the parts do not have them (R02.4). If the old parts weighed nothing (no parts, or all
unknown weights) there is no ratio, so the nutrients stay; if the new parts weigh nothing the
nutrients become 0. A positive new weight becomes the meal's weight, with the named units and any
recipe split dropped (their grams described the old meal); when every new weight is unknown, the
serving is left alone. The line editor rescales a part's energy and macros when its weight
changes, always from an unrounded baseline so typing 1, 15, 150 g does not drift, and a value the
person types becomes the new baseline.

Inputs → outputs:
- `lineTotals(lines)` → `{grams, kcal, protein, carbs, fat}` (plain sums).
- `draftAsLine(draft, photoIds)` → a whole food (entry, analysis, saved meal) as one part: its
  known weight, or 0 g when the weight is unknown; its own parts are not expanded (added in the
  compare step; used by `combineEntries` and by the add-ingredient flow of P06-09).
- `stretchFactor(oldGrams, newGrams)` → null when the old total is not above 0 (leave as is), 0
  when the new total is not above 0, else new ÷ old.
- `applyLineChange(draft, nextLines)` → the draft with the header from the line sums, nutrients
  and extras stretched, and the serving rules above. `nextLines` are the lines as the sheet shows
  them (at the current scale); `draft.lines` are the stored ones (the draft's basis).
- `LinePortion {grams, kcal, protein, carbs, fat}` (kcal unrounded) and
  `rescaleLine(baseline, grams)` → the portion at the new weight, or null when either weight is
  not a finite number above 0 or a result is not finite, negative or ≥ 2³¹ − 1.
- `LineFields {name, grams, kcal, protein, carbs, fat}` (numbers or null when the text did not
  read) and `validateLine(fields)` → the list of fields that block Save (empty when it may save);
  `toLine(fields, media)` → an `IngredientLine` with a trimmed name and whole kcal, or null.
- Lines scale with the header through `scaleLine` in `scale.ts` (grams and macros unrounded, kcal
  rounded).

Files: created `src/domain/servings/ingredients.ts`, `src/domain/servings/ingredients.test.ts`,
this note.

Edge cases / failure modes:
- Old total 0 (first line added to a meal without parts, or parts of unknown weight): nutrients
  unchanged, the new weight (if > 0) still becomes the basis.
- New total 0 (last weighed part removed): nutrients present become 0, unknown ones stay absent
  (never invented as 0); header kcal and macros are the sums (0 for no lines); the basis, units and
  chosen unit stay as they were.
- Negative or non-finite totals count as "not above 0".
- A draft whose header was edited by hand (R02.5, P06-08) gets its header replaced by the sums on
  the next line change; that is expected.
- Line editor: weight 0, negative, NaN, infinity → null; a baseline of 0 g cannot be rescaled; a
  result at or above 2³¹ − 1 or not finite → null.
- `validateLine`: blank or space-only name; weight missing, ≤ 0 or not finite; any value missing,
  negative or not finite; kcal at or above 2³¹ − 1.

Our design differences / decisions:
- Names are ours (`IngredientLine`, `applyLineChange`, `rescaleLine`, `stretchFactor`,
  `lineTotals`).
- With every new weight unknown, the units and chosen unit are kept along with the basis (the
  phase row: "the serving stays as it was"); the reference clears the units in both cases.
- Nutrients and extras go through one generic "multiply what is present" helper instead of a field
  per nutrient; absent stays absent.
- `validateLine` returns the failing fields so a sheet can mark them, not just a yes/no.

Tests we will write:
- Two lines 120 + 80 kcal → header 200 (R02.4).
- Removing a 100 g line from 400 g scales sodium by 300/400 and leaves unknown nutrients absent
  (R02.4, ACC-D13-2); extras stretch too.
- Old total 0 → nutrients unchanged, basis becomes the new weight; new total 0 → nutrients 0,
  basis and units kept.
- A positive new total clears units and the chosen unit (recipe split reset) and sets grams.
- Lines shown at scale 2 change the stored values by the right ratio.
- `stretchFactor` for positive, zero and negative inputs.
- `rescaleLine` 100 g → 150 g gives 1.5× twice in a row from the baseline without drift; doubling
  and halving; an edited value becomes the new baseline; invalid weights and overflow → null.
- `validateLine` and `toLine` valid and invalid cases.

Compare checklist (filled after the rewrite; reopened `A/models/MealIngredient.kt`,
`A/models/IngredientPortion.kt`, `A/models/MealMicronutrientStretch.kt`,
`T/models/IngredientPortionTest.kt`, `T/models/MealMicronutrientStretchTest.kt`,
`IT/MealMicronutrientStretchTests.swift`; and `A/models/CombinedMeal.kt` for the food-to-line
mapping):
- [x] Line sums (`src/domain/servings/ingredients.test.ts > lineTotals > sums weight, energy and
  macros`).
- [x] Line scaling with the header: grams and macros unrounded, kcal rounded, photos and emoji kept
  (`src/domain/servings/scale.test.ts > scaling values > scales a part: grams and macros unrounded,
  kcal whole, photos kept`, `> draftAtAmount > scales the parts with the header`).
- [x] Stretch factor: new ÷ old, none for old ≤ 0, 0 for new ≤ 0 (`ingredients.test.ts >
  stretchFactor > is new ÷ old when both weights are above 0`, `> is null when the old weight is not
  above 0 and 0 when the new one is not`).
- [x] Header from line sums, nutrients and extras stretched, unknowns left absent, basis from the
  new weight (`ingredients.test.ts > applyLineChange > makes the header the sum of the lines: 120 +
  80 kcal is 200 (R02.4)`, `> scales sodium by 300/400 when a 100 g line leaves a 400 g meal
  (R02.4)`, `> takes the lines as shown at the current scale`).
- [x] Old weight 0 leaves nutrients; new weight 0 zeroes them and keeps the serving
  (`ingredients.test.ts > applyLineChange > leaves nutrients unchanged when the old lines weighed
  nothing`, `> sets known nutrients to 0 when the new lines weigh nothing, and keeps the serving`,
  `> keeps the serving as it was when every new weight is unknown`).
- [x] A known new weight clears units and the chosen unit (`ingredients.test.ts >
  applyLineChange > drops units and the chosen unit, ending any recipe split, when the new weight is
  known`).
- [x] Line editor baseline: proportional rescale, no drift, edited values become the baseline,
  invalid weights and overflow refused (`ingredients.test.ts > rescaleLine > gives 1.5× at 150 g
  from the unrounded baseline, twice in a row without drift`, `> doubles and halves every value`,
  `> starts from the edited numbers once the person types a value`, `> refuses weights that are not
  above 0, a 0 g baseline and results that overflow`).
- [x] Save rules (`ingredients.test.ts > validateLine > accepts a named line with a weight and
  non-negative values`, `> names every field that blocks saving`; `toLine > saves a trimmed name
  and whole kcal with the line photos and emoji`, `> gives null while a field is invalid`).
- [x] A whole food as one part, unknown weight 0 g, nested parts not expanded
  (`ingredients.test.ts > draftAsLine > makes a whole food one line with its known weight, without
  expanding its own lines`, `> gives an unknown weight 0 g, never its serving count (R02.1)`).
- Deliberate differences: with every new weight unknown, the units and chosen unit are kept with
  the basis (the reference clears them in both cases); a non-finite old weight means "no ratio"
  (the reference would produce NaN); one generic helper stretches every present nutrient and extra;
  `validateLine` names the failing fields; `draftAsLine` trims the name and skips a blank emoji.
- Not taken: the parts card, the add-ingredient menu and the editor sheet (P06-09 UI); "edited
  value becomes the baseline" is sheet state, shown here by passing the edited numbers as the new
  baseline.

## Decisions for the lead

- `applyLineChange` keeps the units and chosen unit when every new weight is unknown (phase row:
  "the serving stays as it was"); the reference drops them in that case too.
- `draftAsLine` lives here (one food as one part) and is shared by combining and, later, the
  add-ingredient flow (P06-09).
- `LINE_VALUE_LIMIT` = 2³¹ − 1 also bounds rescaled macros, as the reference's editor does; the
  Save rule bounds energy only, as the spec says.

## Status

Done (2026-10-26). `src/domain/servings/ingredients.ts` (20 tests) is in place, all passing; line
scaling lives in `scale.ts` (`scaleLine`) so the modules import in one direction (units → scale →
ingredients → recipe). Nothing outside the slice's files changed. Trap covered: R02.4; acceptance
ACC-D13-2.
