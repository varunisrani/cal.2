# Task: meal times and diary grouping (P01-08) · Phase: 01 · Owner: builder (wt-p01b2)

<!-- Save as platewise/docs/notes/P<nn>/<slug>.md. Write everything above "Compare checklist"
BEFORE writing code, in your own words. Never paste or paraphrase the reference line by line. -->

Read (reference @ `10e14b67`): `A/models/MealSchedule.kt` (all), `T/models/MealScheduleTest.kt`
(all), `T/ui/home/HomeDiaryMealGroupTest.kt` (all); to confirm the editor wheel, the meal-time
sheet's allowed ranges in `A/ui/settings/SettingsScreen.kt` (the boundary editor). Research specs
`02-food-logging.md` §3.2, `06-settings-data.md` §3.4.1, `05-home-progress.md` §3.3.1–3.3.2 (diary
content, grouping, section totals) and §3.7.1 (fast model). Traps R05.4, R05.21; acceptance
ACC-F8-1. No Evidence ids.

What it does (own words): four start minutes after local midnight split the day into breakfast,
lunch, dinner and a late snack that runs past midnight until breakfast starts (defaults 05:00,
12:00, 18:00, 23:00). A stored set is only used when the four are strictly increasing inside one
day; anything else reads as the defaults. A time of day maps to the meal whose window holds it,
which suggests the meal when logging and places water and fasts in the diary. The meal-time
editor offers 15-minute steps that keep each start at least 15 minutes from its neighbours, plus
the current value. Home's diary shows the selected day's food, water and fasts in meal sections:
food keeps the meal it was logged under; water goes where its time falls, a fast where it ended
(or where it started while it is still running). Sections are either the five meals in a fixed
order with empty ones left out, or runs of consecutive rows of one meal in newest-first order.
Each section's totals (kcal and whole grams of protein, carbs and fat) count food only, and a
section without food shows none (R05.4). A completed fast belongs to the day it ended, and the
running fast shows only on today (R05.21).

Inputs → outputs:
- `times.ts`: `MINUTES_PER_DAY`, `MEAL_TIME_STEP` (15), `MEAL_TIME_SLOTS` / `MealTimeSlot`,
  `DEFAULT_MEAL_TIMES`; `isValidMealTimes(value)`; `readMealTimes(stored)` → valid copy or
  defaults; `mealAt(minute, times)` → `TimedMeal` (breakfast, lunch, dinner or snack; never
  `other`); `minuteOfDay(ms)` (local wall clock) and `mealAtInstant(ms, times)`;
  `mealTimeBounds(times, slot)` → `{min, max}`; `mealTimeChoices(times, slot)` → ascending
  minutes.
- `diary.ts`: `DIARY_SORT_MODES` (`byMeal`, `newestFirst`), `DiarySortMode`, `isDiarySortMode`,
  `DEFAULT_DIARY_SORT` (`byMeal`); `DiaryRow` = food (`DiaryEntry`) | water (`WaterLog`) | fast
  (`Fast`); `rowTime(row)`, `rowMeal(row, times)`; `groupDiary(rows, mode, times)` →
  `DiarySection[]` (`{ meal, rows, totals }`, `totals` null without food); `sectionTotals(rows)`;
  `fastsOnDay(fasts, dayKey, todayKey)` → the fasts the day's diary lists.

Files: created `src/domain/meals/{times,diary}.ts` and their `.test.ts`, this note.

Edge cases / failure modes:
- Classification with defaults: 04:59 snack, 05:00 breakfast, 11:59 breakfast, 12:00 lunch, 17:59
  lunch, 18:00 dinner, 22:59 dinner, 23:00 snack, 00:00 snack; custom times move every boundary.
- Validity: equal neighbours, out-of-order (lunch before breakfast), negative, 1 440 or more,
  fractions, missing keys, strings, arrays, `null` → invalid → defaults. A valid stored value is
  copied, not shared.
