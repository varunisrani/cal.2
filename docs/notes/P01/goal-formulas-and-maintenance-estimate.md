# Task: goal formulas and maintenance estimate (P01-12) · Phase: 01 · Owner: builder (wt-p01b4a)

<!-- Save as platewise/docs/notes/P<nn>/<slug>.md. Write everything above "Compare checklist"
BEFORE writing code, in your own words. Never paste or paraphrase the reference line by line. -->

Read (reference @ `10e14b67`): `A/models/UserProfile.kt` (the formula functions and the
maintenance class), `I/Models/UserProfile.swift` (the formula part: activity table, BMR, TDEE,
adjustment, macros, maintenance), `A/models/ActivityLevel.kt` (all), `T/models/UserProfileGoalFormulaTest.kt`
(all), `IT/MaintenanceBreakdownTests.swift` (all). Research spec `01-profile-goals.md` §3.3;
traps ledger R01.9. No Evidence ids.

What it does (own words): turns the person's body data and goal into the "formula plan", the
targets the app would pick without any AI, and the numbers the AI request uses as its anchor.
Resting burn comes from one of two equations: the lean-mass one (Katch-McArdle) whenever a body-fat
fraction is on the profile, otherwise the weight/height/age one (Mifflin-St Jeor) with +166 for
men only. Daily burn multiplies it by an activity factor (moderate is 1.465 on purpose). A weekly
pace (default 0.5 kg) becomes a daily kcal change at 7 700 kcal per kg, cut toward zero. Protein
is a g/kg rate per activity level (plus 0.2 g/kg while losing) on full body weight, fat 0.6 g/kg,
carbs whatever energy is left, in whole grams. Every step truncates or divides as integers do;
nothing rounds (R01.9). The maintenance estimate compares the truncated daily burn with the
target the person follows and calls the gap a deficit, a surplus or "close" inside ±50 kcal.

Inputs → outputs:
- `bmrMethod(p)` → `'katch' | 'mifflin'`; `bmr(p, today)`, `tdee(p, today)` → unrounded kcal.
- `paceAdjustment(p)` → signed whole kcal per day (0 for maintain).
- `formulaProtein(p)`, `formulaFat(p)` → whole grams; `carbsLeft(kcal, protein, fat)` → whole grams.
- `formulaPlan(p, today)` → `Targets`.
- `ACTIVITY_FACTORS[activity]` → multiplier, protein g/kg and the steps-a-day guide;
  `KCAL_PER_KG`, `KCAL_PER_GRAM`, `DEFAULT_WEEKLY_KG`, `LOSING_PROTEIN_EXTRA`, `FAT_PER_KG`.
- `estimateMaintenance(p, today, targetKcal)` → `{maintenanceKcal, targetKcal, difference,
  balance}`; `balanceOf(difference)` → `'deficit' | 'close' | 'surplus'`.
