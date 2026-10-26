# Task: nutrient catalogue, goal defaults and Home pillars (P01-07) · Phase: 01 · Owner: builder (wt-p01b2)

<!-- Save as platewise/docs/notes/P<nn>/<slug>.md. Write everything above "Compare checklist"
BEFORE writing code, in your own words. Never paste or paraphrase the reference line by line. -->

Read (reference @ `10e14b67`): `A/models/NutrientGoals.kt` (all), `I/Models/OptionalNutrientGoals.swift`
(defaults, ranges, upper limits, sanitising), `T/models/OptionalNutrientGoalsTest.kt`,
`IT/OptionalNutrientGoalsTests.swift`; research spec `01-profile-goals.md` §3.11 (the table's
Android column), `05-home-progress.md` §3.2.3 (pillars and picker); decision D-16.57; naming
`17-naming-and-glossary.md` §1.3 (`goals.nutrients`, `home.pillars`). No Evidence ids.

What it does (own words): besides kcal and the three macros, an entry may carry 23 optional
nutrients (stored in grams, milligrams or micrograms) and 8 sports compounds (always grams). 21
of the optional nutrients and all 8 compounds can have a daily goal (29 goals); mono- and
poly-unsaturated fat are shown but never get one. Each goal has a starting value, a sense (a
limit to stay under, or a target to reach) and a wheel range and step for its picker, taken from
the Android column of 01 §3.11 (D-16.57). A person can also type any whole number up to 7 digits;
stored goals are kept inside 0–999 999 and are never moved onto the wheel grid. Eight nutrients
have a general adult upper intake; a goal above it gets a non-blocking hint, and vitamin D also
shows its IU (mcg × 40). Home shows 1–4 chosen "pillars" out of 32 (protein, carbs, fat and the 29
goal keys); a stored choice is cleaned on read and the picker keeps 1–4 picks, refuses to drop the
last one and lets a fifth pick replace the most recent one.

Inputs → outputs:
- `catalogue.ts`: `NUTRIENT_UNITS`/`NutrientUnit` (`g`, `mg`, `mcg`); `NUTRIENT_GROUPS`/
  `NutrientGroup` (`sugarsAndFats`, `minerals`, `vitamins`, `sports`); `CatalogueKey`
  (`NutrientKey | ExtraKey`), `CATALOGUE_KEYS` (31, display order); `GoalKey`, `GOAL_KEYS` (29),
  `isGoalKey`; `PillarKey`, `PILLAR_KEYS` (32), `isPillarKey`; `unitOf(key)` (macros are grams),
  `groupOf(key)`.
- `goalDefaults.ts`: `NUTRIENT_GOAL_RULES[key]` → `{ start, kind, wheel: StepRange, upperLimit? }`;
  `NutrientGoals` (a full record over the 29 keys), `DEFAULT_NUTRIENT_GOALS`;
  `clampNutrientGoal(n)`, `setNutrientGoal(goals, key, n)`, `readNutrientGoals(raw: unknown)`;
  `goalWheelValues(key)`, `isOnGoalWheel(key, n)`; `filterGoalText(text)`, `parseGoalText(text)`;
  `upperLimitExceeded(key, n)` → the limit or null; `vitaminDIu(mcg)`.
- `pillars.ts`: `DEFAULT_PILLARS`, `MAX_PILLARS`, `normalisePillars(keys)`, `readPillars(raw)`,
  `togglePillar(chosen, key)`.

Files: created `src/domain/nutrients/{catalogue,goalDefaults,pillars}.ts` and their `.test.ts`
files, this note. Imports `model.ts` lists and guards and `StepRange`/`clamp` from
`units/numbers.ts`; edits neither.

Edge cases / failure modes:
- Clamp: −1 → 0, 1 000 000 and 1 234 567 → 999 999, NaN → 0, +∞ → 999 999; 7.3 stays 7.3 and an
  off-grid 95 mg of vitamin C stays 95 (never snapped).
- Stored goals: not an object (null, an array, a string) → all defaults; a missing key, a string
  value, NaN or ∞ for one key → that key's default; a negative or huge value is clamped; unknown
  keys are dropped; the input is never mutated.
