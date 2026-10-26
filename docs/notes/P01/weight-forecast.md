# Task: weight forecast (P01-18) · Phase: 01 · Owner: builder (wt-p01c5)

<!-- Save as platewise/docs/notes/P<nn>/<slug>.md. Write everything above "Compare checklist"
BEFORE writing code, in your own words. Never paste or paraphrase the reference line by line. -->

Read (reference @ `10e14b67`): `A/services/WeightAnalysisService.kt` (all: the forecast record,
the 90-day intake average, the balance against the truncated burn, the regression over
weigh-ins, the 30/60/90-day weights, days to goal, the enough-data and disagreement flags; the
deterministic corrector in the same file is not built, D-16.45), `I/Services/WeightAnalysisService.swift`
(all: the same maths on the iOS calendar), `IT/GoalEvidenceTests.swift` (the case that excludes
today's diary from the average). Research spec `01-profile-goals.md` §3.12. No Evidence ids.

What it does (own words): a small energy-balance projection the Coach quotes when the person asks
where their weight is heading. It averages what they ate over the finished days of the last 90
(today is in progress, so it is left out), compares that with the formula burn, and turns the
daily gap into kilograms a week at 7 700 kcal per kg. Separately it fits a straight line through
the weigh-ins of the same span (today's reading included) to get the trend the scale shows. From
the projected pace it gives the weight in 30, 60 and 90 days and, when there is a goal weight in
the right direction, how many days remain. When both trends exist but differ by more than 0.3 kg a
week, the Coach may suggest that food is being under-logged. No AI, no clock: `today` is a
parameter.

Inputs → outputs: `forecastWeight({profile, entries, weighIns, today})` → `WeightForecast`:
- `daysLogged` (distinct `dayKey`s with ≥ 1 entry in today − 90 … today − 1) and `avgKcal`
  (total kcal div days logged, 0 when none);
- `maintenanceKcal` = trunc(TDEE) via `tdee(profile, today)`; `balanceKcal` = avg − maintenance;
- `predictedWeeklyKg` = balance × 7 ÷ 7 700;
- `currentKg` = the newest weigh-in by instant, else the profile weight;
- `weighInsUsed` and `observedWeeklyKg` = least-squares slope of kg over seconds for the weigh-ins
  from the window start through the end of today, × 86 400 × 7; `null` with fewer than 2 points or
  when every point has the same instant;
- `expectedKg` {`d30`, `d60`, `d90`} = current + predicted × d ÷ 7;
- `daysToGoal` and `goalDay` (today + days on the calendar) only when a goal weight exists, the
  goal is not maintain, predicted ≠ 0 and it moves the right way (lose: predicted < 0 and goal <
  current; gain: predicted > 0 and goal > current); days = round(|goal − current| × 7 ÷
  |predicted|); otherwise both `null`;
- `enoughData` = days logged ≥ 2 and weigh-ins used ≥ 2;
- `trendsDisagree` = enough data, an observed trend, and |predicted − observed| > 0.3.
Constants exported: `FORECAST_MIN_FOOD_DAYS` (2), `FORECAST_MIN_WEIGH_INS` (2),
`DISAGREE_KG_PER_WEEK` (0.3). Helpers exported: `weeklyTrend(readings)` (the fitted pace) and
`daysToTarget(goal, target, current, weeklyKg)`.

Files: created `src/domain/forecast/forecast.ts`, `src/domain/forecast/forecast.test.ts`, this note.

Edge cases / failure modes:
- Food on today never counts (1 400 two days ago, 1 600 yesterday, 300 today → 1 500 over 2 days).
- The average is integer division of whole kcal (1 401 + 1 600 over 2 → 1 500), as both
  reference platforms do; the row does not ask for rounding here.
- No entries: average 0, balance = −maintenance, so the projection falls steeply: `enoughData`
  is false and the Coach shows the not-enough-data line instead.
- A weigh-in after today is not in the regression; it still is the current weight (the newest).
- Two weigh-ins at the same instant: no observed trend (zero spread in x).
- Predicted exactly 0 (eating at maintenance): no days to goal.
- Lose with a goal above the current weight, or gain with one below: no days to goal.
- Disagreement just above and below 0.3 (0.31 yes, 0.29 no).

Our design differences / decisions:
- Names are ours (`forecastWeight`, `WeightForecast`, `expectedKg`, `goalDay`, …).
- `today` replaces "now": the window, the regression's end and the age in the formulas only need
  the day. The reach date is a day key (today + days on the calendar), so it never needs an instant.
- Entries are placed by `dayKey`, weigh-ins by their instant in the runtime zone, the same as the
  evidence pack (P01-17), whose window helper this module reuses.
- The deterministic weekly corrector that shares the reference file is not built (D-16.45).

Tests we will write:
- The worked example: 1 400 two days ago, 1 600 yesterday, 300 today → 1 500 over 2 days, three
  weigh-ins used, enough data.
- Average uses integer division; 0 with no entries.
- Maintenance is trunc(TDEE) of the default profile (2 452) and balance follows.
- Predicted pace: 550 kcal under maintenance a day → −0.5 kg a week; 30/60/90-day weights.
- Observed slope of a straight 0.5 kg/week line (and a falling one); none with one weigh-in or
  with two at one instant; a weigh-in later today is used, one tomorrow is not.
- Current weight: newest weigh-in, else the profile.
- Days to goal for lose moving down (and gain moving up); none when moving away, for maintain,
  without a goal weight, or when predicted is 0.
- Not enough data with one weigh-in, or with one logged day.
- Disagreement at 0.31 but not at 0.29, and never without enough data.

Compare checklist (filled after the rewrite; reopened `A/services/WeightAnalysisService.kt`,
`I/Services/WeightAnalysisService.swift`, `IT/GoalEvidenceTests.swift`):
- [x] Intake: finished days of the 90-day window, distinct days, integer division, 0 without days
  (`src/domain/forecast/forecast.test.ts > forecastWeight: intake > averages 1 500 over 2 days from
  1 400 two days ago, 1 600 yesterday and 300 today`, `> divides the total by the logged days with
  integer division`, `> counts several entries of one day as one logged day`, `> gives an average
  of 0 with no logged days, and ignores food outside the 90 finished days`).
- [x] Balance against trunc(TDEE), pace at 7 700 kcal per kg (`forecastWeight: intake > balances
  against the formula burn cut to whole kcal`; `forecastWeight: projection > projects −0.5 kg a
  week for 550 kcal under maintenance, at 30, 60 and 90 days`).
- [x] Current weight: newest weigh-in, else the profile (`forecastWeight: projection > takes the
  newest weigh-in as the current weight, else the profile weight`).
- [x] Regression over the window start through today, none below two points or at one instant
  (`forecastWeight: observed pace > fits the slope of a straight 0.5 kg/week line`, `> fits a
  least-squares line through scattered readings`, `> has no observed pace with one weigh-in or with
  two at the same instant`, `> uses weigh-ins from the window start through the end of today
  only`).
- [x] Days to goal: goal weight, not maintain, pace ≠ 0, right direction, rounded
  (`forecastWeight: days to goal > counts the days for lose moving down: 5 kg at 0.5 kg a week is
  70 days`, `> counts the days for gain moving up`, `> has none when the pace moves away from the
  goal`, `> has none for a target on the wrong side, maintain, no target, or an even balance`, `>
  rounds to whole days`).
- [x] Enough data: 2 logged days and 2 weigh-ins (`forecastWeight: enough data > needs 2 logged
  days and 2 weigh-ins`).
- [x] Disagreement above 0.3 kg a week, only with enough data and an observed pace
  (`forecastWeight: under-logging hint > flags paces 0.3 kg a week apart: at 0.31 but not at
  0.29`, `> never flags without enough data`).
- Deliberate differences: `today` (a day key) instead of the clock; the reach date is a day key
  (today + days on the calendar; Android adds 24-hour steps to now); time is fitted in fractional
  seconds from the first reading (Android uses whole epoch seconds), and a list whose readings all
  share one instant is caught before the division; entries are counted by their stored `dayKey`.
- Not taken: the deterministic weekly corrector in the same reference file (D-16.45); the Coach
  text (P08-01).

## Decisions for the lead

- The intake average stays integer division (both reference platforms and spec §3.12 say div);
  the "round of averages" decision applies to the evidence pack (P01-17).
- `forecastWeight` takes `today` only; the Coach context (P08-01) passes the same day key it uses
  for the evidence. `goalDay` replaces the reference's reach instant.
- `currentKg` is the newest weigh-in by instant even when it is dated after today (as the
  reference); such a reading is outside the regression.
- Extra exports beyond the row: `weeklyTrend`, `daysToTarget`, `ExpectedWeights`, the constants.

## Status

Done (2026-10-26). `forecast.ts` with 19 tests in `forecast.test.ts`, all passing. Nothing outside
`src/domain/forecast/**` changed; it imports `dates`, `goals/formulas`, `goals/integers`,
`completedWindow`/`inWindow` from `evidence.ts` and `latestWeighIn` from
`src/domain/trackers/goalCrossing.ts` (same slice).
