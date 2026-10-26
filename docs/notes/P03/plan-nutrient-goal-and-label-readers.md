# Task: plan, nutrient-goal and label readers (P03-14) · Phase: 03 · Owner: builder (wt-p03s4b)

<!-- Save as platewise/docs/notes/P<nn>/<slug>.md. Write everything above "Compare checklist"
BEFORE writing code, in your own words. Never paste or paraphrase the reference line by line. -->

Read (reference @ `10e14b67`): `A/services/ai/FoodAnalysis.kt` (the optional-goal parse, the label
parse and the label's per-100 g scaling), `I/Services/GeminiService.swift` (the optional-goal
suggestion: only how its reply is parsed and merged, not the prompt; the label scaling), and for
the plan reply the domain validator we already have (`src/domain/goals/planValidator.ts`, P01-14).
Research spec `03-ai-providers.md` §3.6 (label result) and §3.11 (optional nutrient goals), spec
`01-profile-goals.md` §3.11; traps R01.10, R03.24, R03.25; decision D-16.57 (Android ranges, typed
values unsnapped, clamped 0–999 999) and D-16.58 (required numbers); acceptance ACC-C10-2.

What it does (own words): three small readers for the non-meal answers.
- `planReply.ts` reads a plan answer (`kcal`, `protein`, `carbs`, `fat`, `why`) and hands the raw
  values to `checkPlan`, the P01-14 validator, with the person's formula plan. The validator owns
  every rule (ranges, 4/4/9 coherence, the exact fit, plausibility); this reader only maps our keys
  (`why` becomes the plan's reason) and turns a refusal into an invalid answer, so the client tries
  the standby (D-16.22) and the person's targets stay as they are.
- `nutrientGoals.ts` reads the optional nutrient-goal answer after a successful plan rebuild. It is
  tolerant about the shape of each value (a number or a numeric string) and about key spelling (our
  key, snake_case, a unit suffix such as `sodium_mg`, and a few common alternates such as `fiber`),
  rounds each value to a whole number and clamps it to 0–999 999. It starts from the person's
  current goals and overwrites only the keys that came back, so a reply with only sodium changes
  only sodium (ACC-C10-2) and a typed 7.3 stays 7.3 (R01.10, D-16.57). An answer with nothing
  usable is a failure, and a failure never touches the goals (R03.25).
- `labelReply.ts` reads a nutrition-label answer whose values are per 100 g and scales it to the
  serving the person chose, G grams, by G ÷ 100: kcal rounded to a whole number (R03.24; the
  reference truncates on one platform), optional nutrients rounded to 0.1, macros left unrounded as
  everywhere else. Its unit list is read by `units.ts` against the label's printed serving; the
  first unit is chosen with its count derived from G. The label path itself is P2 (D29, D-16.62),
  but the reader is cheap and tested now.

Inputs → outputs:
- `readPlanReply(reply: unknown, formula: Targets)` → `Result<CheckedPlan, PlanReplyFailure>`
  (`invalidResponse`, with the validator's refusal attached when it was the validator).
- `readNutrientGoals(reply: unknown, current: GoalValues)` → `Result<GoalValues, SingleFailure>`.
- `readLabelReply(reply: unknown, grams: number)` → `Result<{ draft, needsRepair }, SingleFailure>`.

Files: created `src/ai/parse/planReply.ts`, `src/ai/parse/planReply.test.ts`,
`src/ai/parse/nutrientGoals.ts`, `src/ai/parse/nutrientGoals.test.ts`, `src/ai/parse/labelReply.ts`,
`src/ai/parse/labelReply.test.ts`, this note.

Edge cases / failure modes:
- Plan: not an object → invalid; numeric strings pass (the validator reads them); a missing,
  boolean or out-of-range value → invalid with the validator's step; `why` blank or not text → no
  reason; the reference's own key names are not read.
- Goals: not an object → failure; no recognised key, or only values that are not numbers (null, a
  word, a boolean, `"12 mg"`) → failure, current goals untouched; `"1500"` → 1 500; −3 → 0;
  2 345.6 → 2 346; 5 000 000 → 999 999; kcal and macro keys ignored; the two goal-less fats ignored;
  our own spelling wins over an alias of the same key; an alias with the wrong unit (`sodium_g`) is
  not read; the input goals object is never changed.
- Label: name blank → invalid; per-100 g kcal or a macro missing, non-numeric or negative →
  invalid (D-16.58); 250 kcal/100 g at 30 g → 75; 333 kcal/100 g at 33 g → 110 (109.89 rounded, not
  truncated); sodium 412 mg/100 g at 30 g → 123.6; a negative or non-numeric nutrient dropped; a
  unit list that fails the strict reader → no units and `needsRepair`; G not a finite number above
  0 → the label's printed serving, else 100 g (the per-100 g values describe exactly 100 g).

Our design differences / decisions:
- Plan keys are ours (`kcal`, `why`); every check is the domain validator's.
- Goal aliases are our own list built from our key names: the key itself, its snake_case form, either
  of those followed by the nutrient's own storage unit (`_g`, `_mg`, `_mcg`), compared without case,
  `_`, `-` or spaces; plus `fiber` and the L-forms of three amino-acid supplements. A unit suffix
  for another unit is not accepted (a gram figure read as milligrams would be off by 1 000).
- Values are rounded then clamped with the domain's `clampGoalValue`; the reference's iOS reader
  truncates and accepts only JSON numbers, its Android reader falls back to defaults (R01.10).
- Label reply shape is ours: `{ name, per100g: { kcal, protein, carbs, fat, nutrients }, servingGrams,
  units }`, where `servingGrams` is the printed serving the units describe.
- Label units: every kept unit's count is refreshed for G (G ÷ grams each), so the stored counts
  describe the stored amount; the reference keeps the label serving's count on the chosen unit.

Tests we will write:
- `planReply.test.ts`: a good reply becomes the validator's plan with the reason from `why`;
  numeric strings accepted; an out-of-range reply refused with the validator's step; a missing
  macro refused; not an object refused; the result equals `checkPlan` on the same values.
- `nutrientGoals.test.ts`: only sodium → only sodium changes (ACC-C10-2, R03.25); `"1500"`
  accepted; −3 → 0; rounding and the 999 999 ceiling; nothing parsable → failure and the goals
  unchanged; aliases and the wrong-unit alias; own key over alias; typed decimals untouched (R01.10).
- `labelReply.test.ts`: 250 → 75 at 30 g; 333 at 33 g → 110 rounded (R03.24); nutrients to 0.1;
  macros unrounded; required values; the first unit chosen with its count from G; a bad unit list
  flags repair; the fallback serving.

Compare checklist (filled after the rewrite; reopened the optional-goal parse, the label parse and
its scaling in `FoodAnalysis.kt`, the supplement rounding in `AminoAcid.kt`, and the optional-goal
merge and label scaling in `GeminiService.swift`):
- [x] Plan values go to the validator unchanged; refusals keep the targets (`src/ai/parse/planReply.test.ts
  > readPlanReply: our keys handed to the plan check (R01.2) > gives exactly what the plan check gives,
  with why as the reason`; `readPlanReply: a refused plan is an invalid answer, so the targets stay >
  refuses a plan the check refuses and names the check`, `> refuses a missing or non-numeric value`)
- [x] Goals start from current values and overwrite only returned keys (`src/ai/parse/nutrientGoals.test.ts
  > readNutrientGoals: only the goals that came back change (R03.25, R01.10) > changes only sodium when
  the answer gives only sodium (ACC-C10-2)`, `> keeps typed values it was not given exactly, never
  snapped or rounded`, `> never changes the goals it was given`)
- [x] Numbers or numeric strings, rounded, floored at 0, plus our 999 999 ceiling (`readNutrientGoals:
  values read tolerantly, rounded and clamped (D-16.57) > accepts "1500" as 1 500`, `> turns −3 into
  0`, `> rounds to a whole number and holds the ceiling at 999 999`, `> skips a value that is not a
  number and keeps the goal it had`)
- [x] Alias spellings incl. unit suffixes (`readNutrientGoals: other spellings of our keys > reads
  snake_case, spaced, capitalised and unit-suffixed spellings`, `> maps the snake_case, unit-suffixed
  spelling of each goal to that goal alone`, `> does not read a suffix for another unit, which would
  be off by 1 000`, `> prefers our own spelling over another spelling of the same goal, in any order`)
- [x] No parsed key → failure, goals untouched (`readNutrientGoals: nothing usable is a failure and
  never clears goals (R03.25) > refuses an answer with no usable goal, leaving the goals to the caller
  unchanged`, `> refuses an answer that is not an object`)
- [x] Label: name and per-100 g kcal and macros required (`src/ai/parse/labelReply.test.ts >
  readLabelReply: an unusable label is invalid (D-16.58) > refuses a missing or blank name`, `> refuses
  a missing per-100 g block`, `> refuses kcal or a macro that is missing, not a number or negative`)
- [x] Scale G ÷ 100, kcal rounded, nutrients and supplements to 0.1, macros unrounded (`readLabelReply:
  per-100 g values scaled to the serving (R03.24) > gives 75 kcal for 250 kcal per 100 g at 30 g`, `>
  gives 110 kcal for 333 kcal per 100 g at 33 g: rounded, not cut down to 109`, `> leaves the macros
  unrounded and rounds nutrients and extras to 0.1`)
- [x] Units read against the printed serving; first chosen; count from G (`readLabelReply: the first
  unit is chosen, its count from the serving > chooses the first unit with grams ÷ grams each as its
  count`, `> checks the units against the printed serving, not the chosen one`, `> reads an empty list
  as complete and a mangled one as needing repair`)
- Mutation check: truncating label kcal fails 1 test; starting the goals from zeros fails 7;
  accepting an answer with no parsed goal fails 2.
- Deliberate differences: our plan, goal and label keys; label kcal rounded (Android truncates);
  label count from G (the reference keeps the printed serving's count); negative per-100 g values are
  invalid (the reference keeps them); goal values must be numbers or numeric text (iOS reads a boolean
  as 1, Android falls back to defaults per key); a 999 999 ceiling (neither reader clamps above).
- Not taken: amino-acid estimates per 100 g (no domain keys); per-100 ml labels; the health-energy
  suggestion and the allergen-report readers (other areas).

## Decisions for the lead

- Label reply shape (`per100g` object, `servingGrams` as the printed serving) is ours; P2's label
  prompt (D29) should ask for it.
- `readLabelReply` falls back to the printed serving, then 100 g, when G is not a positive number.
- Nutrient-goal aliases: the list above; a wrong-unit suffix is not read.
- `PLAN_REPLY_KEYS` and `LABEL_REPLY_KEYS` are exported for the prompts (P03-16, later D29).

## Status

Done (2026-10-27). Created `src/ai/parse/planReply.ts`, `src/ai/parse/planReply.test.ts` (8 tests),
`src/ai/parse/nutrientGoals.ts`, `src/ai/parse/nutrientGoals.test.ts` (16 tests),
`src/ai/parse/labelReply.ts`, `src/ai/parse/labelReply.test.ts` (15 tests), this note. Nothing changed
outside the task's files. P03-18's `requestPlan` and `requestNutrientGoals` pass these readers as
`validate`; the label request is D29 (v1.x).
