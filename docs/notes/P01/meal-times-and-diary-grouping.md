# Task: meal times and diary grouping (P01-08) · Phase: 01 · Owner: builder (wt-p01b2)

<!-- Save as platewise/docs/notes/P<nn>/<slug>.md. Write everything above "Compare checklist"
BEFORE writing code, in your own words. Never paste or paraphrase the reference line by line. -->

Read (reference @ `10e14b67`): `A/models/MealSchedule.kt` (all), `T/models/MealScheduleTest.kt`,
`T/ui/home/HomeDiaryMealGroupTest.kt`; research specs `02-food-logging.md` §3.2,
`06-settings-data.md` §3.4.1, `05-home-progress.md` §3.3.1–3.3.2 and §6 R05.4, R05.21; traps
ledger rows R05.4 and R05.21; acceptance row ACC-F8-1. No Evidence ids.

What it does (own words): a day is split into four meal windows by four start minutes after local
midnight (breakfast 05:00, lunch 12:00, dinner 18:00, late snack 23:00 by default). The windows
must be strictly increasing inside one day; a stored set that is not reads as the defaults. A time
of day falls in the window it starts in, and the late-snack window wraps over midnight to
breakfast. The meal-times editor offers 15-minute steps that keep each start at least 15 minutes
from its neighbours, plus the current value even when it is off the grid. The Home diary for a day
mixes food, water and fast rows: food keeps the meal it was logged with, water and fasts land in
the window of their time of day (a fast by its end, or its start while it runs). Two sort modes:
fixed meal order with empty sections left out and newest rows first, or all rows newest first cut
into runs of one meal (so Snack, Dinner, Snack can happen). A section's totals count food rows
only and exist only when it has one (R05.4). A completed fast belongs to the day it ended; the
running fast shows only on today (R05.21).

Inputs → outputs:
- `times.ts`: `DEFAULT_MEAL_TIMES`, `MEAL_TIME_FIELDS` (`breakfast`, `lunch`, `dinner`,
  `lateSnack`), `MINUTES_PER_DAY`, `MEAL_TIME_STEP` (15); `isValidMealTimes(value)`,
  `readMealTimes(raw: unknown)` → `MealTimes`; `mealAt(minute, times)` → a `TimedMeal` (every
  `MealKind` but `other`); `minuteOfDay(ms)` (runtime zone); `mealAtInstant(ms, times)`;
  `mealTimeBounds(times, field)` → `{min, max}`; `mealTimeOptions(times, field)` → minutes.
- `diary.ts`: `DiaryRow` = `{kind: 'food', entry}` | `{kind: 'water', log}` | `{kind: 'fast',
  fast}`; `DIARY_SORTS`/`DiarySort` (`byMeal`, `newestFirst`) and `isDiarySort` for the
  `home.sort` setting; `rowTime(row)`, `rowMeal(row, times)`; `sectionTotals(rows)` →
  `{kcal, protein, carbs, fat}` or null; `groupDiary(rows, sort, times)` → `DiarySection[]`
  (`{meal, rows, totals}`); `fastsOnDay(fasts, dayKey, todayKey)`.

Files: created `src/domain/meals/{times,diary}.ts` and their `.test.ts` files, this note. Imports
`model.ts` types and `dayKeyOf` from `dates/dayKey.ts`; edits neither.

Edge cases / failure modes:
- Validity: equal neighbours, a start of 1 440, a negative start, a non-integer, a missing field,
  a string field, null or an array → invalid → defaults; a valid stored record comes back as a
  fresh copy (extra fields dropped).
- Classification at the edges: 04:59 snack, 05:00 breakfast, 11:59 breakfast, 12:00 lunch, 17:59
  lunch, 18:00 dinner, 22:59 dinner, 23:00 snack, 00:00 snack; custom windows move the edges.
- Time of day comes from the runtime zone: a water log at 12:30 local is lunch in New York and in
  Tokyo; a 23-hour DST day does not shift the minute.
- Editor: breakfast 0…lunch−15, lunch breakfast+15…dinner−15, dinner lunch+15…snack−15, late snack
  dinner+15…1 439; options are the multiples of 15 inside those bounds; an off-grid current value
  (12:07) is added in order; when neighbours are 20 minutes apart the current value alone is
  offered.
- Diary: an active fast is placed by its start; ties keep the input order; `other` food rows form
  their own section, last in `byMeal`; no rows → no sections.
- Totals: P/C/F rounded to whole grams after summing (12.4 + 12.4 → 25, not 24); kcal summed;
  a section of water and fasts only has no totals; water and fasts never change a section's totals.
- `fastsOnDay`: a fast from 20:00 to 12:00 next day belongs to the second day only; a fast ending
  exactly at local midnight belongs to the new day; an active fast shows on today only, never on
  its start day when that was yesterday, and never on a past or other day.

Our design differences / decisions:
- Names are ours (`MealTimes`, `lateSnack`, `mealAt`, `groupDiary`, `byMeal`/`newestFirst`).
- The stored record is one object (`meals.times`), so the reader takes `unknown` and also rejects
  non-integer minutes.
- Grouping is a pure function over a row union instead of a view-model in the Home screen; section
  totals are `null` instead of zeros when a section has no food, so the header knows to hide them.
