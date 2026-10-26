# Task: plan validator for AI replies (P01-14) · Phase: 01 · Owner: builder (wt-p01b4)

<!-- Save as platewise/docs/notes/P<nn>/<slug>.md. Write everything above "Compare checklist"
BEFORE writing code, in your own words. Never paste or paraphrase the reference line by line. -->

Read (reference @ `10e14b67`): `A/services/ai/FoodAnalysis.kt` (`parseGoalCalculation` only),
`I/Services/GeminiService.swift` (`parseGoalCalculation`, `closestFat`),
`T/services/ai/GoalCalculationParserTest.kt`, and the plan-reply cases in
`IT/GoalEvidenceTests.swift`; research spec `01-profile-goals.md` §3.6 (validation of the reply)
and §6 R01.2, R01.9. Traps ledger rows R01.2, R01.9; acceptance ACC-C3-1. No Evidence ids.

What it does (own words): an AI plan reply must never become a plan unless it is sane. The reply
reader (P03-14) hands over the four raw values and an optional reason; this module decides. In
order: every value must be a finite number or a string holding one (true/false, null, objects are
refused); raw ranges (kcal 800–6 000, protein 10–500, carbs 0–1 500, fat 10–400); the stated macros
must explain the kcal within max(100, 15 %); then the plan is rebuilt so that 4P + 4C + 9F equals
kcal exactly: kcal and protein are rounded (protein no more than kcal ÷ 4); since 9 ≡ 1 (mod 4) the
fat grams must leave the same remainder mod 4 as kcal, so protein is lowered while there is no room
for that remainder, fat becomes the nearest value with that remainder to the requested fat (inside
0…capacity, capacity at most 400, ties to the lower), and carbs are what is left ÷ 4. Then low
macros are refused (protein or fat below 10, carbs below 0), and the plan must be plausible for the
person: protein within 70–130 % of the formula protein, fat within 50–150 % of the formula fat
(both references at least 10), kcal within half to twice the formula kcal (clamped to 800–6 000 on
both ends). A non-blank reason is kept. The result says which step refused the reply.

Inputs → outputs: `checkPlan({ kcal, protein, carbs, fat, reason? }: unknowns, reference:
Targets)` → `Result<CheckedPlan, PlanRejection>` where `CheckedPlan` is `Targets & { reason? }` and
`PlanRejection` is `{ step: 'shape' | 'range' | 'coherence' | 'lowMacro' | 'plausibility', field?,
value?, allowed?: { min, max } }`. Helpers: `readPlanNumber(value)` (step 1), `REPLY_RANGES`,
`plausibleRanges(reference)`, `fatWithResidue(target, residue, capacity)`.

Files: created `src/domain/goals/planValidator.ts`, `planValidator.test.ts`, this note. Uses
`intDiv`/`floorMod` from `formulas.ts`, `Result` from `src/lib/result.ts`; the reference plan comes
from `formulaPlan` (P01-12) and the fixtures.

Edge cases / failure modes:
- Booleans are refused (in some languages `true` reads as 1); "150" and " 150 " are accepted;
  "150g", "", "NaN", "Infinity", null, arrays and objects are refused.
- Range ends are inclusive (800 and 6 000 pass; 799.9 fails).
- Rounding happens only here, after the checks on raw values (R01.9): kcal 2 000.4 → 2 000.
- The fat residue uses a true floor-mod (R01.9); JavaScript `%` is negative for negative inputs.
  `fatWithResidue` handles a target below the residue (the lower candidate is negative, the upper
  one is used) even though the raw ranges keep real replies away from it.
- Protein above kcal ÷ 4 is cut to kcal ÷ 4; when that leaves no room for the fat residue, protein
  is lowered one gram at a time; such a plan then fails the low-fat check.
- The fallback when no candidate fits (residue capped to capacity) cannot be reached with the raw
  ranges but is kept so the function is total.
- A reference plan with protein or fat below 10 uses 10 as its reference.
- Never throws; every refusal is a value.

Our design differences / decisions:
- Our names (`checkPlan`, `readPlanNumber`, `PlanRejection` steps); a `Result` instead of an
  exception.
- The plausibility reference is required (the formula plan from `formulaPlan(profile, today)`);
  the reference allows calling without a profile, but every real caller has one and skipping the
  check would let an implausible plan through (R01.2). The test vectors that the reference checks
  without a profile use fixture profiles whose formula plan makes them plausible.
- Carbs need no separate clamp to 0–1 500: with kcal ≤ 6 000 they cannot pass 1 500, and clamping
  would break the 4/4/9 equality.
- Numeric strings follow one plain grammar (optional sign, digits, optional fraction and exponent,
  spaces around) rather than a platform number parser.

Tests we will write:
- {2 000, 150, 215, 61} → 2 000 / 150 / 215 / 60 with an exact sum (ACC-C3-1, R01.2).
- {801, 70, 29, 45} → exact 801.
- Default profile: protein 300 refused at plausibility (allowed 78–146); kcal 6 000 refused (allowed
  1 226–4 904).
- Incoherent {2 000, 150, 400, 80} refused at coherence; {2 000, 150, 7, 60} too.
- Boolean protein refused at shape; "150" accepted; missing fat refused.
- Raw range refusals for each field and both ends; inclusive ends accepted.
- Low macro: protein 0 / fat 0 refused at range; {800, 200, 0, 10} normalises fat to 0 → refused
  at lowMacro; protein lowered for the residue then refused.