- Typed text: the filter keeps ASCII digits only and at most 7; parse refuses empty text, any
  non-digit and 8 digits; "1234567" → 999 999; "0" → 0; leading zeros are fine ("0030" → 30).
- Wheel: values are min, min+step, …, max; a value is "on the wheel" only when inside the range and
  on the grid (so the editor opens in typing mode for 95 mg of vitamin C or 7.3 g of omega-3).
- Upper-limit hint only when strictly above the limit (calcium 2 500 → none, 2 501 → 2 500); keys
  without a limit never hint.
- Pillar decode: accepts a comma-separated string or an array; trims each name, drops unknown names
  and non-strings, keeps the first of duplicates, keeps the first 4, falls back to protein, carbs,
  fat, fibre when nothing valid is left (or the value is neither a string nor an array).
- Pillar toggle: removing the only pick is refused (same list back); a new pick with 4 chosen
  replaces the last (most recently added) one; picks keep selection order.

Our design differences / decisions:
- Names are ours (`fibre`, `arginine`, `carnitine`, `citrulline` without the L- prefix in keys);
  one keyed record of 29 goals instead of named fields plus a side map for the compounds.
- Display order and groups are ours: sugars and fats (fibre, sugar, added sugar, saturated, trans,
  mono, poly, omega-3, cholesterol, caffeine), minerals, vitamins, sports compounds. Caffeine and
  fibre sit in the first group so P05-12 can show four groups.
- Ranges and steps are the Android column (D-16.57): e.g. fibre 0–100 step 1, sodium 0–5 000 step
  50, potassium 0–7 000 step 50, cholesterol 0–1 000 step 25 (iOS differs and is not used).
- Goals may hold non-integers (7.3 stays 7.3): clamping never rounds. Typed text is whole digits
  only, so a fraction can only arrive from elsewhere (an AI refresh or an import).
- The pillar decoder also takes an array, since the settings value (`home.pillars`) is free to be
  stored as a list (P02-04 decides).
- Labels, short labels and the "Limit"/"Target" words are UI copy (catalogue, P05/P07); this module
  returns keys and numbers only.

Tests we will write:
- Catalogue: 23 + 8 keys with the listed units; 31 display keys, each once; 29 goal keys without
  mono/poly; 32 pillar keys starting with the macros; guards accept members and reject near misses
  (`fiber`, `Protein`, `monounsaturatedFat` as a goal); groups cover every key.
- Goal rules: one rule per goal key; sodium 2 300 mg limit, fibre 30 g target, each compound 0 g
  target 0–50 step 1; the full Android table as a vector; every wheel min/max on its step grid;
  limit/target split; upper limits for the eight nutrients only.
- Custom values: 1 234 567 → 999 999, −1 → 0, 7.3 stays, 95 vitamin C stays; text filter and
  parse; `isOnGoalWheel` for on-grid, off-grid and out-of-range values; vitamin D 20 → 800 IU.
- Stored goals decode table.
- Pillars: `" fat ,fat, foo,protein"` → [fat, protein]; arrays; five valid → first four; empty,
  unknown-only, non-string → defaults; toggle add, remove, last refused, fifth replaces the most
  recent, repeated fifth picks keep replacing the latest.

Compare checklist (filled after the rewrite; reopened `A/models/NutrientGoals.kt`,
`I/Models/OptionalNutrientGoals.swift`, `T/models/OptionalNutrientGoalsTest.kt`,
`IT/OptionalNutrientGoalsTests.swift`):
- [x] Starting values and limit/target split for all 29 goals, compounds at 0 (tested in
  `src/domain/nutrients/goalDefaults.test.ts > goal rules > starts sodium at a 2 300 mg limit,
  fibre at a 30 g target and every compound at 0`, `> uses the Android starts, kinds, ranges and
  steps for the 21 nutrients (D-16.57)`).
- [x] Clamp 0–999 999 on set, never snapped to the wheel (the reference's vitamin C and
  too-high/negative cases) (`goalDefaults.test.ts > custom goals > clamps to 0–999 999: 1 234 567
  → 999 999 and −1 → 0`, `> never snaps a value to the wheel: 7.3 stays 7.3 and 95 mg of vitamin C
  stays 95`).