- `p` is the formula subset of `Profile` (`FormulaInputs`); `today` is a `DayKey` (age via `ageOn`).
- `integers.ts`: `div` (integer division cut toward zero) and `floorMod` (remainder with the
  divisor's sign), shared by the goal modules.

Files: created `src/domain/goals/formulas.ts`, `formulas.test.ts`, `maintenance.ts`,
`maintenance.test.ts`, `integers.ts`, `integers.test.ts`, `__fixtures__/profiles.ts`, this note.

Edge cases / failure modes:
- Default profile (male, 25 y on the fixture day, 175 cm, 70 kg, moderate, maintain): BMR
  1 673.75, TDEE ≈ 2 452.04, plan 2 452 / P 112 / F 42 / C 406.
- 80 kg, 20 % body fat, sedentary: BMR 1 752.4, TDEE 2 102.88 → 2 102 (age and height ignored).
- Pace 0.25 / 0.5 / 1.0 → 275 / 550 / 1 100; lose is negative, gain positive; an absent pace
  counts as 0.5; maintain ignores any stored pace; a pace of 0 while losing gives 0, not −0.
- 100 kg, 30 % body fat, moderate, lose → protein 180 with or without body fat (rates are never
  turned into lean-mass rates).
- female and other both use the base Mifflin value (no +166).
- No floor under the formula kcal (the "under 1 200" warning is UI only); carbs never below 0.
- Floating order of operations kept as the spec writes it, so values like 2.2 + 0.2 truncate the
  same way every time.
- Maintenance: a formula target's difference equals its pace adjustment; −49 and +49 read close,
  −50 deficit, +50 surplus; a saved target (2 600 over 2 102) reads surplus 498.

Our design differences / decisions:
- Names are ours (`formulaPlan`, `paceAdjustment`, `estimateMaintenance`, balance `close`).
- Age is not on the profile: callers pass `today` (a `DayKey`), and `ageOn` gives whole years.
- The legacy "use body fat in BMR" switch does not exist in our model: body fat present means
  Katch-McArdle, as the shipped app behaves.
- The steps-a-day guide is data (`{from, below}` half-open, `below` null for the top level), not
  text; the screens word it from the catalogue.
- The fixture profiles live in `__fixtures__/profiles.ts` (the shared defaults function is P01-15).

Tests we will write:
- `formulas.test.ts`: the default profile's BMR, TDEE and plan (ACC-C1-1); the Katch case;
  female/other base; the factor table in order; pace adjustments (275 / 550 / 1 100, signs,
  default 0.5, no −0); the 100 kg protein case with and without body fat; no kcal floor and the
  carbs floor at 0; a truncation table where rounding would differ (R01.9).
- `maintenance.test.ts`: truncated TDEE as maintenance; formula targets' difference = adjustment;
  saved target compared as followed; −49 close, −50 deficit, +49 close, +50 surplus.
- `integers.test.ts`: `div` cuts toward zero; `floorMod` of negatives (R01.9).

Compare checklist (filled after the rewrite; reopened `A/models/UserProfile.kt`,
`I/Models/UserProfile.swift` (formula part), `A/models/ActivityLevel.kt`,
`T/models/UserProfileGoalFormulaTest.kt`, `IT/MaintenanceBreakdownTests.swift`):
- [x] Multipliers and protein rates per level in order, moderate 1.465; step guides from the iOS
  level descriptions (`src/domain/goals/formulas.test.ts > activity table > lists multipliers and
  protein rates from the least active level up`, `> gives each level a steps-a-day band that
  starts where the previous one ends`).
- [x] Mifflin with +166 for men only, female and other on the base; age from the birth date
  (`formulas.test.ts > bmr and tdee > gives the default profile 1 673.75 kcal at rest and about
  2 452.04 a day`, `> adds 166 for men only; female and other use the shared base`, `> takes age
  from the birth date on the given day`).
- [x] Katch-McArdle whenever body fat is known, independent of age and height (the reference's
  legacy switch does not exist here) (`formulas.test.ts > bmr and tdee > uses the lean-mass
  equation when body fat is known: 80 kg at 20 % → 1 752.4`).
- [x] Pace adjustment ±trunc(rate × 7 700 ÷ 7), default 0.5, maintain 0 (`formulas.test.ts >
  paceAdjustment > turns 0.25 / 0.5 / 1.0 kg a week into 275 / 550 / 1 100 kcal a day`, `> uses
  0.5 kg when no pace is set, and 0 for maintain whatever is stored`).
- [x] Formula kcal = trunc(TDEE) + adjustment, no floor; protein on full body weight with the
  +0.2 losing extra; fat 0.6 g/kg; carbs floored at 0 (`formulas.test.ts > formulaPlan > gives the
  default profile 2 452 kcal, 112 g protein, 406 g carbs, 42 g fat (ACC-C1-1)`, `> keeps protein
  on full body weight: 100 kg at 30 % fat, losing → 180 g either way`, `> adds 0.2 g/kg of protein
  only while losing`, `> has no kcal floor and never gives negative carbs`).
- [x] Truncation everywhere (R01.9) (`formulas.test.ts > formulaPlan > truncates every step instead
  of rounding (R01.9)`; `integers.test.ts > div > divides whole numbers and cuts the quotient
  toward zero (R01.9)`).
- [x] Maintenance = trunc(TDEE), difference = target − maintenance, formula difference = the
  adjustment, saved target compared as followed (`maintenance.test.ts > estimateMaintenance > uses
  the truncated daily burn: 2 102 for the 80 kg lean-mass profile`, `> gives a formula target's
  pace adjustment as the difference`, `> compares a saved target as the one followed`).
- [x] ±50 band: ≤ −50 deficit, ≥ +50 surplus, between close (`maintenance.test.ts > balanceOf >
  reads gaps under 50 kcal either way as close`, `> reads −50 or lower as a deficit and +50 or
  higher as a surplus`).
- Deliberate differences: age is computed from a `today` argument (no clock); no legacy
  body-fat switch; a zero pace while losing gives 0 rather than −0; the step guide is numbers
  (the screens word it).
- Not taken: display name and initials (no name field in our model); the defaults record (P01-15);
  the "recalculated from formulas" profile copy (applying a plan is P05's job; `formulaPlan` gives
  the numbers); labels and subtitles of the levels (catalogue copy, P05).

## Decisions for the lead

- `formulaPlan`, `bmr`, `tdee` and `estimateMaintenance` take `today` (a `DayKey`) because age is
  derived; callers pass the local today.
- The steps-a-day guide is `{from, below}` with `below: null` for the top level (half-open, so
  the screens show "under 5 000", "5 000–7 499", …, "15 000+").
- Extra exports beyond the phase row: `integers.ts` (`div`, `floorMod`, with tests), `bmrMethod`,
  `formulaProtein`, `formulaFat`, `carbsLeft`, `paceAdjustment`, `balanceOf`, the constants, and
  the fixture file `src/domain/goals/__fixtures__/profiles.ts` (`FIXTURE_TODAY` = 2026-10-26,
  `defaultProfile`, `katchProfile`, `lose100Profile`, `profileWith`).

## Status

Done (2026-10-26). Formulas, maintenance estimate, integer helpers and the fixture profiles are in
place with their tests (formulas 17, maintenance 5, integers 2), all passing. Nothing outside
`src/domain/goals/**` and this note changed. Traps covered: R01.9.
