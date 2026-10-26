# Task: food and planning tasks with unit repair (P03-18) · Phase: 03 · Owner: builder (wt-p03s6)

<!-- Save as platewise/docs/notes/P<nn>/<slug>.md. Write everything above "Compare checklist"
BEFORE writing code, in your own words. Never paste or paraphrase the reference line by line. -->

Read (reference @ `10e14b67`): `A/services/ai/ServingUnitRepairPolicy.kt` and
`I/Services/ServingUnitRepairPolicy.swift` (when the repair request is worth its wait),
`T/services/ai/ServingUnitRepairPolicyTest.kt` (usable macros skip it; a valid list never
repairs; zero-energy foods with a known weight get it; an unknown weight never does; labels follow
the same rule); `A/services/ai/FoodAnalysisService.kt` for intent only: the photo, text and label
entry points and how each hands the first photo and the note to the repair, the repair request's
inputs, `calculateGoals`, `estimateOptionalNutrientGoals` and `suggestMealWhatIf` (a text call
with JSON mode off). Research spec `03-ai-providers.md` §3.5 (entry points, photo count, note),
§3.6 (reply contract), §3.7 (unit repair), §3.11 (fit check, nutrient goals, plan); traps R03.15,
R03.16, R03.17; decisions D-16.22, D-16.23, Proposed D-16.58, D-16.60, D-16.62.

What it does (own words): the entry points the screens and services call. Each one builds our
prompt, sends it through the client with a reader that turns the answer into a typed result, so
an answer that does not read (no name, no kcal, a refused plan) sends the standby in (D-16.22).
A food answer is read into a draft: the totals, the parts breakdown (kept only when it adds up),
and the unit choices. When the unit list was missing or mangled and the food has a known weight
but no energy or macros at all (water, black coffee), the units are what make the entry usable
("1 cup"), so one more short request asks for the unit list alone, with the food's name, weight,
the note and the first photo. Its answer replaces the units only when it gives some; any failure
of that request leaves the first analysis as it was. Pizza with no units list does not trigger
it: the person can log grams, and the extra request would double the wait. The repair runs inside
the same time limit as the analysis (D-16.60). The planning tasks ask for the daily plan (checked
by the plan rules, so an out-of-range plan goes to the standby), the optional nutrient goals
(starting from the person's current goals) and the fit check (a few plain sentences, no JSON,
served by the text provider and its standby).

Inputs → outputs:
- `analyzePhotos({ images, note?, progressive? }, deps)` → `Result<NutritionDraft, AiFailure>`;
  only the first ten non-empty photos are sent.
- `analyzeText(text, deps)` → the same; the typed text is also the repair's note.
- `analyzeLabelScan({ images, note? }, deps)` → the same, through the photo path with the label
  hint (Proposed D-16.62); the caller stores it with source label.
- `readFoodAnswer(text, context)` → `{ draft, needsRepair }` or invalidResponse (the validator).
- `needsUnitRepair(reading)` and `repairUnitsIfNeeded(reading, { note?, photo? }, deps)`.
- `requestPlan({ profile, today, units, evidence? }, deps)` → `Result<CheckedPlan, AiFailure>`.
- `requestNutrientGoals({ profile, today, units, targets, current }, deps)` →
  `Result<GoalValues, AiFailure>`.
- `fitCheck(input, deps)` → `Result<string, AiFailure>` (the trimmed sentences).
`deps` are the client's (`settings`, `keys`, `fetch`, optional `deadline`, `cancel`,
`imageBackend`).

Files: created `src/ai/tasks/food.ts`, `src/ai/tasks/food.test.ts`, `src/ai/tasks/planning.ts`,
`src/ai/tasks/planning.test.ts`, this note.

Edge cases / failure modes:
- 11 photos → the first 10 sent; empty blobs are skipped before counting; no usable photo at all
  → `imageConversion` with no request.
- Coffee: 0 kcal, 0 g macros, 240 g, no units key → one repair request, its units applied and the
  first one chosen.
- Pizza with no units key → no repair (energy present). An empty units list → no repair (a
  complete answer). Unknown weight → no repair (R03.15). Fat 0.4 g and nothing else → no repair.
- Repair answer: units fitting 240 g → applied; an empty list → first result kept; a mangled list
  or unreadable JSON → invalid, so the standby gets the repair, and if it fails too the first
  result is kept; the repair's provider fails (busy, key) → first result kept; the time limit
  runs out during the repair → first result kept; Cancel during the repair → `cancelled`.
