# Task: goal formulas and maintenance estimate (P01-12) · Phase: 01 · Owner: builder (wt-p01b4)

<!-- Save as platewise/docs/notes/P<nn>/<slug>.md. Write everything above "Compare checklist"
BEFORE writing code, in your own words. Never paste or paraphrase the reference line by line. -->

Read (reference @ `10e14b67`): `A/models/UserProfile.kt` (the formula members: BMR, TDEE,
adjustment, formula calories and macros, the maintenance comparison), `I/Models/UserProfile.swift`
(the same part, plus the activity table and the 7 700 kcal constant), `A/models/ActivityLevel.kt`,
`T/models/UserProfileGoalFormulaTest.kt`, `IT/MaintenanceBreakdownTests.swift`; research spec
`01-profile-goals.md` §3.1 (age, body fat), §3.3 (formulas, maintenance) and §6 R01.9; decisions
D-16.56 (one weight range; not used by the maths). Traps ledger row R01.9; acceptance ACC-C1-1. No
Evidence ids.

What it does (own words): turns a profile into the plan the app would suggest without any AI: a
resting burn (BMR), a daily burn (TDEE = BMR × activity factor), a daily kcal adjustment for the
chosen pace, and four whole-number targets. BMR uses the lean-mass equation (370 + 21.6 × lean
fraction × kg) whenever a body-fat value is present, else the height/weight/age equation with +166
for men only (women and "other" use the base). Moderate activity is 1.465, not the textbook 1.55.
Every step that makes a whole number cuts the fraction (TDEE, pace adjustment, protein, fat, carbs
as whole-gram integer division); nothing rounds. Protein is grams per kg of full body weight, with
0.2 g/kg extra while losing; body fat never turns it into a lean-mass rate. The maintenance
estimate compares the kcal target the person follows with the cut TDEE and labels the gap as a
deficit (≤ −50), a surplus (≥ +50) or "close", because the formula is far less exact than ±50.

Inputs → outputs:
- `ACTIVITY_TABLE[activity]` → `{ factor, proteinPerKg, steps: { from, below } }` (steps a day:
  below 5 000; 5 000–7 499; 7 500–9 999; 10 000–12 499; 12 500–14 999; 15 000 and up).
- Constants: `KCAL_PER_KG` 7 700, `DEFAULT_PACE_KG` 0.5, `CUT_PROTEIN_BOOST` 0.2, `FAT_PER_KG` 0.6,
  `KCAL_PER_GRAM` {protein 4, carbs 4, fat 9}.
- `intDiv(a, b)` (cuts toward zero, like the integer division the spec uses) and `floorMod(a, n)`
  (always 0…n−1, R01.9); `macroKcal({protein, carbs, fat})`; `remainderCarbs(kcal, P, F)` =
  max(0, (kcal − 4P − 9F) div 4).
- `bmrMethod(profile)` → `'leanMass' | 'standard'`; `bmr(profile, today)`; `tdee(profile, today)`;
  `paceAdjustment(goal, weeklyKg?)` → whole kcal a day (0, −trunc(rate × 7 700 ÷ 7), +…);
  `formulaPlan(profile, today)` → `Targets`.
- `maintenance.ts`: `MAINTENANCE_TOLERANCE` 50; `compareToMaintenance(maintenance, target)` →
  `{ maintenance, target, difference, balance: 'deficit' | 'close' | 'surplus' }`;
  `maintenanceEstimate(profile, today)` with maintenance = trunc(TDEE) and target = the effective
  kcal (saved kcal, else formula kcal; from `targets.ts`, P01-13).
- `src/domain/goals/__fixtures__/profiles.ts`: `FIXTURE_TODAY` and named profiles: `defaultProfile`
  (male, 25 y, 175 cm, 70 kg, moderate, maintain), `leanMassProfile` (80 kg, 20 % body fat,
  sedentary), `lose100Profile` (100 kg, 30 % body fat, moderate, lose), plus `smallCutProfile`
  (a light, lighter person losing slowly) for the plan-validator vectors that need a low kcal plan.

Files: created `src/domain/goals/formulas.ts`, `formulas.test.ts`, `maintenance.ts`,
`maintenance.test.ts`, `__fixtures__/profiles.ts`, this note. Imports `ageOn` from
`src/domain/dates/age.ts` and the records from `src/domain/model.ts`.

