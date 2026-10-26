# Task: ingredient lines and nutrient stretch (P01-10) · Phase: 01 · Owner: builder (wt-p01b3)

<!-- Save as platewise/docs/notes/P<nn>/<slug>.md. Write everything above "Compare checklist"
BEFORE writing code, in your own words. Never paste or paraphrase the reference line by line. -->

Read (reference @ `10e14b67`): `A/models/MealIngredient.kt`, `A/models/IngredientPortion.kt`,
`A/models/MealMicronutrientStretch.kt` (all three in full); tests
`T/models/IngredientPortionTest.kt`, `T/models/MealMicronutrientStretchTest.kt`,
`IT/MealMicronutrientStretchTests.swift`; research spec `02-food-logging.md` §3.15 (line shape,
line editor, applying a line change) and §6 R02.4, R02.5; traps ledger row R02.4; acceptance row
ACC-D13-2. No Evidence ids.

What it does (own words): a meal can be broken into **lines** (parts) that carry weight, energy and
the three macros, but no optional nutrients. Whenever the person adds, edits or removes a line in
the review or edit sheet, the meal header is rebuilt from the lines as the sheet shows them (at
the current amount): kcal and macros become the line sums. Optional nutrients and extras cannot be
rebuilt from lines, so they are stretched by how much the total line weight changed (new ÷ old);
when the old lines weighed nothing the ratio is unknown and they stay; when the new lines weigh
nothing every known value becomes 0. If the new lines have a weight, that weight becomes the
basis, the named units are dropped (their counts referred to the old meal) and any recipe split
ends; if every line weight is unknown the serving is left alone. The line editor rescales energy
and macros proportionally when the weight changes, always from an unrounded baseline so typing
"1", "15", "150" does not drift; editing a value directly makes the current numbers the new
baseline. A line can be saved only with a name, a weight above 0 and values that are finite, not
negative and (for kcal) below 2³¹ − 1.

Inputs → outputs:
- `lineTotals(lines)` → `{grams, kcal, protein, carbs, fat}` (unknown weights count as 0).
- `stretchFactor(oldGrams, newGrams)` → number or `null` (null = leave the values alone).
- `stretchValues(values, factor)` → same record with each known value multiplied.
- `applyLineChange(draft, nextLines)` → the new draft (`nextLines` are the lines as shown).
- `lineAmounts(line)` → `LineAmounts` (an editor baseline);
  `rescaleLine(baseline, grams)` → `LineAmounts` or `null`.
- `validateLine(input)` → `Result<ValidLine, LineField[]>` (the fields that block Save).
- `scaleLine` (in `scale.ts`) scales a line with the header: grams, kcal rounded, macros.

Files: created `src/domain/servings/ingredients.ts`, `ingredients.test.ts`, this note.

Edge cases / failure modes:
- Two lines 120 + 80 kcal → header 200; macros are unrounded sums.
- Removing a 100 g line from 400 g → sodium × 300/400 (ACC-D13-2); absent nutrients stay absent.
- Old total 0 (first lines added to a plain meal) → nutrients unchanged, basis becomes the new
  total; new total 0 (all lines removed) → known nutrients 0, absent stay absent, kcal 0, basis
  unchanged.
- New total > 0 → basis grams = total, units cleared, chosen unit and count cleared (split ends).
- All new weights unknown (lines at 0 g) → basis, units and chosen unit kept.
- Stretch factor: old ≤ 0 or not finite → `null`; new ≤ 0 or not finite → 0.
- `rescaleLine`: baseline grams ≤ 0, new grams ≤ 0, NaN or ∞, or a result that is not finite, is
  negative or reaches 2³¹ − 1 → `null`; 100 g → 150 g twice in a row gives the same 1.5×.
- `validateLine`: blank or spaces-only name; grams null, 0, negative, ∞; a value null, negative,
  NaN, ∞; kcal ≥ 2³¹ − 1 → each named in the error list.

Our design differences / decisions:
- Names are ours (`IngredientLine`, `applyLineChange`, `rescaleLine`, `LineAmounts`).
- `applyLineChange` takes the draft at its base and the lines as shown; the caller returns the
  amount to the new base (scale 1) afterwards, as the reference sheet does.
- When every new weight is unknown the units and chosen unit stay as well as the basis (the
  research spec: "serving left as it was").
- `validateLine` returns the failing fields instead of a single flag, so the editor can mark them;
  the valid line has a trimmed name and whole kcal.