- The repair's request carries the notes for the AI (client), the first photo for a photo
  analysis and none for a typed one.
- Plan reply out of range (kcal 9 000) → invalid → the standby; both refuse → bothFailed.
- Nutrient goals: only the keys that came back change; nothing usable → invalid → standby.
- Fit check: prose, JSON mode off, the text role when it is on, the text standby.

Our design differences / decisions:
- Every entry point validates inside the client, so an unusable answer reaches the standby
  (D-16.22); the reference parses after its router.
- One deadline per action: the food task starts it (or takes the caller's) and hands it to both
  the analysis and the repair (D-16.60), so the repair can never stretch the wait past the
  setting.
- Cancel during the repair is returned as `cancelled` (the person stopped the action); every
  other repair failure, the time limit included, keeps the first result (R03.17).
- The repair answer is read strictly by `readUnits`: a mangled list is an invalid answer (standby
  tries), an empty list is a valid "no unit fits" and changes nothing.
- No usable photo → `imageConversion` (the iOS choice; the Android build says invalid answer):
  the message "the photo could not be prepared" fits better.
- Label scan is the photo request with the label hint (Proposed D-16.62); the per-100 g label
  reader stays for v1.x.
- Names are ours: `readFoodAnswer`, `needsUnitRepair`, `repairUnitsIfNeeded`, `MAX_MEAL_PHOTOS`.

Tests we will write (`food.test.ts`, `planning.test.ts`, fake fetch on Gemini and an Anthropic
standby, fake image backend, fake timers):
- Coffee (0 kcal, 240 g, units missing) → exactly one repair request with the name, the weight to
  one decimal, the note and the first photo; its units applied and chosen (ACC-E9-1, R03.17).
- Pizza with units missing → one request only (ACC-E9-1).
- Repair failure (provider error; mangled list; empty list; time limit) → the first result.
- Cancel during the repair → cancelled.
- The repair runs inside the analysis's deadline: a handed-in deadline is shared, the time limit
  covers both.
- 11 photos → 10 sent, empty ones skipped; none usable → imageConversion and no request.
- An unusable food answer (no protein) goes to the standby.
- Text analysis: the text prompt, no photos, the text role; the repair carries the typed text.
- Label scan: label hint in the prompt, photos sent, progressive off.
- Parts kept replace the totals; the reading keeps `needsRepair`.
- `needsUnitRepair` table: flagged + known + all ≤ 0 only.
- Plan: valid reply → checked plan; out-of-range → standby → plan; evidence text reaches the
  prompt.
- Nutrient goals: only returned keys change; unusable → standby.
- Fit check: the text role and the text standby, JSON mode off, trimmed text.

Compare checklist (filled after the rewrite; reopened `ServingUnitRepairPolicy.kt`,
`ServingUnitRepairPolicy.swift`, `ServingUnitRepairPolicyTest.kt`, `FoodAnalysisService.kt`):
- [x] The repair rule: a flagged list, a known weight and kcal, protein, carbs and fat all ≤ 0;
  usable macros (fat 0.4 g alone included) skip it; a valid list never repairs; an unknown weight
  never does (`src/ai/tasks/food.test.ts > needsUnitRepair (R03.17) > asks only for a flagged
  list, a known weight and no energy or macros at all`, `> never asks for a food of unknown weight
  (R03.15)`)
- [x] Coffee gets one repair request with the name, the weight, the note and the first photo;
  its units replace the empty list and the first is chosen (`analyzePhotos: the unit repair
  request (R03.17, ACC-E9-1) > asks once more for the units of black coffee and applies them
  (ACC-E9-1)`); pizza does not (`> does not ask again for a pizza without units (ACC-E9-1)`); an
  empty list in the first answer does not (`> does not ask again when the answer gave an empty
  unit list`)
- [x] Repair failures keep the analysis, as the reference's catch-all does (`> keeps the first
  result when the repair request fails`, `> keeps the first result when the repair answer offers
  no unit`, `> asks the standby when the repair list is mangled, and keeps the first result if it
  fails too`, `> runs the repair inside the analysis time limit and keeps the first result when
  it runs out (D-16.60)`); Cancel stops the action (`> stops with cancelled when Cancel comes
  during the repair request`); the deadline is shared (`> shares a deadline handed in between the
  analysis and the repair, and leaves it running`)
- [x] Photo entry: empty photos dropped, at most ten (`analyzePhotos: the photos sent (03 §3.5) >
  sends only the first ten photos that hold bytes, in order`, `> fails as imageConversion and
  sends nothing when no photo holds bytes`); the step-by-step flag only with two photos or more
  (`> asks for a plate built in steps only with two photos or more`); an unusable answer reaches
  the standby (`> sends an unusable answer to the standby and returns the standby draft
  (D-16.22)`)
- [x] Typed text: the description goes to the repair as its note, without a photo (`analyzeText >
  sends the description to the text role and carries it to the repair request`)
- [x] Label scan through the photo path (`analyzeLabelScan (Proposed D-16.62) > sends the photos
  with the label request, through the photo path, progressive off`)
- [x] The food reader: parts kept as totals, units, needsRepair kept, D-16.58 refusals
  (`readFoodAnswer: the reader the client runs on a food answer > reads the draft, keeps parts
  that add up as the totals, and the unit choices`, `> keeps needsRepair when the unit list is
  missing or mangled`, `> refuses an answer without protein, so the client asks the standby
  (D-16.58)`)
- [x] Plan request checked against the formula plan; a refused plan reaches the standby
  (`src/ai/tasks/planning.test.ts > requestPlan (01 §3.6, R01.2) > returns the checked plan with
  its reason`, `> asks the standby when the plan is out of range, and returns its plan
  (D-16.22)`, `> gives bothFailed with the standby refusal when both plans are refused`, `> sends
  the evidence text when there is an evidence pack`)
- [x] Nutrient goals start from the current goals, not the defaults (R03.25) (`requestNutrientGoals
  (03 §3.11, R03.25) > changes only the goals the answer gave, starting from the current ones`,
  `> asks the standby when the answer holds no usable goal`)
- [x] Fit check: a text call with JSON mode off, the answer trimmed (`fitCheck (03 §3.11) > uses
  the text role when it is on, with JSON mode off, and returns the trimmed sentences`, `> falls
  back to the text standby, never the photo standby`)
- Mutation check: kcal-only repair rule (1 test fails), repair failure surfaced (3), the repair on
  its own deadline (1), no ten-photo cap (1), Cancel during the repair keeps the first result
  (1), no weight check (1); planning: JSON on for the fit check (1), goals not from the current
  ones (1), the plan judged against another formula plan (2). Applying an empty repair list is
  equivalent (the draft has no units when a repair runs), so the explicit check stays for
  reading only.
- Deliberate differences: validation inside the client on every entry point, the repair's answer
  included (D-16.22); one deadline for the analysis and its repair (D-16.60); Cancel during the
  repair returns `cancelled` (the reference's catch-all would swallow it, then drop the result
  with the cancelled job); no usable photo → `imageConversion` (Android says invalid answer);
  ten photos at most in the task itself (the reference caps in its pickers); the step-by-step
  flag is kept only with two photos or more (the reference copies the toggle as it was); nutrient
  goals fall back to the current goals per key (R03.25); the label scan uses the photo request
  (Proposed D-16.62), so the per-100 g label repair variant is not built.
- Not taken: the single-photo, auto and per-100 g label entry points (03 §3.5; the label reader
  is P2); amino acids (not in our settings); the health-energy and workout requests (other
  phases).

## Decisions for the lead

- No usable photo → `imageConversion` with no request (the iOS choice); empty blobs are dropped
  before the ten-photo cap.
- Cancel during the repair returns `cancelled`; every other repair failure, the time limit
  included, keeps the first result.
- The repair answer is validated by `readUnits`: a mangled list is an invalid answer (the standby
  gets the repair), an empty list is valid and changes nothing.
- The typed description is the repair request's note (the stated amounts are the evidence for a
  count); the draft from a typed meal carries no note.
- The draft's progressive flag is what the request used (`usesProgressive`: the toggle and two
  photos or more).
- `requestPlan`, `requestNutrientGoals` and `fitCheck` take the prompt builders' inputs
  (`PlanPromptInput` with `today` and display units, etc.), since the prompts need them; P05-05
  hands in its own 60 s deadline through `deps.deadline`.

## Status

Done (2026-10-27). Created `src/ai/tasks/food.ts`, `src/ai/tasks/food.test.ts` (20 tests),
`src/ai/tasks/planning.ts`, `src/ai/tasks/planning.test.ts` (8 tests), this note. Nothing changed
outside the task's files. The phase file names this note
`food-and-planning-tasks-with-unit-repair.md`; the lead's prompt named
`food-and-planning-tasks.md`, which is used here.
