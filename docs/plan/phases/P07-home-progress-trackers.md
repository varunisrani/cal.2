# P07 · Home depth, Progress, water, fasting, weight and body fat

**Weeks:** 2–3 · **Tracks:** UI (Home, Progress, trackers); domain (ranges, charts maths, recap, averages) · **Depends on:** P01, P02, P04, P06 (add menu, diary rows) · **Status:** 🔨 in progress: P07-01..16 landed (16/17, 2026-10-27)

Reference paths are relative to `$PLATEWISE_REF` (`/root/reference/fud-ai`, pinned at `10e14b67`). Prefixes: `A/` = `android/app/src/main/java/com/apoorvdarshan/calorietracker/`, `I/` = `ios/calorietracker/`, `T/` = `android/app/src/test/java/com/apoorvdarshan/calorietracker/`, `IT/` = `ios/calorietrackerTests/`. A number in brackets is the file's length in lines; read only the named part of a big file. Read the research spec section first, then the reference, then its tests.

## Goal

Home becomes the full day view: a week bar of 53 weeks, day swipe, the gauge and up to four chosen pillars plus water, the day's nutrient sheet, both sort modes, water and fasting rows. Water and fasting work end to end (off by default; an active fast pauses food logging with "End fast and log", D-16.35). Progress shows the last completed week's recap, ranges with period arrows, weight and body-fat cards with charts and logging, histories with confirmed deletes, the calorie history and nutrient averages.

## Slices and waves

Each slice owns its files; no two slices in a wave touch the same path. A builder takes one slice, runs Read → note → Rewrite → Compare for each task, then the loop until green. The lead lands one commit per slice and writes any deviation back into this file.

- **Wave A:** S1 = P07-01..04 (`src/features/home/{WeekBar,DaySwipe,useSelectedDay,PillarRow,DayNutrientsSheet,PillarPicker}.tsx`, `DaySummary.tsx` and `HomePage.tsx` updates) · S2 = P07-05..08 (`src/features/home/{Diary (update),WaterRow,FastRow,SortMenu}.tsx`, `src/features/water/**`, `src/features/fasting/**`, `AddMenu.tsx` update, settings registry update) · S3 = P07-10, P07-11 (`src/ui/charts/**`, `src/domain/progress/chartMath.ts`).
- **Wave B:** S4a = P07-09, P07-12..14 (`src/features/progress/{ProgressPage,RangeBar,MetricSwitch,WeightCard,LogWeightSheet,BodyFatCard,LogBodyFatSheet,HistorySheet}.tsx`, `src/domain/progress/ranges.ts`) · S4b = P07-15, P07-16 (`src/domain/progress/{recap,averages}.ts`, `src/features/progress/{RecapCard,CaloriesCard,AveragesCard}.tsx`).
- **Wave C:** P07-17 (`e2e/home-progress.spec.ts`).

## Tasks (17)