Tests we will write:
- `lineTotals`, `scaleLine` (lines scale with the header).
- `applyLineChange`: header from lines at the current scale (R02.4), the removal stretch
  (ACC-D13-2), old total 0, new total 0, basis/units/split reset, unknown weights keep the serving.
- `stretchFactor` / `stretchValues`.
- `rescaleLine`: doubling and halving, no drift, value edit becomes the baseline, rejects.
- `validateLine`: valid input and every invalid case.

Compare checklist (filled after the rewrite; reopened `A/models/MealIngredient.kt`,
`A/models/IngredientPortion.kt`, `A/models/MealMicronutrientStretch.kt`,
`T/models/IngredientPortionTest.kt`, `T/models/MealMicronutrientStretchTest.kt`,
`IT/MealMicronutrientStretchTests.swift`):
- [x] Line sums and line scaling with the header, kcal rounded (tested in
  `src/domain/servings/ingredients.test.ts > lineTotals > sums weight, kcal and macros; unknown
  weights add nothing`, `scaleLine > scales lines with the header: grams, kcal rounded, macros
  unrounded`).
- [x] Header from the lines as shown, nutrients stretched by the gram ratio (`applyLineChange >
  makes the header the sum of the lines: 120 + 80 kcal gives 200`, `> takes the header from the
  lines at the current scale and stretches nutrients to match (R02.4)`, `> scales sodium by
  300/400 when a 100 g line is removed from 400 g`); extras stretch too (same tests).
- [x] Absent values stay absent; nothing rebuilt from lines (`> never makes up nutrients the meal
  did not know (lines carry none)`).
- [x] Old total 0 → unchanged; new total 0 → known values 0, kcal 0, serving kept (`> leaves
  nutrients unchanged when the old lines weighed nothing`, `> sets every known nutrient to 0 when
  the new lines weigh nothing, and keeps the serving`).
- [x] New weight → basis, units and chosen unit cleared (`> with a new weight, clears the units and
  the chosen unit, which ends a recipe split`); all weights unknown → serving kept (`> keeps the
  serving as it was when every new weight is unknown`); entry fields kept (`> keeps every other
  field of a diary entry`).
- [x] Stretch factor: new ÷ old, null for old ≤ 0, 0 for new ≤ 0 (`stretchFactor > is new ÷ old
  when both weights are positive`, `> is null when the old weight is not positive and 0 when the
  new one is not`).
- [x] Line editor: doubling and halving, no drift while typing, value edit becomes the baseline,
  rejects zero, negative, non-finite and overflowing results (`rescaleLine > scales energy and
  macros in proportion to the weight`, `> rescales from the unrounded baseline every time, so
  typing never drifts`, `> starts from the current numbers once a value is edited`, `> refuses
  weights that are not positive and results that overflow`).
- [x] Save rules (`validateLine > accepts a named line with a weight and non-negative values,
  trimming and rounding`, `> refuses a blank name and a weight that is missing, 0, negative or not
  finite`, `> refuses values that are missing, negative or not finite, and kcal from 2³¹ − 1`,
  `> lists every field that blocks saving, in field order`).
- Deliberate differences: when every new line weight is unknown, the units and chosen unit stay
  with the basis (the plan and research spec: "the serving stays as it was"; the Android code
  clears the units in every case); an old or new weight that is not finite counts as unknown
  (null, or 0) rather than giving NaN; `validateLine` returns the failing fields.
- Not taken: the line photos list and the add-ingredient menu (P06-09); the amino-acid extras
  (not in v1's extras list).

## Decisions for the lead

- `applyLineChange(draft, nextLines)` follows the reference when every new line weight is
  unknown: the header becomes the shown line sums while the basis stays at its base amount, and
  the sheet returns to scale 1. If the person had changed the amount first (scale ≠ 1), the shown
  amount drops back to the base with the new sums. A later fix could pass the scale and move the
  basis to the shown amount; not done, to keep the reference rule.
- `validateLine` takes parsed numbers (`null` for an empty or unreadable field) and returns
  `Result<ValidLine, LineField[]>`; the valid line has a trimmed name and whole kcal. Energy in kJ
  is converted by the editor (P06-09) before it calls this.
- Extra exports: `LINE_KCAL_LIMIT`, `LineTotals`, `LineAmounts`, `LineInput`, `LineField`,
  `ValidLine`, `lineTotals`, `stretchFactor`, `lineAmounts`. The row's "nutrient stretch" is
  `stretchFactor` plus `scaleRecord` from `scale.ts`.

## Status

Done (2026-10-26). `ingredients.ts` (22 tests), all passing; nothing outside the slice's files
changed. Trap covered: R02.4; acceptance row ACC-D13-2.
