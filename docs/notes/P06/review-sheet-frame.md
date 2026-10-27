# Task: review sheet frame (P06-06) · Phase: 06 · Owner: builder (wt-p06s2a, slice S2a)

<!-- Save as platewise/docs/notes/P<nn>/<slug>.md. Write everything above "Compare checklist"
BEFORE writing code, in your own words. Never paste or paraphrase the reference line by line. -->

Read (reference @ `10e14b67`): `A/ui/home/FoodResultSheet.kt` (state set-up, the save callback,
the sheet layout from the toolbar to the product block, the photo viewer and the saved-label
notice), `I/Views/FoodResultView.swift` lines 160–330 (initial state, header from the parts,
energy and decimal helpers, lock toggle) and 730–880 (toolbar, single submission, the entry it
builds), `T/ui/home/FoodDraftSaversTest.kt` (what survives a process restart). Research spec
`02-food-logging.md` §3.4, §3.5, §3.1 (timestamps), §3.2, §6 R02.5, R02.11–R02.13. Decisions
D-16.16, D-16.35, D-16.46. Ledger rows naming P06-06: R02.13, ACC-D7-1, ACC-D7-2.

What it does (own words): after an analysis finishes, the review sheet shows what the AI made of
the meal so the person can correct it before anything is written. It covers the screen and only
its own buttons close it: Cancel lets the draft (and photos nothing else uses) go; Log writes one
diary entry and then lets the draft go. From top to bottom: the photos in a sideways strip (a badge
"2/3" when there are several, a tap opens a full-screen viewer; no photos → the food's emoji, else
a plate icon), a place for the saved-label notice, the name (left blank → the analysed name), a
place for the allergen line, the serving card (P06-07), the nutrition rows and micronutrients
(P06-08), a place for the ingredients card (P06-09), the meal, the date and time (from ten years
ago up to now), and a place for the product block. The meal starts as the meal for the picked date
and time (D-16.16), so moving the time from breakfast to the evening moves it to dinner, until the
person picks a meal themselves. The sheet edits its own copy of the draft; Log stores every value at
the chosen amount, the weight when it is known, the draft's note, plate-in-steps flag and photos,
once, however often Log is pressed. A fast in progress refuses the write: the sheet stays open with
a message (the paused dialog with "End fast and log" arrives in P07).

Inputs → outputs: the analysis service's `reviewReady` state (`AnalysisDraft`: draft, photo ids,
source, saved-label flag) and the settings `log.gramsFirst`, `units.energy`, `meals.times`, the
viewed day (`selectedDay` in the app state, today when unset) and the clock → `diary.logEntry(draft
at the shown amount, {loggedAt, meal, source, photoIds})`, then `analysis.closeReview()`; Cancel →
`analysis.closeReview()`.

Files: created `src/features/log/review/ReviewSheet.tsx` (+ `ReviewSheet.test.tsx`),
`src/features/log/review/PhotoStrip.tsx` (+ `PhotoStrip.test.tsx`),
`src/features/log/review/review.module.css`, `src/i18n/en/review.ts`, this note. Shared, additive:
`src/app/App.tsx` (mount the review once in the tab frame, + a test in `src/app/App.test.tsx`),
`src/i18n/en.ts` (the `review` partition line), `src/ui/icons/index.tsx` (`plate`, `lock`,
`unlock` icons).

