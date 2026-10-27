# Task: entry editor (P06-11) · Phase: 06 · Owner: builder (wt-p06s11, wave C)

<!-- Save as platewise/docs/notes/P<nn>/<slug>.md. Write everything above "Compare checklist"
BEFORE writing code, in your own words. Never paste or paraphrase the reference line by line. -->

Read (reference @ `10e14b67`): `A/ui/home/EditFoodEntrySheet.kt` (all: state set-up, the entry
it builds on Save, reprocess, the photo strip with its remove buttons, the sections in order, the
actions and the delete confirmation), `I/Views/EditFoodEntryView.swift` (all: initial state, the
line-change rules, reprocess, save, the edited entry), `T/models/FoodEntryPhotoRemovalTest.kt`
(what a photo removal does to the primary, the extra photos and the parts' photos). Research spec
`02-food-logging.md` §3.7, §3.1, §3.3, §3.15, §3.19, §6 R02.5, R02.6, R02.8, R02.21, R02.25.
Decisions D-16.19 (nutrition editable after logging), D-16.16 (review meal; not used here),
D-16.35 (paused dialog, later). Ledger rows naming P06-11: R02.21, ACC-D12-1, ACC-D12-2,
ACC-D12-3.

What it does (own words): tapping a diary row (P06-19 wires the tap) opens the entry in an
editor that looks like the review sheet: photos, name, allergen line, serving, nutrition with the
same lock (D-16.19), ingredients with the split stepper, micronutrients, meal, a note for the AI,
date and time, product block, then a Saved switch and "Delete entry". It edits its own copy:
nothing is written until Save, and Cancel drops everything. Save writes the name (blank keeps the
current one), meal, trimmed note (blank: none), every value at the shown amount, the parts, the
serving and the photos minus the ones removed, and keeps `loggedAt` to the millisecond unless the
person changed the date or the minute (R02.21: re-saving must not re-order rows logged in the same
minute). After the write, only the photos the edit dropped are offered to the photo store, which
deletes those nothing else names, so a saved meal sharing a photo keeps it (R02.8). Each photo has
a remove button; removals are staged in the copy (removing the primary promotes the next; with no
meal photo left the first part photo becomes the primary). While the note differs from the saved
note the primary button reads "Reprocess": it sends "name, amount. note" to the AI (the photos
when the entry still has any, else as text), and the answer replaces the copy's values, serving
and parts (a split ends); the note then counts as saved and the button reads Save again. Errors
show under the note. Delete asks first.

Inputs → outputs: entry id (+ optional day key, the day Home shows by default), `onClose` →
`diary.updateEntry(entry)` (`updated` | `missing` | `fastActive` | `ignored`; releases the photos
the write dropped), `diary.deleteEntry(id)`, `diary.toggleSaved(entry)`,
`reprocess.run({name, amount, note, photoIds, progressive}, signal)` (new service:
`draft` | `failed` | `cancelled`). Reads: `useDayEntries(day)`, `useSavedMeals()`,
`useSettings(['log.gramsFirst', 'units.energy'])`.

Files: created `src/features/log/EntryEditor.tsx` (+ `EntryEditor.test.tsx`), `editor.module.css`,
`src/i18n/en/editor.ts`, `src/services/reprocess.ts` (+ test), this note. Changed:
`src/services/diary.ts` (+ tests: `updateEntry`, `toggleSaved`, `withoutPhotos`). Shared,
additive: `src/i18n/en.ts` (the `editor` partition), `src/services/context.tsx` (`reprocess?`),
`src/main.tsx` (wire `reprocess`, pass the saved-meals repository to the diary service),
`src/features/log/review/PhotoStrip.tsx` (optional remove buttons), `review.module.css` (their
style), `ReviewSheet.tsx` (export two helpers it already has).

Edge cases / failure modes:
- Untouched Save: same instant to the millisecond, same values (the copy opens on the entry's own
  header, not the parts' sums, so an unlocked edit made at review survives).
- Date or minute changed: the picked local date and minute (seconds zeroed); the day moves.
- Time changed and changed back to the original minute: kept to the millisecond.
- Entry not on the day read, or deleted meanwhile: a message, only Close; Save over a deleted
  entry answers `missing` (toast, editor closes) and never brings it back.
- Save pressed twice: one write (the service's gate per entry, plus the sheet's guard).
- A fast running: `updateEntry` turns a `FastActiveError` into `fastActive` (the repository does
  not refuse edits today); the sheet keeps the edits and shows the paused toast.
- Storage failure: a toast, edits kept, Save works again.
- Reprocess failure: messages under the note, values unchanged, button still Reprocess. Cancel
  while it runs stops it; an answer after the sheet went is ignored.
- All photos removed: the strip shows the emoji or the plate; reprocess goes as text.
- A removed photo also named by a part: removed from the part too (it is one file).
- Photos added as parts during the edit are kept by Save (the entry names them) and let go by
  Cancel (the intake session's close).

Our design differences / decisions:
- Names are ours (`EntryEditor`, `updateEntry`, `toggleSaved`, `withoutPhotos`, reprocess
  service). Copy is ours ("Edit entry", "Delete entry", "Note for the AI").
- Nutrition stays editable through the shared lock (D-16.19; the reference edit is read-only),
  so More Nutrition lists every row like the review (the reference lists only known ones).
- Values are stored unrounded at the shown amount (`draftAtAmount`, R02.25); the reference rounds
  micronutrients to 0.1 when the scale is not 1.
- Built from the review's parts (PhotoStrip, ServingCard, NutritionRows, MoreNutrition,
  IngredientsCard, AllergenLine, ProductBlock) instead of a mode prop on `ReviewSheet`, whose
  logic is tied to an analysis draft (Log, opening instant, meal from the time, fit check).
  PhotoStrip gains optional remove buttons.
- The meal stays the entry's own unless picked (D-16.16 is about the review's default).
- Saved switch acts at once on the entry as stored (as the reference's favourite button does),
  not staged until Save; the copy is a snapshot (D-16.17).
- Reprocess has its own small service (AI loaded on first use) instead of the app's analysis,
  which would drop the draft waiting for review and show the overlay.
- `fastActive` → the review's paused toast for now (P07-07 adds the shared dialog).
- Back and Escape do not close the editor (like the review); Cancel, Save and Delete do.

Tests we will write:
- `EntryEditor.test.tsx` (harness, real diary service with the saved-meals repository, stand-in
  reprocess): untouched Save keeps `loggedAt` to the ms and the values (ACC-D12-1, R02.21);
  changed minute / day stores the picked local time; kcal edited through the unlock is saved
  (ACC-D12-2, D-16.19), also at a doubled amount; blank name keeps the name, note trimmed; photo
  remove staged until Save, primary promoted, removed file deleted after Save; last meal photo
  removed → part photo becomes primary; a photo shared with a saved meal stays in it (R02.8);
  reprocess: button label, request (photos vs text, description), values change only after Save,
  split cleared, error inline; delete asks first (ACC-D12-3); Saved switch; Cancel writes
  nothing; fast active keeps the sheet with the paused toast; missing entry; partition lint.
- `diary.test.ts`: `updateEntry` writes and releases only dropped photos, keeps shared ones;
  `missing`; `fastActive`; repeat ignored; `toggleSaved` both ways; `withoutPhotos` cases.
- `reprocess.test.ts`: description text; photo request with the description as note; text when
  no photo can be read; failure messages; cancel.

Compare checklist (filled after the rewrite; reopened `EditFoodEntrySheet.kt`,
`EditFoodEntryView.swift`, `FoodEntryPhotoRemovalTest.kt`):
E = `src/features/log/EntryEditor.test.tsx`, D = `src/services/diary.test.ts`,
R = `src/services/reprocess.test.ts`, P = `src/features/log/review/PhotoStrip.test.tsx`.
- [x] Toolbar: Cancel, title, primary Save; Escape does not close (E > EntryEditor: Save > is
  titled Edit entry with Cancel and Save, and Escape does not close it)
- [x] Untouched Save keeps the instant to the millisecond and every value, the header included
  when the parts add up to something else (E > EntryEditor: Save > keeps loggedAt to the
  millisecond and every value when an untouched entry is saved (ACC-D12-1, R02.21))
- [x] Time changed and back keeps the instant; a changed date or minute stores the picked local
  time, the day follows, the meal stays (E > EntryEditor: Save > keeps the instant when the time
  is changed and changed back (R02.21); > stores the picked date and minute when they change, and
  keeps the meal)
- [x] Nutrition editable through the lock, at the shown amount (D-16.19; the reference edit is
  read-only) (E > EntryEditor: Save > saves calories edited through the unlock (ACC-D12-2,
  D-16.19), at the amount shown)
- [x] Blank name keeps the name; typed name trimmed; note trimmed, emptied note asks to
  reprocess; meal picked (E > EntryEditor: Save > keeps the name when it is left blank, and stores
  the note trimmed; > stores a typed name trimmed and the meal picked)
- [x] Cancel writes nothing (E > EntryEditor: Save > writes nothing on Cancel)
- [x] Fast refusal keeps the edits with the paused message (E > EntryEditor: Save > keeps the
  edits with the paused message while a fast refuses the write; D > updateEntry (P06-11) > turns
  a fast refusal into fastActive)
- [x] Photo remove buttons, staged until Save, next photo promoted, removed file deleted after
  the write (E > EntryEditor: photos > stages a removal until Save: the next photo becomes the
  primary, then the file goes; P > PhotoStrip > gives each photo a remove button when asked,
  which names its place (P06-11); > turns the remove buttons off when asked)
- [x] Part photo becomes primary when no meal photo is left (E > EntryEditor: photos > makes the
  first part photo the primary when no meal photo is left; D > withoutPhotos (P06-11) > makes the
  first part photo the primary when the last own photo goes)
- [x] `FoodEntryPhotoRemovalTest` cases in our own data (D > withoutPhotos (P06-11) > promotes the
  next photo when the primary goes, and changes nothing else; > keeps the primary and the order
  of the others when another photo goes; > takes the photo off the parts too, and leaves their
  values alone; > leaves no photo when every one goes, values and parts otherwise the same;
  > gives the record itself back for no photo, or photos it does not name; > never changes the
  record it was given, nor a saved copy of it)
- [x] A photo shared with a saved meal stays in it; only dropped photos are released (R02.8)
  (E > EntryEditor: photos > leaves a photo shared with a saved meal in the saved meal (R02.8);
  D > updateEntry (P06-11) > deletes only the photos the edit dropped, and keeps one a saved meal
  still names (R02.8))
- [x] Reprocess: label switch, request (name, amount, note, photos), values replaced only in the
  sheet, note becomes saved, Save writes them (E > EntryEditor: Reprocess > turns Save into
  Reprocess while the note differs, and changes values only on Save)
- [x] Reprocessing turns the inputs off; no photos → text (E > EntryEditor: Reprocess > turns the
  editor off while it runs, and sends a photo-less entry as text; R > createReprocessService
  (P06-11) > asks with the line as a typed meal when no photo of the entry can be read)
- [x] Reprocess clears a recipe split (E > EntryEditor: Reprocess > ends a recipe split with the
  answer)
- [x] Reprocess errors inline under the note, nothing changed (E > EntryEditor: Reprocess > shows
  a failure under the note and changes nothing; R > createReprocessService (P06-11) > gives a
  failure its messages)
- [x] The description "name, amount. note"; photos sent with it (R > reprocessDescription (02
  §3.7) > reads "name, amount. note" with grams, a named unit or a serving count; > leaves out a
  blank note and an amount that is not above 0; R > createReprocessService (P06-11) > sends the
  entry's photos with the line as their note, and gives back what the AI made of it)
- [x] Delete asks first (E > EntryEditor: Saved and Delete > asks before deleting, and deletes on
  Delete (ACC-D12-3))
- [x] Saved toggle at once, both ways, photos released only when unused (E > EntryEditor: Saved
  and Delete > saves the entry to the saved meals at once with the switch, and takes it out
  again; D > toggleSaved (P06-11) > saves a copy of the entry, then removes it and deletes its
  photos nothing else names)
- [x] Entry gone: message, no Save; Save over a deleted entry answers missing (E > EntryEditor:
  Save > says so when the entry is no longer in the diary, and offers no Save; D > updateEntry
  (P06-11) > answers missing for an entry deleted meanwhile, and never brings it back)
- [x] One write per entry at a time; storage failures pass on (D > updateEntry (P06-11) > ignores
  a repeat save of the same entry while it is written, and passes a failure on; > keeps the edit
  when the photo cleanup fails)
- [x] Copy from the catalogue (E > the editor partition > passes the catalogue lint merged with
  the other partitions)
- Mutation check: storing the picked minute even when it is unchanged fails 3 tests in E.
- Deliberate differences: nutrition editable through the lock and More Nutrition lists every row
  (D-16.19); values stored unrounded at the shown amount (R02.25; the reference rounds
  micronutrients to 0.1 when scaled); the note is stored trimmed on both platforms' behalf (iOS
  keeps the untrimmed text); our own copy for the delete confirmation and the note's hint; the
  date can be moved back at most ten years and never past now; Reprocess uses its own service,
  never the app's analysis draft; Escape and Back do not close the editor.
- Not taken: Share (later phase); amino-acid rows (02-Q10); a separate "Total ≈ g" row (the
  serving card's line covers it).

Decisions for the lead (smallest choices, easy to change):
- `EntryEditor({ entryId, dayKey?, onClose })`: it reads the entry from that day's live list
  (`dayKey` defaults to the day Home shows), since the read hooks have no read by id. P06-19 can
  pass the row's `dayKey`.
- The editor is built from the review's parts; `ReviewSheet` gets no mode prop. Additive changes
  in the review folder: `PhotoStrip` (`onRemove`, `removeDisabled`), two classes in
  `review.module.css`, and `export` on `withValue` and `yearsBefore` in `ReviewSheet.tsx`.
- `DiaryService.updateEntry` and `toggleSaved` are optional on the interface (every stand-in
  diary in other tests has only `logEntry` and `deleteEntry`); `createDiaryService` always gives
  `updateEntry`, and `toggleSaved` when it gets `savedMealsRepo`. `diaryRepo` now needs
  `update` too. P06-19's heart on Home rows can call `diary.toggleSaved(entry)` (the comment in
  `services/savedMeals.ts` expected the toggle there; the phase file puts it in diary.ts).
- `updateEntry` maps a `FastActiveError` to `fastActive`, but the repository does not refuse
  edits during a fast today, so an edit always goes through; the editor shows the review's
  paused toast if it ever comes back.
- Reprocess is a new optional service (`services.reprocess`), wired in `main.tsx` with its own
  `createAiAccess`; the AI tasks load on first use.
- The Saved switch acts at once on the entry as stored (as the reference does), not on Save.
- Untouched Save rewrites the unit counts from the weight and, with grams first on, stores grams
  as the chosen unit (as the reference does); the instant and every value stay.


## Status

Done (2026-10-27). Created `src/features/log/EntryEditor.tsx` (+ test: 20), `editor.module.css`,
`src/i18n/en/editor.ts`, `src/services/reprocess.ts` (+ test: 6), this note. Changed
`src/services/diary.ts` (+ tests: 15 new, 30 in all). Shared, additive: `src/i18n/en.ts` (+2
lines), `src/services/context.tsx` (+3), `src/main.tsx` (+8: `reprocess`, `savedMealsRepo` for the
diary), `src/features/log/review/PhotoStrip.tsx` (+ 2 tests), `review.module.css`,
`ReviewSheet.tsx` (2 exports). Handed on: P06-19 mounts the editor from the row tap and may use
`diary.toggleSaved` for the heart; P07-07 replaces the paused toast with the shared dialog.
Hooks: `editor`, `editor.{cancel,save,name,meal,note,problem,when,actions,saved,delete,
deleteDialog,missing,mealPicker}`, `review.photo.<n>.remove`, plus the review parts' own.
