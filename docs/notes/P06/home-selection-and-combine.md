# Task: Home selection and combine (P06-19) · Phase: 06 · Owner: builder (wt-p06s19, wave C)

<!-- Save as platewise/docs/notes/P<nn>/<slug>.md. Write everything above "Compare checklist"
BEFORE writing code, in your own words. Never paste or paraphrase the reference line by line. -->

Read (reference @ `10e14b67`): `A/ui/home/HomeScreen.kt` (selection mode parts only: the picked
set and how it starts, grows, shrinks and ends; Back while picking; the bar that takes the place of
the floating buttons; the row in picking mode; tap and long-press on a food row; the favourite
indicator and toggle), `A/ui/home/HomeViewModel.kt` (`combineIntoMeal`, `toggleFavorite`: what
they hand on), `A/data/FoodRepository.kt` (`combineIntoMeal`: the fast check, the one write),
`T/models/CombinedMealTest.kt` and `IT/CombinedMealTests.swift` (the totals and latest-meal cases;
P01-11 already covers them in the domain). Research spec `02-food-logging.md` §3.4 (fasting block),
§3.15 (combined meal), §3.19 (photo ownership after combine), §6 R02.9, R02.12, R02.24; spec
`05-home-progress.md` §3.3.4, §3.4 (the bar replaces the floating buttons). Decisions D-16.20
(combine sums every nutrient all rows know), D-16.35 (paused dialog with "End fast and log"),
D-16.17 (saved meals are copies with their own ids). Ledger rows naming P06-19: ACC-D15-1,
ACC-F12-1 (no trap row names P06-19; R02.9 and R02.24 are already covered by P01-11 and P02-06,
and this task's tests cite them again where they show through).

What it does (own words): on Home, pressing and holding a food row (or its "Select" button, which
appears when it gets keyboard focus) starts picking rows for a combine. While picking, the "+"
button is replaced by a bar with the number picked, Cancel and Combine; Combine needs at least two.
A tap on a row picks it or lets it go; letting go of the last one, Cancel, Back or moving to
another day ends picking. Rows cannot be swiped or deleted while picking, and only food rows can be
picked. Combine turns the picked rows into one entry through the P01-11 rule (one part per row,
energy and macros summed, every nutrient summed only when every row knows it, D-16.20, at the time
and meal of the latest row) and writes it with the originals removed in one transaction. While a
fast runs the store refuses: nothing changes, and the paused dialog offers to end the fast and
combine (two writes, as copy-a-day does). Outside picking, a tap on a row opens the entry editor
(P06-11) for that row's day, fetched on demand, and a heart on the row adds a copy to the saved
meals or takes it out (D-16.17).

Inputs → outputs: picked diary entries → `combine.combine(entries)` (`combined` with the stored
entry | `fastActive` with the fast | `missing` | `tooFew` | `ignored`); the paused dialog's action
→ `fasting.end(fastId)` then `combine.combine(entries)` again. Row tap → `EntryEditor({entryId,
dayKey, onClose})` on the sheet stack. Heart → `diary.toggleSaved(entry)`; its state from
`useSavedMeals()` (a saved meal whose `originEntryId` is the row's id).

Files: created `src/services/combine.ts` (+ test), `src/features/home/SelectionBar.tsx` (+ test),
`src/features/home/useSelection.ts` (the picking state on the sheet stack),
`src/features/home/selection.module.css` (the bar, the picked row, the heart), this note. Changed:
`src/features/home/EntryRow.tsx` (+ test), `Diary.tsx` (+ test), `HomePage.tsx` (+ test),
`src/i18n/en/home.ts` (additive keys). Shared, additive: `src/services/context.tsx` (`combine?`),
`src/main.tsx` (wire `combine` with its words).

Edge cases / failure modes:
- One row picked: Combine disabled; letting it go ends picking and the "+" comes back.
- A picked row deleted elsewhere (another tab) drops out of the count; none left ends picking.
- An original deleted between the pick and the write: the store refuses, nothing is written, a
  message says so and picking stays.
- Fast running: nothing is written; the paused dialog opens; Cancel keeps fasting and picking;
  "End fast and log" ends the fast and combines; a refusal on the second try says so.
- Combine pressed twice: one write (the bar's busy state and the service's own gate).
- Storage failure: a message, picking stays, Combine works again.
- Long-press then release: the click that follows does not also open the editor or let the row
  go. A press that moves (a swipe or a scroll) is not a long-press.
- The heart before the saved meals are read: not drawn, so it never shows the wrong state.
- The editor opens on the row's own day, so it finds the entry even when that day is not today.

Our design differences / decisions:
- Names are ours (`combine` service, `SelectionBar`, `useSelection`, `FoodRowActions`); copy is
  ours ("{count} selected" is a 1–4 word label; "Combined foods" and "{count} others" for the name
  words).
- Picking lives on the sheet stack (`select`), so the browser Back ends it (the reference's Back
  clears the picked set) and a reload never brings it back. Moving to another day ends it: a
  combine joins rows of the day shown.
- The combined name lists the rows in the order they were eaten (oldest first; equal times keep
  the order picked); the reference uses its stored order, which is usually the same.
- After a combine the selection ends and Home shows the new row; the reference also opens the
  edit sheet on it. Opening a sheet while the selection's history entry is still being stepped
  back over would race in the browser, and a tap opens it anyway.
- A keyboard "Select" button (shown on focus) starts picking: a long-press has no keyboard form.
- The heart is a toggle button on the row (pressed when saved), not a sideways swipe: the row's
  swipe already deletes, and a button works for every input.
- Nutrients and extras are summed where every row knows them (D-16.20; the reference drops them).
- "End fast and log" for a combine is two writes (end, then combine) since the store has no
  combined write for it; a combine refused again after the fast ended says so.

Tests we will write:
- `src/services/combine.test.ts`: three entries → one "A + B + C" at the latest time, originals
  gone (ACC-D15-1, R02.24); sodium summed only when all three know it (D-16.20, R02.9); fast
  running → `fastActive`, nothing changes (R02.12); an original gone → `missing`, nothing written;
  fewer than two → `tooFew`; order by time; duplicates once; single flight; storage failure.
- `src/features/home/SelectionBar.test.tsx`: count, Cancel, Combine enabled at two; combine
  success; fast running → paused dialog, nothing changes; "End fast and log" ends and combines;
  failures.
- `src/features/home/EntryRow.test.tsx`: tap opens; long-press picks (fake timers) and the click
  after it does nothing more; a moving press is not a long-press; Select button; picking mode
  (pressed state, no delete); heart pressed state, toggle, failure.
- `src/features/home/Diary.test.tsx`: the row actions reach every food row.
- `src/features/home/HomePage.test.tsx`: long-press → bar instead of "+" (ACC-F12-1); three rows →
  Combine → one entry (ACC-D15-1); fast → paused dialog, nothing changes; Back ends picking; row
  tap opens the editor; heart toggles a saved meal.

Compare checklist (filled after the rewrite; reopened `A/ui/home/HomeScreen.kt` selection parts,
`A/ui/home/HomeViewModel.kt` `combineIntoMeal` / `toggleFavorite`, `A/data/FoodRepository.kt`
`combineIntoMeal`; tests are named file > describe > test, with S = `src/services/combine.test.ts`,
B = `src/features/home/SelectionBar.test.tsx`, R = `src/features/home/EntryRow.test.tsx`,
H = `src/features/home/HomePage.test.tsx`, D = `src/features/home/Diary.test.tsx`):
- [x] Long-press starts picking with that row; the bar replaces the "+" with the count, Cancel
  and Combine, disabled below two (R > EntryRow: on Home (P06-19) > starts picking after a press
  held still for half a second, and the click that ends it does nothing more (ACC-F12-1); H >
  HomePage: picking and combining rows (P06-19) > starts picking on a long-press: the bar with the
  count, Cancel and Combine takes the place of "+" (ACC-F12-1); B > SelectionBar > says how many
  rows are picked and offers Combine from two (ACC-F12-1))
- [x] A press that moves or ends early is a tap; a held press never also opens the editor (R >
  EntryRow: on Home (P06-19) > keeps a press that moves, or is let go early, an ordinary press)
- [x] Tap while picking toggles; the last one let go, Cancel and Back end picking (R > … > while
  picking, shows whether the row is picked, toggles it on a tap and offers no swipe, delete or
  heart; H > … > ends picking when the last picked row is let go, on Cancel and on Back; B >
  SelectionBar > ends picking on Cancel and changes nothing)
- [x] No swipe or delete while picking (R > … > while picking, shows whether the row is picked,
  toggles it on a tap and offers no swipe, delete or heart)
- [x] Combine: one entry named after the rows at the latest time and meal, originals gone in one
  write (S > combine > replaces three entries by one named "Toast + Eggs + Tea" at the latest
  time, in one write (ACC-D15-1, R02.24); B > SelectionBar > combines three rows into one named
  "Toast + Eggs + Tea" at the latest time, then ends picking (ACC-D15-1); H > HomePage: picking
  and combining rows (P06-19) > combines three picked rows into one entry named "Toast + Eggs +
  Tea" at the latest time, and the "+" comes back (ACC-D15-1, D-16.20))
- [x] A nutrient summed only when every row knows it (S > combine > sums sodium only when all
  three entries know it (D-16.20, R02.9))
- [x] Fast running: nothing changes, the paused dialog shows, picking stays; "End fast and log"
  ends the fast and combines (S > combine > changes nothing while a fast runs, and says so
  (R02.12); B > SelectionBar > changes nothing while a fast runs and shows the paused dialog;
  Cancel keeps fasting and picking (R02.12); B > SelectionBar > ends the fast and combines on "End
  fast and log" (D-16.35); H > HomePage: picking and combining rows (P06-19) > changes nothing
  while a fast runs and shows the paused dialog; picking stays (R02.12))
- [x] An original gone, fewer than two, a second press, a storage failure (S > combine > writes
  nothing when one of the entries was deleted meanwhile; > needs two different entries: one, or
  one given twice, writes nothing; > ignores a second combine while the first is still being
  written; > passes a storage failure on, and the next combine may try again; B > SelectionBar >
  says so when a picked row was deleted meanwhile, and keeps picking; > says so when the combine
  fails, and Combine works again)
- [x] Photos stay with the combined entry (S > combine > keeps every photo of the originals on
  the combined entry, and deletes none)
- [x] Row tap opens the editor on the row's day, fetched on demand (R > EntryRow: on Home
  (P06-19) > keeps the row announced by its name and energy, and opens the entry on a tap; D >
  Diary > hands Home's row actions to every food row: a tap opens that entry, and picking shows on
  each (P06-19); H > HomePage: a row opens its editor and keeps a saved copy (P06-19) > opens the
  entry editor on a tap, and Cancel closes it)
- [x] Heart: pressed when saved, toggles from the row, waits for the read, failure message (R >
  EntryRow: on Home (P06-19) > shows the heart pressed for an entry with a saved copy, and toggles
  the saved meal from the row; > draws no heart until the saved meals have been read; > says so
  when the saved meals cannot be changed; H > HomePage: a row opens its editor and keeps a saved
  copy (P06-19) > keeps a copy in the saved meals from the row's heart, and takes it out again)
- [x] Keyboard: the Select button starts picking and the focus stays on the row (R > … > starts
  picking from the keyboard Select button and keeps the focus on the row)
- [x] Order of the name (S > inEatingOrder > puts the entries oldest first, keeps the given order
  for equal times and drops repeats)
- Mutation checks: dropping the "click after a long-press" guard fails R's long-press test;
  dropping the eating-order sort fails 3 tests in S.
- Browser check (scratch, not committed): on a Pixel 7 profile a real touch held 800 ms started
  picking without opening the editor, Back ended it, three rows combined into "Toast + Eggs +
  Tea 435 kcal", the editor chunk loaded on a tap, and the heart toggled; no page errors.
- Deliberate differences: picking lives on the sheet stack and ends on another day; the combined
  name lists rows in eating order; no editor opens after a combine; a Select button for the
  keyboard; the heart is a toggle button, not a sideways swipe; nutrients summed where every row
  knows them (D-16.20); "End fast and log" is two writes.
- Not taken: the photo preview from the row's thumbnail (rows have no thumbnails yet); the health
  store sync of the reference's combine (no health stores in v1).

## Decisions for the lead

- `services.combine` (`createCombineService({diaryRepo, photoRepo, words})`) is a new optional
  service; `main.tsx` passes the catalogue words `home.combine.unnamed` ("Combined foods") and
  `home.combine.more` ("N others") for the P01-11 name rule.
- Picking is a pseudo-sheet `select` on the router's stack, so Back ends it (the reference's
  BackHandler) and a reload drops it. Moving to another day ends it.
- The combined name lists the rows oldest first (`inEatingOrder`; the reference uses its stored
  order, which is usually the same).
- After a combine Home shows the new row; the reference also opens its edit sheet. Opening a sheet
  while the `select` history entry is still being stepped back over would race in the browser.
- The heart is an `aria-pressed` toggle button on each row (shown once the saved meals are read);
  saved state = a saved meal whose `originEntryId` is the row's id, as the editor reads it.
- The "+" slot is hidden (`hidden`) while picking instead of unmounted, to keep the HomePage diff
  small next to P07-05/P07-08's changes there.
- "The dialog loads on demand": `PausedDialog` is already in the start-up bundle through
  `ManualSheet` (imported statically by Home), so a lazy import would split nothing; only the
  editor loads on demand (its own 3.3 kB gzip chunk). Initial JS 213.07 → 216.36 kB gzip.
- Follow-up: once P07-05 lands water and fast rows in `Diary.tsx`, they must not take
  `foodActions` (only food rows can be picked); a test with a water row then belongs in Diary.

## Status

Done (2026-10-27). Created `src/services/combine.ts` (+ test: 9), `src/features/home/
SelectionBar.tsx` (+ test: 7), `useSelection.ts`, `selection.module.css`, this note. Changed
`EntryRow.tsx` (+ 8 tests), `Diary.tsx` (+ 1 test), `HomePage.tsx` (+ 6 tests),
`src/i18n/en/home.ts` (additive keys). Shared, additive: `src/services/context.tsx` (+3),
`src/main.tsx` (+10). Hooks: `entry.row.open`, `entry.row.saved`, `entry.row.select`,
`home.selection`, `home.selection.{cancel,count,combine}`.
