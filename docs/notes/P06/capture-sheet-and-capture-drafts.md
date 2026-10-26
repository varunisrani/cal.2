# Task: capture sheet and capture drafts (P06-03) · Phase: 06 · Owner: builder (wt-p06s1a, slice S1a)

<!-- Save as platewise/docs/notes/P<nn>/<slug>.md. Write everything above "Compare checklist"
BEFORE writing code, in your own words. Never paste or paraphrase the reference line by line. -->

Read (reference @ `10e14b67`): `A/ui/home/ContextNoteSheet.kt` (all: the meal-photos sheet, its
header, cards, add button, the progressive switch and its info dialog, the note, what Analyze
sends), `A/ui/home/PhotoCaptureDraftViewModel.kt` (all: the draft folder, the mutex, the session
counter, the batch import, remove, clear, busy), `A/ui/home/ContentUriBytes.kt` (all: the 25 MiB
read cap), `A/ui/home/HomeScreen.kt` (the capture wiring around the picker launcher and the sheet:
what opens it, what Remove of the last photo and Cancel do), `I/ContentView.swift` (search
`photosPicker(`: the picker limits, silent skipping, the progressive reset under two photos) and
the Android test `PhotoCaptureDraftRestorationTest.kt` (restore from names, remove, clear). Research
spec `02-food-logging.md` §3.9 and trap R02.17; decision D-16.46 (drafts survive a reload).
Acceptance ids ACC-D4-1, ACC-D4-2.

What it does (own words): the meal-photos sheet collects up to 10 photos of one meal before they
are analysed. "Add photo" opens the camera (a file input with `capture=environment`) or the photo
library (a multiple file input), as the opener chose. The app holds at most 10: extra picks are
left out and a line says how many. Any picked file that is empty, unreadable, over 25 MiB or that
the browser cannot decode refuses the whole pick with a message, and nothing of it is kept
(R02.17: analysing 9 of 10 photos would give wrong totals). The header reads "N of 10 photos";
each card shows the photo with a "Photo k" badge and a remove button; removing the last photo
closes the sheet. The "Plate built in steps" switch (with an info dialog) can be turned on only
with two or more photos and is sent only then. A multi-line note goes with the photos. Analyse is
off while photos are still being stored and hands `{photoIds, note, progressive}` to the opener
(the analysis service is P06-04); Cancel drops the draft and its photos. Everything picked is
stored at once (P06-02) and listed in the capture draft (P02-13), so a reload brings the sheet's
photos, note and switch back (D-16.46).

Inputs → outputs:
- `src/services/captureDrafts.ts`: `createCaptureDraftService({photos, draftsRepo, photoRepo})` →
  `load()` → the stored draft or an empty one; `add(files)` → `{kind: 'added', photoIds, leftOut}`
  | `{kind: 'refused', reason: 'tooLarge' | 'unreadable' | 'unsupportedImage' | 'storageFailed'}` |
  `{kind: 'cleared'}`; `remove(photoId)` → the photo ids left; `update({note?, progressive?})`;
  `clear()`.
- `src/features/log/capture/CaptureSheet.tsx`: props `open`, `picker: 'camera' | 'library'`,
  `onAnalyse({photoIds, note, progressive})`, `onClose()`; `PhotoCard.tsx`: one card from a photo id.

Files: created `src/services/captureDrafts.ts`, `src/services/captureDrafts.test.ts`,
`src/features/log/capture/{CaptureSheet,PhotoCard}.tsx`, `CaptureSheet.test.tsx`,
`capture.module.css`, `src/i18n/en/capture.ts`, this note. Shared, additive: `captureDrafts` in
`Services` (`src/services/context.tsx`), its wiring in `src/main.tsx`, the `capture` line in
`src/i18n/en.ts`.

Edge cases / failure modes:
- 12 picked with an empty draft → the first 10 stored, "2 left out"; 3 picked with 9 in the draft
  → 1 stored, 2 left out; a pick with 10 already there stores nothing.
- Only the files that fit are checked: a file left out by the cap cannot refuse the pick.
- A 30 MiB file anywhere in the kept files → refused before any read or write; an empty file →
  unreadable; a file whose bytes cannot be read → unreadable, before anything is stored.
- A file the browser cannot decode (HEIC) found while storing → refused; the photos this pick
  already stored are released (a failed batch removes its own blobs). A storage error does the
  same.
- Cancel (clear) while a pick is being stored → the pick turns stale at its next step, releases
  what it stored and reports `cleared`; the clear itself runs after it, so nothing of the old
  draft survives.
- Operations run one at a time in call order (load, add, remove, update, clear), so two quick
  picks never exceed 10 and a remove never races an add. Note and switch changes made while a
  write waits are merged into one write.
- Removing the last photo drops the whole draft record (the sheet closes).
- A stored draft that cannot be read loads as empty (the repository keeps the raw value aside).
- Release failures are ignored: the photo repository's prune collects unused photos later.
- Analyse is off with no photos, while the draft loads and while a pick or remove runs; add and
  remove buttons are off while a pick or remove runs.

