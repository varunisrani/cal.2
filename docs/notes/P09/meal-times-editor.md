# Task: Meal times editor (P09-03) · Phase: 09 · Owner: builder (wt-p09s09)

<!-- Save as platewise/docs/notes/P<nn>/<slug>.md. Write everything above "Compare checklist"
BEFORE writing code, in your own words. Never paste or paraphrase the reference line by line. -->

Read (reference @ `10e14b67`): `android/.../ui/settings/SettingsScreen.kt` lines 3290–3400 (the
sheet switch that opens the meal times sheet and stores its result) and the sheet itself further
down (around 3780–3900: the list of four starts, the per-start wheel, its allowed range, the help
line, Save / restore defaults / cancel), and the Tracking card's first row (around 1075). Tests:
`android/.../test/.../models/MealScheduleTest.kt` (classification and the invalid-set fallback; our
domain P01-08 already covers both). Research spec `06-settings-data.md` §3.4 (the row is first on
the Tracking page) and §3.4.1 (bounds, step, current value always offered). Domain:
`src/domain/meals/times.ts` (`mealTimeBounds`, `mealTimeChoices`, `DEFAULT_MEAL_TIMES`,
`mealAtInstant`). Acceptance id reviewed here: ACC-J4-1.

What it does (own words): the four meal starts (breakfast, lunch, dinner, late snack) decide which
meal a new entry starts in, and where water and fasts sit in the diary. Settings › Tracking &
reminders gets a "Meal times" card first on the page; its row opens an editor sheet that lists the
four starts with their times written the locale's way. Tapping a start turns the sheet into a wheel
of quarter hours for that start, kept at least 15 minutes from each neighbour (breakfast from
midnight, late snack up to 23:59); the start's current time is always in the wheel even when it is
off the quarter hours or closer than 15 minutes to a neighbour, so opening and leaving never moves
it. Done puts the picked time into the editor's draft, Cancel goes back to the list unchanged.
"Restore default times" puts 05:00 / 12:00 / 18:00 / 23:00 into the draft. Nothing is stored until
Save; Cancel (or Escape, the scrim, Back) leaves the stored times as they were.

Inputs → outputs: the setting `meals.times` (read with `useSettings`) → the draft in the sheet →
`trackingSettings.setMealTimes(times)` → `settingsRepo.set('meals.times', …)` (the schema refuses an
invalid set) → Home's grouping, the manual and review sheets' meal suggestion through their own
live reads.

Files: created `src/features/settings/tracking/MealTimesSheet.tsx` (the card with its row, and the
editor) with its test, `src/features/settings/tracking/clockText.ts` (a minute of the day written
the locale's way), `src/services/trackingSettings.ts` (the Tracking page's writes: meal times and
the reminder switches, shared with P09-09) with its test. Changed: `TrackingPage.tsx` (its marked
place), `tracking.module.css`, `src/i18n/en/trackers.ts` (additive keys). Shared, additive:
`src/services/context.tsx` (`trackingSettings?`), `src/main.tsx` (builds it).

Edge cases / failure modes:
- A stored set that is not valid reads as the defaults (schema reader), so the editor opens on them.
- A stored start off the quarter hours (07:07) or within 15 minutes of a neighbour: offered as is,
  and the wheel opens on it.
- Moving lunch narrows breakfast's and dinner's wheels in the draft at once.
- Save while the write runs: buttons wait; a failed write keeps the sheet open with a toast.
- Settings not read yet → the card is not drawn (R06.22); read failed → a short note.
- The editor's draft never mixes with a change made in another tab: Save stores the whole draft.

Our design differences / decisions:
- Names and words are ours ("Meal times", "Breakfast starts", "Restore default times" is the
  shared 3-word label); the help line and the card's description are our own sentences.
