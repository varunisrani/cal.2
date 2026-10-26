# Task: nutrient catalogue and goal defaults (P01-07) · Phase: 01 · Owner: builder (wt-p01b2)

<!-- Save as platewise/docs/notes/P<nn>/<slug>.md. Write everything above "Compare checklist"
BEFORE writing code, in your own words. Never paste or paraphrase the reference line by line. -->

Read (reference @ `10e14b67`): `A/models/NutrientGoals.kt` (all), `I/Models/OptionalNutrientGoals.swift`
(defaults, ranges, steps, upper limits and sanitising), `T/models/OptionalNutrientGoalsTest.kt`
(all), `IT/OptionalNutrientGoalsTests.swift` (all); to confirm the Android wheel column and the
typed-value sheet, the picker range, step and upper-limit helpers near the end of
`A/ui/settings/SettingsScreen.kt` and its wheel sheet (seeding, typing mode, 7-digit filter); the
Home picker's toggle in `A/ui/home/NutritionDetailSheet.kt`. Research spec `01-profile-goals.md`
§3.11, `05-home-progress.md` §3.2.3; decision D-16.57 (Android ranges). No Evidence ids.

What it does (own words): every optional nutrient, sports compound and macro has an id and a
storage unit (grams, milligrams or micrograms) so later screens can label it `nutrient.<id>` and
show amounts in the right unit. Of the 23 optional nutrients, 21 carry a daily goal (the two
unsaturated fats never do); together with the 8 sports compounds that makes 29 goals. Each goal
has a default, a kind (a limit is a ceiling, a target is something to reach), a wheel range and
step for the picker (Android's column, D-16.57) and, for eight nutrients, a general adult upper
limit that the picker mentions without blocking. A person may also type any whole number of up
to 7 digits; whatever is stored is clamped to 0–999 999 and never moved onto the wheel grid.
Vitamin D also shows its value in IU (mcg × 40). Home shows 1–4 chosen "pillars" from 32
nutrients (the three macros plus the 29 goal nutrients); the stored choice is cleaned on read
(trim, unknown dropped, duplicates dropped, first four kept, nothing left → protein, carbs, fat,
fibre) and the picker keeps at least one and swaps the newest pick when a fifth is chosen.

Inputs → outputs:
- `catalogue.ts`: `MASS_UNITS` / `MassUnit` (`g`, `mg`, `mcg`); `NUTRIENT_UNITS` (record over the 23
  keys); `EXTRA_UNIT` (`g`); `CATALOGUE_IDS` (3 macros + 23 nutrients + 8 extras, the label ids)
  with `CatalogueId`; `catalogueGroupOf(id)` → `macro` / `nutrient` / `extra`; `unitOf(id)` (macros
  and extras are grams); `GOALLESS_NUTRIENTS` (the two unsaturated fats); `GOAL_NUTRIENT_KEYS` (21);
  `GOAL_KEYS` (29) with `GoalKey` and `isGoalKey`; `PILLAR_KEYS` (32) with `PillarKey` and
  `isPillarKey`.
- `goalDefaults.ts`: `NutrientGoalKind` (`limit` / `target`); `GOAL_SPECS[key]` → `{ defaultValue,
  kind, wheel: {min, max, step}, upperHint? }`; `GoalValues` and `DEFAULT_GOAL_VALUES`;
  `GOAL_VALUE_MAX` (999 999); `GOAL_TEXT_MAX_DIGITS` (7); `clampGoalValue(n)`;
  `filterGoalText(raw)` → digits only, at most 7; `goalFromText(text)` → clamped number or null;
  `decodeGoalValues(stored)` → a full record (defaults for anything missing or unreadable, clamped
  values); `withGoalValue(goals, key, value)` → a copy with one clamped value; `isWheelValue(key,
  value)` (the picker opens in typing mode when false); `goalWheelStart(key, value)` → where the
  wheel opens; `isAboveUpperHint(key, value)`; `vitaminDIu(mcg)`.
- `pillars.ts`: `DEFAULT_PILLARS`, `MAX_PILLARS` (4), `decodePillars(stored)` (a comma-separated
  string or an array) → 1–4 keys; `togglePillar(selection, key)` → the new selection, or the
  same array when the change is refused; `pillarGoal(key, targets, goals)` → the macro's
  effective target or the optional goal (added during Compare).

Files: created `src/domain/nutrients/{catalogue,goalDefaults,pillars}.ts` and their `.test.ts`,
this note.

Edge cases / failure modes:
- Exactly 23 + 8 keys, 32 pillar keys, 29 goal keys, no duplicates; mono- and polyunsaturated fat
  are catalogue ids with a unit but no goal and no pillar.
- Defaults: sodium 2 300 mg limit, fibre 30 g target, trans fat 0 g limit, every sports compound
  0 g target with wheel 0–50 step 1.
- Typed values: "1234567" → 999 999; "" → null; anything with a non-digit → null; the filter
  keeps digits only and at most 7 of them. A stored 7.3 stays 7.3 and 17 mg of vitamin C stays 17
  (not snapped to the wheel); negative → 0; NaN → 0; +∞ → 999 999.
- Stored goals: not an object, an array or `null` → all defaults; a key missing or not a finite
  number → that key's default; unknown keys dropped; values clamped.
- Wheel: a value on the grid inside the range is a wheel value; off-grid or out of range is not.
  The opening value is the value rounded down to the step and kept inside the range.
- Upper hints only for calcium 2 500 mg, iron 45 mg, zinc 40 mg, vitamin A 3 000 mcg, vitamin C
  2 000 mg, vitamin D 100 mcg, vitamin E 1 000 mg, folate 1 000 mcg; exactly at the limit is not
  above it. Vitamin D 20 mcg = 800 IU.
- Pillars: `" fat ,fat, foo,protein"` → [fat, protein]; `""`, `[]`, `null`, `42`, only unknowns →
  default; more than four valid → first four; array members that are not strings are dropped.
- Toggle: removing the only pillar is refused; removing one of several keeps the others in order;
  adding a fifth replaces the most recently added (the last); adding to fewer than four appends.

Our design differences / decisions:
- Names are ours (`fibre`, `citrulline`, … from `src/domain/model.ts`); display names, short
  names, icons and unit words are UI catalogue copy for later slices (`nutrient.<id>`).
- Android wheel ranges and steps for every goal (D-16.57): fibre 0–100 step 1, sodium 0–5 000
  step 50, potassium 0–7 000 step 50, saturated fat step 1, cholesterol step 25.
- Stored goals are numbers and keep fractions (7.3 stays 7.3); the reference stores whole numbers.
  Typed values are whole numbers because the filter keeps digits only.
- A typed 7-digit value above 999 999 is clamped (the reference's sheet refuses it and keeps Save
  off; its model clamps). One rule for both paths.
- Our pillar list order is macros, then the goal nutrients in the model's key order (grams, mg,
  mcg), then the extras; the picker's visual order is the UI's to choose.
