# Task: domain model types (P01-01) · Phase: 01 · Owner: builder (wt-p01a)

<!-- Save as platewise/docs/notes/P<nn>/<slug>.md. Write everything above "Compare checklist"
BEFORE writing code, in your own words. Never paste or paraphrase the reference line by line. -->

Read (reference @ `10e14b67`): `A/models/FoodEntry.kt` (all), `A/models/UserProfile.kt` (the
field list only, lines 40–71), research spec `02-food-logging.md` §3.1 (with §3.3, §3.10, §3.13,
§3.15, §3.16 for the shapes the record nests), `01-profile-goals.md` §3.1, `04-coach.md` §3.7
(message shape), `05-home-progress.md` §3.5.4, §3.6, §3.7.1 (body fat, water, fast shapes),
`17-naming-and-glossary.md` §1 and §3, phase files P02 (table indexes) for the field names later
layers already expect. No Evidence ids.

What it does (own words): one module, `src/domain/model.ts`, that names every record the layers
pass to each other: a diary entry, the draft an analysis produces before review, the pieces they
hold (unit choices, serving basis, ingredient lines, product details, optional nutrient values),
the profile, the four-number plan, weigh-ins, body-fat readings, water logs, fasts, saved meals,
Coach messages, meal times and the stored analysis draft. It is types only, plus the closed lists
of string values (meal kinds, entry sources, nutrient and extra keys, macro keys, sex, activity,
goal, Coach roles) and a runtime guard for each list, because the storage codecs (P02-02) and the
AI reply parsers (P03) must check untrusted strings before they become one of these unions. One
extra validator checks the locked-macro list (macro keys, no repeats, at most two).

Inputs → outputs: none at runtime except the guards: `unknown` → `value is <Union>`.

Files: created `src/domain/model.ts`, `src/domain/model.test.ts`, this note.

Edge cases / failure modes:
- A guard must reject case variants (`Snack`), the empty string, padded strings, non-strings,
  and near spellings of our own values (`photos`, `fiber`, `very active`, `maintenance`).
- An unknown optional nutrient is absent, never 0: `NutrientValues` is a partial record, so a
  missing key type-checks and reads as `undefined`.
- The unknown-weight basis must not be a unit that happens to be called "serving" (R02.2): it is
  its own `kind` in a discriminated union, so code has to branch on `kind` to read grams.
- `lockedMacros` holds at most two keys; TypeScript cannot express "length ≤ 2" on a readonly
  array without making every caller fight tuple types, so the type is a readonly array and the
  validator enforces the length (decision from the lead).
- A fast's `end` is `null` while it runs (the phase row's shape), not a missing key.

Our design differences / decisions:
- Names are ours (17 §1): `DiaryEntry`, `NutritionDraft`, `UnitChoice`, `ServingBasis`,
  `IngredientLine`, `ProductInfo`, `Profile`, `Targets`, `MealTimes`, `AnalysisDraft`. The
  reference's legacy profile fields (the unused balance macro and the "use body fat" flag) and the
  person's name are dropped (spec 01 §3.1 says the name is never edited; the decision is final).
- Saved targets are one nested partial record `saved: Partial<Targets>` instead of four loose
  fields, so the lock and auto-balance code (P01-13) can index it by macro key.
- Birth date is a local day key (`YYYY-MM-DD`), not an instant (R01.15).
- Extras drop the "L-" prefix in their keys (`arginine`, `carnitine`, `citrulline`); amino-acid
  estimates are not modelled (16: N-7).
- `NutritionDraft` lives here, not in `src/ai/`, because P01-10/11 (domain) and P03-12 (AI parser)
  both need it and the domain imports nothing outside itself. `DiaryEntry` and `SavedMeal` extend
  it with identity, time and photos.
- Ingredient lines carry no id (the domain cannot mint ids; lists are edited by position).
- Product data source is `'fdc'` (our id for FoodData Central everywhere else).
- Coach message `state` holds only a failure marker (kind as a string, optional details); the
  pending state is in memory (P08-09), not stored.
- Arrays in records are `readonly`, so domain functions cannot mutate a record they were given.
- `DayKey` is a plain `string` alias (imported from `dates/dayKey.ts`), not a branded type, so
  literals and stored strings need no casts; codecs check with `isDayKey`.

Tests we will write:
- Each guard accepts every member of its list and rejects `''`, a case variant, a padded copy,
  a near spelling, `null`, `undefined`, a number, an array and an object.
- The lists have the documented sizes (5 meal kinds, 5 sources, 23 nutrients, 8 extras, 3 macros,
  6 activity levels) with no repeats and no overlap between nutrients and extras.
- `isLockedMacros`: accepts `[]`, one key, two keys; rejects three keys, a repeat, an unknown key
  and a non-array.