- Editor bounds: breakfast 0 … lunch − 15; lunch breakfast + 15 … dinner − 15; dinner lunch + 15
  … late snack − 15; late snack dinner + 15 … 1 439. Choices are the quarter hours inside the
  bounds plus the current value even when it is off the grid or inside the 15-minute margin;
  bounds that leave no room give just the current value.
- Diary placement: food under its own meal even when its time says otherwise (and `other` stays
  `other`); water by its time; a completed fast by its end, an active one by its start. Rows with
  the same time keep their input order.
- `byMeal`: breakfast, lunch, dinner, snack, other; empty sections dropped; newest first inside.
  `newestFirst`: an interleaved day gives Snack, Dinner, Snack.
- Totals: kcal summed; protein, carbs and fat summed then rounded to whole grams; water and fast
  rows never count; a water-only or fast-only section has `totals: null`.
- Fasts on a day: a fast 20:00 → 12:00 next day shows on the second day only; an active fast
  started yesterday shows on today and not yesterday; a completed fast ending at 00:30 belongs to
  the new day (local zone).

Our design differences / decisions:
- Names are ours (`MealTimes`, `lateSnack`, `byMeal`, `newestFirst` from 17 §1.3); the meal-time
  record is the model's `MealTimes`; the setting is one record.
- Valid meal times must be whole minutes (the reference stores integers; a fraction read from
  storage is treated as invalid).
- Editor choices sit on the clock's quarter hours (00, 15, 30, 45) rather than counting 15-minute
  steps from the lower bound; the two agree whenever the neighbours are on quarter hours, which
  the editor itself always produces. The current value is always offered, even inside the margin.
- `groupDiary` takes one list of tagged rows; selecting the day's rows is the caller's job
  (`fastsOnDay` for fasts, the day key for entries and water).
- Section totals return whole numbers ready to show; the reference keeps unrounded sums and rounds
  when drawing.

Tests we will write:
- `times.test.ts`: defaults; classification vectors (defaults and custom); validity and
  `readMealTimes` fallbacks (including `{breakfast: 720, lunch: 300, …}` → defaults); `minuteOfDay`
  and `mealAtInstant` in New York and Tokyo; editor bounds for each slot (lunch = breakfast + 15 …
  dinner − 15); choices on quarter hours, the current value always present, no-room case.
- `diary.test.ts`: sort-mode guard and default; placement of each row kind; `byMeal` order and
  dropping empty sections; `newestFirst` runs (Snack, Dinner, Snack); totals from food only with
  whole grams (R05.4); a water-only section has none (R05.4); a water row in Breakfast leaves its
  totals unchanged (R05.4); `fastsOnDay` vectors (R05.21, ACC-F8-1).

Compare checklist (filled after the rewrite; reopened `A/models/MealSchedule.kt`,
`T/models/MealScheduleTest.kt`, `T/ui/home/HomeDiaryMealGroupTest.kt`, the meal-time editor in
`A/ui/settings/SettingsScreen.kt`; to check ordering, ties and the day filter, the diary grouping
and the selected-day fast filter in `A/ui/home/HomeScreen.kt`):
- [x] Defaults 300 / 720 / 1 080 / 1 380 (`src/domain/meals/times.test.ts > meal times > defaults
  to 05:00, 12:00, 18:00 and 23:00`).
- [x] Validity 0 ≤ b < l < d < s < 1 440 and fallback to defaults (`times.test.ts > meal times >
  accepts only whole minutes with breakfast < lunch < dinner < late snack inside one day`, `> reads
  an invalid stored value as the defaults`, `> reads a valid stored value as a fresh record without
  extra keys`).
- [x] Classification with default and custom boundaries (`times.test.ts > mealAt > classifies the
  default boundaries to the minute`, `> follows custom boundaries`); local wall clock (`> reads an
  instant on the local wall clock`, `> uses the zone the device is in`, `> keeps the wall clock on a
  daylight-saving day`).