- Floor-mod: `fatWithResidue` for every residue, ties to the lower, target below residue.
- Reason kept when non-blank, dropped when blank or not a string.
- Property sweep: a deterministic sweep of coherent raw replies; every accepted plan has 4P + 4C +
  9F = kcal and fat ≡ kcal (mod 4); every kcal from 800 to 6 000 with fixed macros normalises
  exactly.

Compare checklist (filled after the rewrite; reopened `A/services/ai/FoodAnalysis.kt`
`parseGoalCalculation`, `I/Services/GeminiService.swift` `parseGoalCalculation` and `closestFat`,
`T/services/ai/GoalCalculationParserTest.kt`, `IT/GoalEvidenceTests.swift` lines 227–279):
- [x] Every field required; numbers or numeric strings; booleans refused (tested in
  `src/domain/goals/planValidator.test.ts > checkPlan: shape (step 1) > refuses a missing macro`,
  `> refuses a boolean protein`, `> accepts "150" as protein, and numeric strings for every field`,
  `> refuses null, objects, arrays, non-finite numbers and text that is not a plain number`, `> reads
  plain numbers and numeric strings and nothing else`).
- [x] Raw ranges, inclusive, refused not clamped (`checkPlan: raw ranges (step 2) > uses kcal 800–6
  000, protein 10–500, carbs 0–1 500, fat 10–400`, `> refuses each field just outside either end`,
  `> refuses extreme or zero-macro replies instead of clamping them`, `> lets values on the range
  ends through to the later steps`).
- [x] Coherence within max(100, 15 %) (`checkPlan: worked examples > refuses the incoherent {2000,
  150, 400, 80} at the coherence step`, `> refuses {2000, 150, 7, 60}: the macros explain only 1 168
  kcal`, `> refuses {800, 500, 1200, 400}: every value in range, but the macros explain 10 400 kcal`,
  `checkPlan: coherence (step 3) > allows a mismatch up to max(100, 15 % of kcal) either way`).
- [x] Normalisation: rounding, protein cap and lowering loop, fat capacity 400, nearest fat with
  kcal's remainder, ties to the lower, floor-mod, fallback (`checkPlan: worked examples > stores
  {2000, 150, 215, 61} as 2 000 / 150 / 215 / 60 with 4P + 4C + 9F = 2 000 (ACC-C3-1, R01.2)`,
  `> keeps {801, 70, 29, 45} exact at 801 kcal`, `checkPlan: normalising and low macros (steps 4 and
  5) > rounds kcal and protein, and moves fat to the nearest value with kcal’s remainder mod 4`,
  `> lowers protein until fat has room for the remainder, then refuses the low fat`, `> caps protein
  at kcal div 4 and fat at 400 g`, `fatWithResidue (R01.9) > picks the nearest value with the
  remainder, ties to the lower`, `> stays inside 0…capacity`, `> uses a true floor-mod when the
  target is below the remainder`, `> falls back to the remainder capped at the capacity when nothing
  fits`).
- [x] Low macro after normalising (`checkPlan: normalising and low macros (steps 4 and 5) > refuses
  {800, 200, 0, 10}: protein fills the kcal, fat normalises to 0`).
- [x] Plausibility against the formula plan (`checkPlan: worked examples > refuses protein 300 for
  the default profile (allowed 78–146)`, `> refuses 6 000 kcal for the default profile (allowed
  1 226–4 904)`, `checkPlan: plausibility (step 6) > derives the spans from the formula plan`, `> uses
  at least 10 g as the macro reference and clamps the kcal reference to 800–6 000`, `> refuses fat
  outside 50–150 % of the formula fat`, `> accepts the span ends`).
- [x] Reason kept only when a non-blank string (`checkPlan: reason (step 7) > keeps a non-blank
  reason, trimmed`, `> drops a blank or non-text reason`).
- [x] Exact 4/4/9 for every accepted plan (`checkPlan: exact energy sweep > gives 4P + 4C + 9F =
  kcal for every accepted reply in a sweep of coherent replies`, `> normalises every kcal from 800
  to 6 000 to an exact sum`).
- Deliberate differences: a `Result` with the failing step instead of an exception; the plausibility
  reference is required; numeric strings follow one plain grammar (the reference's number parser
  also took forms such as hex or a `d` suffix); the reason is trimmed; no extra carbs clamp; low
  carbs are refused as on Android (iOS clamped them to 0, which cannot happen after normalising).
- Not taken: JSON extraction from the reply text (P03-11/P03-14).

## Decisions for the lead

- `checkPlan(reply, reference)` takes the formula plan (`formulaPlan(profile, today)`) rather than
  the profile, so the validator needs no date. The reference is required: the vectors the reference
  tests checked without a profile ({2000, 150, 215, 61}, {801, 70, 29, 45}) are tested against
  fixture profiles whose formula plan makes them plausible (`lose100Profile`, `smallCutProfile`).
- `exactPlan` (step 4 alone) is exported for tests and for any caller that needs the exact 4/4/9
  rebuild of already-checked numbers.
- A rejection carries `step`, `field`, `value` and `allowed`, enough for a log line or a dev
  message; the user-facing text stays "goals unchanged" (P05-08).

## Status

Done (2026-10-26). `planValidator.ts` (33 tests); nothing outside the slice's files changed. Traps
covered: R01.2, R01.9 (fat residue). Acceptance: ACC-C3-1
(`src/domain/goals/planValidator.test.ts > checkPlan: worked examples > stores {2000, 150, 215, 61}
as 2 000 / 150 / 215 / 60 with 4P + 4C + 9F = 2 000 (ACC-C3-1, R01.2)`).