- `expectTypeOf`: `ServingBasis` narrows by `kind` (grams only on the grams kind, count only on
  the servings kind); `Profile['lockedMacros']` is `readonly MacroKey[]`; `NutrientValues` entries
  are `number | undefined` and `{}` is a valid value; `Fast['end']` is `number | null`;
  `Profile['birthDate']` is a `DayKey`.

Compare checklist (filled after the rewrite; reopened `A/models/FoodEntry.kt`,
`A/models/UserProfile.kt` lines 40–71):
- [x] Every field of the reference's logged-food record has a home: core values, instant, photos,
  emoji, source, meal, the 23 optional nutrients, the extras map, serving weight, unit options,
  chosen unit and count, note, progressive flag, ingredient lines, product details (tested in
  `src/domain/model.test.ts > closed lists > have the documented sizes and no repeats` and
  `> record types > store birth dates as day keys and a running fast with a null end`).
- [x] Nutrients, extras and macros never share a key (`model.test.ts > closed lists > keep
  nutrients, extras and macros apart`).
- [x] Each string union has a guard that accepts every member and rejects near misses
  (`model.test.ts > union guards > accept every one of the meal kinds`, `> reject near misses of
  the meal kinds`, the same pair for each list, and `> reject the case variant Snack and the empty
  string as meal kinds`).
- [x] Locked macros behave as a set of at most two (`model.test.ts > isLockedMacros > accepts no
  locks, one lock and two different locks`, `> rejects three locks, a repeated lock, an unknown
  key and a non-array`); the type is a readonly array (`> record types > type lockedMacros as a
  readonly array of macro keys`).
- [x] Unknown weight is a kind of its own, and "weight known" means finite and above 0 (written on
  the type; `model.test.ts > record types > make ServingBasis a union discriminated by kind`).
- [x] Absent optional nutrient = unknown (`model.test.ts > record types > make optional nutrients
  partial so absent means unknown`).
- [x] Profile fields: sex, birth date, height, weight, activity, goal, body fat, goal body fat,
  weekly pace, goal weight, four saved targets, allergens, calorie lock, macro locks (type only;
  `> record types > type lockedMacros as a readonly array of macro keys`).
- Deliberate differences: no person's name and no legacy fields (the unused balance macro and the
  "use body fat" flag; spec 01 §3.1 already says neither is read by the maths); saved targets are
  one nested `saved: Partial<Targets>`; birth date is a day key, not an instant (R01.15); photos
  are one ordered id list (first = primary) instead of a primary file plus extras; the unknown
  weight is a `servings` kind instead of an absent weight plus a unit named "serving"; extras keys
  drop the "L-" prefix; product source is `'fdc'`; a draft type separate from the entry.
- Not taken: the record's derived helpers (favourite key: D-16.17 gives saved meals their own ids;
  weight-known and review reference: P01-09; duplicating for a re-log: P06; gallery and thumbnail
  photo order and photo removal: P02-07 / P06); the two health-store fields (later phase); amino
  acids (N-7); "a missing meal decodes as other" belongs to the P02-02 codec.

## Decisions for the lead

- `NutritionDraft` is defined here (domain), because P01-10/11 and P03-12 both need it and the
  domain cannot import from `src/ai/`. `DiaryEntry` and `SavedMeal` extend it.
- Nutrient keys: `addedSugar, fibre, monounsaturatedFat, omega3, polyunsaturatedFat,
  saturatedFat, sugar, transFat, caffeine, calcium, cholesterol, iron, magnesium, potassium,
  sodium, vitaminC, vitaminE, zinc, folate, vitaminA, vitaminB12, vitaminD, vitaminK`; extras:
  `arginine, betaAlanine, betaine, carnitine, citrulline, creatine, hmb, taurine`. P01-07 and the
  P03 reply contract should use these names.
- Type names chosen where the plan named none: `Sex`, `Activity`, `GoalKind`, `MacroKey`,
  `CoachRole`, `SavedTargets`, `ExtraValues`, `NovaGroup`, `CoachMessageState`; list constants
  are UPPER_SNAKE (`MEAL_KINDS`, …) with `MAX_LOCKED_MACROS = 2`.
- `SavedMeal` = draft + `id`, `order`, `originEntryId?`, `source`, `photoIds` (no meal kind: the
  meal is chosen when it is logged again). `WeighIn {id, at, kg}`, `BodyFatReading {id, at,
  fraction}`, `WaterLog {id, at, dayKey, ml}`.
- `CoachMessage.state` is `{status: 'failed', kind, details?}` only; P08-09 may widen it.
- Ingredient lines have no id (domain functions cannot mint ids); if the UI needs stable keys,
  P06 can add one.
- `DayKey` is a plain string alias; tighten to a template-literal type later if wanted.
- Follow-up for P02-02/P03-12 codecs: a grams basis only when grams is finite and > 0; a missing
  meal reads as `other`.

## Status

Done (2026-10-26). `src/domain/model.ts` and its tests are in place; nothing outside the task's
files changed. 28 tests in `model.test.ts`, all passing (run with TZ=America/New_York).
