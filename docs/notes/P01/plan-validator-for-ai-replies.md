# Task: plan validator for AI replies (P01-14) · Phase: 01 · Owner: builder (wt-p01b4a)

<!-- Save as platewise/docs/notes/P<nn>/<slug>.md. Write everything above "Compare checklist"
BEFORE writing code, in your own words. Never paste or paraphrase the reference line by line. -->

Read (reference @ `10e14b67`): `A/services/ai/FoodAnalysis.kt` (only the goal-reply parser),
`I/Services/GeminiService.swift` (only the goal-reply parser and its fat helper),
`T/services/ai/GoalCalculationParserTest.kt` (all). Research spec `01-profile-goals.md` §3.6
(validation); traps ledger R01.2, R01.9. No Evidence ids.

What it does (own words): the gate between an AI's plan and the person's saved targets. A reply
that is missing a number, out of range, internally inconsistent or far from what the person's
body data suggests is refused, and the caller keeps the old targets. A reply that passes is
nudged to whole numbers that add up exactly (4 kcal per gram of protein and carbs, 9 per gram of
fat), so the saved plan never disagrees with itself. The checks run in a fixed order and a
refusal says which check failed:
1. numbers: all four values are finite numbers or numeric strings (booleans, null, objects out);
2. raw ranges: kcal 800–6 000, protein 10–500, carbs 0–1 500, fat 10–400;
3. coherence: the macros' energy is within max(100, 15 % of kcal) of kcal;
4. exact fit: kcal rounded; protein rounded and at most kcal div 4; fat must leave the same
   remainder mod 4 as kcal (9 ≡ 1 mod 4), so protein steps down while the room left cannot hold
   that remainder; fat is the value with that remainder nearest the asked fat (capped by the room
   and by 400), ties going lower; carbs take the rest by division;
5. minimums: protein and fat at least 10, carbs at least 0;
6. plausibility against the formula plan: protein within 70–130 % of max(10, formula protein),
   fat within 50–150 % of max(10, formula fat), kcal within max(800, half) to min(6 000, double)
   of the formula kcal held to 800–6 000 (bounds rounded);
7. a non-blank reason is kept.

Inputs → outputs: `checkPlan(reply, formula)` where `reply` = `{kcal, protein, carbs, fat,
reason?}` as raw values (P03-14 reads them from the reply text) and `formula` =
`formulaPlan(profile, today)` → `Result<CheckedPlan, PlanRejection>`; `CheckedPlan` = whole
`Targets` plus an optional `reason`; `PlanRejection` = `{step, field?, value?, min?, max?}` with
`step` one of `notNumber`, `outOfRange`, `incoherent`, `belowMinimum`, `implausible`.

Files: created `src/domain/goals/planValidator.ts`, `planValidator.test.ts`, this note.

Edge cases / failure modes:
- {2000, 150, 215, 61} → 2000 / 150 / 215 / 60 (fat moved to the residue class).
- {801, 70, 29, 45} → exact 801 (residue 1, fat 45 already fits).
- {800, 200, 0, 10} → protein takes all the room, fat falls to 0 → refused at the minimums step.
- Default profile: protein 300 refused (allowed 78–146); kcal 6 000 refused (allowed 1 226–4 904).
- {2000, 150, 400, 80} and {2000, 150, 7, 60} refused at coherence; {801, 999, 999, 999} at ranges.
- Boolean, null, missing, `NaN`, `Infinity`, "abc", "12abc" → refused at the numbers step; "150"
  and " 150 " accepted.
- Fractional raw values round half up (only positive values reach rounding).
- The residue uses a true floor-mod helper (R01.9), though kcal is positive here.
- Body fat on the profile never changes the protein reference (it comes from the formula plan).
- Property sweep: every accepted reply sums exactly to its kcal.

Our design differences / decisions:
- Names are ours (17 §1.6: `checkPlan`; the reader `readPlanReply` is P03-14).
- Returns a `Result` instead of throwing; the error names the failed step and, where it helps,
  the field and the allowed bounds (the UI shows one generic message).
- Plausibility always runs: the input is the formula plan, not an optional profile. The caller
  builds it with `formulaPlan(profile, today)`, which also keeps the clock out of this module.
- Numeric strings follow Android (iOS refuses them); our grammar is plain decimal with an optional
  sign, fraction and exponent, surrounding spaces trimmed.
