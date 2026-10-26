# Task: analysis service and overlay (P06-04) · Phase: 06 · Owner: builder (wt-p06s1b, slice S1b)

<!-- Save as platewise/docs/notes/P<nn>/<slug>.md. Write everything above "Compare checklist"
BEFORE writing code, in your own words. Never paste or paraphrase the reference line by line. -->

Read (reference @ `10e14b67`): `A/ui/home/HomeViewModel.kt` (lines 440–1210: the text, photo and
barcode analysis launches, the generation counters, the pending-draft save with its two staleness
checks, restore on launch, discard, Cancel and Retry), `A/ui/home/HomeScreen.kt` (only the Analyze
hand-off from the capture draft, to see who owns the photos while the analysis runs) and the test
`T/ui/home/PendingReviewStateTest.kt` (a restored draft keeps its source and saved-label flag).
Research spec `02-food-logging.md` §3.4 (pipeline states), §3.9 (source label when armed), §3.10
(pending drafts), trap R02.10; decision D-16.46. Acceptance ids ACC-A5-1, ACC-D5-1, ACC-D5-2.

What it does (own words): one analysis runs at a time for the whole app. Starting one (photos of a
meal, a label photo after a barcode miss, or a typed description) first moves the stored draft on
to a new generation, which drops the draft waiting for review and lets its photos go. While the AI
works, an overlay covers the screen with the first photo (a spinner for text) and Cancel, and the
tab bar hides. The request runs under one time limit taken from the AI settings. When the answer
comes back, the draft is stored with its photo ids and how it was made (photo, label, text), the
capture sheet's record is dropped (the photos now belong to the draft), and the review is ready
to open. Cancel stops the request and shows nothing; the photos of that attempt are let go. A
failure shows the failure's message with Retry (the very same request again) and Cancel. An answer
that comes back after the person moved on (Cancel, a newer analysis, a review closed) is never
shown and lets its own photos go (R02.10). After a reload, a stored draft opens the review again,
unless an analysis was started first (D-16.46).

Inputs → outputs:
- `createAnalysisService(deps)`: deps are the drafts, photo, settings and secrets repositories,
  the app state store's `setAnalysisOverlay`, `fetch`, and optionally a clock and an image backend.
- `start(kind, inputs)`: `photo {photoIds, note, progressive, armedLabel?}`, `label {photoIds,
  note, barcode?}`, `text {text}` → state `analysing` → `reviewReady {draft, generation}` |
  `failed {failure, messages}` | `idle` (cancelled or overtaken). Resolves when the attempt is over.
- `cancel()`, `retry()`, `closeReview()` (the review was logged or cancelled: P06-06),
  `restore()` (app start).
- `getSnapshot()` / `subscribe()` for `useSyncExternalStore`.
- `AnalysisOverlay`: renders the overlay while `analysing`, the failure dialog while `failed`,
  nothing otherwise; `useAnalysis()` gives screens the service and its state.