Edge cases / failure modes:
- Truncation, not rounding, everywhere here (R01.9): TDEE 2 452.04 → 2 452; 1 673.75 BMR is kept
  unrounded; protein 1.6 × 70 = 112.000…01 → 112.
- Floating-point order matters for truncation: protein is (rate + boost) × kg, the lean-mass BMR is
  370 + 21.6 × (1 − fraction) × kg, the adjustment is rate × 7 700 ÷ 7, in that order, so a value
  that lands a hair under a whole number cuts the same way the reference does.
- Losing with a pace of 0 gives 0, never −0. An absent pace means 0.5 kg a week for lose and gain;
  maintain ignores any stored pace.
- Formula kcal has no floor (a very low plan is possible; the "under 1 200" warning is UI only).
  Carbs never go below 0.
- Body fat of 0 still counts as "known" (lean-mass equation); only an absent value falls back.
- Age comes from the local birth date and the day key passed in (R01.15), so the plan does not shift
  with the time zone.

Our design differences / decisions:
- Names are ours (`formulaPlan`, `paceAdjustment`, `bmrMethod` `'leanMass' | 'standard'`,
  `compareToMaintenance`, `EnergyBalance` with `close` instead of the reference's maintenance case).
  Activity keys are ours (`hard`, `athlete` for the two top levels, from `model.ts`).
- Pure functions of (profile, today) instead of computed members of the profile record; no legacy
  body-fat preference (it never gated anything).
- The integer helpers live here and are shared by `targets.ts`, `locks.ts`, `planEdit.ts` and
  `planValidator.ts`, so every module truncates the same way.
- The step guides are numbers (`from`, `below`) for the Activity step and the methods page to
  format; the subtitles are copy (P05).

Tests we will write:
- Default profile: BMR 1 673.75, TDEE 2 452.04, plan 2 452 kcal / P 112 / F 42 / C 406 (ACC-C1-1,
  printed in the test name).
- Lean-mass profile: BMR 1 752.4, TDEE 2 102.88 → 2 102, independent of age; body fat 0 still uses
  the lean-mass equation.
- Adjustments 275 / 550 / 1 100 for 0.25 / 0.5 / 1.0 (both signs), default 0.5, maintain 0, pace 0
  is +0.
- 100 kg, 30 % body fat, moderate, lose → protein 180 with and without body fat.
- Female and other use the base equation (166 less than male).
- Every activity factor and protein rate in order; 1.465 for moderate.
- Truncation table (R01.9): `intDiv` cuts toward zero for negatives, `floorMod(−1, 4)` is 3 where
  `%` gives −1; formula values for a sweep of weights are integers and never rounded up.
- Maintenance: a formula target's difference equals its adjustment (0, +275, −550); a saved 2 600
  against 2 102 reads surplus 498; −49 and +49 read close, −50 deficit, +50 surplus.
- Same plan in Asia/Tokyo (age from day keys).

Compare checklist (filled after the rewrite; reopened `A/models/UserProfile.kt` formula members,
`I/Models/UserProfile.swift` lines 1–310, `A/models/ActivityLevel.kt`,
`T/models/UserProfileGoalFormulaTest.kt`, `IT/MaintenanceBreakdownTests.swift`):
- [x] Lean-mass BMR whenever body fat is known, in the same expression order (tested in
  `src/domain/goals/formulas.test.ts > bmr > gives 80 kg at 20 % body fat 1 752.4 kcal with the
  lean-mass equation, whatever the age`, `> treats 0 % body fat as known`); the legacy preference
  cannot switch it off (it is not in our model).
- [x] Standard BMR, +166 for male only, female and other on the base (`bmr > gives the default
  profile 1 673.75 kcal with the standard equation (male, 25 y, 175 cm, 70 kg)`, `> uses the base
  equation for female and other: 166 kcal below male`); age from the local birth date and clamped
  at 0 through `ageOn` (`> takes 5 kcal off for each year of age, from the local birth date`,
  `formulaPlan > gives the same plan in Asia/Tokyo: age comes from day keys`).
- [x] Activity factors with 1.465 for moderate, protein rates in order, step guides (`constants >
  gives each level its own factor and protein rate, least active first, with 1.465 for moderate`,
  `> gives each level a step guide that starts where the one before stops`, `tdee > multiplies the
  same BMR by each activity factor`).
- [x] TDEE 2 452.04 and 2 102.88 (`tdee > gives the default profile 2 452.04 kcal (1 673.75 ×
  1.465)`, `> gives 80 kg at 20 % body fat, sedentary, 2 102.88 kcal`).
- [x] Adjustment = trunc(rate × 7 700 ÷ 7), default 0.5, maintain 0, sign for lose (`paceAdjustment
  > gives 275 / 550 / 1 100 kcal a day for 0.25 / 0.5 / 1.0 kg a week`, `> uses 0.5 kg a week when
  no pace is set, and 0 to maintain whatever the pace`, `> cuts the fraction instead of rounding:
  0.123 kg a week gives 135 (135.3)`, `> gives +0, never -0, for a pace of 0`).
- [x] Formula kcal = trunc(TDEE) + adjustment, no floor (`formulaPlan > cuts TDEE before adding the
  pace and has no kcal floor`).
- [x] Protein (rate + 0.2 when losing) × kg cut, full body weight with or without body fat
  (`formulaPlan > gives 100 kg, 30 % body fat, moderate, lose 180 g protein with or without body
  fat`, `> adds 0.2 g/kg protein only while losing`, `> cuts protein and fat instead of rounding them
  (R01.9)`).
- [x] Fat trunc(0.6 × kg), carbs max(0, … div 4) (`formulaPlan > gives the default profile 2 452
  kcal, 112 g protein, 406 g carbs and 42 g fat (ACC-C1-1)`, `> never gives negative carbs`,
  `integer maths (R01.9) > counts macro energy at 4 / 4 / 9 and fills carbs with whole grams, never
  below 0`).
- [x] R01.9 truncation and floor-mod helpers (`integer maths (R01.9) > cuts toward zero in integer
  division`, `> keeps a floor-mod in 0…n−1 where % goes negative: floorMod(-1, 4) = 3`,
  `formulaPlan > gives whole numbers that fit inside the kcal for every weight from 40 to 160 kg`).
- [x] Maintenance = trunc(TDEE) against the effective kcal; a formula target's difference equals
  its adjustment; ±50 tolerance (`src/domain/goals/maintenance.test.ts > maintenanceEstimate >
  gives 80 kg at 20 % body fat, sedentary, maintenance 2 102 and a formula target 0 kcal away`,
  `> gives a formula target a difference equal to its pace adjustment: +275 surplus, −550 deficit`,
  `> compares a saved 2 600 kcal target with 2 102: a 498 kcal surplus`, `> reads an AI-tuned
  maintain target 30 kcal under maintenance as close, not a deficit`, `balanceOf > reads −49 and +49
  as close, −50 as a deficit and +50 as a surplus`).
- Deliberate differences: pure functions of (profile, today) instead of members that read the
  clock; the legacy body-fat preference is gone; activity keys `hard` and `athlete`; `close`
  instead of a "maintenance" balance name; a lose pace of 0 gives +0.
- Not taken: display name and initials (the name is never edited, 01 §3.1); the methods page and
  activity subtitles (copy, P05-03/P05-13).

## Decisions for the lead

- `formulaPlan`, `bmr` and `tdee` take `today` as a day key (age needs it); everything that needs
  the formula plan (`effectiveTargets`, the lock engine) takes `today` too, so callers never pass a
  stale formula plan.
- The integer helpers (`intDiv`, `floorMod`, `macroKcal`, `remainderCarbs`) are exported from
  `formulas.ts` and shared by the other goal modules; P05-05 can use `remainderCarbs` for its carbs
  re-derivation.
- Fixture file holds a fourth profile, `smallCutProfile` (female, 52 kg, light, lose 0.25), used by
  the plan-validator vector {801, 70, 29, 45}, besides the three the phase file names (`defaultProfile`,
  `leanMassProfile` for "Katch", `lose100Profile`). `FIXTURE_TODAY` is 2026-10-26.

## Status

Done (2026-10-26). `formulas.ts` (27 tests), `maintenance.ts` (6 tests) and the fixtures; nothing
outside the slice's files changed. Traps covered: R01.9 (with P01-13/14), R01.15 (plan in Tokyo).
Acceptance: ACC-C1-1 (`src/domain/goals/formulas.test.ts > formulaPlan > gives the default profile
2 452 kcal, 112 g protein, 406 g carbs and 42 g fat (ACC-C1-1)`).
