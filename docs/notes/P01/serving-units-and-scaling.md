# Task: serving units and scaling (P01-09) · Phase: 01 · Owner: builder (wt-p01b3)

<!-- Save as platewise/docs/notes/P<nn>/<slug>.md. Write everything above "Compare checklist"
BEFORE writing code, in your own words. Never paste or paraphrase the reference line by line. -->

Read (reference @ `10e14b67`): `A/models/ServingUnitOption.kt` (all), `I/Views/ServingUnitEditor.swift`
(all: the picker list, the initial unit and quantity, the unit switch, the "serving" label),
`T/models/FoodServingRestoreTest.kt` (all), `IT/FoodServingRestoreTests.swift` (all; the two
round-trip cases belong to P02/P09 codecs and sharing, read only for the serving fields); to see
what "review reference" means, the four review helpers of `A/models/FoodEntry.kt` (lines 66–88).
Research spec `02-food-logging.md` §3.1 (serving metadata, derived values), §3.3 (all) and §6
R02.1, R02.2, R02.3, R02.25. Decision D-16.20 does not touch this task. No Evidence ids.

What it does (own words): the amount row of the review and edit sheets works in one of three
kinds of unit. When the food's weight is known, grams come first and up to four named units
(slice, cup, a split recipe's serving) follow, each with its grams per unit; the person types a
count, the count becomes grams, and every value scales by shown grams ÷ base grams. When the
weight is unknown, the only unit is a count of servings: grams never appear, nothing is ever
invented as 100 g, and the count the person saved is the base the next time the entry opens, so
2 servings reopen as 2 servings (R02.1). That count is its own kind, never a unit that happens to
be called "serving" (R02.2). Scaling keeps everything unrounded except energy, which is a whole
kcal, so the preview, the fit check and the stored row agree (R02.25); a value the person types
while the amount is scaled is divided by the scale before it is stored, so it does not double
again on the next amount change (R02.3).

Inputs → outputs:
- `units.ts`
  - `unitId(name)` → trimmed, lower-case id; `isGramSpelling(name)` for g / gram / grams.
  - `normaliseChoices(list, baseGrams)` → at most 4 `UnitChoice` with lower-case ids, no gram
    spellings, no empty names, no gramsEach ≤ 0 or non-finite, no duplicates (first wins), and a
    count filled with base ÷ gramsEach when it is missing or not a positive number.
  - `isWeightKnown(basis)` → true only for a grams basis with finite grams > 0.
  - `PickerUnit` = grams | a named unit with its gramsEach | the serving count (own kind);
    `pickerUnits(basis, choices)` → grams then the normalised choices when the weight is known,
    else only the serving count.
  - `initialUnit(draft, gramsFirst)` → the serving count when the weight is unknown; grams when
    the grams-first setting is on; the draft's chosen unit when the picker offers it; the first
    named unit; grams.
  - `ShownAmount {unit, count, amount}`: what the amount row shows (count in its unit) and the
    basis amount it stands for (grams, or servings for the serving count). `amountOf(unit,
    count)`, `countIn(unit, amount)`, `switchUnit(shown, unit)` (keeps the amount, rewrites the
    count) and `withCount(shown, count)` (typing a count).
  - `unitLabel(unit, count, servingWord)` → the label after a count.
- `scale.ts`
  - `reviewBase(draft)` → the known grams, else the serving count when > 0, else 1.
  - `initialAmount(draft, gramsFirst)` → the `ShownAmount` a sheet opens with (scale 1).
  - `scaleFor(shown, base)` → shown ÷ base (1 when either is unusable).
  - `scaledKcal(kcal, scale)` → round(kcal × scale); `scaleValues(values, factor)` multiplies the
    present nutrients or extras and keeps absent ones absent; `scaleLine(line, factor)` scales a
    part (grams and macros unrounded, kcal rounded).
  - `baseFromTyped(typed, scale)` → typed ÷ scale, a scale that is ≤ 0 or not finite read as 1.
  - `draftAtAmount(draft, shown)` → the draft rewritten at the shown amount, ready to store:
    whole kcal, every other value unrounded, the basis and chosen unit set from `shown`.
  - `shownTenth(value)` → a nutrient rounded to 0.1 for display, null when unknown.

Files: created `src/domain/servings/units.ts`, `src/domain/servings/units.test.ts`,
`src/domain/servings/scale.ts`, `src/domain/servings/scale.test.ts`, this note.

Edge cases / failure modes:
- Unit names arrive from the AI, labels and saved rows in any case and with spaces: " Slice " and
  "slice" are one unit; "G", "Gram", "grams" are never stored as a unit.
- A choice with a count that is 0, negative or not finite gets the filled count; with an unknown
  or unusable base weight no count is invented (the field stays absent).
- `pickerUnits` for an unknown weight ignores any named units the draft carries: grams and named
  units would need a weight (R02.1).
- A recipe "serving" unit with known grams is an ordinary named unit in the picker; it never turns
  the basis into the serving count (R02.2), and the serving count is never a `UnitChoice`.
- `initialUnit` matches the chosen unit by id, so "Slice" chosen and "slice" offered match; a
  chosen unit that is no longer offered falls back to the first named unit, then grams.
- The initial count is the stored chosen count only when the opening unit is that chosen unit;
  otherwise it is the base amount expressed in the opening unit.
- Labels: a count within 0.0001 of 1, or no count, keeps the singular; the gram spellings, kg,
  mg, ml, l, oz, fl oz, tbsp and tsp never change; piece → pieces; any other name gains an "s"
  unless it already ends in one; the serving unit (split or count) shows the serving word the
  caller passes, singular or plural by the same count rule.
- Scale: a base or shown amount that is not finite, or a base ≤ 0, gives scale 1, never NaN or
  infinity. Typed values at scale ≤ 0 are stored as typed (scale read as 1).
- `draftAtAmount` keeps optional nutrients absent when unknown (never 0), refreshes each named
  unit's count for the new weight, and drops the chosen unit for grams and for the serving count.

Our design differences / decisions:
- Names are ours (`UnitChoice`, `PickerUnit`, `ShownAmount`, `normaliseChoices`, `reviewBase`,
  `draftAtAmount`, …). The serving count is a `ServingBasis` kind and a `PickerUnit` kind; no
  stored unit stands in for it (R02.2, from the model).
- Unit ids are stored lower-case (the model's rule), so labels show the lower-case name.
- `unitLabel` takes the serving word, singular and plural, from the caller (the domain is
  locale-free); the reference always shows the singular word.
- A missing or unusable count is filled; the reference fills only a missing one.
- The initial count uses the chosen count only for the chosen unit (the reference would show it in
  whatever unit opened first).
- `draftAtAmount` refreshes the named units' counts for the new weight, so a stored count always
  means "how many of this unit the stored values describe" (the model's definition).
- Display rounding is a separate helper (`shownTenth`); nothing stored is rounded except kcal.

Tests we will write:
- units: the Verify list ["Slice", "slice", "g", {gramsEach: 0}] → one `slice`; five valid units
  keep four; trimming, gram spellings in any case, empty names, non-finite gramsEach; count
  filling (missing, 0, negative) and no filling with an unknown base; picker for a known weight
  (grams first) and an unknown one (only the serving count, R02.1); a recipe "serving" unit with
  known grams stays a named unit (R02.2); initial unit in all five branches; switching unit keeps
  the grams; labels 1 piece / 2 pieces / 2 tbsp / 3 cups, glass, fl oz, count 1.00005, serving word
  singular and plural.
- scale: reviewBase for grams, servings, servings with a bad count; an entry with unknown weight
  saved at 2 servings reopens at 2 servings with no grams anywhere (R02.1, ACC-D9-1); scale and
  kcal rounding; nutrients unrounded and unknowns kept absent (R02.25); typed 300 kcal at scale 2
  stores 150, scale 0 and negative read as 1 (R02.3); `draftAtAmount` for grams, a named unit and
  the serving count; line scaling.

Compare checklist (filled after the rewrite; reopened `A/models/ServingUnitOption.kt`,
`I/Views/ServingUnitEditor.swift`, `T/models/FoodServingRestoreTest.kt`,
`IT/FoodServingRestoreTests.swift`, the review helpers of `A/models/FoodEntry.kt`):
- [x] Unit id = trimmed lower-case name; g / gram / grams never stored
  (`src/domain/servings/units.test.ts > unitId > trims and lower-cases a unit name`, `> knows the
  three gram spellings in any case`).
- [x] Normalising: invalid, gram and repeated units dropped, a missing count filled from the base,
  first four kept (`units.test.ts > normaliseChoices > keeps one slice from ["Slice", "slice",
  "g", {gramsEach: 0}]`, `> keeps the first four of five valid units`, `> drops gram spellings,
  empty names and weights that are not a positive number`, `> keeps a positive count and fills a
  missing or unusable one from the base weight`, `> invents no count when the base weight is
  unknown`).
- [x] Picker: grams first for a known weight; only the serving count when unknown (R02.1); a
  recipe "serving" with grams stays a named unit (R02.2) (`units.test.ts > pickerUnits > offers
  grams first, then the named units, when the weight is known`, `> offers only the serving count
  when the weight is unknown, never grams (R02.1)`, `> keeps a recipe serving unit with known grams
  a named unit, not the servings basis (R02.2)`, `> keeps the four-unit cap`).
- [x] Initial unit order (`units.test.ts > initialUnit > opens an unknown weight in the serving
  count, whatever else is set (R02.1)`, `> opens in grams when the grams-first setting is on and the
  weight is known`, `> opens in the chosen unit when it is offered, matching by id`, `> falls back to
  the first named unit, then grams`).
- [x] Initial count: stored chosen count, else base ÷ gramsEach (`scale.test.ts > initialAmount >
  opens a known unit at its stored count and amount`, `> writes the base in the opening unit when
  that is not the chosen one`).
- [x] Switching unit keeps the grams; a typed count becomes grams (`units.test.ts > switchUnit >
  keeps the grams and rewrites the count`, `> turns a typed count into the basis amount`).
- [x] Plural labels and the serving word (`units.test.ts > unitLabel > writes 1 piece, 2 pieces,
  2 tbsp and 3 cups`, `> keeps the singular within 0.0001 of one and without a count`, `> never
  changes metric and kitchen abbreviations`, `> adds no second s to a name that ends in one`,
  `> shows the serving word, singular or plural, for a serving`).
- [x] Review reference = known weight, else chosen serving count, else 1; an unknown weight
  restores as servings and is never given grams (`src/domain/servings/scale.test.ts > reviewBase >
  is the known weight, else the serving count, else 1`, `> initialAmount > reopens an unknown weight
  saved at 2 servings at 2 servings and never shows grams (R02.1)`, `> keeps a split serving with
  known grams a named unit when reopened (R02.2)`).
- [x] Scale, whole kcal, unrounded macros/nutrients/extras, display rounding (`scale.test.ts >
  scaleFor > is shown amount ÷ base amount`, `> is 1 when the base is not above 0 or either amount
  is not usable`; `scaling values > rounds energy to a whole kcal`, `> keeps known values unrounded
  and unknown ones absent`, `> scales a part: grams and macros unrounded, kcal whole, photos kept`,
  `> rounds nutrients to 0.1 for display only`; `draftAtAmount > stores values unrounded so review,
  fit check and totals agree (R02.25)`, `> scales the parts with the header`).
- [x] Typed values ÷ scale, scale ≤ 0 read as 1 (`scale.test.ts > baseFromTyped > stores typed
  300 kcal at scale 2 as 150 (R02.3)`, `> treats a scale of 0 or less as 1 (R02.3)`, `> keeps the
  typed base unrounded so the shown value reads back as typed (R02.25)`).
- [x] Writing the shown amount back (`scale.test.ts > draftAtAmount > stores a named unit as the
  chosen unit and refreshes unit counts`, `> drops the chosen unit when grams are shown`, `> keeps
  the other fields of an entry`, `> leaves the draft as it is for an amount that is not above 0`).
- Deliberate differences: the serving count is its own kind (basis and picker), not a unit named
  "serving" with 1 g per unit; unit ids are stored lower-case; the serving word has a plural from
  the caller (the reference always shows the singular); a count of 0 or less is refilled like a
  missing one, and no count is invented without a base weight; the grams-first setting wins over
  the chosen unit (the phase row and spec order; the iOS helper checks the chosen unit first); the
  chosen count seeds the field only for the chosen unit; `draftAtAmount` refreshes named units'
  counts for the stored weight; a shown amount that is not above 0 leaves the draft alone.
- Not taken: the amount field's blur/revert, clear button and picker visibility (P06-07 UI); the
  health-store metadata and share-link round trips of the iOS test (later phase / P09).

## Decisions for the lead

- `unitLabel(unit, count, {one, other})`: the caller passes the catalogue's serving word in
  singular and plural; the plural rule (count 1 ± 0.0001) applies to it too.
- Grams-first is checked before the chosen unit (`initialUnit`), as the phase row says; the iOS
  helper checks the chosen unit first. Easy to swap if the lead prefers iOS.
- The sheet opens at scale 1 (`initialAmount` keeps the base as the amount even when a stored
  chosen count times gramsEach differs from it); only typing a count moves the grams.
- Extra exports beyond the row: `MAX_UNIT_CHOICES`, `GRAMS_ID`, `SERVING_UNIT`, `GRAMS_UNIT`,
  `SERVING_COUNT_UNIT`, `unitId`, `isGramSpelling`, `isWeightKnown`, `findUnit`, `PickerUnit`,
  `ShownAmount`, `amountOf`, `countIn`, `switchUnit`, `withCount`, `ServingWord` (units.ts);
  `initialAmount`, `scaleFor`, `scaledKcal`, `scaleValues`, `scaleLine`, `baseFromTyped`,
  `shownTenth`, `draftAtAmount` (scale.ts).

## Status

Done (2026-10-26). `src/domain/servings/units.ts` (22 tests) and `src/domain/servings/scale.ts`
(20 tests) are in place, all passing. Nothing outside the slice's files changed. Traps covered:
R02.1, R02.2, R02.3, R02.25; acceptance ACC-D9-1.