Files: created `src/services/analysis.ts`, `src/services/analysis.test.ts`,
`src/features/log/AnalysisOverlay.tsx`, `src/features/log/AnalysisOverlay.test.tsx`,
`src/features/log/analysis.module.css`, this note. Shared, additive: `analysis` in `Services`
(`src/services/context.tsx`), its wiring in `src/main.tsx`, `export` on `browserFetch` in
`src/ai/transport.ts` (the lead's change), words added to `src/i18n/en/capture.ts`.

Edge cases / failure modes:
- Cancel before the draft generation was even started, while photos load, while the request runs,
  and while the result is being written: always silent, never a review; a draft written in that
  last window is cleared again under its own generation.
- A new start while one runs: the old request is aborted and its result, should it still arrive,
  is stale. A start while a review is waiting drops that draft first.
- The stored draft can be taken by another tab (the generation moved on in the database): the
  write reports stale and the attempt ends quietly.
- Photos: released only through `releaseIfUnused`, so a photo still named by the capture record,
  a newer draft or a logged entry is never deleted. Missing photos are skipped; none left gives the
  image failure.
- AI not set up (`ai.settings` null): the defaults are used and the request fails with the
  no-key message before anything is sent.
- A storage error anywhere is the generic failure, with Retry.
- `restore()` yields to any start that happened after it was called, and to a state that is not
  idle.
- The overlay flag follows the state: on only while analysing; the tab bar comes back when the
  result, the failure or the Cancel arrives.

Our design differences / decisions:
- Names are ours (`analysis`, `reviewReady`, `closeReview`, `armedLabel`).
- Photos are stored before the analysis (P06-02/03) and stay named by the capture record until the
  draft names them, so a reload while the AI works keeps the photos (the reference holds them in
  memory and loses them). Cancel then drops that capture record and lets the photos go.
- A new start aborts the request it replaces instead of letting it run on.
- The draft is written before the review opens (the reference opens first and writes after); the
  write is one small IndexedDB transaction and the photos are already stored.
- The failure dialog sits over the page with the tab bar back, as in the reference.
- A label photo carries its barcode onto the draft's product details, so the label can be found
  again (P06-17 may replace this with its own helper).

Tests we will write:
- `analysis.test.ts` (real repositories over a test database, fake fetch, a fake image backend):
  success stores the draft (photo ids, source, note, switch) and reports `reviewReady`, drops the
  capture record and keeps the photos; reload (new service, same database) reopens it; restore
  yields to a newer start; Cancel aborts the request, shows no error and releases the photos
  (ACC-D5-1); failure → Retry sends the same request (ACC-D5-2); a result arriving after a newer
  start is discarded and its photos released, and a write that lands after Cancel is cleared
  (R02.10); a new start drops the waiting draft's photos; label source and barcode; text source;
  no AI set up → no-key message; the time limit from the settings (fake timers); the overlay flag.
- `AnalysisOverlay.test.tsx`: first photo shown, spinner for text; Cancel; the failure dialog with
  the message, Retry and Cancel; the tab bar hides during an analysis and returns after
  (ACC-A5-1); copy from the catalogue.

Compare checklist (filled after the rewrite; reopened `HomeViewModel.kt` lines 440–1210, the
`AnalyzingOverlay` and the error dialog in `HomeScreen.kt`, `PendingReviewStateTest.kt`):
- [x] One pipeline; a start drops the previous draft and its photos first (`discardPendingDraft` at
  every launch) (`src/services/analysis.test.ts > late results (R02.10) > drops the draft waiting
  for review when a new analysis starts, with its photos`)
- [x] Success stores the draft with photos and source and opens review; the overlay drops at once
  (`analysis.test.ts > start: a finished analysis waits for review > stores the draft with its
  photos, note and source, and hands the capture photos to it`, `> hides the tab bar while it runs
  and shows it again with the result`)
- [x] Source text for typed meals, label when the label barcode was armed (barcode kept on the
  product), photo otherwise (`> sends a typed meal trimmed, as text, and stores it with no photo`,
  `> runs photos taken for an armed label scan as a label, keeping the barcode`, `> stores a label
  start with source label, and without a barcode leaves the product alone`)
- [x] Empty photos skipped, at most 10 (the P03-18 task), none left → image failure (`> skips
  photos that are gone, and with none left shows the photo message without sending`)
- [x] Cancel: request cancelled, overlay gone, no error, retry dropped, that attempt's files deleted
  (`analysis.test.ts > Cancel (ACC-D5-1) > stops the request with no error, and lets the photos and
  the capture record go`, `> aborts the request on its way (the fake sees the aborted signal)`, `>
  sends nothing when pressed before the request goes out`, `> after a failure, closes it and lets
  the photos go`; UI: `src/features/log/AnalysisOverlay.test.tsx > AnalysisOverlay > closes on
  Cancel with no error message, and the tab bar comes back (ACC-D5-1)`, `> closes the failure on
  Cancel and shows nothing more`)
- [x] Failure: the kind's message with Retry (the same request: same photos, note, switch, text)
  and Cancel (`analysis.test.ts > failure and Retry (ACC-D5-2) > shows the failure's message, keeps
  the photos, and Retry sends the same request again`, `> keeps photos no record names when Retry
  sends them again`, `> does nothing when there is no failure to retry`; UI: `AnalysisOverlay >
  shows the failure with Retry, which sends the same request again (ACC-D5-2)`); the generic message
  for a non-AI error (`> shows the generic message when the draft cannot be stored`)
- [x] The two staleness checks around the draft write (generation and "same draft"): a late result
  deletes its own files and never opens; cancel clean-up only touches its own attempt (R02.10)
  (`analysis.test.ts > late results (R02.10) > never shows a result that arrives after a newer
  start, and lets its photos go`, `> drops a result whose write lands after a newer start began`,
  `> clears again a draft written just as Cancel was pressed`)
- [x] Restore on launch with photos and source, unless an analysis or review already started
  (`analysis.test.ts > restore after a reload (D-16.46) > opens the stored draft again, with its
  photos and source`, `> leaves the review closed when there is no draft`, `> yields to an analysis
  started while it reads`, `> stays closed when an analysis started while it read was cancelled`)
- [x] Overlay: the first photo (or, for us, a spinner for text), a status line that differs for
  typed meals, Cancel; the tab bar hidden only while it shows (`AnalysisOverlay > shows the first
  photo with Cancel while photos are analysed`, `> shows a spinner for a typed meal`, `> hides the
  tab bar during an analysis and brings it back afterwards (ACC-A5-1)`, `> shows nothing while no
  analysis runs`)
- [x] Review closed (logged or cancelled) clears the record; Cancel deletes the files, Log keeps
  them (`analysis.test.ts > closing the review > drops the draft and its photos after Cancel`, `>
  keeps the photos a logged entry names`)
- [x] One time limit from the settings (`analysis.test.ts > the time limit (fake timers) > stops at
  the timeout from the AI settings and offers Retry`); AI not set up fails before sending (`start:
  … > shows the no-key message and sends nothing when AI is not set up`)
- [x] Copy from the catalogue (`AnalysisOverlay > draws its words from a catalogue partition that
  passes the lint`)
- Mutation check: dropping the stale check after the write fails 1 test, not dropping the capture
  record on Cancel 4, restore ignoring newer starts 1, releasing the photos a Retry is sending 1,
  keeping the previous draft's photos on a new start 1, not clearing a draft written after Cancel
  1, the overlay flag stuck on 7, Retry sending another request 3.
- Deliberate differences: photos are stored before the analysis and stay owned by the capture
  record until the draft names them (a reload mid-analysis keeps them; the reference holds them in
  memory); the draft is written before the review opens; a new start aborts the request it
  replaces; the overlay is a card over a scrim, not an opaque page, with a spinner only for typed
  meals; the failure dialog's title is ours; a failure to drop the capture record does not fail the
  analysis.
- Not taken: the barcode lookup path and the "Scan label" offer on its errors, clearing the armed
  label on every exit and `fromSavedLabel` (P06-17); the hosted-AI paywall routing (no hosted AI);
  thumbnail pre-warming (thumbnails are made when photos are stored, P06-02); skipping the overlay
  photo for very large files (the preview is the 720 px copy).

## Decisions for the lead

- `AnalysisService` (`src/services/analysis.ts`): `start(kind, inputs)` with kinds `photo
  {photoIds, note, progressive, armedLabel?}`, `label {photoIds, note, barcode?}`, `text {text}`;
  `cancel()`, `retry()`, `closeReview()`, `restore()`, `getSnapshot()`/`subscribe()`. States `idle`,
  `analysing {kind, photoIds}`, `failed {kind, photoIds, failure, messages}`, `reviewReady {draft,
  generation}`. `start` resolves when the attempt is over and never rejects.
- `armedLabel` on photo inputs is the armed hand-off's barcode: when set, the start runs as `label`
  (the P03-18 label task, source label, the barcode stamped on `draft.product`, an otherwise empty
  product record when the AI gave none). P06-17 may swap the stamp for its own helper; both the
  `label` kind and `armedLabel` exist so the capture sheet's opener can pass the hand-off without
  branching.
- For P06-06 (review): open from `reviewReady`; after Log writes the entry, or on Cancel, call
  `closeReview()`: it clears the record under its generation and releases the draft's photos, which
  the new entry keeps by naming them. `useAnalysis()` (in `AnalysisOverlay.tsx`) gives a screen the
  service and its state.
- For P06-01/App: mount `<AnalysisOverlay />` once in the shell (it renders nothing while idle);
  the capture sheet's `onAnalyse` calls `analysis.start('photo', request)` and closes the sheet.
  `main.tsx` calls `analysis.restore()` after the first render.
- Cancel (during the analysis or on the failure) drops the capture record when it holds the
  attempt's photos, so they are deleted, as the reference deletes them; a failure keeps the
  record so Retry has the photos and a reload brings the capture sheet back.
- The overlay flag follows the state (on only while analysing), so the tab bar is back behind the
  failure dialog, as in the reference.
- `fetch` is wired in `main.tsx` from `browserFetch`, with the one `export` keyword added to
  `src/ai/transport.ts` as the lead asked.
- Words went into the `capture` partition (`capture.analysing.*`, `capture.describe.*`); no new
  partition, so `src/i18n/en.ts` is unchanged.

## Status

Done (2026-10-26). Created `src/services/analysis.ts` (+ 27 tests),
`src/features/log/AnalysisOverlay.tsx` (+ 8 tests), `src/features/log/analysis.module.css`, this
note. Shared, additive: `analysis` in `Services` (`src/services/context.tsx`), its wiring and the
start-up restore in `src/main.tsx`, `export` on `browserFetch` in `src/ai/transport.ts`, words in
`src/i18n/en/capture.ts`. Not reachable from the app yet (the add menu is P06-01, the review
P06-06). Trap R02.10 and ACC-A5-1, ACC-D5-1, ACC-D5-2 are now tested.
