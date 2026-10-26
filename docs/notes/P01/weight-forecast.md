# Task: weight forecast (P01-18) · Phase: 01 · Owner: builder (wt-p01c5)

<!-- Save as platewise/docs/notes/P<nn>/<slug>.md. Write everything above "Compare checklist"
BEFORE writing code, in your own words. Never paste or paraphrase the reference line by line. -->

Read (reference @ `10e14b67`): `A/services/WeightAnalysisService.kt` (all; the forecast part, the
unused weekly corrector in the same file is not built, D-16.45), `I/Services/WeightAnalysisService.swift`
(all), `IT/GoalEvidenceTests.swift` (the forecast test); research spec `01-profile-goals.md` §3.12
and §6 R01.16; acceptance row ACC-C13-1 (owned by P08-01, the Coach context that prints it). No
Evidence ids.

What it does (own words): an energy-balance estimate of where the person's weight is heading, for
the Coach context only (not shown on Progress). Average intake is the kcal logged over the 90
finished days ending yesterday, divided by the number of distinct days that have entries (a day
with nothing logged is unknown and is not averaged in as 0; today is left out because it is still
in progress). The daily balance is that average minus the whole-kcal TDEE; 7 700 kcal is one kg, so
the predicted weekly change is balance × 7 ÷ 7 700. Separately, a straight line fitted through the
weigh-ins from the window start through today gives the observed weekly change. From the current
weight (newest weigh-in, else the profile) it projects the weight in 30, 60 and 90 days and, when
the person has a goal weight and the prediction moves toward it, how many days it would take. When
both trends exist and differ by more than 0.3 kg a week, the person may be under-logging.

Inputs → outputs: `forecastWeight({ profile, entries, weighIns, today })` → `WeightForecast`:
`avgKcal` (whole kcal, integer division, 0 with no logged day), `loggedDays`, `tdee` (trunc),
`balance`, `predictedWeeklyKg`, `observedWeeklyKg` (`null` with < 2 points or one instant),
`weighInsUsed`, `currentKg`, `expectedKg` (`{ in30, in60, in90 }`), `daysToGoal` and `goalDay`
(`null` unless reachable), `enoughData`, `trendsDisagree`. Also `weeklySlopeKg(points)` for the fit
and `daysToGoalWeight(goal, goalKg, currentKg, weeklyKg)`.

Files: created `src/domain/forecast/forecast.ts`, `src/domain/forecast/forecast.test.ts`, this note.
Uses `tdee`, `KCAL_PER_KG`, `intDiv` (goals/formulas.ts), `addDays` (dates/dayKey.ts), `inDays`
(dates/ranges.ts), `finishedDays`, `keyInWindow` (forecast/evidence.ts), `latestByTime`
(trackers/goalCrossing.ts).

Edge cases / failure modes:
- Today's food never counts; entries after today and before the window neither.
- No logged day → average 0, balance = −TDEE (as recorded); `enoughData` false.
- One weigh-in, or several at the same instant → no observed trend.
- Weigh-ins older than the window start are not in the fit; the newest weigh-in is the current
  weight even when it is older than the window.
- Days to goal: none without a goal weight, for maintain, with a predicted change of exactly 0, or
  when moving away (lose with predicted ≥ 0 or goal ≥ current; gain mirrored).
- Disagreement needs enough data and an observed trend; strictly more than 0.3.
- Day boundaries of weigh-ins follow the runtime zone (NY and Tokyo tested).

Our design differences / decisions:
- Our names (`forecastWeight`, `WeightForecast` fields).
- Food days come from the entry's stored `dayKey` (as in the evidence pack).
- The fit uses x in days (ms ÷ 86 400 000), so the slope is kg a day and × 7 gives kg a week; the
  same line as a fit in seconds, scaled.
- The reach date is a day key (`today` + days, by calendar), since the Coach prints a date.
- The reference's deterministic weekly corrector next to the forecast is not built (D-16.45).

Tests we will write:
- 1 400 two days ago, 1 600 yesterday, 300 today → average 1 500 over 2 days; three weigh-ins used;
  enough data.
