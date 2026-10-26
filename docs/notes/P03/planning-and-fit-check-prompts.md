# Task: planning and fit-check prompts (P03-16) · Phase: 03 · Owner: builder (wt-p03s5)

<!-- Save as platewise/docs/notes/P<nn>/<slug>.md. Write everything above "Compare checklist"
BEFORE writing code, in your own words. Never paste or paraphrase the reference line by line. -->

Read (reference @ `10e14b67`): nothing. The phase row lists no reference file for wording, and the
reference's prompt text is off limits before and after writing. Behaviour only from research
spec `01-profile-goals.md` §3.2 (the kJ line), §3.3 (the formulas and constants), §3.6 (what the
plan request supplies and asks), §3.8 (the evidence pack), §3.11 (optional nutrient goals), and
`03-ai-providers.md` §3.11 (fit check and nutrient-goal requests); decision D-16.24 (the person's
notes for the AI travel in the system channel); glossary 17 §1.4 (plan reply keys `kcal`,
`protein`, `carbs`, `fat`, `why`); acceptance ACC-C9-1; trap R01.16. The domain code the prompts
render: `src/domain/goals/{formulas,targets,planValidator}.ts`, `src/domain/forecast/evidence.ts`,
`src/domain/nutrients/{catalogue,goalDefaults}.ts`, `src/domain/units/{body,energy}.ts`.

What it does (own words): the requests behind Rebuild plan, the weekly tune-up, the optional
nutrient-goal refresh and Fit check. `plan.ts` asks the model to act as our plan calculator and
answer with only `kcal`, `protein`, `carbs`, `fat` (whole numbers) and a short `why` under 100
characters. It hands over the whole formula set with its constants taken from the domain module
(both resting-burn equations and which one applies to this person, the activity table, 7700 kcal
per kg, the pace change, protein rates with the extra 0.2 g/kg while losing, 0.6 g/kg fat, carbs
as the rest, 4/4/9), the rules for leaning on the person's own data (one 14-, 28- or 90-day
window; medium or high confidence; at least half that window's days fully logged; two or more
weigh-ins at least 14 days apart; a believable trend; partial and missing days never count;
weight change spread over the real days between the first and last weigh-in), protein within
about 15 % of the formula and never cut to fit a low kcal, kcal between 800 and 6000 and 4P + 4C +
9F close to kcal. Then the profile in metric (one decimal) plus the person's own units, the
formula reference values (resting burn, daily burn, formula kcal and macros), the current targets,
and the evidence text. `evidenceText.ts` writes the evidence pack as compact lines: the window,
a privacy line (numbers and dates only), how days are judged, the confidence with its parts, the
period summaries with coverage, weigh-in and body-fat signals, dated readings and the newest
logged days with their coverage label. It never reads anything the pack does not hold, and the
pack holds no names. `nutrientGoals.ts` asks for whole numbers for exactly the 29 optional goal
keys with their unit, kind and current value; limits are ceilings, targets are floors; sports
compounds stay 0 unless the person asks; never kcal or macros. `fitCheck.ts` asks for 2–4 short
plain sentences on whether one meal fits today with one practical next step, concrete numbers,
nothing medical, and never a claim that anything was logged or changed; it carries the profile,
the targets, today's totals before and after the meal, what is left and up to 12 of today's meals.
The kJ line goes to plan and fit check (both answers reach the person), not to the JSON-only
nutrient goals.

Inputs → outputs:
- `planPrompt({ profile, today, units, evidence? })` → `PromptText`.
- `evidenceText(pack)` → string.
- `nutrientGoalsPrompt({ profile, today, units, targets, current })` → `PromptText`.
- `fitCheckPrompt({ profile, today, units, targets, eaten, meal, todaysMeals })` → `PromptText`.

Files: created `src/ai/prompts/{plan,evidenceText,nutrientGoals,fitCheck}.ts`, their tests, the
fixture `src/ai/prompts/__fixtures__/evidence.ts`, this note.

Edge cases / failure modes:
- No evidence (onboarding) → no data section; the prompt says to use the formula daily burn.
- Maintain → pace "not set"; no goal weight → "not set"; no body fat → "not set" and Mifflin named.
- Body fat as both percent and fraction (0.2 → 20 % and 0.2).
- Height in ft/in uses the rounded inch (170 cm → 5 ft 7 in), weight in lb one decimal.
- Evidence with no logged days, no weigh-ins, null averages → "none" / "unknown", never 0.
- More than 12 meals today → the newest 12 are listed and the count left out is stated.
- A meal or note text with line breaks stays inside its own quoted line (flattened).
- Remaining amounts may be negative: written as "over by".
- The fit-check meal values are whole kcal and one-decimal grams; totals add exactly.

Our design differences / decisions:
- Constants come from the domain (`ACTIVITY_FACTORS`, `KCAL_PER_KG`, `FAT_PER_KG`,
  `LOSING_PROTEIN_EXTRA`, `KCAL_PER_GRAM`, `RAW_PLAN_RANGES`, `GOAL_SPECS`), so a change there
  changes the prompt; the tests assert the literal values the spec names.
