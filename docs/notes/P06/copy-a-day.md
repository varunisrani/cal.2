# Task: copy a day (P06-13) · Phase: 06 · Owner: builder (wt-p06s4b, slice S4b)

<!-- Save as platewise/docs/notes/P<nn>/<slug>.md. Write everything above "Compare checklist"
BEFORE writing code, in your own words. Never paste or paraphrase the reference line by line. -->

Read (reference @ `10e14b67`): `A/ui/home/HomeScreen.kt` lines 2706–2870 (the copy sheet: source
day, the line about originals, empty state, the primary button with the count, a button per meal,
a tap per food, the date dialog) and its caller (`copyEntriesToSelectedDay` in
`A/ui/home/HomeViewModel.kt`: one shared stamp, stop at the first refused write);
`I/ContentView.swift` `private func copy(` (the stamp from the target day and the current clock
time, stop and show the paused dialog on a refused write, close on success). No reference tests.
Research spec `02-food-logging.md` §3.17, §3.4 (the fasting block), traps R02.12, R02.13; Proposed
D-16.50 (copies keep their meal), D-16.35 (the paused dialog). Acceptance ACC-D18-1.

What it does (own words): "Copy a day" in the add menu's Reuse group opens a sheet that copies
food from another day onto the day Home shows. The source day defaults to the day before; a date
field changes it (up to today, ten years back). A line says where the foods go and that the
originals stay as they are. The source day's entries are listed under their meals in the fixed
meal order (breakfast, lunch, dinner, snack, other), newest first inside a meal. The person copies
everything (the primary button, which says how many), one meal ("Copy Breakfast") or one food (a
tap on it). A day with nothing logged shows an empty state; Done closes the sheet. Each copy is a
new entry: a new id, stamped on the target day at the current clock time, the meal it had
(Proposed D-16.50: yesterday's breakfast copied at 20:00 stays breakfast), and everything else as
it was: source, name, values, units, note, lines, product details and the photo ids (the same
photos, shared, never duplicated: the photo store keeps a photo while any entry names it). All
copies of one tap are written together in one `diaryRepo.addMany`, so a fast that is running
refuses the whole copy before anything is written, and the paused dialog explains why; the sheet
stays open. After a successful copy the sheet closes.

Inputs → outputs:
- `src/services/copyDay.ts`: `copy(entries, targetDay)` →
  `{kind: 'copied', entries}` | `{kind: 'fastActive', fast}` | `{kind: 'ignored'}` (another copy
  is still being written); rejects on a storage failure. Deps: `diaryRepo.addMany`, a clock, ids.
- `src/features/log/CopyDaySheet.tsx`: props `open`, `onClose`, `targetDay` → the sheet; reads the
  source day through `useDayEntries`, the energy unit and meal times through `useSettings`.
- Home: the `copyDay` case of `choose` opens it (`COPY_DAY_SHEET`) with the viewed day as target.

Files: created `src/services/copyDay.ts` (+ test), `src/features/log/CopyDaySheet.tsx` (+ test),
this note; copy-day words in `src/i18n/en/reuse.ts`; styles in
`src/features/log/reuse/reuse.module.css`. Shared, additive: `copyDay` in `Services` and
`src/main.tsx`.

Edge cases / failure modes:
- Empty source day: empty state, no copy buttons, Done closes.
- Copying onto a day that is not today: the copies take that day at the current clock time
  (`stampForDay`); onto today: now.
- Several copies at one tap keep their order on the target day: the newest original gets the
  stamp, each older one a millisecond earlier (never before the target day's start), so equal
  stamps never leave the order to random ids.
- A double tap, or "Copy all" then "Copy Lunch" while the first write runs: the second is ignored.
- Fast running: nothing written, the paused dialog shows, the sheet stays open; its OK closes the
  dialog only.
- Write failure: a toast says the foods were not copied; the sheet stays.
- The source day cannot be read: a message in place of the list.
- Copying a day onto itself is allowed (it doubles the day, as asked).

Our design differences / decisions:
- Copies keep each original's meal (Proposed D-16.50); the reference files them under the
  current time's meal (R02.13).
- One all-or-nothing write instead of a loop that stops at the first refused copy: with a fast
  running nothing is written at all, never a part of the day.
- Order-keeping millisecond offsets (above); the reference gives every copy the same instant.
- The paused dialog is a plain message with OK until P07 brings "End fast and log" (D-16.35).
- Header: Done only (the sheet can be dismissed; nothing is typed); the reference also has a
  "Copy all" in its header, ours is the primary button with the count in the body.
- Names are ours: `CopyDaySheet`, `copyDay`, "Copy a day".

Tests we will write:
- `copyDay.test.ts`: copy all from yesterday → new ids on today at the clock time, meals kept,
  originals unchanged (ACC-D18-1); one group copies only that meal; photos shared, not duplicated
  (photo rows unchanged; deleting the original keeps them); note, lines, product kept; fast active
  → nothing written, `fastActive`; past target day → that day at the clock time; order kept;
  double call ignored; empty list writes nothing.
- `CopyDaySheet.test.tsx`: defaults to the day before; groups in meal order; copy all closes and
  writes; one meal; one entry; empty day → empty state and Done; another source day; fast → the
  paused dialog and the sheet stays.
- `HomePage.test.tsx`: Copy a day opens the sheet from the Reuse group.

Compare checklist (filled after the rewrite; reopened `A/ui/home/HomeScreen.kt` 2706–2870,
`A/ui/home/HomeViewModel.kt` `copyEntriesToSelectedDay`, `I/ContentView.swift` `copy(`):
- [x] Source day defaults to the day before the target; another day can be picked
  (`src/features/log/CopyDaySheet.test.tsx > CopyDaySheet > opens on the day before the target, its
  foods under their meals in the fixed order`, `> reads another source day when the date changes`,
  `> names the target day when it is not today, and starts from the day before it`)
- [x] Foods grouped by meal in the fixed order, newest first inside a meal (same test as above)
- [x] Copy all (primary button with the count), one meal, one food; the sheet closes after
  (`CopyDaySheet > copies all of them with the count on the button, keeps their meals and leaves
  yesterday as it was (ACC-D18-1)`, `> copies one meal with its own button`, `> copies one food with
  a tap on it`; `src/services/copyDay.test.ts > copy > copies one meal group only, still under that
  meal at the evening's clock time (D-16.50)`)
- [x] A line naming the target and saying the originals stay (`CopyDaySheet > opens on the day
  before the target…`, `> names the target day when it is not today…`)
- [x] Empty day → empty state and Done (`CopyDaySheet > shows an empty day with Done, which closes
  the sheet`)
- [x] Each copy: new id, the target day at the current clock time, the meal kept (Proposed
  D-16.50), everything else copied (`copyDay.test.ts > copy > copies yesterday onto today with new
  ids at the clock time, meals kept and yesterday unchanged (ACC-D18-1)`, `> keeps everything else
  of the entry: source, values, units, note, lines and product`, `> stamps a past target day at the
  current clock time`, `> never stamps a copy before the start of the target day`)
- [x] Photos shared, never duplicated, and they outlive the original (`copyDay.test.ts > copy >
  shares the photos instead of duplicating them, and they outlive the original`)
- [x] A running fast: nothing written, the paused dialog, the sheet stays (`copyDay.test.ts > copy >
  writes nothing while a fast runs, and says so (R02.12)`; `CopyDaySheet > writes nothing during a
  fast: the paused dialog shows and the sheet stays (R02.12)`)
- [x] One copy at a time (`copyDay.test.ts > copy > ignores a second copy while the first is still
  being written`); a failed write says so (`CopyDaySheet > says so when a copy fails, and stays
  open`)
- [x] Home: Copy a day opens from the Reuse group and the copies show in the viewed day's diary
  (`src/features/home/HomePage.test.tsx > HomePage: the add menu opens its sheets (P06-01) > opens
  %s from the Reuse group (P06-12, P06-13)`, `> copies a day onto the day Home shows, and the copies
  appear in the diary (ACC-D18-1)`)
- Mutation check: copies filed under another meal fail 5 tests.
- Deliberate differences: the meal is kept (Proposed D-16.50; the reference uses the current
  time's meal, R02.13); one all-or-nothing write instead of a loop that stops part-way; copies a
  millisecond apart to keep their order (the reference gives them one instant); the sheet stays open
  when a fast refuses the copy (one reference platform closes it first); Done in the header and the
  count button in the body (the reference also puts "Copy all" in the header); the source day
  cannot be later than today (the reference's wheel allows the rest of the current year); words are
  ours.
- Not taken: the wheel date dialog (a native date input instead).

## Decisions for the lead

- Proposed D-16.50 is implemented as written (copies keep their meal); R02.13's copy half is
  decided by it.
- New service `src/services/copyDay.ts` (`copy(entries, targetDay)` →
  `copied | fastActive | ignored`, rejects on storage failure); optional `Services.copyDay`, built in
  `main.tsx` over the existing `diaryRepo` (additive). It does not call the diary service's
  first-entry hook (D-16.8): a copy needs entries that were logged before.
- The paused dialog is a plain message with OK until P07 brings the shared one with "End fast and
  log" (D-16.35); it lives in `CopyDaySheet.tsx` (`copyDay.paused`).
- Sheet id `copyDay` (`COPY_DAY_SHEET` in `HomePage.tsx`); target = Home's viewed day.
- Data-ui: `copyDay`, `copyDay.from`, `copyDay.note`, `copyDay.empty`, `copyDay.all`,
  `copyDay.meal.<meal>` (+ `.copy`), `copyDay.entry`, `copyDay.paused`.
- Ledger lines for the lead: ACC-D18-1 → the three ACC-D18-1 tests above; R02.12 may add the two
  copy tests.

## Status

Done (2026-10-27). Created `src/services/copyDay.ts` (+ 9 tests), `src/features/log/CopyDaySheet.tsx`
(+ 9 tests), this note; copy-day words in `src/i18n/en/reuse.ts`, styles in
`src/features/log/reuse/reuse.module.css`. Changed `src/features/home/HomePage.tsx` (+ 1 test, and
the shared `it.each` with P06-12). Shared, additive: `copyDay` in `Services` and `src/main.tsx`.