Our design differences / decisions:
- Names are ours (`CaptureSheet`, `PhotoCard`, `captureDrafts`, `add`, `leftOut`, "Plate built in
  steps").
- The capture draft is a record of the drafts table naming stored photo ids (P02-13), not a
  separate folder of files: the photo cleanup sees it as an owner like any other, so diary cleanup
  cannot delete a capture photo.
- Photos are stored (capped and thumbnailed, P06-02) as they are picked, so Analyse later starts
  from stored photos and the review can show them by id.
- The sheet cannot be closed by Escape, the scrim or a pull (only Cancel, Analyse and removing the
  last photo), so photos are not dropped by accident; the reference closes and clears on a swipe.
- Both pickers are file inputs (no in-app camera view); the browser's own camera UI shows.
- With fewer than two photos the switch is shown off and disabled; its stored value is kept and
  sent only with two or more (the Android behaviour; iOS resets it).
- The notices are lines inside the sheet (a polite status for the cap, an alert for a refusal),
  not a separate dialog.
- Analyse does not clear the draft: P06-04 decides when the analysis owns the photos.

Tests we will write:
- `captureDrafts.test.ts` (real drafts and photo repositories, a fake photo service): 12 picked →
  first 10 kept, 2 left out (ACC-D4-1); one 30 MiB file → whole batch refused, nothing stored
  (ACC-D4-2, R02.17); an unreadable or empty file → refused, nothing stored; an undecodable file
  after two stored → the two released; a reload (new service, same database) restores 3 photos,
  the note and the switch (D-16.46); clear during an import → stale, its photos released; quick
  adds run in order and never pass 10; remove releases the photo and the last one drops the record;
  note writes are merged; Cancel clears the draft and its blobs.
- `CaptureSheet.test.tsx` (real services over a test database, fake codec): camera and library
  inputs; 12 picked → 10 cards and the notice; a 30 MiB file → message, no card, nothing stored;
  switch disabled with one photo, enabled with two, sent only then; reload restores 3 photos and
  the note; Cancel clears the draft and its blobs; Analyse off while storing; removing the last
  closes; the info dialog; copy from the catalogue.

Compare checklist (filled after the rewrite; reopened `ContextNoteSheet.kt`,
`PhotoCaptureDraftViewModel.kt`, `ContentUriBytes.kt`, the capture part of `HomeScreen.kt`,
`ContentView.swift` `photosPicker(`, `PhotoCaptureDraftRestorationTest.kt`):
- [x] Header "N of 10 photos", cards with "Photo k" and a remove button, add button only under 10,
  pickers: camera one photo, library several (`src/features/log/capture/CaptureSheet.test.tsx >
  CaptureSheet > opens the camera as one photo with capture=environment, and the library as
  several`, `> keeps the first 10 of 12 picked photos and says 2 were left out (ACC-D4-1)`, `> shows
  each card as the 720 px preview, named by its place`)
- [x] The cap is applied against the current draft inside the serialised operation
  (`src/services/captureDrafts.test.ts > add: up to 10 photos (ACC-D4-1) > keeps the first 10 of 12
  picked photos and counts the 2 left out`, `> fills only the room left, and a full draft takes
  none`, `> runs picks one at a time, so two quick picks never pass 10`); the person is told — a
  notice the reference does not show (deliberate, the phase row asks for it)
- [x] Any unreadable or > 25 MiB file refuses the whole pick; exactly 25 MiB is fine; empty counts as
  unreadable (`ContentUriBytes`, `importUris`) (`captureDrafts.test.ts > add: a pick is kept whole or
  not at all (R02.17) > refuses the whole pick when one file is over 25 MiB, and stores nothing
  (ACC-D4-2)`, `> takes a file of exactly 25 MiB`, `> refuses the whole pick when a file cannot be
  read, before storing anything`, `> refuses an empty file as unreadable`; sheet:
  `CaptureSheet.test.tsx > CaptureSheet > refuses a pick with a 30 MiB photo whole: a message, no card
  and nothing stored (ACC-D4-2, R02.17)`)
- [x] A failed write removes that batch's files (`captureDrafts.test.ts > add: … > refuses a pick
  with a photo the browser cannot decode and removes the photos it already stored`, `> removes the
  photos it stored when storage fails`; sheet: `CaptureSheet > says plainly when this browser cannot
  open a photo, as HEIC outside Safari (ACC-D28-2, D-16.21)`)
- [x] Clear moves the session on at once; imports from before it never publish and delete their
  files (`captureDrafts.test.ts > remove, clear and waiting writes > turns a pick still being stored
  stale on clear, and removes what it stored`, `> does not start a pick that was waiting when the
  clear came`)
- [x] Busy while any operation runs: Analyse and add/remove off (`CaptureSheet > keeps Analyse off
  while photos are being stored, then sends the photos and the note`)
- [x] Restore after process death from the saved names; unreadable ones dropped
  (`PhotoCaptureDraftRestorationTest`) (`captureDrafts.test.ts > a reload brings the draft back
  (D-16.46) > restores 3 photos, the note and the switch`, `> drops photos that can no longer be read
  when it loads`, `> loads an empty draft when there is none`; sheet: `CaptureSheet > brings back 3
  photos, the note and the switch after a reload (D-16.46)`)
- [x] Remove deletes only that photo; removing the last closes the sheet (`captureDrafts.test.ts >
  remove, clear and waiting writes > removes a photo and releases it; removing the last drops the
  draft and its note`, `> ignores a photo the draft does not hold`; `CaptureSheet > removes a photo and
  numbers the rest again; removing the last closes the sheet`)
- [x] Cancel clears the draft and its files (`captureDrafts.test.ts > remove, clear and waiting writes
  > Cancel clears the draft and its photos`; `CaptureSheet > Cancel clears the draft and its photos`)
- [x] Progressive switch enabled and sent only with two or more photos, with an info dialog
  (`CaptureSheet > keeps the plate-built-in-steps switch off with one photo, and sends it only with
  two or more`, `> explains plate built in steps in a dialog`)
- [x] Note: multi-line, optional, sent trimmed (blank → empty) (`CaptureSheet > keeps Analyse off
  while photos are being stored, then sends the photos and the note`; persisted:
  `captureDrafts.test.ts > a reload … > keeps a note typed before the first photo`, `> remove, clear
  and waiting writes > merges note and switch changes made while a write waits into one write`)
- [x] Copy from the catalogue (`CaptureSheet > draws its words from a catalogue partition that passes
  the lint`)
- Mutation check: dropping the size refusal fails 3 tests, dropping the stale check inside a pick 2,
  not releasing a refused pick's photos 2, sending the switch with one photo 1, enabling Analyse
  while a pick runs 1.
- Deliberate differences: the draft is a record of stored photo ids (photos are capped and
  thumbnailed as they are picked) instead of a folder of raw bytes; the sheet cannot be swiped or
  Escaped away (the reference clears the draft on a swipe); a cap notice and inline refusal lines
  instead of an error dialog; the note and switch are stored with the draft (the reference keeps
  them in screen state only); the switch is shown off while under two photos but its value is kept;
  files left out by the cap are not checked; Analyse leaves the draft for P06-04.
- Not taken: the in-app camera view and "Add photo returns to the camera" (the browser's camera UI
  via the file input instead); iOS's AR scale; the label-scan barcode clearing on every exit (P06-17);
  starting a fresh draft when the camera opens from the menu (the opener's job, P06-01).

## Decisions for the lead

- `CaptureDraftService` (`src/services/captureDrafts.ts`): `load()` (serialised, drops photos whose
  rows are gone), `add(files)` → `added {photoIds, leftOut}` | `refused {reason: tooLarge |
  unreadable | unsupportedImage | storageFailed}` | `cleared`; `remove(id)` → ids left; `update({note?,
  progressive?})` (changes waiting for a write are merged); `clear()`. Constants `MAX_CAPTURE_PHOTOS`,
  `MAX_PICK_BYTES`. `CaptureDraft` is re-exported for screens.
- `CaptureSheet` props: `open`, `picker: 'camera' | 'library'` (what "Add photo" opens),
  `onAnalyse({photoIds, note, progressive})`, `onClose`. Data-ui: `capture`, `capture.cancel`,
  `capture.analyse`, `capture.count`, `capture.card`, `capture.card.remove`, `capture.add`,
  `capture.camera`, `capture.library` (the file inputs), `capture.notice`, `capture.steps`,
  `capture.steps.about`, `capture.steps.dialog`, `capture.note`.
- For P06-01 (the add menu): open the sheet with the picker the method names; after a reload, open
  it when `captureDrafts.load()` has photos. The reference clears the draft when the camera starts a
  new capture; whether "Camera" from the menu should do that is the menu's call (`clear()` first).
  The pickers sit inside the sheet, so the menu needs one more tap unless it opens the input itself.
- For P06-04 (analysis): `onAnalyse` does not clear the capture draft. Once the analysis draft names
  the photos, drop the capture record without releasing them (`draftsRepo.clearCapture()`, ignoring
  the returned ids), or call `clear()` only if the photos should go.
- The 10 cap counts files beyond it as "left out" and does not check them, so an oversized 11th file
  does not refuse the 10 before it.
- A file is read through once (`arrayBuffer`) before anything is stored, so an unreadable one refuses
  the pick with nothing written; the photo service then reads it again to decode. Costs one extra
  read of each picked file.
- `captureDrafts` is optional in `Services` for the same reason as `photos`.
- Copy partition `capture` (`src/i18n/en/capture.ts`, one line in `src/i18n/en.ts`); P06-04 can add
  the overlay's words to it.

## Status

Done (2026-10-26). Created `src/services/captureDrafts.ts` (+ 20 tests),
`src/features/log/capture/{CaptureSheet,PhotoCard}.tsx`, `CaptureSheet.test.tsx` (12 tests),
`capture.module.css`, `src/i18n/en/capture.ts`, this note. Shared, additive: `captureDrafts` in
`Services`, its wiring in `src/main.tsx`, the `capture` line in `src/i18n/en.ts`. The sheet is not
reachable from the app yet (the add menu is P06-01). Trap R02.17 and ACC-D4-1, ACC-D4-2 are now
tested.
