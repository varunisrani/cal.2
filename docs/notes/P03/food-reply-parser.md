# Task: food reply parser (P03-12) · Phase: 03 · Owner: builder (wt-p03s4)

<!-- Save as platewise/docs/notes/P<nn>/<slug>.md. Write everything above "Compare checklist"
BEFORE writing code, in your own words. Never paste or paraphrase the reference line by line. -->

Read (reference @ `10e14b67`): `A/services/ai/FoodAnalysis.kt` (the food reply parse only: which
fields are required, defaults, the unknown-weight branch, how numbers are read),
`I/Services/GeminiService.swift` lines 1436–1700 (the iOS food parse: required JSON numbers, the
same unknown-weight branch), then `IT/ServingUnitFallbackTests.swift`
(`missingServingWeightRemainsUnknownInsteadOfBecomingOneHundredGrams`). Also
`A/services/ai/FoodAnalysisService.kt` around the multi-photo call, only to see where the
progressive flag comes from (the request, not the reply). Research spec `03-ai-providers.md` §3.6
and trap R03.15; decisions D-16.22 and Proposed D-16.58 (`18-phase-wise-build-plan.md`).

What it does (own words): turns the object a model returned for a food analysis (already cut out
of the text by P03-11) into the `NutritionDraft` the review sheet shows. The answer must name the
food and give kcal, protein, carbs and fat as numbers (a numeric string such as `"250"` is fine);
anything less is an unusable answer, which makes the client try the standby (D-16.22, D-16.58)
instead of showing a meal of zeros. kcal is rounded to a whole number; macros keep their decimals.
When the model gives no serving weight (or zero, or a negative one) the weight stays unknown: the
draft describes "1 serving", never an invented 100 g, and so the unit repair can never run on it
(R03.15). The optional nutrients and the 8 sports compounds are kept only when they are finite
and not negative; anything else is dropped, which means "unknown". The emoji is kept, the person's
note is kept on the draft, and the progressive flag the request was sent with is echoed. Unit
choices and parts are read by P03-13 from the same object; this reader leaves them empty.

Inputs → outputs: `readFoodReply(reply: unknown, { note?, progressive? })` →
`Result<NutritionDraft, SingleFailure>` (failure `{ kind: 'invalidResponse' }`). Exported key
constants (`FOOD_REPLY_KEYS`, `UNIT_REPLY_KEYS`, `PART_REPLY_KEYS`) are the contract's spelling,
for P03-13 and P03-15's `contract.ts`.

Files: created `src/ai/parse/foodReply.ts`, `src/ai/parse/foodReply.test.ts`, this note.

Edge cases / failure modes:
- Not an object (an array, a string, null) → invalid.
- `name` missing, not a string, or blank after trimming → invalid; the name is trimmed.
- kcal, protein, carbs or fat missing, null, a boolean, a non-numeric string (`"lots"`, `"12 g"`),
  NaN or infinite (a string `"NaN"`) → invalid. Negative → invalid (our choice, see below).
- `"250"` kcal → 250; 410.6 kcal → 411; 6.95 fat stays 6.95.
- `servingGrams` missing, null, 0, negative, non-numeric → servings basis with count 1 and no unit
  picked; a positive number or numeric string → grams basis.
- `nutrients` missing or not an object → no nutrients; a negative, NaN, null, string-word or
  boolean value → that key dropped; 0 kept (a known zero); numeric strings accepted.
- Unknown keys at the top level or inside `nutrients` → ignored.
- `emoji` blank or not a string → none.
- note: the request's note, trimmed; blank → none.
- progressive: the request's flag; when the caller passes none, the reply's `progressive: true`.

Our design differences / decisions:
- Our reply keys (`kcal`, `servingGrams`, `nutrients {<our keys>}`, `units`, `parts`) replace the
  reference's snake_case names (17-naming-and-glossary). The 8 sports compounds are read from the
  same `nutrients` object under the `ExtraKey` names of `src/domain/model.ts`: one object for every
  optional value keeps the contract small. (Decision for the lead, below.)