- [x] Editor ranges with the 15-minute margin and the current value offered (`times.test.ts > meal
  time editor > keeps each start 15 minutes from its neighbours`, `> offers every quarter hour
  inside the bounds`, `> always offers the current value, in order, even off the quarter hours`,
  `> offers just the current value when the neighbours leave no room`).
- [x] Food keeps its own meal; water by its time; a fast by its end, or its start while active
  (`diary.test.ts > row placement > keeps food under the meal it was logged with, whatever its
  time`, `> places water by its time of day`, `> places a completed fast by its end and a running
  one by its start`).
- [x] Standard order with empty meals dropped, newest first inside (`diary.test.ts > groupDiary >
  by meal: breakfast, lunch, dinner, snack, other, newest first inside each`, `> by meal: leaves
  out meals with no rows`).
- [x] Latest-first runs (`diary.test.ts > groupDiary > newest first: runs of one meal, so a meal can
  repeat (Snack, Dinner, Snack)`, `> newest first: every row of the day in time order`); stable
  ties (`> keeps the given order for rows at the same time`).
- [x] Water and a fast inside a timed meal, listed first when newest, totals unchanged
  (`diary.test.ts > section totals > does not change a section total for a water row in Breakfast
  (R05.4)`, `> does not change a section total for a fast that ended in it (R05.4)`).
- [x] Totals only with a food row (`diary.test.ts > section totals > gives no totals to a section
  without food (R05.4)`), whole grams (`> sums food energy and rounds each macro to whole grams
  (R05.4)`), per run (`> counts each run on its own in newest-first mode`).
- [x] Completed fasts by the local day of their end, the active one only on today
  (`diary.test.ts > fastsOnDay > shows a fast from 20:00 to 12:00 the next day on the second day
  only (R05.21, ACC-F8-1)`, `> shows the running fast on today and not on the day it started
  (R05.21)`, `> lists the completed fasts of the day and the running one together on today
  (R05.21)`, `> uses the local day of the end in the device zone (R05.21)`).
- Deliberate differences: meal times must be whole minutes; editor choices on the clock's quarter
  hours instead of counting from the lower bound (identical when the neighbours sit on quarter
  hours); the current value is offered even inside the 15-minute margin (the reference drops it
  there); meal times are a parameter, not a process-wide value; totals come rounded and ready to
  show; `fastsOnDay` keeps the input order (`groupDiary` orders rows).
- Not taken: section ids for list keys (the UI can key by position, meal and first row id); the
  sort control, share icon and section header copy (UI); the onboarding seed of the newest-first
  mode (the wizard's job, P05); time formatting in the editor (UI).

## Decisions for the lead

- Editor choices sit on quarter hours (00, 15, 30, 45); the current value is always offered,
  even when it is closer than 15 minutes to a neighbour. The reference steps from the lower bound
  and drops a current value inside the margin.
- Meal times with a fractional minute read as invalid (defaults).
- `groupDiary` takes one tagged list (`DiaryRow`); a caller passing food, water and fasts in that
  order gets the reference's order for rows at the same time.
- Extra exports beyond the row: `MINUTES_PER_DAY`, `MEAL_TIME_STEP`, `MEAL_TIME_SLOTS` /
  `MealTimeSlot`, `TimedMeal`, `isValidMealTimes`, `readMealTimes`, `minuteOfDay`,
  `mealAtInstant`, `mealTimeBounds`, `mealTimeChoices`, `DIARY_SORT_MODES`, `isDiarySortMode`,
  `DEFAULT_DIARY_SORT`, `rowTime`, `rowMeal`, `sectionTotals`.

## Status

Done (2026-10-26). `src/domain/meals/{times,diary}.ts` and their tests (33) are in place, all
passing. Nothing outside the slice's files changed. Traps covered: R05.4 (section totals part:
water and fasts never enter a section's totals) and R05.21; acceptance ACC-F8-1.