- Totals return whole-gram macros (the header shows whole grams); kcal stays in kcal (the UI
  converts to kJ).
- `mealAt` never returns `other`; its return type says so.

Tests we will write:
- Times: defaults; the eight edge times plus midnight; a custom set (07:00/13:00/20:00/23:30);
  validity table and `{breakfast: 720, lunch: 300, …}` → defaults; `minuteOfDay`/`mealAtInstant` in
  New York and Tokyo; editor bounds for each field (lunch = breakfast+15 … dinner−15), grid
  options, off-grid current value, a tight window.
- Diary: `byMeal` order and newest first inside, empty sections dropped, `other` last;
  `newestFirst` gives Snack, Dinner, Snack for an interleaved day; water and fasts placed by time
  of day (fast by end, active by start) in both zones; a water row in Breakfast leaves its totals
  unchanged (R05.4); a fast row likewise; a water-only section has no totals; macro rounding;
  `fastsOnDay` for the 20:00 → 12:00 fast (R05.21, ACC-F8-1), the active fast on today and not on
  yesterday (R05.21), midnight end; `isDiarySort` guard.

Compare checklist (filled after the rewrite; reopened `A/models/MealSchedule.kt`,
`T/models/MealScheduleTest.kt`, `T/ui/home/HomeDiaryMealGroupTest.kt`):
- [x] Default edges 04:59 / 05:00 / 11:59 / 12:00 / 17:59 / 18:00 / 22:59 / 23:00 (tested in
  `src/domain/meals/times.test.ts > mealAt > splits the default day at 05:00, 12:00, 18:00 and
  23:00`); custom edges (`> moves the edges with custom times`); local time of day in both zones
  (`times.test.ts > mealAtInstant > uses the local time of day in New York and in Tokyo`).
- [x] Validity 0 ≤ b < l < d < s < 1 440; an invalid set (lunch after dinner) reads as the
  defaults (`times.test.ts > meal times validity > reads [720, 300, 1080, 1380] as the defaults`,
  `> reads anything out of order, out of the day or malformed as the defaults`).
- [x] Editor bounds and 15-minute options with the current value kept, from the spec (not in the
  files read) (`times.test.ts > meal times editor > keeps each start 15 minutes from its
  neighbours`, `> offers lunch from breakfast + 15 to dinner − 15 in 15-minute steps`, `> always
  offers the current value, in order, even off the 15-minute grid`).
- [x] Water inside a timed meal, newest first, totals from food only (`diary.test.ts > section
  totals > leaves Breakfast totals unchanged by a water row in it (R05.4)`).
- [x] A fast inside the meal of its end, first when newest, totals unchanged (`diary.test.ts >
  section totals > leaves a section total unchanged by a fast row in it (R05.4)`).
- [x] Sort modes from the spec (`diary.test.ts > groupDiary by meal > lists breakfast, lunch,
  dinner, snack and other in that order, leaving out empty ones`, `groupDiary newest first > gives
  Snack, Dinner, Snack for an interleaved day`).
- [x] Fast day rules (`diary.test.ts > fastsOnDay > shows a fast from 20:00 to 12:00 on the second
  day only (R05.21, ACC-F8-1)`, `> shows the active fast on today and not on yesterday (R05.21)`).
- Deliberate differences: section totals give whole-gram macros (what the header shows) where the
  reference keeps raw sums, and null instead of zeros for a section without food; the stored
  record is one object and rejects non-integer minutes; grouping is a pure function over a row
  union, not part of the Home screen.
- Not taken: the reference's process-wide "current schedule" holder (the times are a parameter);
  the default sort for people finishing onboarding (`newestFirst` seeding is P05/P02-04); labels
  and the time formatting of the editor (UI).

## Decisions for the lead

- `sectionTotals` rounds protein, carbs and fat to whole grams after summing and returns null for
  a section with no food row, so the header shows totals exactly when they exist (R05.4).
- Rows logged at the same instant keep their input order in both sort modes.
- An active fast is ordered and placed by its start (05 §3.3.1); a completed one by its end.
- `mealTimeOptions` also offers the current value when it lies outside its bounds (possible when
  stored neighbours are less than 15 minutes apart), so opening the editor never moves a time.
- `readMealTimes` treats non-integer minutes as invalid (the reference's minutes are integers).
- Extra exports beyond the phase row: `MEAL_TIME_FIELDS`, `MealTimeField`, `MINUTES_PER_DAY`,
  `MEAL_TIME_STEP`, `TimedMeal`, `isValidMealTimes`, `minuteOfDay`, `mealAtInstant`,
  `mealTimeBounds`, `DIARY_SORTS`, `isDiarySort`, `rowTime`, `rowMeal`, `sectionTotals`.

## Status

Done (2026-10-26). `times.ts`, `diary.ts` and 32 tests, all passing (time-of-day and day-placement
cases run in America/New_York and Asia/Tokyo); nothing outside the slice's files changed. Traps
covered: R05.4 (section totals; averages and the recap stay with P07-15/P07-16), R05.21.
Acceptance: ACC-F8-1. Handed on: the diary UI and sort menu (P07-05), the meal-times editor
(P09-03), the default meal on review and manual entry (P06), the settings schema (P02-04).