- Current targets are the effective targets (what the person follows), saved or derived.
- No measured-energy anchor and no tape measurements in v1 (later phases); the trust order still
  names the anchor first so the text does not change when it arrives.
- Fit check keeps the newest 12 meals when there are more (our choice; the spec says "up to 12").
- Nutrient goals: "unless the person asks" points at their notes for the AI (system channel).

Tests we will write:
- `plan.test.ts`: every constant (the six activity multipliers and protein rates, the energy of a
  kilogram, fat per kg, the extra protein while losing, 4/4/9, the kcal range); the reply keys; the BMR method named for each profile; the
  profile's formula reference values and current targets; metric plus display units; the data
  rules only with evidence; the kJ line only for kJ readers; ACC-C9-1: a plan prompt built from
  entries with food names, notes and ingredients holds none of them.
- `evidenceText.test.ts`: never contains names (fixture with names, notes, ingredients, product
  text); coverage labels and the privacy line; window dates; period figures; unknown values.
- `nutrientGoals.test.ts`: all 29 keys with unit, kind and current value; no macro or kcal key
  asked; limits as ceilings; supplements 0 unless asked; integers.
- `fitCheck.test.ts`: at most 12 meals; totals before and after; remaining and over; the answer
  rules; the kJ line only for kJ readers.
- similarity check green on these files.

Compare checklist (filled after the rewrite; reopened spec 01 §3.2, §3.3, §3.6, §3.8, §3.11 and
03 §3.11 only, since the reference's prompt text stays closed):
- [x] Plan item 1, formula set, constants and the method that applies (`src/ai/prompts/plan.test.ts
  > planPrompt: the formula set and its constants > …` (5 tests))
- [x] Plan items 2–4, own-data rules, protein near the formula, 800–6000, 4/4/9 (`plan.test.ts >
  planPrompt: the rules > …` (3 tests), `planPrompt: the evidence > gives the own-data rules and
  the evidence text when there is a pack`, `> uses the formula daily burn and no data rules
  without a pack`)
- [x] Plan items 5–6, profile in metric plus display units, reference values and current targets
  (`plan.test.ts > planPrompt: the profile, reference values and current targets > …` (6 tests))
- [x] Plan items 7–8, the evidence and the kJ line (`plan.test.ts > planPrompt: the evidence > …`,
  `planPrompt: energy unit > adds the kJ line only for kJ readers, keeping the reply fields in
  kcal`)
- [x] No food name, note or ingredient in a plan request, ACC-C9-1 (`plan.test.ts > planPrompt: the
  evidence > holds no food name, note or ingredient of the logged entries (ACC-C9-1)`)
- [x] Evidence privacy and labels, R01.16 (`src/ai/prompts/evidenceText.test.ts > evidenceText:
  privacy (R01.16, ACC-C9-1) > never contains a food name, note, ingredient, product text, photo or
  id of the fixture`, `evidenceText: coverage labels > …` (3 tests), and 5 more)
- [x] Nutrient goals request (`src/ai/prompts/nutrientGoals.test.ts > nutrientGoalsPrompt: the 29
  goals and nothing else > …` (5 tests), `nutrientGoalsPrompt: the person > …` (2 tests))
- [x] Fit-check inputs and answer rules, at most 12 meals, kJ line (`src/ai/prompts/fitCheck.test.ts
  > fitCheckPrompt: today's meals > lists at most 12 meals, the newest, and says how many earlier
  ones were left out` and 10 more)
- Mutation check: listing 13 meals fails 1 test; a food name in the evidence text fails 2.
- Deliberate differences: our prose and structure; constants rendered from the domain module;
  current targets are the effective targets; the activity table is one row per level; fit check
  keeps the newest 12 meals and counts the rest; the full profile lines in every planning prompt;
  no kJ line on the JSON-only nutrient-goal request.
- Not taken: the measured-energy anchor (Energy Burn, a later phase), tape measurements and
  workouts in the evidence (later phases), the Android "finish onboarding" short-cut (a caller
  rule for P03-18 or the screen, not prompt text).

## Decisions for the lead

- Plan reply keys: `plan.ts` asks for exactly `kcal`, `protein`, `carbs`, `fat`, `why` and keeps
  them in its own `PLAN_REPLY_KEYS` (the lead's note: `parse/planReply.ts` is not in this base and
  is not imported). When both land, point `plan.ts` at the `PLAN_REPLY_KEYS` exported by
  `parse/planReply.ts` and delete the local copy.
- Fit check lists the newest 12 of today's meals and says how many earlier ones were left out.
- The kJ line goes to plan (number fields stay kcal; only the `why` uses kJ) and fit check, not to
  the nutrient-goal request.

## Status

Done (2026-10-27). Created `src/ai/prompts/{plan,evidenceText,nutrientGoals,fitCheck}.ts`, their
tests (45 tests) and the shared fixture `src/ai/prompts/__fixtures__/evidence.ts`, this note.
Nothing changed outside the task's files. The tasks (P03-18) call these builders and check the
plan reply with `checkPlan`.