- The kept reason is trimmed.

Tests we will write: the spec's examples and Verify vectors above, one refusal per step with its
step name, the string/boolean cases, the fat tie going lower, the protein step-down loop, and a
seeded sweep of coherent replies asserting the exact 4/4/9 sum and integer outputs (R01.2).

Compare checklist (filled after the rewrite; reopened `A/services/ai/FoodAnalysis.kt` (goal
parser), `I/Services/GeminiService.swift` (goal parser and fat helper),
`T/services/ai/GoalCalculationParserTest.kt`):
- [x] All four required, finite, numeric strings accepted, booleans refused
  (`src/domain/goals/planValidator.test.ts > checkPlan: refused replies > refuses a value that is
  not a number or numeric text (step 1, R01.2)`, `checkPlan: accepted replies > accepts numeric
  text, with or without spaces`).
- [x] Raw ranges before rounding (`planValidator.test.ts > checkPlan: refused replies > refuses raw
  values outside the ranges, before rounding (step 2, R01.2)`).
- [x] Coherence allowance max(100, 15 %) (`planValidator.test.ts > checkPlan: refused replies >
  refuses macros whose energy is too far from kcal (step 3, R01.2)`).
- [x] Exact fit: rounding, protein cap and step-down, fat residue by floor-mod, nearest fat with
  ties lower, carbs by division (`planValidator.test.ts > checkPlan: accepted replies > stores
  2 000 / 150 / 215 / 61 as 2 000 / 150 / 215 / 60 (R01.2, ACC-C3-1)`, `> keeps 801 / 70 / 29 / 45
  exact at 801 kcal`, `> rounds fractional raw values half up before the exact fit`, `> moves fat
  to the nearest amount with the right remainder, the lower one on a tie`, `checkPlan: refused
  replies > lowers protein until fat can take the remainder kcal needs (R01.9)`).
- [x] Minimums after the fit (`planValidator.test.ts > checkPlan: refused replies > refuses a fit
  that leaves fat under 10 g (step 5)`).
- [x] Plausibility bands and reference clamps (`planValidator.test.ts > checkPlan: refused replies
  > refuses protein 300 for the default profile, which allows 78–146 (step 6, R01.2)`, `> refuses
  6 000 kcal for the default profile, which allows 1 226–4 904 (step 6)`, `> refuses fat outside
  half to one and a half times the formula fat (step 6)`, `> holds the kcal reference to 800–6 000
  and the macro references to at least 10 g`).
- [x] Body fat never changes the protein reference (`planValidator.test.ts > checkPlan: accepted
  replies > never turns protein into a lean-mass rate when body fat is known`).
- [x] Reason kept when not blank (`planValidator.test.ts > checkPlan: accepted replies > keeps a
  reason with text in it, trimmed, and drops a blank or non-text one`).
- [x] Every accepted reply sums exactly (`planValidator.test.ts > checkPlan: exact energy > gives
  whole values that sum exactly to kcal for every accepted reply (R01.2)`).
- Deliberate differences: a `Result` naming the failed step instead of a thrown error;
  plausibility always runs against the formula plan; numeric text is plain decimal (optional sign,
  fraction, exponent; spaces trimmed), so the Java-only forms such as hex floats or a trailing
  `f`/`d` are refused; the reason is trimmed; no final carbs clamp (carbs cannot pass 1 500 once
  kcal is at most 6 000, and a clamp would break the exact sum).
- Not taken: extracting the JSON object from the reply text and the key names (P03-14's
  `readPlanReply`).

## Decisions for the lead

- `checkPlan(reply, formula)` takes the formula plan rather than the profile, so the validator
  needs no "today"; P05-05/P05-08 call it as `checkPlan(values, formulaPlan(profile, today))`.
- The rejection carries `step` (`notNumber`, `outOfRange`, `incoherent`, `belowMinimum`,
  `implausible`) plus the field and bounds; the UI shows one generic message per the spec.
- Numeric text: the grammar above, with surrounding spaces ignored. `RAW_PLAN_RANGES` is exported.
- At kcal ≥ 800 the 100 kcal floor of the coherence allowance never applies (15 % of 800 is 120);
  it is kept as the rule says.

## Status

Done (2026-10-26). `checkPlan` and its tests (17) are in place, all passing. Nothing outside
`src/domain/goals/**` and this note changed. Traps covered: R01.2 (and R01.9 for the residue).