| ID | Task | Read in reference | New files | Verify |
|---|---|---|---|---|
| P07-01 | **Week bar.** `src/features/home/WeekBar.tsx` (05 §3.2.1, D-16.36): pages of 7 day tiles from P01-02 `weekPages` (current week and the 52 before; never a future week), first weekday from the setting; each tile a narrow weekday letter over the day number; selected = filled accent circle; today (not selected) = accent ring; days after today are shown but disabled; selecting a day in another week moves the bar to that week; a setting change re-anchors on the current week; keyboard: arrow keys move between enabled days. | `A/ui/components/WeekStrip.kt` [238: all]; `I/Views/HomeComponents.swift` [778: week strip part] | `src/features/home/WeekBar.tsx`, `src/features/home/WeekBar.test.tsx` | tomorrow's tile is disabled and not focusable by click; selecting last Monday moves to that week; Sunday start shows Sunday first; 53 pages; today ring shown when another day is selected. |
| P07-02 | **Selected day and day swipe.** `src/features/home/useSelectedDay.ts`: the selected day for Home (default today, reset to today on every new Home visit after a cold start and by shortcuts), with `stamp()` = P01-02 `stampForDay`. `DaySwipe.tsx`: a horizontal swipe on the summary region only (not the diary) changes the day: leftward = next day, rightward = previous; it needs ≥ 80 px of horizontal travel and \|dx\| > 1.5 \|dy\|; never moves past today. Update `HomePage.tsx` to pass the selected day to the summary, diary and logging flows (new entries stamped for that day). | `I/ContentView.swift` [7 966: lines 1270–1295 day swipe]; `A/ui/home/HomeViewModel.kt` [1 255: `timestampForSelectedDay`] | `src/features/home/useSelectedDay.ts`, `src/features/home/useSelectedDay.test.ts`, `src/features/home/DaySwipe.tsx`, `src/features/home/DaySwipe.test.tsx` | swipe right 100 px moves to yesterday; 60 px does nothing; diagonal swipe ignored; swipe left on today does nothing; a manual entry logged while yesterday is selected is stamped yesterday at the current clock time. |
| P07-03 | **Gauge and pillars, full.** Update `DaySummary.tsx` and add `PillarRow.tsx` (05 §3.2.2–3.2.3): the gauge for the selected day with the kJ heading when needed; 1–4 chosen pillars (settings, P01-07) then a fixed water pillar when water tracking is on; each pillar: day total (one decimal only when not whole), tube, name, status "N g left", "N g over", "Goal reached" or "No goal" (goal 0) in the nutrient's unit; protein/carbs/fat goals from targets, others from the optional goals. The fill-from-zero animation on cold start and real foreground returns is P2 (F13); when built it follows R05.18 (an open epoch above the router, never on tab switches or edits). | `A/ui/components/MacroCard.kt` [158]; `A/ui/home/HomeScreen.kt` [3 229: lines 1666–1850] | `src/features/home/PillarRow.tsx`, `src/features/home/PillarRow.test.tsx` | sodium pillar with goal 2 300 and 2 500 eaten shows 200 mg over; a nutrient with goal 0 shows No goal; water pillar appears only when tracking is on, after the chosen ones; kJ heading switches. |
| P07-04 | **Day nutrients sheet and pillar picker.** `DayNutrientsSheet.tsx` (05 §3.2.4): opened by an "All nutrients" link under the pillars; sections: Home pillars (names the chosen ones, plus water; opens the picker), water (when on), macros (kcal in the display unit and P/C/F against goals), detailed nutrition (the 21 optional goal nutrients plus mono- and poly-unsaturated fat without goals, then the 8 extras); a total of exactly 0 shows "—". `PillarPicker.tsx`: all 32 nutrients with checks; the P01-07 rules (1–4, last cannot be removed, a fifth replaces the most recent); water as a locked row when on; the chosen order with position numbers; Reset to default; Done saves, Cancel discards. | `A/ui/home/NutritionDetailSheet.kt` [623: all]; `I/Views/HomeComponents.swift` [778: nutrient picker part] | `src/features/home/DayNutrientsSheet.tsx`, `src/features/home/DayNutrientsSheet.test.tsx`, `src/features/home/PillarPicker.tsx`, `src/features/home/PillarPicker.test.tsx` | values are for the selected day; MUFA shows no goal; picking a fifth nutrient replaces the latest pick; Cancel leaves settings unchanged; Reset restores protein, carbs, fat, fibre. |
| P07-05 | **Diary depth: sort modes, water and fast rows.** Update `Diary.tsx` (05 §3.3, R05.9): include water logs and fasts (P01-08 `fastsOnDay`) for the selected day; a sort control only in the first section header (`SortMenu.tsx`: by meal / newest first, persisted); `WaterRow.tsx` (drop icon, "Water", time, amount in the water unit); `FastRow.tsx` (active: started time, elapsed ticking every second while visible, goal, thin progress bar capped at 1; completed: duration, start–end times, goal); swipe-delete with a confirmation for water and completed fasts; tap a fast → the fast editor (P07-07). Rows of a tracker that is switched off still show. | `A/ui/home/HomeScreen.kt` [3 229: lines 1235–1527 fasting rows, 1868–2150 headers, 2204–2470 water row]; `T/ui/home/HomeDiaryMealGroupTest.kt` [82] | `src/features/home/SortMenu.tsx`, `src/features/home/WaterRow.tsx`, `src/features/home/WaterRow.test.tsx`, `src/features/home/FastRow.tsx`, `src/features/home/FastRow.test.tsx` | newest-first mode shows repeated meal sections; the active fast row advances by one second with fake timers; water rows still show with tracking off; deleting a water row asks first; the sort control only in the first header. |
| P07-06 | **Water flows and settings.** `src/features/water/` (05 §3.6, D-16.39): `WaterMenuPage.tsx` (the + menu's Water page: three quick-add amounts that log at once with a short confirmation, "Custom amount" and Back); `CustomWaterSheet.tsx` (one numeric field with the unit suffix and the P01-05 filters, Add enabled above 0, capped at 5 000 ml); entries stamped by the selected-day rule. `WaterSettings.tsx` (switch, off by default; daily goal wheel; ml / fl oz; quick-add editor `PresetsEditor.tsx` with untouched fields keeping exact ml, Save disabled on error, Reset). Turning water off also turns its reminder off. Mount the water and fasting settings on a Tracking page registered in the settings registry (P09-03 adds meal times and reminders to it). | `A/ui/home/WaterViews.kt` [99]; `A/data/WaterRepository.kt` [36]; `A/ui/settings/SettingsScreen.kt` [5 141: lines 3786–4020 water part] | `src/features/water/WaterMenuPage.tsx`, `src/features/water/WaterMenuPage.test.tsx`, `src/features/water/CustomWaterSheet.tsx`, `src/features/water/CustomWaterSheet.test.tsx`, `src/features/water/WaterSettings.tsx`, `src/features/water/WaterSettings.test.tsx`, `src/features/water/PresetsEditor.tsx`, `src/features/water/PresetsEditor.test.tsx`, `src/features/settings/tracking/TrackingPage.tsx`, `src/i18n/en/trackers.ts` | tapping 500 ml logs 500 on the selected day; custom 6 000 refused; fl oz preset editor round trip keeps 250; turning water off turns its reminder off; goal wheel in fl oz. |
| P07-07 | **Fasting flows, editor and settings.** `src/features/fasting/` (05 §3.7, D-16.35): `StartFastSheet.tsx` (goal stepper 1–168 h seeded with the default; Start starts now); End and Cancel from the + menu act at once; `FastEditor.tsx` (Started date and time, Ended for completed fasts, never before start, goal hours; active: End fast now (one write with the edits, `fastRepo.endNow`) and Cancel fast; completed: Delete fast; Save keeps an active fast active; refusals show "overlaps another fast" with a hint); `FastingSettings.tsx` (switch, off by default; default goal wheel; turning off ends an active fast); `PausedDialog.tsx`: the shared "fast in progress" dialog for any refused food write, offering "End fast and log" (calls `diaryRepo.endFastAndAdd`) and Cancel; wire it into review, manual, copy, combine and reuse paths through the diary service's `fastActive` result. | `I/Views/FastingViews.swift` [320]; `A/ui/home/HomeScreen.kt` [3 229: lines 1235–1527]; `IT/FastingStoreTests.swift` [125] | `src/features/fasting/StartFastSheet.tsx`, `src/features/fasting/StartFastSheet.test.tsx`, `src/features/fasting/FastEditor.tsx`, `src/features/fasting/FastEditor.test.tsx`, `src/features/fasting/FastingSettings.tsx`, `src/features/fasting/FastingSettings.test.tsx`, `src/features/fasting/PausedDialog.tsx`, `src/features/fasting/PausedDialog.test.tsx` | start → the + menu hides food methods and shows the fasting page; logging from review during a fast shows the dialog; End fast and log ends the fast and logs in one step; editing a fast to overlap another shows the refusal and changes nothing; tracking off ends the active fast. |
| P07-08 | **Add menu: water and fasting entries.** Update `AddMenu.tsx` (05 §3.4): below the food groups a divider, Water (when water tracking is on) and Start fast (fasting on, none active) or Fasting (active: End fast, Cancel fast, Back); while a fast is active every food group and method is hidden. | `A/ui/home/HomeScreen.kt` [3 229: lines 226–600 + menu parts] | — (updates only; see Files to update) | `AddMenu.test.tsx` (extended): water off → no Water row; fast active → only the fasting rows (and Water); End fast from the menu ends it at once. |
| P07-09 | **Progress layout, ranges and periods.** `src/domain/progress/ranges.ts` (05 §3.5.2, §3.5.7): ranges 1W 7, 1M 30, 3M 90, 6M 180, 1Y 365, All 3 650 days; window [end − (days − 1), end] with offset steps of whole windows; offset reset when the range changes; nutrition windows end yesterday when "Count today" is off (and past periods shift by one day too); metric availability: weight always, body fat when any reading, a profile value or a body-fat goal exists; a vanished metric falls back to weight. `ProgressPage.tsx`: recap card, range `Segmented` (default 1W, not persisted), `RangeBar.tsx` period arrows with the label (P00-06 `formatPeriod`; forward disabled at offset 0; hidden for All), `MetricSwitch.tsx`, the metric card and its history link, the Count-today switch (persisted, default on) and the nutrition cards. | `A/ui/progress/ProgressScreen.kt` [2 901: lines 167–657]; `A/ui/progress/{ProgressViewModel,ProgressMetric}.kt` [114, 20]; `T/ui/progress/{ProgressRangeTest,ProgressMetricTest}.kt` [171, 57]; `IT/ProgressRangeTests.swift` [180] | `src/domain/progress/ranges.ts`, `src/domain/progress/ranges.test.ts`, `src/features/progress/RangeBar.tsx`, `src/features/progress/RangeBar.test.tsx`, `src/features/progress/MetricSwitch.tsx`, `src/features/progress/progress.module.css`, `src/i18n/en/progress.ts` | 1M offset 1 ends 30 days before today; windows are contiguous; changing range resets offset; Count today off ends at yesterday and shifts offset windows; body fat hidden without data and shown with a goal only; label shows the year only across years. |
| P07-10 | **Line chart.** `src/domain/progress/chartMath.ts`: y padding max(15 % of range, 2) units (body fat: max(15 %, 1), floor 0), about five nice ticks (1, 2, 5 or 10 × a power of ten), downsampling into equal date buckets averaged in time and value with limits by span (≤ 45 days 60, ≤ 100 48, ≤ 200 36, ≤ 400 30, else 24), x labels (5 evenly spaced, de-duplicated; first/middle/last with month and year when the span is over 150 days and crosses a year). `src/ui/charts/LineChart.tsx`: SVG, a smooth Catmull-Rom curve in the accent with a soft area, dots only at ≤ 31 points, a dashed goal line in the success colour, tick labels on the right, dashed vertical guides; inspector: press-drag shows a vertical line, a ringed dot and a tooltip on the nearest point; only clearly horizontal drags (\|dx\| > 1.5 \|dy\|) scrub; pointer state stays local and the chart re-renders only when the nearest point changes (R05.16); a hidden table lists the points for screen readers. Lazy-loaded with the Progress tab. | `A/ui/progress/ProgressScreen.kt` [2 901: lines 760–1400 weight chart, ticks, downsample]; `I/Views/ProgressComponents.swift` [2 131: chart domains] | `src/domain/progress/chartMath.ts`, `src/domain/progress/chartMath.test.ts`, `src/ui/charts/LineChart.tsx`, `src/ui/charts/LineChart.test.tsx`, `src/ui/charts/charts.module.css` | ticks for 68.2–74.9 kg; padding includes the goal; 365 daily points downsample to 30 buckets; labels for a 200-day span across New Year; a vertical drag does not scrub; moving within one point's zone does not re-render (render counter). |
| P07-11 | **Bar chart.** `src/ui/charts/BarChart.tsx` (05 §3.5.7, R05.15): bars only for days with data (absent days are gaps, not zero bars); rounded tops in the accent; a dashed goal line; y top = the highest nice tick at or above max(max day, goal); geometry: bars share the width with gaps of 4, each bar at most 60 wide; when bars of 2 no longer fit, the gap shrinks (not below 1); beyond that bar and gap scale together 2 : 1, so the whole range always fits and the newest day stays reachable; x labels under bar centres thinned to ≥ 40 px each with the last day always labelled; tap pins a tooltip, a second tap or a tap elsewhere clears, horizontal drag scrubs. Hidden table for screen readers. | `A/ui/progress/ProgressScreen.kt` [2 901: lines 1497–1970]; `T/ui/progress/ProgressRangeTest.kt` [171: `denselyLoggedLongPeriodsFitTheWholePlotSoTheLatestDayIsReachable`, `onlyClearlyHorizontalDragsScrubTheCalorieChart`] | `src/ui/charts/BarChart.tsx`, `src/ui/charts/BarChart.test.tsx` | 365 bars fit a 360 px plot with the last bar inside; 7 bars are 60 wide max; labels thinned with the last kept; tap pins and second tap clears; missing days are gaps. |
| P07-12 | **Weight card and logging.** `WeightCard.tsx` (05 §3.5.3): header with "Log weight"; empty prompt when the window has no weigh-ins; badges Current (latest overall), Goal (if set), Net change (last − first in the window, signed, \|x\| < 0.05 → 0.0 without a sign), Average (window mean), one decimal in kg or lb; the line chart with the goal line. `LogWeightSheet.tsx`: kg / lb toggle that changes the app-wide weight unit (R05.11), whole + tenth wheels 20–250 kg or 50–500 lb (D-16.37), converting and clamping on toggle, seeded from latest → profile → 70 kg; a date field that cannot pick a future day; Save stores kg through `weightRepo.addWeighIn` with today → now, earlier day → that day at the current clock time; the goal-reached event comes from the repository. | `A/ui/progress/ProgressScreen.kt` [2 901: lines 1974–2270 log weight]; `T/ui/progress/LogWeightDateTest.kt` [45] | `src/features/progress/WeightCard.tsx`, `src/features/progress/WeightCard.test.tsx`, `src/features/progress/LogWeightSheet.tsx`, `src/features/progress/LogWeightSheet.test.tsx` | net change −0.04 shows 0.0; toggling to lb converts 70.0 → 154.3 and changes the app unit; a future date is not selectable; a back-dated entry keeps the profile weight; Current shows the latest overall even outside the window. |
| P07-13 | **Body-fat card and logging.** `BodyFatCard.tsx` (05 §3.5.4): shown when available; empty only with no readings in the window and no profile value; badges Current (latest, else the profile value), Goal, Net change and Average when the window has readings, one decimal %; chart with floor 0 and % ticks. `LogBodyFatSheet.tsx`: one wheel 3–60 % in 0.5 steps (Proposed D-16.56), seeded latest → profile → 20 %, stamped now; saved through `bodyFatRepo`. | `A/ui/progress/ProgressScreen.kt` [2 901: lines 2296–2620]; `A/data/BodyFatRepository.kt` [181] | `src/features/progress/BodyFatCard.tsx`, `src/features/progress/BodyFatCard.test.tsx`, `src/features/progress/LogBodyFatSheet.tsx` | `BodyFatCard.test.tsx`: no readings but a profile value → Current from the profile, no chart; readings → chart with 0 floor; saving 18.5 % updates the profile body fat. |
| P07-14 | **History sheets.** `HistorySheet.tsx` (05 §3.5.5, D-16.38, R05.22): a link card under the metric card (count and a hint; hidden with no entries) opens all weigh-ins or body-fat readings newest first (value with one decimal over a medium date) with a visible delete button per row; delete asks for confirmation naming the date and value, then removes the row from the open list at once; the repository re-syncs the profile. | `A/ui/progress/ProgressScreen.kt` [2 901: history parts]; `I/Views/ProgressMetricViews.swift` [583: history views] | `src/features/progress/HistorySheet.tsx`, `src/features/progress/HistorySheet.test.tsx` | newest first; delete asks first and Cancel keeps it; confirm removes the row immediately; deleting the latest weigh-in re-syncs the profile weight. |
| P07-15 | **Weekly recap.** `src/domain/progress/recap.ts` (05 §3.5.6, R05.19, D-16.44): the most recent completed week by the app's week start (offset 0 = the week before the current one) compared with the week before; per week: logged days, calorie-target days (logged days within ±10 % of a positive kcal goal, always in kcal), protein days (protein rounded to a whole gram ≥ a positive goal), average kcal over logged days (rounded), weigh-ins and weight change (≥ 2), longest logging streak; highlights (at most 3, improvements only, in order: 7/7 logged or a streak ≥ 3; more calorie-target days; more protein days; average on target with ≥ 3 logged days; more logged days when not a full week); workout tiles, burn and the more-workouts highlight are left out. `RecapCard.tsx`: four tiles (days logged n/7, calorie-target days, protein days, average kcal with the target) with deltas (+2 / −1 / 0, accent when better), the weight row, highlights, arrows (forward stops at 0, session only), an empty message, and a re-read of today on foreground. | `A/ui/progress/{WeeklyRecap,WeeklyRecapCard}.kt` [277, 329]; `I/Models/WeeklyRecap.swift` [298]; `T/ui/progress/WeeklyRecapTest.kt` [443]; `IT/WeeklyRecapTests.swift` [399] | `src/domain/progress/recap.ts`, `src/domain/progress/recap.test.ts`, `src/features/progress/RecapCard.tsx`, `src/features/progress/RecapCard.test.tsx` | Monday-start vs Sunday-start weeks group late-Sunday entries differently; the current week is never recapped; 1 800 kcal with goal 2 000 counts and 1 799 does not (±10 %, 05 §3.5.6); protein 149.6 counts for goal 150; three highlights maximum in priority; kJ display with kcal comparison; empty week message. |
| P07-16 | **Calories card and averages.** `src/domain/progress/averages.ts` (05 §3.5.7, R05.17, R05.4): calorie history = days with kcal > 0 only; "Avg" = integer mean over those days; macro averages per logged day (any food entry); nutrient averages for every other pillar-eligible nutrient, listed unless the average is under 0.05 and the goal is 0; food entries only (water and fasts never count). Compute in a cancellable task: changing range, period, switch, entries or goals cancels the previous run; show a loading card when nothing is shown yet and a small spinner over stale results. `CaloriesCard.tsx` (bar chart with goal line, empty message), `AveragesCard.tsx` (avg / goal with a thin bar, minimum visible width). | `A/ui/progress/ProgressScreen.kt` [2 901: lines 1497–1970 stats]; `T/ui/progress/ProgressRangeTest.kt` [171: `excludingTodayKeepsAPartialDayOutOfTheAverages`] | `src/domain/progress/averages.ts`, `src/domain/progress/averages.test.ts`, `src/features/progress/CaloriesCard.tsx`, `src/features/progress/CaloriesCard.test.tsx`, `src/features/progress/AveragesCard.tsx` | days 1 800 and 2 200 with a missing day between → Avg 2 000 and two bars; macro average divides by logged days; water logs do not change any average; Count today off excludes today's partial day; a newer computation cancels the older one. |
| P07-17 | **Home and Progress e2e.** `e2e/home-progress.spec.ts`: select a past day in the week bar and log water there; swipe the summary back and forth; choose pillars; turn on fasting, start a fast, try to log food → paused dialog → End fast and log; log a back-dated weight and see the chart; delete from history with confirmation; seed a previous week through the UI and see the recap tiles. | none | `e2e/home-progress.spec.ts` | passes three times in a row in the mobile viewport. |

## Files to create (68)

| Path (under `platewise/`) | What it holds | Task |
|---|---|---|
| `src/features/home/WeekBar.tsx` | 53-week day picker | P07-01 |
| `src/features/home/WeekBar.test.tsx` | Tests for `WeekBar.tsx`: the Verify cases of P07-01 | P07-01 |
| `src/features/home/useSelectedDay.ts` | Selected day state and stamps | P07-02 |
| `src/features/home/useSelectedDay.test.ts` | Tests for `useSelectedDay.ts`: the Verify cases of P07-02 | P07-02 |
| `src/features/home/DaySwipe.tsx` | Swipe gesture on the summary | P07-02 |
| `src/features/home/DaySwipe.test.tsx` | Tests for `DaySwipe.tsx`: the Verify cases of P07-02 | P07-02 |
| `src/features/home/PillarRow.tsx` | Chosen pillars plus water | P07-03 |
| `src/features/home/PillarRow.test.tsx` | Tests for `PillarRow.tsx`: the Verify cases of P07-03 | P07-03 |
| `src/features/home/DayNutrientsSheet.tsx` | All nutrients for the selected day | P07-04 |
| `src/features/home/DayNutrientsSheet.test.tsx` | Tests for `DayNutrientsSheet.tsx`: the Verify cases of P07-04 | P07-04 |
| `src/features/home/PillarPicker.tsx` | Choose Home pillars | P07-04 |
| `src/features/home/PillarPicker.test.tsx` | Tests for `PillarPicker.tsx`: the Verify cases of P07-04 | P07-04 |
| `src/features/home/SortMenu.tsx` | Sort mode menu | P07-05 |
| `src/features/home/WaterRow.tsx` | Water row | P07-05 |
| `src/features/home/WaterRow.test.tsx` | Tests for `WaterRow.tsx`: the Verify cases of P07-05 | P07-05 |
| `src/features/home/FastRow.tsx` | Active and completed fast rows | P07-05 |
| `src/features/home/FastRow.test.tsx` | Tests for `FastRow.tsx`: the Verify cases of P07-05 | P07-05 |
| `src/features/water/WaterMenuPage.tsx` | Water page of the + menu | P07-06 |
| `src/features/water/WaterMenuPage.test.tsx` | Tests for `WaterMenuPage.tsx`: the Verify cases of P07-06 | P07-06 |
| `src/features/water/CustomWaterSheet.tsx` | Custom amount | P07-06 |
| `src/features/water/CustomWaterSheet.test.tsx` | Tests for `CustomWaterSheet.tsx`: the Verify cases of P07-06 | P07-06 |
| `src/features/water/WaterSettings.tsx` | Water settings rows | P07-06 |
| `src/features/water/WaterSettings.test.tsx` | Tests for `WaterSettings.tsx`: the Verify cases of P07-06 | P07-06 |
| `src/features/water/PresetsEditor.tsx` | Quick-add editor | P07-06 |
| `src/features/water/PresetsEditor.test.tsx` | Tests for `PresetsEditor.tsx`: the Verify cases of P07-06 | P07-06 |
| `src/features/settings/tracking/TrackingPage.tsx` | Tracking settings page (grows in P09) | P07-06 |
| `src/i18n/en/trackers.ts` | Water and fasting copy partition | P07-06 |
| `src/features/fasting/StartFastSheet.tsx` | Start a fast | P07-07 |
| `src/features/fasting/StartFastSheet.test.tsx` | Tests for `StartFastSheet.tsx`: the Verify cases of P07-07 | P07-07 |
| `src/features/fasting/FastEditor.tsx` | Edit, end, cancel, delete | P07-07 |
| `src/features/fasting/FastEditor.test.tsx` | Tests for `FastEditor.tsx`: the Verify cases of P07-07 | P07-07 |
| `src/features/fasting/FastingSettings.tsx` | Fasting settings rows | P07-07 |
| `src/features/fasting/FastingSettings.test.tsx` | Tests for `FastingSettings.tsx`: the Verify cases of P07-07 | P07-07 |
| `src/features/fasting/PausedDialog.tsx` | Food paused during a fast | P07-07 |
| `src/features/fasting/PausedDialog.test.tsx` | Tests for `PausedDialog.tsx`: the Verify cases of P07-07 | P07-07 |
| `src/domain/progress/ranges.ts` | Windows, offsets, availability | P07-09 |
| `src/domain/progress/ranges.test.ts` | Tests for `ranges.ts`: the Verify cases of P07-09 | P07-09 |
| `src/features/progress/RangeBar.tsx` | Range and period navigation | P07-09 |
| `src/features/progress/RangeBar.test.tsx` | Tests for `RangeBar.tsx`: the Verify cases of P07-09 | P07-09 |
| `src/features/progress/MetricSwitch.tsx` | Weight / body fat switch | P07-09 |
| `src/features/progress/progress.module.css` | Progress styles | P07-09 |
| `src/i18n/en/progress.ts` | Progress copy partition | P07-09 |
| `src/domain/progress/chartMath.ts` | Ticks, padding, downsampling, labels | P07-10 |
| `src/domain/progress/chartMath.test.ts` | Tests for `chartMath.ts`: the Verify cases of P07-10 | P07-10 |
| `src/ui/charts/LineChart.tsx` | Line chart with inspector | P07-10 |
| `src/ui/charts/LineChart.test.tsx` | Tests for `LineChart.tsx`: the Verify cases of P07-10 | P07-10 |
| `src/ui/charts/charts.module.css` | Chart styles | P07-10 |
| `src/ui/charts/BarChart.tsx` | Calorie bars with adaptive geometry | P07-11 |
| `src/ui/charts/BarChart.test.tsx` | Tests for `BarChart.tsx`: the Verify cases of P07-11 | P07-11 |
| `src/features/progress/WeightCard.tsx` | Weight badges and chart | P07-12 |
| `src/features/progress/WeightCard.test.tsx` | Tests for `WeightCard.tsx`: the Verify cases of P07-12 | P07-12 |
| `src/features/progress/LogWeightSheet.tsx` | Log a weight | P07-12 |
| `src/features/progress/LogWeightSheet.test.tsx` | Tests for `LogWeightSheet.tsx`: the Verify cases of P07-12 | P07-12 |
| `src/features/progress/BodyFatCard.tsx` | Body-fat badges and chart | P07-13 |
| `src/features/progress/BodyFatCard.test.tsx` | Tests for `BodyFatCard.tsx`: the Verify cases of P07-13 | P07-13 |
| `src/features/progress/LogBodyFatSheet.tsx` | Log body fat | P07-13 |
| `src/features/progress/HistorySheet.tsx` | Weight and body-fat histories | P07-14 |
| `src/features/progress/HistorySheet.test.tsx` | Tests for `HistorySheet.tsx`: the Verify cases of P07-14 | P07-14 |
| `src/domain/progress/recap.ts` | Recap maths and highlights | P07-15 |
| `src/domain/progress/recap.test.ts` | Tests for `recap.ts`: the Verify cases of P07-15 | P07-15 |
| `src/features/progress/RecapCard.tsx` | Recap card | P07-15 |
| `src/features/progress/RecapCard.test.tsx` | Tests for `RecapCard.tsx`: the Verify cases of P07-15 | P07-15 |
| `src/domain/progress/averages.ts` | Calorie history and averages | P07-16 |
| `src/domain/progress/averages.test.ts` | Tests for `averages.ts`: the Verify cases of P07-16 | P07-16 |
| `src/features/progress/CaloriesCard.tsx` | Calorie bars and average | P07-16 |
| `src/features/progress/CaloriesCard.test.tsx` | Tests for `CaloriesCard.tsx`: the Verify cases of P07-16 | P07-16 |
| `src/features/progress/AveragesCard.tsx` | Macro and nutrient averages | P07-16 |
| `e2e/home-progress.spec.ts` | Home depth, trackers and Progress end to end | P07-17 |

## Files to update (7)

| Path (under `platewise/`) | Change | Task |
|---|---|---|
| `src/features/home/HomePage.tsx` | Selected day, week bar, swipe, all-nutrients link | P07-02 |
| `src/features/home/DaySummary.tsx` | Selected day, kJ heading, PillarRow | P07-03 |
| `src/features/home/Diary.tsx` | Water and fast rows, sort menu | P07-05 |
| `src/features/log/AddMenu.tsx` | Water and fasting entries; hide food during a fast | P07-08 |
| `src/features/settings/registry.ts` | Register the Tracking page | P07-06 |
| `src/features/progress/ProgressPage.tsx` | Replace the placeholder with the full page | P07-09 |
| `src/i18n/en.ts` | Import the trackers and progress partitions (lead) | P07-06 |

## Migrations and fixtures (0)

None. The IndexedDB schema stays at version 1 until a later phase needs an upgrade step (P02-01 registry).

## Task notes (17)

`docs/notes/P07/<slug>.md`, one per task, from `docs/notes/_template.md`, written before the code:

- `docs/notes/P07/week-bar.md` (P07-01)
- `docs/notes/P07/selected-day-and-day-swipe.md` (P07-02)
- `docs/notes/P07/gauge-and-pillars-full.md` (P07-03)
- `docs/notes/P07/day-nutrients-sheet-and-pillar-picker.md` (P07-04)
- `docs/notes/P07/diary-depth-sort-modes-water-and-fast-rows.md` (P07-05)
- `docs/notes/P07/water-flows-and-settings.md` (P07-06)
- `docs/notes/P07/fasting-flows-editor-and-settings.md` (P07-07)
- `docs/notes/P07/add-menu-water-and-fasting-entries.md` (P07-08)
- `docs/notes/P07/progress-layout-ranges-and-periods.md` (P07-09)
- `docs/notes/P07/line-chart.md` (P07-10)
- `docs/notes/P07/bar-chart.md` (P07-11)
- `docs/notes/P07/weight-card-and-logging.md` (P07-12)
- `docs/notes/P07/body-fat-card-and-logging.md` (P07-13)
- `docs/notes/P07/history-sheets.md` (P07-14)
- `docs/notes/P07/weekly-recap.md` (P07-15)
- `docs/notes/P07/calories-card-and-averages.md` (P07-16)
- `docs/notes/P07/home-and-progress-e2e.md` (P07-17)

## Run until green

```bash
cd platewise
pnpm install --frozen-lockfile
pnpm lint && pnpm fmt:check && pnpm typecheck && pnpm test   # fix and re-run until all pass
pnpm build && pnpm e2e                                        # browser tests, mobile viewport
PLATEWISE_REF=/root/reference/fud-ai pnpm check --require-ref # similarity, banned, assets, licences, traps, acceptance
```

Phase additions, inside the same loop:

```bash
pnpm build && pnpm exec playwright test e2e/home-progress.spec.ts
pnpm check:bundle   # charts load with the Progress chunk, not the initial bundle
```

On any failure, fix the cause and run the whole loop again from `pnpm install`. Never skip a test, widen an allow-list without a written reason, or edit a recorded fixture to make a test pass. Real waits are banned in tests: use fake timers (`vi.useFakeTimers()`) and the clock helpers in `src/test/time.ts`.

## Compare checklist (reopen the reference after writing)

- [ ] Week bar paging, first weekday, today styling; deliberate: future days disabled (D-16.36).
- [ ] Pillars: statuses, water pillar position, picker rules (05 §3.2.3).
- [ ] Diary: both sort modes, water and fast placement, fasts on their end day, rows kept when trackers are off (R05.9, R05.21).
- [ ] Water: presets round trip, custom cap (D-16.39), reminder off with tracking.
- [ ] Fasting: one active, no overlap, End fast now atomic, tracking off ends the fast; deliberate: End fast and log (D-16.35).
- [ ] Progress: windows, include-today shift, chart padding/ticks/downsampling, bar geometry, averages denominators (R05.15–R05.17).
- [ ] Recap: week start, rounding, ±10 % in kcal, highlight order; deliberate: no workout or burn tiles (D-16.44).
- [ ] Weight: global unit toggle, back-dating, goal event; deliberate ranges (D-16.37) and confirmed deletes (D-16.38).
- [ ] Every task note's compare section is ticked, each tick naming its test.
- [ ] Trap rows owned by this phase in `docs/internals/traps-ledger.md` now carry `Test:` lines (the lead updates the ledger at land time).
- [ ] Acceptance rows owned by this phase in `docs/internals/acceptance-map.md` now carry `Test:` lines.

## Done when

All P07 tests pass; `e2e/home-progress.spec.ts` passes; Progress charts stay out of the initial bundle. **Demo 4 (M5):** browse to last Tuesday in the week bar and log a glass of water there; start a fast and see food paused, then end it and log in one step; log a back-dated weight and see it on the 1M chart; open last week's recap.