- The stored pillar choice may be a comma-separated string (the Verify vector) or an array; the
  reference's enum-name aliases are not accepted (our ids differ anyway).

Tests we will write:
- Catalogue: counts (23 + 8, 32 pillar, 29 goal), every unit as listed in the row, extras in
  grams, macros in grams, the two goal-less fats, guards accept members and reject near misses.
- Goal defaults: the full table (default, kind, Android range and step) for all 29; sodium 2 300
  limit, fibre 30 target, extras 0; `clampNutrientGoal` for 1 234 567, 7.3, 17, −1, NaN, ±∞;
  `filterGoalText` and `goalFromText`; `decodeNutrientGoals` fallbacks and clamping;
  `withNutrientGoal` leaves the input untouched; `isWheelValue` and `goalWheelStart`; upper hints
  and `isAboveUpperHint`; vitamin D 20 mcg = 800 IU.
- Pillars: decode vectors above; 1–4 choices round-trip; toggle add, replace-last, remove,
  refuse-last.

Compare checklist (filled after the rewrite; reopened `A/models/NutrientGoals.kt`,
`I/Models/OptionalNutrientGoals.swift`, `T/models/OptionalNutrientGoalsTest.kt`,
`IT/OptionalNutrientGoalsTests.swift`, the picker helpers and wheel sheet in
`A/ui/settings/SettingsScreen.kt`, the toggle in `A/ui/home/NutritionDetailSheet.kt`):
- [x] 32 pillar nutrients with g / mg / mcg units, macros and extras in grams
  (`src/domain/nutrients/catalogue.test.ts > goal and pillar keys > lets Home show 32 nutrients:
  protein, carbs, fat and the 29 goal keys`; `> catalogue > stores each optional nutrient in grams,
  milligrams or micrograms`, `> stores the extras and the macros in grams`).
- [x] 29 optional goals, the two unsaturated fats without one (`catalogue.test.ts > goal and pillar
  keys > gives 29 goals: every optional nutrient but the two unsaturated fats, and the 8 extras`).
- [x] Defaults and limit/target kinds; supplements 0 (`goalDefaults.test.ts > goal specs > matches
  the default, kind and Android wheel of every goal nutrient (D-16.57)`, `> defaults sodium to a
  2 300 mg limit, fibre to a 30 g target and supplements to 0`, `> has a spec for each of the 29
  goals`).
