# Task: serving units and scaling (P01-09) · Phase: 01 · Owner: builder (wt-p01b3)

<!-- Save as platewise/docs/notes/P<nn>/<slug>.md. Write everything above "Compare checklist"
BEFORE writing code, in your own words. Never paste or paraphrase the reference line by line. -->

Read (reference @ `10e14b67`): `A/models/ServingUnitOption.kt` (all), `I/Views/ServingUnitEditor.swift`
(unit list helpers, initial unit and quantity, unit switch, labels), the review-reference helpers
of `A/models/FoodEntry.kt` (the four `review…` getters only, because the tests below use them);
tests `T/models/FoodServingRestoreTest.kt`, `IT/FoodServingRestoreTests.swift`; research spec
`02-food-logging.md` §3.1 (derived values) and §3.3 (unit list rules, unknown weight, scaling
rules), §6 R02.1, R02.2, R02.3, R02.25; traps ledger rows R02.1–R02.3 and R02.25; acceptance row
ACC-D9-1. No Evidence ids.

What it does (own words): every amount the review sheet shows is measured against the draft's
**serving basis**: a known weight in grams, or, when the weight is unknown, a count of servings.
`units.ts` keeps the list of named units (slice, cup, a split recipe's serving) clean: ids are
trimmed and lower-cased, spellings of grams, nameless units, units without a positive weight and
repeats are dropped, a missing count is filled from the base weight, and at most four survive. The
picker offers grams first and then the named units when the weight is known, and only the serving
count when it is not, so an unknown weight is never shown as grams and never becomes 100 g. The
first unit shown is grams when the person prefers grams (and the weight is known), else the unit
the draft was saved with if it is still offered, else the first named unit, else grams. Switching
unit keeps the amount and rewrites the number. Unit labels pluralise in a small English way
(abbreviations stay, piece → pieces, otherwise an "s"), and the serving word comes from the
catalogue as a parameter. `scale.ts` turns the shown amount into a scale against the base amount;
shown kcal is rounded, every other value is kept unrounded and only rounded on screen, and a value
typed at the shown amount is stored divided by the scale (a broken scale counts as 1).

Inputs → outputs:
- `unitId(name)` → trimmed, lower-case id; `isGramUnit(name)`; `isPositive(n)` (finite and > 0).
- `basisFor(grams, count?)` → a grams basis only for finite grams > 0, else a servings basis.
- `weightKnown(basis)` → boolean.
- `normaliseChoices(list, baseGrams)` → `UnitChoice[]` (≤ 4).
- `pickerUnits(basis, units)` → `PickerUnit[]` (`{kind: 'grams' | 'unit' | 'servings', id,
  amountEach}`; `amountEach` = grams per unit, or 1 for the serving count).
- `initialUnit(draft, gramsFirst)` → `PickerUnit`.
- `shownAmount(quantity, unit)`, `switchUnit(quantity, from, to)` → numbers.
- `unitLabel(unit, count, servingWords)` → text.
- `reviewBase(draft)` → base amount; `initialAmount(draft, unit)` → the quantity the field opens
  with; `scaleOf(shown, base)`; `scaleValues(values, scale)`; `scaleLine(line, factor)`;
  `scaleDraft(draft, scale)`; `fromShown(typed, scale)`.

Files: created `src/domain/servings/units.ts`, `units.test.ts`, `scale.ts`, `scale.test.ts`, this
note.

Edge cases / failure modes:
- `["Slice", "slice", "g", {gramsEach: 0}]` → one `slice`; five valid units keep the first four;
  "  Cup " becomes `cup`; `gram`, `GRAMS` dropped; NaN, ∞ and negative weights dropped.
- A count of 0, negative or not finite is treated as missing and filled; no fill when the base
  weight is unknown.
- Unknown weight (servings basis, or a grams basis with grams ≤ 0 or NaN) → the picker has only
  the serving count; the initial unit is the serving count even when grams-first is on; the field
  opens at the saved count (2 servings stay 2), never at grams (R02.1).
- A named `serving` unit with known grams (a split recipe) is a unit choice, not the servings basis
  (R02.2).
- The saved unit is matched by id, so "Slice" finds `slice`; a saved unit that is no longer offered
  falls back to the first named unit, then grams.
- Labels: count within 0.0001 of 1 or no count → singular; `g`, `kg`, `mg`, `ml`, `l`, `oz`,
  `fl oz`, `tbsp`, `tsp` (and the gram spellings) never change; `piece` → `pieces`; `glass` stays.
- Scale: base ≤ 0 or not finite → 1. `fromShown(300, 2)` = 150; scale 0, negative or NaN → typed
  value unchanged (R02.3).
- kcal shown = round(kcal × scale) (half up); macros, nutrients, extras and line macros unrounded
  (R02.25); absent nutrients stay absent after scaling.

Our design differences / decisions:
- Names are ours (`UnitChoice`, `PickerUnit`, `normaliseChoices`, `pickerUnits`, `initialUnit`,
  `unitLabel`, `reviewBase`).
- The unknown-weight basis is its own picker kind (`servings`), not a unit named "serving"
  (R02.2), following the model in `src/domain/model.ts`.
- `UnitChoice.unit` is stored as its id (trimmed, lower-case), as `model.ts` documents.
- The serving word comes in as `{one, other}` and is pluralised by count (the reference shows one
  fixed word); a named `serving` unit and the serving count both use it.
- The initial quantity uses the saved count only when the opened unit is the saved unit.
- `scaleLine` lives in `scale.ts` (one place for every scaling rule); `ingredients.ts` uses it.

Tests we will write:
- `units.test.ts`: `normaliseChoices` (Verify example, cap of four, count fill), `pickerUnits`
  (grams first; serving count only when unknown, R02.1; recipe serving is a unit, R02.2),
  `initialUnit` (grams-first, saved unit, first unit, grams), `switchUnit`, `unitLabel` table,
  `basisFor` (never 100 g).
- `scale.test.ts`: `reviewBase`, `initialAmount`, ACC-D9-1 reopen at 2 servings, `scaleOf`,
  `scaleValues` (kcal rounded, rest unrounded, R02.25), `fromShown` (R02.3), `scaleDraft`.

Compare checklist (filled after the rewrite; reopened `A/models/ServingUnitOption.kt`,
`I/Views/ServingUnitEditor.swift`, `T/models/FoodServingRestoreTest.kt`,
`IT/FoodServingRestoreTests.swift`):
- [x] Unit list cleaning: trimmed lower-case ids, gram spellings, empty names, weights ≤ 0 and
  repeats dropped, first four kept (tested in `src/domain/servings/units.test.ts >
  normaliseChoices > keeps one slice from ["Slice", "slice", "g", a unit of 0 g]`, `> drops gram
  spellings, empty names and weights that are not finite and above 0`, `> keeps the first four of
  five valid units`).
- [x] Missing count filled with base ÷ grams each (`normaliseChoices > fills a missing or unusable
  count from the base weight, and keeps a given one`, `> leaves the count out when the base weight
  is unknown`).
- [x] Picker: grams first, then named units (`pickerUnits > offers grams first, then the named
  units, when the weight is known`); unknown weight → only the serving count (`> offers only the
  serving count when the weight is unknown, never grams (R02.1)`); a recipe serving with grams is
  a unit (`> treats a recipe "serving" unit with known grams as a unit choice, not the serving
  count (R02.2)`).
- [x] Initial unit: grams-first, saved unit by id, first unit, grams (`initialUnit > opens on grams
  when grams-first is on and the weight is known`, `> otherwise opens on the chosen unit when it
  is offered, matched by id`, `> falls back to the first named unit, then grams`, `> always opens
  an unknown weight on the serving count, even with grams-first (R02.1)`).
- [x] Unknown weight restores as a serving count, never grams, and re-logs without a weight
  (`src/domain/servings/scale.test.ts > reopening a saved entry > reopens an unknown-weight entry
  at its serving count and never offers grams (R02.1)`); known weight keeps its unit and count
  (`> reopens a known weight on its saved unit and count`); initial quantity in other units
  (`> opens other units at the base amount in that unit`).
- [x] Review base: weight, else count, else 1 (`scale.test.ts > reviewBase > is the known weight`,
  `> is the serving count when the weight is unknown`, `> falls back to the chosen count, then
  1`); never 100 g (`units.test.ts > basisFor and weightKnown > keeps a missing or broken weight a
  serving count, never 100 g (R02.1)`).
- [x] Unit switch keeps grams (`units.test.ts > switching units > keeps the amount when the unit
  changes`).
- [x] Labels: one within 0.0001, abbreviations, piece → pieces, "s" rule (`unitLabel > leaves a
  unit unchanged at one, or within 0.0001 of one, or with no quantity`, `> writes 2 pieces, 3
  cups, and keeps a unit that already ends in s`, `> never pluralises metric and kitchen
  abbreviations`); the serving word from the caller (`> uses the catalogue serving words for the
  serving count and a split serving unit`).
- [x] Scaling: kcal rounded, the rest unrounded (`scale.test.ts > scaleValues > rounds shown kcal
  and keeps macros, nutrients and extras unrounded (R02.25)`, `scaleDraft > stores base × scale
  unrounded except kcal, so review and logged totals agree (R02.25)`); typed ÷ scale
  (`fromShown > stores a value typed at the shown amount divided by the scale (R02.3)`, `> treats
  a scale of 0 or less, or not finite, as 1 (R02.3)`).
- Deliberate differences: unit ids are stored lower-case (the reference keeps the typed spelling
  for display); a count of 0 or less is refilled (the reference keeps any given count); the picker
  also keeps at most four units; grams-first is checked before the saved unit (the plan's order;
  the iOS helper checks the saved unit first); the initial quantity uses the saved count only for
  the saved unit; the serving word is pluralised from catalogue text (iOS shows one fixed word).
- Not taken: the amount field's typing and blur rules and the calculator row (P06-07); health
  store and share-link round trips of the iOS test (later phases, codecs in P02).

## Decisions for the lead

- `fromShown` returns the unrounded base, so a typed kcal can leave a fraction on the draft under
  review (301 at 2× → 150.5); the logged kcal is `round(base × scale)` through `scaleDraft`, which
  shows the typed 301 again. P06-08 should keep the fraction until Log rather than round the base.
- Picker ids: grams is `'g'`, the unknown-weight serving count is `'servings'` (kind `servings`); a
  named unit uses its id. They never share one picker list.
- Extra exports beyond the row: `MAX_UNITS`, `SERVING_UNIT`, `GRAMS_PICK`, `SERVINGS_PICK`,
  `PickerUnit`, `ServingWords`, `UnitState`, `isPositive`, `unitId`, `isGramUnit`, `weightKnown`,
  `basisFor`, `pickFor`, `withChoice`, `shownAmount`, `switchUnit` (units); `NutritionValues`,
  `initialAmount`, `scaleOf`, `scaleRecord`, `scaleValues`, `scaleLine`, `scaleDraft` (scale).
- `scaleDraft` scales values, lines and the basis only; the caller records the picked unit and
  quantity with `withChoice` when logging (P06-06).

## Status

Done (2026-10-26). `units.ts` (23 tests) and `scale.ts` (15 tests), all passing; nothing outside
the slice's files changed. Traps covered: R02.1, R02.2, R02.3, R02.25; acceptance row ACC-D9-1.