Edge cases / failure modes:
- Log pressed twice before the write finishes: one entry (the sheet's own guard plus the diary
  service's gate, R02.11).
- Name left blank or only spaces: the analysed name is stored.
- Untouched date and time: the opening instant is stored exactly (seconds included); a changed
  date or minute stores the picked local date and time.
- A time in the future or more than ten years back cannot be picked (the inputs hold it).
- A fast in progress: nothing written, the sheet stays, a message says why; Log works again.
- A storage failure: a message, the sheet stays, Log works again.
- Photos that cannot be read show an empty frame; without a photo service the frames stay empty.
- The settings not read yet: the sheet frame shows, Log is off and the body waits, so grams-first
  never flips the unit under the person.
- A new draft (another analysis) replaces the sheet's state entirely (keyed by generation).

Our design differences / decisions:
- Names are ours (`ReviewSheet`, `AnalysisReview`, `PhotoStrip`); the toolbar's second action is
  "Fit check".
- The meal follows the picked date and time (D-16.16), not the current clock (reference R02.13).
- Later slices' parts are typed render slots (`ReviewSlots`): saved-label notice (P06-17),
  allergen line and product block (P06-18), ingredients card (P06-09), fit check (P06-10). The
  Fit check button shows only when its slot is given, so it never does nothing. The connector
  (`AnalysisReview`) is the one place that fills them.
- Fast active → a toast with our message for now (D-16.35 dialog in P07); storage failure → a
  toast; the reference shows dialogs.
- Edits are not kept across a reload: the stored draft reopens as analysed (A keeps edits across
  process restarts, `FoodDraftSaversTest`). Recorded as a follow-up.
- The full-screen viewer is a modal layer with Close and Previous/Next buttons and an "i of n"
  label; no pinch zoom or swipe.
- The date and time use the native date and time inputs (`DateTimeField`) with limits; the
  reference opens picker dialogs.

Tests we will write:
- `ReviewSheet.test.tsx` (harness with the real diary service over the test database, a stand-in
  analysis, fixed clock at 12:30): the frame (title, Cancel, Fit check with a slot, Log; Escape
  does nothing); time 08:00 → breakfast, 19:30 → dinner unless a meal was picked (ACC-D7-1,
  R02.13); Log twice writes one entry (ACC-D7-2, R02.11); blank name keeps the draft name; Log
  stores base × scale, the shown grams, note, plate-in-steps flag, photos and source; an untouched
  time keeps the opening instant; fast active keeps the sheet open with the message and writes
  nothing; Cancel through the real analysis service releases the draft's photo; the connector
  opens on `reviewReady` and stays closed otherwise; copy from a catalogue partition that passes
  the lint.
- `PhotoStrip.test.tsx`: "i/n" badges only with more than one photo; tap opens the viewer on that
  photo, Next and Close; emoji, then plate icon, without photos.
- `src/app/App.test.tsx`: the tab frame shows the review over Home when the analysis has a draft.

Compare checklist (filled after the rewrite; reopened `FoodResultSheet.kt`, `FoodResultView.swift`):
- [x] Toolbar: Cancel, title, Fit check, Log; Escape does nothing; Fit check only with its slot
  (`src/features/log/review/ReviewSheet.test.tsx > ReviewSheet > is a sheet titled Review food
  that only Cancel and Log close, with Fit check when its slot is given`, `> offers no Fit check
  until its slot is given`)
- [x] Meal follows the picked time (D-16.16; the reference uses the current clock, R02.13) and a
  picked meal sticks (`> suggests the meal for the picked time: 08:00 is breakfast and 19:30
  dinner (ACC-D7-1, R02.13, D-16.16)`, `> keeps the meal the person picked when the time changes`)
- [x] Date and time seeded from the viewed day; untouched keeps the instant; range ten years back
  to now (`> logs at the opening instant to the millisecond while the date and time are
  untouched`, `> logs on a picked earlier day at the picked minute, and refuses a time after now`)
- [x] Single submission (`> writes one entry when Log is pressed twice (ACC-D7-2, R02.11)`)
- [x] Blank name keeps the analysed name (`> logs the analysed name when the name is left blank,
  and a typed one trimmed`)
- [x] Save: values base × scale, weight = shown grams, note, steps flag, photos, source (pending,
  else photo with photos, else text); unknown weight saved as the serving count (`> logs every
  value at the shown amount with the shown grams, the note, the steps flag, the photos and the
  source`, `> logs a food of unknown weight as its serving count, and a typed meal as text`)
- [x] Fast active and storage failure keep the review (`> keeps the sheet open with a message
  while a fast is running, and logs once it ends`, `> keeps the sheet open with a message when
  the entry cannot be stored`)
- [x] Photos: strip, i/n badge, viewer at 2 048 / previews at 720, spinner, emoji or plate
  (`src/features/log/review/PhotoStrip.test.tsx > PhotoStrip > shows every photo at card size
  with an i/n badge when there are several`, `> opens the viewer on the tapped photo at viewer
  size, steps through and closes`, `> shows the food's emoji large when there are no photos`,
  `> draws a plate icon for a food with neither photos nor an emoji`)
- [x] Saved-label notice only for a saved-label draft; allergen line and product block slots
  (`ReviewSheet.test.tsx > ReviewSheet > shows the emoji when there are no photos, and fills the
  slots it is given`, `> leaves out the saved-label notice for a draft that did not come from a
  saved label`)
- [x] Opens from `reviewReady`; Cancel and Log hand the draft back; Cancel lets the photo go, Log
  keeps it (`ReviewSheet.test.tsx > AnalysisReview > opens while the analysis has a draft
  waiting, and hands it back on Cancel`, `> lets the draft and its photo go on Cancel, and keeps
  the photo a logged entry names`; `src/app/App.test.tsx > App > opens the review over the tab
  screen while the analysis has a draft waiting (P06-06)`)
- [x] Copy from the catalogue (`ReviewSheet.test.tsx > the review partition > passes the
  catalogue lint merged with the other partitions`)
- Mutation check: filing the meal by the opening time instead of the picked one fails 2 tests.
- Deliberate differences: meal from the picked date and time (D-16.16); Log waits for the write
  and keeps the sheet on a fast (a toast for now, the D-16.35 dialog in P07) or a storage failure
  (a toast; the reference uses dialogs, iOS closes at once); Back and Escape never close the
  review (the reference treats Back as Cancel); the viewer has Previous/Next buttons that wrap
  round instead of swiping, and no zoom; native date and time inputs instead of picker dialogs;
  the name field shows the analysed name as its placeholder; the Fit check button is hidden until
  P06-10 fills its slot.
- Not taken: keeping review edits across a reload (A keeps them across a process restart,
  `FoodDraftSaversTest`; ours reopens the stored draft as analysed); exporting logged photos to
  the device gallery; amino-acid rows (02-Q10).

Decisions for the lead (smallest choices, easy to change):
- Later slices plug into typed render slots on `ReviewSheet` (`ReviewSlots`), filled in one place
  (`AnalysisReview`), instead of editing the sheet's body.
- Back and Escape never close the review (it is not on the router's sheet stack); only Cancel and
  Log do. The meal picker is on the stack, so Back closes it.
- Edits are not kept across a reload (the stored draft reopens as analysed); a follow-up if wanted.

## Status

Done (2026-10-27). Created `src/features/log/review/{ReviewSheet,PhotoStrip}.tsx` (+ tests: 20
and 7), `review.module.css`, `src/i18n/en/review.ts`, this note. Shared, additive:
`src/app/App.tsx` (+3 lines: `<AnalysisReview />` in the tab frame when the analysis service
exists), `src/app/App.test.tsx` (+1 test), `src/i18n/en.ts` (+2 lines, the `review` partition),
`src/ui/icons/index.tsx` (+3 icons: `plate`, `lock`, `unlock`). Hooks: `review`,
`review.{cancel,log,fitCheck,name,meal,when,emoji}`, `review.photos`, `review.photo.<n>`,
`review.viewer[.close|.previous|.next|.caption]`, `review.mealPicker`. Handed on: P06-09 fills
`slots.ingredients` (`IngredientsSlot`: lines at the shown amount, `onLinesChange` = `withLines`,
`onWorkingChange` for a recipe split; `withLines` for parts without weight makes the shown amount
the new basis and scales nutrients by the scale: S2b may refine it with `keepSplit`), P06-10
`slots.fitCheck`, P06-17 `slots.savedLabelNotice`, P06-18 `slots.allergenLine` and
`slots.productBlock`, all through `AnalysisReview` (one place). P07 replaces the paused toast with
the "End fast and log" dialog.