- Integer division of the average; no food → 0.
- Slope of a straight 0.5 kg/week line (and a falling one); none with one point or one instant.
- Expected weight at 30/60/90 days.
- Days to goal for lose moving down (70 days for 5 kg at −0.5 kg/week); none when moving away; none
  for maintain, without a goal weight, or at a zero prediction; gain mirrored.
- Not enough data with one weigh-in or one food day.
- Disagreement at 0.31 but not at 0.29.
- Current weight = newest weigh-in, else profile weight.
- Window edges for food and weigh-ins in America/New_York and Asia/Tokyo.

Compare checklist (filled after the rewrite; reopened `A/services/WeightAnalysisService.kt`,
`I/Services/WeightAnalysisService.swift`, `IT/GoalEvidenceTests.swift`; all tests in
`src/domain/forecast/forecast.test.ts`):
- [x] Average over distinct logged days in the 90 finished days, integer division, 0 without one,
  today left out (`forecastWeight: average intake > averages 1 400 two days ago and 1 600
  yesterday as 1 500 over 2 days, leaving out today's 300 (R01.16)`, `> divides the total by the
  logged days with integer division`, `> counts a day with several entries once`, `> gives 0
  without a logged day, so the balance is minus the whole TDEE`, `> leaves out food from before the
  window and after today`).
- [x] Balance against trunc(TDEE), weekly kg at 7 700 kcal, 30/60/90-day weights (`forecastWeight:
  prediction > subtracts the whole-kcal TDEE: 550 kcal a day under it is 0.5 kg a week`, `>
  projects the weight at 30, 60 and 90 days from the newest weigh-in`).
- [x] Least-squares slope, none with < 2 points or one instant (`weeklySlopeKg > gives 0.5 for a
  straight line rising 0.5 kg a week`, `> gives -0.5 for a falling line, whatever the order of the
  points`, `> gives null for one point or for points at one instant`).
- [x] Fit window from the window start through today; current weight = newest weigh-in else
  profile (`forecastWeight: observed trend and current weight > fits only the weigh-ins from the
  window start through today`, `> takes the newest weigh-in as the current weight, even one older
  than the window`, `> falls back to the profile weight without weigh-ins`).
- [x] Days to goal: goal weight, not maintain, non-zero prediction, right direction, rounded
  (`forecastWeight: days to goal > gives 70 days for 5 kg to lose at -0.5 kg a week, and the day
  that lands on`, `> gives none when the prediction moves away from the goal`, `> gives none for
  maintain, without a goal weight, or at a zero prediction`, `> mirrors lose for gain`, `> rounds to
  the nearest whole day`).
- [x] Enough data (≥ 2 food days, ≥ 2 weigh-ins) and the 0.3 kg/week hint (`forecastWeight: enough
  data and the under-logging hint > is not enough data with one weigh-in`, `> is not enough data
  with one food day`, `> flags trends 0.31 kg a week apart but not 0.29`, `> gives no hint without
  an observed trend`).
- [x] Day edges in both zones (`forecastWeight: day boundaries > fits weigh-ins from the first
  window day through the end of today in America/New_York`, `> … in Asia/Tokyo`).
- Deliberate differences: food days from the stored `dayKey`; the fit runs on days instead of
  seconds (same line); days to goal computed as |remaining| × 7 ÷ |weekly| in one expression (the
  reference divides 7 by the pace first; the two can only differ on an exact .5 tie); the reach date
  is a day key (`today` + days) instead of an instant.
- Not taken: the deterministic weekly corrector that lives next to the forecast (D-16.45); the
  Coach text (P08-01).

## Decisions for the lead

- `goalDay` is a day key, `today` + `daysToGoal` by calendar; the Coach prints a date, not a time.
- `forecastWeight` takes `today` only (no `now`): every rule is by local day except the fit, which
  uses each reading's own instant.
- `evidence.ts` owns the shared window (`finishedDays`, `keyInWindow`, `LOOKBACK_DAYS`) and
  `forecast.ts` imports it; `latestByTime` comes from `trackers/goalCrossing.ts`.

## Status

Done (2026-10-26). `forecast.ts` with 24 tests; nothing outside the slice's files changed. R01.16's
"today excluded" also holds for the forecast (tested). ACC-C13-1 (owned by P08-01) prints this
result.
