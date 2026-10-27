# Task: Diary sort modes, water and fast rows (P07-05) · Phase: 07 · Owner: builder (wt-p07s2c, slice S2c)

Read (reference @ `10e14b67`): `A/ui/home/HomeScreen.kt` lines 1235–1527 (the running and the
finished fast rows, their tile, the goal chooser only for context), 1868–2150 (the meal section
header with its sort drop-down and totals; the diary item model and the two ways of forming
sections), 2204–2470 (the swipeable food, water and fast rows, the strip behind them, the water
row), and lines 440–470 and 638–720 of the same file (which fasts the day lists, the section loop,
the delete dialog's three cases and the editor hand-off). Test: `T/ui/home/HomeDiaryMealGroupTest.kt`
(water and a fast sit in the meal of their time and never change the food totals). Research spec
`05-home-progress.md` §3.3 (3.3.1–3.3.5), §3.6.3 (water display), §3.7.4 (editor entry point);
traps R05.4, R05.9, R05.21. Acceptance ids reviewed by P07-05: ACC-F7-2, ACC-F8-2, ACC-F9-1.
Already in place: `groupDiary`, `fastsOnDay`, `sectionTotals` (P01-08, `src/domain/meals/diary.ts`),
the `home.sort` setting, `useDayWater`, `useFasts`, `SwipeRow`, `ProgressBar`, `Menu`, the fast
editor (P07-07) and the water service (P07-06).

What it does (own words): Home's diary lists, for the day shown, the food entries, the water logs
and the fasts: finished fasts that ended that day, and the running fast only on today. Water sits
in the meal section its time of day falls in, a fast where it ended (where it started while it
runs). The person picks how sections form with a Sort control drawn in the first section's header
only: by meal (one section per meal in the fixed order, rows newest first) or newest first (every
row newest first, a new section each time the meal changes, so a meal can come back). The choice is
stored. A water row shows a drop tile, "Water", its time and the amount in the water unit. A running
fast shows that it is running, its start time, the time so far (refreshed every second while the
page is visible), its goal, and a thin bar of time so far over the goal, full at most. A finished
fast shows its length, start and end times and its goal. Tapping a fast opens the fast editor over
Home. Water rows and finished fasts slide toward the leading edge (or use their delete button) to
delete, always after a confirmation. These rows show whether or not their tracker is switched on:
the switches hide entry points, never history (R05.9). Section totals stay food only (R05.4).

Inputs → outputs:
- `Diary` {entries, energyUnit, times, isToday, water?, waterUnit?, fasts?, sort?, onSortChange?,
  onOpenFast?} → the sections from `groupDiary` over food, water and fast rows in `sort` mode; the
  Sort control in the first header when `onSortChange` is given.
- `SortMenu` {mode, onChange} → a Menu button "Sort" with two radio rows (By meal, Newest first).
- `WaterRow` {log, unit} → the row; delete asks, then `water.deleteLog(id)`.
- `FastRow` {fast, onOpen} → the running or finished row; tap → `onOpen(fast)`; a finished one
  deletes after asking through `fasting.remove(id)`.
- `HomePage` reads `useFasts(day, day)` (filtered by `fastsOnDay`), `useDayWater(day)`,
  `home.sort`, `water.unit`; stores a new sort through `homePrefs.setSort`; holds the tapped fast
  and opens `FastEditor` (fetched on demand) on the sheet stack (`fast`).
- `src/services/water.ts` gains `deleteLog(id)` (the repository's `remove`); `src/services/
  homePrefs.ts` gains `setSort(mode)` (setting `home.sort`).

Files: created `src/features/home/{SortMenu,WaterRow,FastRow}.tsx`, `WaterRow.test.tsx`,
`FastRow.test.tsx`, `SortMenu.test.tsx`, `src/features/home/diaryRows.module.css`; changed
`src/features/home/Diary.tsx` (+ test), `src/features/home/HomePage.tsx` (+ test),
`src/i18n/en/home.ts` (additive). Shared, additive: `src/services/water.ts` (+ test),
`src/services/homePrefs.ts` (+ test).

Edge cases / failure modes:
- A fast from 20:00 to 12:00 the next day shows on the second day only; the running fast only on
  today, never on the day it started (R05.21, `fastsOnDay`).
- A section of water or fasts only has no totals; a water row in a food section leaves its totals
  as they were (R05.4).
- Two rows at the same instant keep their given order (the domain's sort is stable).
- Newest first: the same meal can head two sections, so section keys and heading ids are by place.
- The running row's timer stops while the page is hidden and catches up at once when it shows.
- A running fast past its goal: the bar stays full; the time keeps counting.
- A fast deleted or ended elsewhere while its row is on screen: the live read redraws the diary;
  a delete of a row already gone does nothing (the repository's remove is a no-op / `missing`).
- A delete that fails: a toast, the row stays.
- A sort that cannot be stored: a toast, the old order stays.
- Tracker switched off: its rows still show and still delete; only the menu entries go (P07-08).

Our design differences / decisions:
- Names, copy, layout and hooks are ours; the drop and hourglass are our own icons, not emoji.
- Sort labels "By meal" and "Newest first"; the control is a Menu with radio rows and a check mark.
- Delete is our SwipeRow (slide, or the keyboard delete button) with our own dialog words; the
  running fast has no swipe (Android). The iOS End / Cancel swipe on a running fast is not taken.
- The fast editor and the other new sheets are fetched on first open (`onDemand`), so Home's
  start-up download does not grow by the fasting screens.
- Elapsed time follows the spec's duration format (minutes floored: "45m", "16h", "16h 30m") and
  is redrawn every second while visible, as the reference does; the bar moves every second.
- Start and end of a finished fast are times only, as in the reference.

Tests we will write:
- `Diary.test.tsx`: water and fast rows sit in the meal of their time; a water row and a fast never
  change a section's totals and a tracker-only section has none (R05.4); newest first shows repeated
  meal sections in time order (ACC-F7-2); the sort control only in the first header, and choosing a
  mode hands it on.
- `SortMenu.test.tsx`: two radio rows with the current one checked; choosing calls `onChange`.
- `WaterRow.test.tsx`: drop tile, "Water", time, amount in ml and in fl oz; deleting asks first
  (swipe and the delete button), Cancel keeps it, Delete removes it (ACC-F9-1); a failed delete
  says so.
- `FastRow.test.tsx`: the running row shows its start, elapsed, goal and bar; it advances by one
  second with fake timers (ACC-F8-2); the bar is capped when past the goal; the finished row shows
  length, times and goal; tap opens; a finished fast deletes after asking; a running one has no
  delete.
- `HomePage.test.tsx`: water and fast rows of the shown day with both trackers off (R05.9); a
  fast over midnight on its end day only; the sort choice is stored and newest first redraws
  (ACC-F7-2); tapping a fast opens the fast editor sheet; deleting a water row asks first and
  removes it (ACC-F9-1).
- `src/services/water.test.ts`: `deleteLog` removes one log; `homePrefs.test.ts`: `setSort`.

Compare checklist (filled after the rewrite; reopened `A/ui/home/HomeScreen.kt` 440–470 (which
fasts a day lists), 638–720 (sections, Sort in the first header only, the rows and their delete
dialog), 1235–1360 (the running and finished fast rows), 1868–2030 (header, diary items, the two
groupings), 2204–2470 (swipe rows, water row), and `T/ui/home/HomeDiaryMealGroupTest.kt`):
- [x] the day lists food, water, finished fasts that ended on it and the running fast only on today
      (`HomePage.test.tsx > HomePage: water and fasts (P07-05, P07-08) > shows the day's water and
      fasts with both trackers off, a fast over midnight on its end day only, and no tracker in the
      menu (R05.9, R05.21, ACC-F8-1)`)
- [x] water in the meal of its time, a fast in the meal of its end (start while running), never in
      the totals (`Diary.test.tsx > Diary: water, fasts and the sort order (P07-05) > puts water in
      the meal of its time and a fast in the meal it ended in, never in the totals (R05.4)`,
      `> places a running fast where it started and shows it as fasting now`)
- [x] by meal: fixed meal order, rows newest first; newest first: runs, a meal can come back
      (`Diary.test.tsx > Diary: water, fasts and the sort order (P07-05) > shows repeated meal
      sections in time order when sorted newest first (ACC-F7-2)`; `HomePage.test.tsx > HomePage:
      water and fasts (P07-05, P07-08) > stores the sort order from the first header; newest first
      shows a meal again (ACC-F7-2)`)
- [x] Sort only in the first header; two choices, the current one checked; stored
      (`Diary.test.tsx > Diary: water, fasts and the sort order (P07-05) > draws the sort control in
      the first header only, and hands on the mode chosen`, `> has no sort control on an empty
      day`; `SortMenu.test.tsx > SortMenu > offers By meal and Newest first, the stored one
      checked`, `> hands on another mode and closes; the current one changes nothing`;
      `src/services/homePrefs.test.ts > setSort > stores how the diary forms its sections`)
- [x] water row: tile, "Water", time, amount in the water unit (`WaterRow.test.tsx > WaterRow >
      shows a drop tile, Water, the time it was logged and the amount in ml`, `> writes the amount
      in fl oz when that is the water unit`)
- [x] running fast: start time, time so far refreshed every second, goal, a bar capped at full
      (`FastRow.test.tsx > FastRow > shows a running fast as fasting now: its start, the time so
      far, its goal and a bar`, `> advances by one second with fake timers (ACC-F8-2)`, `> keeps
      the bar full past the goal while the time goes on counting`)
- [x] finished fast: length, start – end, goal (`FastRow.test.tsx > FastRow > shows a finished fast
      by its length, its start and end times and its goal`)
- [x] water rows and finished fasts swipe to delete, always after a confirmation; a short slide
      springs back; a running fast has no delete (`WaterRow.test.tsx > WaterRow > asks before
      deleting on a swipe, and keeps the log on Cancel (ACC-F9-1)`, `> deletes the log once Delete
      is confirmed (ACC-F9-1)`, `> says so and keeps the log when the delete fails`;
      `FastRow.test.tsx > FastRow > asks before deleting a finished fast, keeps it on Cancel and
      deletes it on Delete`, `> says nothing when the fast was already gone, and says so when the
      delete fails`; `HomePage.test.tsx > HomePage: water and fasts (P07-05, P07-08) > asks before
      deleting a water row and removes it once confirmed (ACC-F9-1)`; `src/services/water.test.ts >
      deleteLog > deletes one log and keeps the others; a log already gone does nothing`)
- [x] tap a fast → the fast editor (`FastRow.test.tsx > FastRow > opens the editor on a tap,
      running or finished`; `Diary.test.tsx > Diary: water, fasts and the sort order (P07-05) >
      hands a tapped fast to its editor`; `HomePage.test.tsx > HomePage: water and fasts (P07-05,
      P07-08) > opens the fast editor over Home from a fast's row`)
- [x] rows of a switched-off tracker still show (R05.9) (`HomePage.test.tsx > HomePage: water and
      fasts (P07-05, P07-08) > shows the day's water and fasts with both trackers off, a fast over
      midnight on its end day only, and no tracker in the menu (R05.9, R05.21, ACC-F8-1)`)
- Deliberate differences: our own drop and hourglass icons instead of emoji tiles; "Fasting now"
  and "By meal" / "Newest first" are our words; our dialog words, one per row kind, and a toast
  when a delete or a sort cannot be stored; the running row's timer stops while the page is hidden
  and catches up when it shows (`FastRow.test.tsx > FastRow > stops while the page is hidden and
  catches up at once when it shows again`); the fast editor is fetched on first open.
- Not taken: meal icons in the headers and the share icon (area 02 / later); the iOS End / Cancel
  swipe on a running fast; the favourite swipe on food rows (P06-19).

## Decisions for the lead

- **Sort is stored through `homePrefs.setSort`** (`src/services/homePrefs.ts`, additive), the
  service that already holds Home's own choices. `water.deleteLog` is added to
  `src/services/water.ts` (its `waterRepo` dependency now needs `remove` as well).
- **Elapsed time keeps the spec's duration format** ("45m", "16h 30m", minutes floored), redrawn
  every second as the reference does; the bar moves every second. Showing seconds would make the
  per-second tick visible in the text; easy to change in `FastRow.tsx` (`lengthText`) if wanted.
- **New Diary props are optional** (`water`, `waterUnit`, `fasts`, `sort`, `onSortChange`,
  `onOpenFast`) so the P06-19 merge on `Diary.tsx` stays small; Home passes all of them.
- **The fast editor, the start sheet and the custom water sheet are fetched on demand** and drawn
  only while open (`HomePage.tsx`). Initial JS went from 213.07 to 216.99 kB gzip (the three rows,
  the sort menu, the menu changes and the words).
- data-ui hooks for P07-17: `home.sort` (rows `home.sort.byMeal`, `home.sort.newestFirst`),
  `water.row` (`water.row.delete`, dialog `water.delete`), `fast.row` (running ones carry
  `data-running`; `fast.row.elapsed`, `fast.row.progress`, `fast.row.delete`, dialog
  `fast.delete`); sheets on the stack: `water`, `startFast`, `fast`.

## Status

Done (2026-10-27). Diary with water and fast rows, both sort modes with the stored Sort control in
the first header, swipe delete with confirmation, the fast editor from a fast's row. Lines outside
the task's own files: `src/services/water.ts` (`deleteLog`) and `src/services/homePrefs.ts`
(`setSort`), each with a test. Handed on: the e2e walk (P07-17), selection and the row tap on food
(P06-19).