- [x] Android wheel ranges and steps, iOS column not used (D-16.57) (same test as above; `> puts
  every default inside its wheel`).
- [x] Stored values clamped to 0–999 999, not snapped (17 mg vitamin C stays 17; 1 000 000 →
  999 999; −1 → 0) (`goalDefaults.test.ts > custom goal values > clamps to 0–999 999 without
  snapping to the wheel`, `> sets one goal in a copy, clamped and not snapped`).
- [x] Typed field: digits only, at most 7 (`goalDefaults.test.ts > custom goal values > keeps
  digits only, at most seven, while typing`, `> reads a typed value and clamps it`).
- [x] Missing keys and unreadable records read as defaults, values sanitised on load
  (`goalDefaults.test.ts > decodeGoalValues > reads every goal as its default when the stored value
  is not a record`, `> fills missing or unreadable keys with defaults, clamps the rest and drops
  unknown keys`, `> returns a new record every time`).
- [x] Wheel seeding (rounded down to the step, kept in range) and typing mode for an off-wheel value
  (`goalDefaults.test.ts > goal picker > opens in typing mode for a value the wheel cannot show`,
  `> opens the wheel on the value rounded down to the step and kept in range`).
- [x] Upper-limit hints, strictly above (`goalDefaults.test.ts > goal picker > flags a goal above
  the general adult upper limit, only for the eight with one`); vitamin D IU (`> shows vitamin D in
  IU as mcg × 40`).
- [x] Pillar decode: trim, unknown and repeats dropped, first four, empty → default; 1–4 round
  trip (`pillars.test.ts > decodePillars > trims, drops unknown names and repeats, and keeps the
  picked order`, `> keeps one to four choices as they were stored`, `> keeps only the first four
  valid names`, `> falls back to protein, carbs, fat and fibre when nothing valid is left`).
- [x] Picker toggle: last one stays, fifth pick replaces the last added (`pillars.test.ts >
  togglePillar > refuses to remove the only pillar`, `> lets a fifth pick replace the most recently
  added one`, `> adds a new pick at the end while fewer than four are chosen`, `> removes a chosen
  pillar and keeps the others in order`).
- [x] Pillar goal source: macros from the effective targets, the rest from the optional goals
  (gap found in Compare; `pillars.test.ts > pillarGoal > takes macros from the targets and
  everything else from the optional goals`).
- Deliberate differences: Android wheel column for every goal (D-16.57); stored goals keep
  fractions (7.3 stays 7.3); a typed value above 999 999 is clamped instead of refused; the pillar
  list's order is ours (macros, goal nutrients in the model's key order, extras); the stored pillar
  list may be an array; IU returned as a number rounded to a whole unit, not text.
- Not taken: display names, short names, icons and unit words (UI catalogue, `nutrient.<id>`);
  per-pillar day totals (the day's nutrient sums belong to the Home slice); the reference's
  150 / 220 / 70 g macro fallback when no profile is loaded (R05.12: Home waits for the profile);
  the reference's enum-name aliases and `_g` / snake-case key variants when reading (the AI
  refresh parser is P03-14, R01.10); the comma-joined storage encoder.

## Decisions for the lead

- A typed custom goal above 999 999 (a 7-digit value) is clamped to 999 999, as the row says; the
  reference's sheet refuses it. Same clamp for every write path.
- Stored goals are plain numbers and keep fractions; only clamping applies (`clampGoalValue`).
  `decodeGoalValues` reads non-finite or non-numeric values as the key's default.
- `decodePillars` accepts a comma-separated string (the Verify vector) or an array of strings; we
  suggest P02's settings record stores an array.
- Our pillar order (`PILLAR_KEYS`) is macros, then the 21 goal nutrients in `NUTRIENT_KEYS` order,
  then the extras. The picker can reorder for display.
- `pillarGoal` added for the Home slice: macros read the effective targets, others the optional
  goals (0 = no goal).
- Extra exports beyond the row: `MASS_UNITS`, `CatalogueId`, `CATALOGUE_IDS`, `catalogueGroupOf`,
  `GOAL_NUTRIENT_KEYS`, `GOALLESS_NUTRIENTS`, `GOAL_TEXT_MAX_DIGITS`, `isWheelValue`,
  `goalWheelStart`, `isAboveUpperHint`, `pillarGoal`.

## Status

Done (2026-10-26). `src/domain/nutrients/{catalogue,goalDefaults,pillars}.ts` and their tests (34)
are in place, all passing. Nothing outside the slice's files changed. No traps owned; Verify
vectors of P01-07 all covered.