- [x] Stored record: missing keys read as their starting value, values sanitised on read, a
  record that cannot be read gives the defaults (`goalDefaults.test.ts > readNutrientGoals > gives
  every starting value for anything but a plain object`, `> fills missing or unreadable keys with
  their starting values`, `> clamps stored values without rounding them and drops unknown keys`).
- [x] Upper-limit table and vitamin D IU = mcg × 40 (`goalDefaults.test.ts > hints > has upper
  limits for exactly eight nutrients`, `> names the upper limit only when a goal is above it`,
  `> gives vitamin D in IU as mcg × 40: 20 mcg = 800 IU`).
- [x] Units for the 23 nutrients, compounds in grams (`catalogue.test.ts > units > stores each of
  the 23 optional nutrients in grams, milligrams or micrograms`, `> stores the 8 sports compounds
  and the macros in grams`); 32 pillar choices (`catalogue.test.ts > catalogue lists > offers 32
  pillars: the macros first, then the 29 goal keys`).
- [x] Pillar decode: trim, unknown dropped, duplicates dropped, first 4, empty or unknown-only →
  protein, carbs, fat, fibre; 1–4 choices survive a round trip (`pillars.test.ts > readPillars >
  trims names, drops unknown ones and repeats: " fat ,fat, foo,protein" → fat, protein`, `> keeps
  one to four choices in their stored order`, `> keeps only the first four valid choices`, `> falls
  back to protein, carbs, fat and fibre when nothing valid is left`).
- [x] Picker rule from the spec (not in the files read): last pick cannot be removed, a fifth
  replaces the most recent (`pillars.test.ts > togglePillar > refuses to remove the only chosen
  nutrient`, `> lets a fifth pick replace the most recently added one`).
- Deliberate differences: Android ranges and steps (D-16.57, iOS column not used); one keyed record
  of 29 goals; display order and groups are ours; the pillar decoder matches only our key names
  (the reference also accepts its enum spellings) and also takes a list; goals may hold fractions.
- Not taken: the reference's fallback macro goals for a missing profile (R05.12 says no fallback
  flashes; P04/P07), the per-pillar day sums (P07-03/P07-16), labels, short labels, icons and the
  "IU" detail text (UI copy).

## Decisions for the lead

- Goals keep fractions: clamping never rounds, so 7.3 stays 7.3 (the Verify vector). Typed text is
  whole digits only (01 §3.11), so fractions come only from the AI refresh or an import; P03-14
  rounds AI values before they arrive.
- Group ids are ours: `sugarsAndFats` (fibre, sugar, added sugar, saturated, trans, mono, poly,
  omega-3, cholesterol, caffeine), `minerals`, `vitamins`, `sports`, so P05-12 can show the four
  groups its row names. Caffeine and fibre sit in the first group.
- `readPillars(raw: unknown)` takes a comma-separated string or a list and returns a list; P02-04
  may store `home.pillars` either way (a list is simpler).
- `togglePillar` returns the same picks when removing the last one is refused (no flag); the UI can
  compare lengths if it wants to react.
- No change to `model.ts` was needed: the unit and goal lists are built here from its
  `NutrientKey`/`ExtraKey` types, as its comment intends.
- Extra exports beyond the phase row: `NUTRIENT_UNITS`, `NUTRIENT_GROUPS`, `CATALOGUE_KEYS`,
  `isCatalogueKey`, `groupOf`, `GoalNutrientKey`, `NUTRIENT_GOAL_KINDS`, `MAX_NUTRIENT_GOAL`,
  `GOAL_TEXT_MAX_DIGITS`, `goalWheelValues`, `isOnGoalWheel`, `filterGoalText`, `parseGoalText`,
  `VITAMIN_D_IU_PER_MCG`, `normalisePillars`, `MAX_PILLARS`.

## Status

Done (2026-10-26). `catalogue.ts`, `goalDefaults.ts`, `pillars.ts` and 38 tests, all passing;
nothing outside the slice's files changed. Handed on: the goals editor (P05-12), the AI goal
refresh (P03-14, R01.10), pillars and the picker (P07-03, P07-04), the settings schema (P02-04).