- Strictness: required numbers may be JSON numbers or numeric strings (Android's tolerance) but
  must be present and finite (iOS's strictness), per Proposed D-16.58; a missing macro is never 0.
- Negative kcal or macros are an invalid answer rather than kept or clamped: no food has them, and
  the standby is the better answer. (Decision for the lead.)
- The unknown weight is the servings basis of the domain model, not a unit named "serving" with an
  internal weight of 1.
- The draft's progressive flag is the request's; the reply's own `progressive` key is used only
  when the caller does not say.
- Amino acids are not read: the domain model has no keys for them yet (opt-in setting, later).

Tests we will write (`foodReply.test.ts`):
- a full valid reply → the expected draft (grams basis, rounded kcal, decimal macros, nutrients,
  extras, emoji, note, progressive, empty units and lines).
- the fake AI's `food-ok.json` reply text → a draft (via `parseModelJson`).
- `"250"` kcal accepted; missing protein → invalid; `"NaN"` fat → invalid; other bad required
  values (null, boolean, word, negative); blank name → invalid; non-object → invalid.
- no weight → servings basis with count 1, no chosen unit, never 100 g (R03.15); zero and negative
  weights the same.
- negative sodium dropped; NaN-like and boolean nutrient values dropped; 0 kept.
- unknown keys ignored, top level and inside `nutrients`.

Compare checklist (filled after the rewrite; reopened the food parse in `FoodAnalysis.kt`,
`GeminiService.swift` lines 1436–1700 and
`missingServingWeightRemainsUnknownInsteadOfBecomingOneHundredGrams`):
- [x] A non-empty name is required (`src/ai/parse/foodReply.test.ts > readFoodReply: an unusable
  answer is invalid, so the standby runs (D-16.58) > refuses a missing, blank or non-text name`)
- [x] kcal and the three macros required as finite numbers or numeric strings (`> refuses an answer
  without protein`, `> refuses NaN fat, as a JSON string or a number`, `> refuses each required
  value when it is missing, null, a word, a boolean or negative`; `readFoodReply: a usable answer
  becomes a draft > accepts numeric strings for kcal, the macros and the weight`)
- [x] kcal rounded, macros decimal (`> rounds kcal to a whole number and leaves the macros as they
  came`, `> maps every contract key to the draft, kcal rounded and macros decimal`)
- [x] Missing weight → unknown, one serving, never 100 g, no unit picked (`readFoodReply: a missing
  weight stays unknown (R03.15) > describes one serving, never 100 g, when the answer gives no
  weight`, `> treats a zero, negative, null or non-numeric weight as unknown`)
- [x] Optional nutrients and extras finite and ≥ 0, else dropped (`readFoodReply: optional
  nutrients and extras > drops a negative sodium and keeps the rest`, `> drops values that are not
  finite numbers at least 0, and keeps a known 0`, `> reads every nutrient key and every extra key
  of the domain model`)
- [x] Unknown keys ignored (`> ignores unknown keys at the top level and inside nutrients`, `> reads
  only the answer's own keys, not inherited ones`)
- [x] Emoji kept, note kept, progressive echoed from the request (`readFoodReply: a usable answer
  becomes a draft > trims the name and the emoji, and leaves out a blank emoji and a blank note`,
  `> echoes the request's progressive flag, and the answer's only when none was given`)
- [x] The fake AI's food reply reads (`> reads the fake AI's food answer, which uses our contract
  keys`); units and parts left to P03-13 (`> leaves unit choices and parts for their own readers`)
- Mutation check: defaulting a missing macro to 0 fails 3 tests; an unknown weight of 100 g fails 2.
- Deliberate differences: our contract keys; kcal rounded (both platforms truncate); a zero or
  negative weight is unknown (the reference keeps 0 as a known weight); booleans are never numbers
  (iOS reads `true` as 1); negative kcal or macros are invalid; negative optional values dropped.
- Not taken: amino-acid estimates (no domain keys yet); the per-key snake_case names; unit options
  and the parts breakdown with its macro totals (P03-13).

## Decisions for the lead

- The sports compounds (`ExtraKey`) travel in the reply's `nutrients` object next to the
  `NutrientKey` values; P03-15's contract should ask for them there.
- Negative kcal or macros make the answer invalid (standby runs).
- The draft's `progressive` is the request's flag; the reply's `progressive: true` counts only when
  the caller passes none.
- `FOOD_REPLY_KEYS`, `UNIT_REPLY_KEYS`, `PART_REPLY_KEYS` are exported from `foodReply.ts` for
  P03-13 (`units.ts`, `parts.ts`) and P03-15 (`contract.ts`).

## Status

Done (2026-10-26). Created `src/ai/parse/foodReply.ts`, `src/ai/parse/foodReply.test.ts`
(22 tests), this note. Nothing changed outside the task's files. Units and parts (P03-13) and the
`validate` hook that runs this reader (P03-18) are next.
