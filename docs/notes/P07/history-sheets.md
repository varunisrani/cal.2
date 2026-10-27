# Task: History sheets (P07-14) · Phase: 07 · Owner: builder (wt-p07s4c, slice S4c)

Read (reference @ `10e14b67`): `A/ui/progress/ProgressScreen.kt` lines 473–480 (the history link
follows the chosen metric and hides with no entries), 597–610 (the lists are handed over newest
first with a delete callback), 1390–1456 (the two link cards: list icon, title, count with a short
hint, chevron), 1974–2100 (the two sheets: title with Done, value over a medium date, a trash
button per row that deletes at once); `A/ui/progress/ProgressViewModel.kt` (`deleteWeight`,
`deleteBodyFat` go straight to the repositories). `I/Views/ProgressComponents.swift` lines
1187–1410 (the iOS link cards and sheets: a local copy of the list so a deleted row leaves at once,
a confirmation naming the date and the value, Cancel and Delete; the visible trash button on the
weight list and swipe on both). The phase row names `I/Views/ProgressMetricViews.swift`; its only
history part is the count text (lines 1–8); the views are in `ProgressComponents.swift`. Tests:
none in the reference for these views (`IT/WeightHistoryTests.swift` covers health imports and
tombstones only). Research spec `05-home-progress.md` §3.5.5; decision D-16.38 (deleting asks
first); trap R05.22, with R05.8 for the profile re-sync (already tested at the repositories).

What it does (own words): under the chosen metric's card, a link card for that metric's history: a
list icon, "Weight history" or "Body-fat history", how many readings there are with a short hint
that the list can be reviewed and trimmed, and a chevron. It is not drawn when the metric has no
readings at all. Tapping it opens a sheet listing every reading of that metric, newest first: the
value (one decimal, in kg/lb or %) over a medium date, and a visible delete button on each row.
Delete asks first, naming the date and the value; Cancel keeps the row; Delete takes the row out
of the open list at once and then removes it through the progress service. The repositories move
the profile weight (or body fat) to the newest reading left (R05.8); deleting the last body-fat
reading keeps the profile value. If the delete fails, the row comes back with a toast.

Inputs → outputs:
- `HistoryLink` {metric, count, onOpen} → the link card, or nothing when `count` is 0.
- `HistorySheet` {open, metric, readings: {id, at, value text}[], onClose} → the list (newest
  first); delete → `services.progress.deleteWeighIn(id)` or `deleteBodyFatReading(id)`.
- `services/progress.ts`: `deleteWeighIn(id)` → `weightRepo.deleteWeighIn`;
  `deleteBodyFatReading(id)` → `bodyFatRepo.deleteReading`.
- `ProgressPage`: the counts and rows from the page's reads of every weigh-in and body-fat reading
  up to today; the sheet on the sheet stack (`history`).

Files: created `src/features/progress/HistoryLink.tsx`, `src/features/progress/HistorySheet.tsx`
(+ test); `src/features/progress/readings.module.css` (shared with P07-13); changed
`src/features/progress/ProgressPage.tsx` (the history slot), `src/services/progress.ts` (+ test),
`src/i18n/en/progress.ts`.

Edge cases / failure modes:
- No readings of the chosen metric: no link card (the body-fat card may still show a profile
  value).
- Cancel, Escape or the scrim on the confirmation keeps the row and stores nothing.
- The last row deleted while the sheet is open: the sheet stays with a short "nothing left" line;
  the link card goes away behind it.
- A delete that fails: the row returns, a toast says so.
- Another tab adds or deletes readings while the sheet is open: the list follows the live read
  (rows this sheet just deleted stay hidden).
- Two readings at the same instant: both listed (keys are ids).

Our design differences / decisions:
- Every delete asks first, on both platforms' lists (D-16.38); the confirmation names the date and
  value. The delete button is visible on both lists (iOS has it on weight only).
- No swipe-to-delete in the history list: the visible button is the one way (the diary keeps
  its swipe).