- One sheet with two views (the list, then a start's wheel) like the reference; the wheel view's
  confirming button is "Done" (it only changes the draft), and Escape or the scrim in the wheel
  view go back to the list instead of closing everything.
- The wheel always offers the current value, even outside the 15-minute bounds (P01-08, 06
  §3.4.1); the reference drops a current value that lies outside the allowed range.
- The writes go through a new `trackingSettings` service (the Tracking page had none of its own;
  water and fasting keep theirs).

Tests we will write (`MealTimesSheet.test.tsx`, `trackingSettings.test.ts`):
- The card is first on the Tracking page; the editor lists the four starts with formatted times.
- Lunch's wheel runs breakfast + 15 … dinner − 15 in quarter hours.
- A stored 07:07 breakfast is offered and selected.
- Restore default times then Save stores 05:00 / 12:00 / 18:00 / 23:00.
- Cancel (and Escape) leave the stored times unchanged after edits in the draft.
- Moving lunch to 11:30 and saving makes a manual entry logged at 11:45 go under lunch (ACC-J4-1).
- The service stores a valid set and refuses an invalid one.

Compare checklist (filled after the rewrite; reopened `SettingsScreen.kt` 1075–1085, 3340–3355,
3780–3900 and `MealScheduleTest.kt`):
- [x] the meal times row comes first on the Tracking page, above water and fasting
  (`MealTimesSheet.test.tsx > MealTimesCard > is the first card of the Tracking page, above the
  trackers`)
- [x] four starts listed with their times written the locale's way; a tap opens that start's wheel
  (`MealTimesSheet.test.tsx > MealTimesCard > opens the editor on the four starts with their
  times`; `> MealTimesSheet > runs lunch's wheel from breakfast + 15 to dinner − 15 in quarter
  hours`)
- [x] the allowed range per start in 15-minute steps: breakfast from 0, lunch breakfast+15 …
  dinner−15, dinner lunch+15 … snack−15, snack dinner+15 … 23:59, worked out on the draft
  (`MealTimesSheet.test.tsx > MealTimesSheet > runs lunch's wheel from breakfast + 15 to dinner −
  15 in quarter hours`; `> keeps breakfast from midnight and the late snack up to 23:59`;
  `> narrows breakfast's and dinner's wheels to a lunch moved in the draft`)
- [x] the current value is offered and the wheel opens on it (`MealTimesSheet.test.tsx >
  MealTimesSheet > offers a stored 07:07 among the quarter hours and opens on it`)
- [x] the wheel view's confirm puts the time in the draft, its cancel goes back to the list
  (`MealTimesSheet.test.tsx > MealTimesSheet > goes back to the list, unchanged, from a start's
  wheel with its Cancel or Escape`; `> narrows breakfast's and dinner's wheels to a lunch moved in
  the draft`)
- [x] Save stores the draft, restore defaults fills it with 05:00 / 12:00 / 18:00 / 23:00
  (`MealTimesSheet.test.tsx > MealTimesSheet > puts 05:00, 12:00, 18:00 and 23:00 back with
  Restore default times, and Save stores them`)
- [x] leaving without Save stores nothing (`MealTimesSheet.test.tsx > MealTimesSheet > leaves the
  stored times as they were on Cancel, after changes in the draft`)
- [x] an invalid stored set opens as the defaults; an invalid set is refused on save (schema
  reader, `src/data/settingsSchema.ts`; `trackingSettings.test.ts > setMealTimes > refuses starts
  that are not in order within one day, and keeps the stored ones`)
- [x] the times drive the meal a new entry starts in (`MealTimesSheet.test.tsx > MealTimesSheet >
  files an entry logged at 11:45 under lunch once lunch starts at 11:30 (ACC-J4-1)`;
  classification itself: P01-08's `src/domain/meals/times.test.ts`)
- Deliberate differences: the current value is always in the wheel, even outside the 15-minute
  bounds (06 §3.4.1, P01-08; the reference drops it then); the wheel view confirms with Done (it
  only changes the draft) and Escape or the scrim there go back to the list; focus follows the
  view (the wheel, then the row it came from); a failed save keeps the editor open with a toast;
  our own heading ("Meals"), card line and help line.
- Not taken: the reference's description under the sheet title (our card line says what the times
  are for); its glass surfaces and gradient Save.

## Decisions for the lead

- **A service for the page.** The Tracking page had no writes of its own, so
  `src/services/trackingSettings.ts` holds them (meal times here, the notifications switch and
  reminders for P09-09); `Services.trackingSettings?` and `main.tsx` build it (shared, additive).
- **Ledger:** ACC-J4-1 can switch from `Review: P09-03` to the ACC-J4-1 test above.

## Status

Done (2026-10-27). `MealTimesSheet.tsx` (the card and the editor, 11 tests), `clockText.ts`,
`trackingSettings.ts` (with P09-09, 12 tests), the card in its place on `TrackingPage.tsx`, words in
`src/i18n/en/trackers.ts`. Shared, additive: `src/services/context.tsx`, `src/main.tsx`.
