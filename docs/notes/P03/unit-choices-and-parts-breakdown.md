# Task: unit choices and parts breakdown (P03-13) · Phase: 03 · Owner: builder (wt-p03s4b)

<!-- Save as platewise/docs/notes/P<nn>/<slug>.md. Write everything above "Compare checklist"
BEFORE writing code, in your own words. Never paste or paraphrase the reference line by line. -->

Read (reference @ `10e14b67`): `A/services/ai/FoodAnalysis.kt` (the parts parse, the unit-list
parse and its per-element helpers, the "parts replace the totals" step), `A/models/ServingUnitOption.kt`
(how a unit's id and count are formed), then the tests `T/services/ai/IngredientBreakdownParserTest.kt`,
`T/services/ai/ServingUnitFallbackDecisionTest.kt` and `IT/ServingUnitFallbackTests.swift` (the unit
and breakdown cases). Research spec `03-ai-providers.md` §3.6 (unit options, component breakdown)
and §3.7 (who uses the repair flag), traps R03.14 and R03.16, acceptance ACC-E8-2.

What it does (own words): two readers for the lists that come back inside a food answer.
`units.ts` reads the `units` list ("2 slices", "1 bowl") strictly: the list either is fully usable
or is thrown away and flagged for one repair request (which P03-18 sends only for zero-energy foods
with a known weight). A missing `units` key or a value that is not a list flags repair; an empty
list is a complete answer ("no sensible unit") and flags nothing. Every element must be an object
with a non-empty unit name that is not a spelling of grams, and a count and grams-each that are
real JSON numbers above 0 (a numeric string or a boolean is a mangled element). When the weight is
known, count × grams-each must land within max(5 g, 15 % of the weight) of it, so a unit that
describes another amount is refused. One bad element voids the whole list. Repeats (same unit,
any case) keep the first; at most 4 survive. The first one becomes the unit the review sheet opens
in, with its count. `parts.ts` reads the `parts` breakdown all or nothing (R03.14): because kept
parts replace the meal's kcal and macros, a partial or padded list would corrupt the totals, so any
doubt drops the whole list and the answer's own totals stay (ACC-E8-2). Unknown part weights are
filled from the weight left in the meal, in proportion to each part's kcal, but only when that is
physically possible (no more than 9 kcal per gram, the energy density of pure fat).

Inputs → outputs:
- `readUnits(reply: unknown, basis: ServingBasis)` → `{ units: UnitChoice[] (≤ 4), needsRepair }`.
- `withUnits(draft, units)` → the draft with `units`, and `chosenUnit`/`chosenCount` from the first
  unit when the weight is known (absent otherwise).
- `readParts(reply: unknown, meal: { kcal, basis })` → `IngredientLine[]`; empty means no breakdown
  (none given, or dropped).
- `withParts(draft, lines)` → the draft with `lines`, and kcal and macros replaced by the parts'
  sums (the domain's `lineTotals`) when there are any; unchanged totals when there are none.

Files: created `src/ai/parse/units.ts`, `src/ai/parse/units.test.ts`, `src/ai/parse/parts.ts`,
`src/ai/parse/parts.test.ts`, this note.

Edge cases / failure modes:
- Units: reply not an object or without `units` → repair; `units: null`, a string or an object →
  repair; `[]` → no repair, no units; `["slice"]` → repair; element missing count or grams-each →
  repair; `count: true`, `count: "2"`, `gramsEach: false`, 0, negative, NaN-ish → repair; unit name
  blank, not a string, or `g`/`Gram`/` grams ` → repair; 2 × 120 g for a 250 g serving passes,
  2 × 80 g fails and voids the list (even next to a good element); exactly at the tolerance passes;
  the 5 g floor applies to small servings (20 g: 3 × 8 g = 24 g passes, 26 g fails); unknown weight
  → no tolerance check; " Slice " and "slice" are one unit, the first kept; five distinct → four.
- Units with an unknown weight: the list is still read (it can carry a repair flag), but no unit is
  chosen, since the sheet then offers only the serving count.
- Parts: key missing, not a list, empty or 21 entries → none; an element that is not an object,
  has a blank or non-text name, a kcal or macro that is missing, a word, a boolean, negative or
  above 100 000 → none; grams negative, above 100 000 or not a number → none; grams missing, null
  or 0 means unknown; an unknown-weight part with kcal 0 → none (nothing to size it by).
- Fill: unknown weights need a known meal weight, room left (meal grams − listed grams > 0) and an
  implied density (unknown kcal ÷ room) ≤ 9 kcal/g; each unknown part gets kcal × room ÷ unknown kcal,
  rounded to 0.1 g. Anything else → none.
- Coverage: with meal kcal > 0, the parts' kcal sum ÷ meal kcal must sit in [0.5, 1.5] (so 0.4 and
  a doubled list with a total row are dropped). Meal kcal 0 skips the check.
- Kept parts: kcal is the sum of the parts' whole kcal; protein, carbs and fat the plain sums; the
  serving weight is not touched.

Our design differences / decisions:
- Our contract keys (`units` [{unit, count, gramsEach}], `parts` [{name, grams, kcal, protein,
  carbs, fat}]) from `foodReply.ts`; the reference's snake_case keys and its legacy aliases are not
  read (no answer in the old spelling can reach us).
- A gram unit is a bad element and voids the list (as §3.6 and the reference do), not a silently
  skipped one.
- Unit names are stored trimmed and lower-case (`UnitChoice.unit` in the domain model), so
  duplicates are found on the stored id.
- A part's grams that is present but not a number (a word, a boolean) drops the list; the reference
  reads such a value as "unknown". A malformed value is a malformed entry.
- Part kcal is read as a number or numeric string (§3.6) and rounded to a whole kcal per line; the
  coverage check uses those whole kcal, the same numbers that become the meal total.
- The repair flag is a plain boolean on the reading; the repair itself is P03-18.
- Lines carry no photo ids from the reader (`photoIds: []`); the capture flow attaches photos.

Tests we will write:
- `units.test.ts`: valid list kept with its first unit chosen; `[]` no repair; missing key and
  non-list repair; `count: true` and `"2"` repair (R03.16); missing field and string element
  repair; 2 × 120 g in, 2 × 80 g out and voiding a good neighbour; tolerance edge and 5 g floor;
  gram spellings void; blank names void; dedupe case-insensitively and keep 4; unknown weight skips
  the tolerance and chooses nothing; `withUnits` sets and clears the chosen unit; the fake AI's
  answer reads its two units.
- `parts.test.ts`: valid list kept and totals replaced (ACC-E8-2's counterpart); numeric strings;
  21 parts dropped; empty and missing dropped; every malformed entry kind drops the list and keeps
  the totals; unknown grams filled from the remaining weight to 0.1 g; no meal weight, no room, or
  density 10 kcal/g dropped; zero-kcal unknown part dropped; coverage 0.4 and a total row dropped
  and the totals kept (ACC-E8-2); meal kcal 0 skips coverage; the fake AI's answer reads its parts.

Compare checklist (filled after the rewrite; reopened the parts and unit-list parse in
`FoodAnalysis.kt`, `ServingUnitOption.kt`, `MealIngredient.kt` (totals) and the three test files):
- [x] Missing key or non-list → repair; empty list → no repair (`src/ai/parse/units.test.ts >
  readUnits: a missing or mangled list asks for one repair (R03.16) > asks for repair when the list
  is missing or not a list`; `readUnits: a usable list (R03.16) > reads an empty list as a complete
  answer: no units and no repair`)
- [x] Count and grams each must be JSON numbers above 0; booleans and strings void the list (`> refuses
  count: true and count: "2", and the same for grams each`, `> refuses counts and weights that are
  zero, negative or not finite`)
- [x] Element must be an object with a non-empty string unit; incomplete objects void (`> refuses an
  element that is not an object, lacks a field or has no usable name`)
- [x] Gram units rejected (`> refuses every spelling of grams, which the picker always offers itself`)
- [x] max(5 g, 15 %) only when the weight is known; one bad element voids good neighbours
  (`readUnits: a usable list (R03.16) > accepts 2 × 120 g for a 250 g serving, within 15 %`, `> allows
  max(5 g, 15 %): 30 g either side of 200 g, 5 g either side of 20 g`, `> skips the weight check when
  the weight is unknown`; `readUnits: a missing or mangled list … > refuses 2 × 80 g for a 250 g
  serving and voids the good unit beside it`)
- [x] De-duplicate case-insensitively after validating every element, keep 4 (`> removes repeats in
  any case, keeping the first, and keeps four`)
- [x] First unit chosen with its count (`withUnits: the first unit is the one the sheet opens in >
  chooses the first unit and its count when the weight is known`, `> keeps the units but chooses none
  when the weight is unknown`, `readUnits with the food reply > reads the fake AI's answer: a bowl and
  1.75 cups, the bowl chosen`)
- [x] Parts: missing, empty or > 20 dropped, never truncated (`src/ai/parse/parts.test.ts > readParts:
  a breakdown that does not add up is dropped and the totals kept (ACC-E8-2) > drops 21 parts instead
  of cutting the list short`, `> gives no breakdown for a missing, empty or non-list value`; `readParts:
  a usable breakdown replaces the totals (R03.14) > keeps 20 parts, the most an answer may list`)
- [x] Any malformed entry (name, kcal/macros 0–100 000, grams (0, 100 000] or unknown) drops the list
  and keeps the totals (`> drops the whole list for any malformed part`); numeric strings read
  (`> reads numeric strings, trims names and rounds each part to a whole kcal`)
- [x] Unknown grams with kcal ≤ 0 drops (`readParts: unknown part weights are filled from the meal
  (R03.14) > drops the breakdown when a part of unknown weight has no kcal to size it by`)
- [x] Fill from remaining weight to 0.1 g; needs a known weight, room > 0, ≤ 9 kcal/g (`> shares the
  weight the listed parts leave over in proportion to kcal`, `> reads a null weight as unknown too, and
  rounds a filled weight to 0.1 g`, `> accepts a fill of exactly 9 kcal per gram and drops one of 10`,
  `> drops the breakdown when the meal weight is unknown`, `> drops the breakdown when the listed
  weights leave no room`)
- [x] Coverage 0.5–1.5 when meal kcal > 0 (`readParts: a breakdown that does not add up … (ACC-E8-2) >
  drops a breakdown covering 0.4 of the meal kcal`, `> drops a breakdown that also lists a total row`;
  `readParts: a usable breakdown … > keeps a breakdown at exactly half and at exactly one and a half of
  the meal kcal`, `> skips the coverage check when the meal has no kcal`)
- [x] Kept parts replace kcal and macros; weight stays (`> keeps the parts and makes the meal kcal and
  macros their sums`, `> leaves the serving weight, units and nutrients as the answer gave them`,
  `withParts > reads the fake AI's answer: soup and bread, totals from the parts`)
- Mutation check: reading counts with a string-accepting reader fails 1 test; skipping a bad element
  instead of voiding fails 7; a missing list without repair fails 1; removing the coverage check fails
  2; raising the 20 cap fails 1; removing the 9 kcal/g cap fails 1.
- Deliberate differences: our contract keys, no legacy aliases; unit ids stored lower-case (domain
  model); a part name that is not text (the reference reads a number name as text) and a present but
  non-numeric part weight (the reference reads it as unknown) both drop the list; coverage is judged
  against the draft's rounded kcal (the reference truncates the meal kcal).
- Not taken: legacy key spellings for the list and for grams each; amino-acid limits (no domain keys).

## Decisions for the lead

- A gram unit in the list voids it and flags repair (the reference and §3.6), rather than being
  skipped; R03.16's "drop gram units" is read as "never keep one".
- A part weight that is present but not numeric drops the breakdown (the reference treats it as
  unknown).
- Units on an unknown-weight draft are kept but none is chosen.

## Status

Done (2026-10-27). Created `src/ai/parse/units.ts`, `src/ai/parse/units.test.ts` (18 tests),
`src/ai/parse/parts.ts`, `src/ai/parse/parts.test.ts` (20 tests), this note. Nothing changed outside
the task's files. P03-18 composes them after `readFoodReply`: `withParts(draft, readParts(reply,
draft))`, then `withUnits(draft, readUnits(reply, draft.basis).units)`, keeping `needsRepair` for
`repairUnitsIfNeeded`; a repair answer is read with the same `readUnits` and applied with `withUnits`
only when its list is non-empty.