- The list is the live read minus the rows deleted in this sheet, instead of a copy taken when the
  sheet opens, so a reading added elsewhere shows too.
- No health-store tombstones (no health sync in v1).
- Readings stamped after today (only possible through an import or a clock change) are not
  listed: the page reads readings up to today. Same as the cards.

Tests we will write:
- `HistorySheet.test.tsx`: newest first with value over a medium date; delete asks first and Cancel
  keeps it; confirm removes the row immediately (before the store answers); deleting the latest
  weigh-in re-syncs the profile weight (ACC-G6-1, R05.22, P07-14 Verify); body-fat rows in percent
  and their delete; a failed delete brings the row back with a toast; the link card shows the
  count and hides with no readings, and follows the chosen metric.
- `src/services/progress.test.ts`: both deletes go through the repositories and re-sync the profile.

Compare checklist (filled after the rewrite; reopened `ProgressScreen.kt` 473–480, 597–610,
1390–1456, 1974–2100, `ProgressViewModel.kt` deletes, `ProgressComponents.swift` 1187–1410):
- [x] a link card for the chosen metric only, under its card, hidden with no readings
      (`HistorySheet.test.tsx > HistoryLink > names the history of the metric on show, with its count,
      under the card`, `> is not shown while the metric on show has no readings`)
- [x] the count with a hint (`HistorySheet.test.tsx > HistoryLink > names the history of the metric
      on show, with its count, under the card`)
- [x] all readings newest first, value with one decimal (kg, lb or %) over a medium date, a
      visible delete per row, Done closes (`HistorySheet.test.tsx > HistorySheet > lists every
      weigh-in newest first, each value over its date`, `> writes weigh-ins in pounds when that is the
      weight unit`, `> lists body-fat readings in percent and deletes them; the profile follows the
      newest left (R05.8)`, `> keeps the profile value after the last body-fat reading is deleted, and
      says the list is empty`)
- [x] delete asks first naming the date and the value; Cancel keeps it (`HistorySheet.test.tsx >
      HistorySheet > asks first, naming the date and the value, and keeps the row on Cancel (R05.22)`)
- [x] confirmed: the row leaves the open list at once (`HistorySheet.test.tsx > HistorySheet > takes
      the row out of the open list at once, before the store answers (ACC-G6-1, R05.22)`)
- [x] the profile re-syncs to the newest reading left; the last body-fat reading leaves the value
      (`HistorySheet.test.tsx > HistorySheet > moves the profile weight to the one before when the
      newest weigh-in is deleted (R05.8)`, `> keeps the profile value after the last body-fat reading
      is deleted, and says the list is empty`; `src/services/progress.test.ts > history deletes >
      deletes the newest weigh-in and moves the profile weight to the one before (R05.8)`, `> deletes
      body-fat readings; the profile follows the newest left, then keeps the last value (R05.8)`)
- [x] a failed delete puts the row back (`HistorySheet.test.tsx > HistorySheet > puts the row back
      and says so when the delete fails`)
- Deliberate differences: every delete asks first (D-16.38; Android deletes on one tap); a visible
  delete on both lists (iOS has it on weight only); the list is the live read minus this sheet's
  deletes rather than a copy taken on open; an empty list says so; readings stamped after today
  are not listed (the page reads up to today).
- Not taken: swipe-to-delete in the list; health-store tombstones (no health sync in v1); the
  health-store line in the iOS question.

## Decisions for the lead

- One sheet id, `history` (`HISTORY_SHEET` in `HistorySheet.tsx`), for both metrics: the sheet shows
  the metric on show. The page cannot change metric while the sheet is up.
- `HistoryLink` is its own file (`src/features/progress/HistoryLink.tsx`, one component per file);
  it holds the per-metric words table the sheet uses too.
- The link's list mark is the existing `text` icon (four lines); no icon was added to the set.
- Styles live in the new `readings.module.css` (see the P07-13 note).

## Status

Done (2026-10-27). `HistoryLink`, `HistorySheet` and the two deletes in the progress service are in,
with tests. Outside the task's files: none beyond those listed in the P07-13 note.
