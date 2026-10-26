# Task: drafts repository (P02-13) · Phase: 02 · Owner: builder (wt-p02s2)

<!-- Save as platewise/docs/notes/P<nn>/<slug>.md. Write everything above "Compare checklist"
BEFORE writing code, in your own words. Never paste or paraphrase the reference line by line. -->

Read (reference @ `10e14b67`): `A/models/PendingFoodAnalysisDraft.kt` (all),
`A/ui/home/HomeViewModel.kt` (lines 440–700, plus the draft save, restore and discard helpers and
the two generation counters they use), `T/ui/home/PendingReviewStateTest.kt` (all); research spec
`02-food-logging.md` §3.9 (capture drafts), §3.10, §6 R02.10; decision D-16.46; the landed model
(`AnalysisDraft`) and codec (`decodeAnalysisDraft`). No Evidence ids.

What it does (own words): an analysis can finish while the person is not looking, and the app can be
closed before they log it. The finished result is kept in the `drafts` table so the review opens
again after a reload (D-16.46). Results arrive late and in any order (a new scan started, the
person logged or cancelled), so the analysis draft row carries a generation number. Starting an
analysis takes a new generation (and hands back the photos of the draft it replaced, for release);
a result is kept only when it carries the current generation, otherwise it is refused as stale and
the caller releases the photos it wrote for it; clearing with an old generation leaves a newer
draft alone, and clearing bumps the generation so a save still in flight for the cleared flow is
refused too (R02.10). The capture draft (photos picked before Analyze, the note and the "plate
built in steps" flag) is its own row with save, load and clear. Draft operations from this tab run
one after another in call order.

Inputs → outputs (plain functions, `db` first):
- `begin(db)` → `{ gen, previousPhotoIds }`.
- `saveResult(db, gen, result)` → `'saved' | 'stale'`.
- `load(db)` → `{ gen, result }` or null.
- `clear(db, gen?)` → the photo ids the cleared draft held ([] when nothing was cleared).
- `saveCapture(db, capture)` → ids the previous capture held that the new one does not;
  `loadCapture(db)` → the capture or null; `clearCapture(db)` → the ids it held.
- `decodeDraftRow` and `draftPhotoIds(row)` for the photo store's reference check (P02-07).

Files: created `src/data/repos/draftsRepo.ts`, `src/data/repos/draftsRepo.test.ts`, this note.

Edge cases / failure modes:
- A result for an older generation (a newer scan began, or the flow was cleared) → stale, nothing
  stored.
- Log keeps the draft's photos: the entry references them, so releasing the ids `clear` returns
  keeps them (the photo store checks owners).
- `begin` when the previous flow had not saved a result yet → no photo ids to hand back.
- The generation survives reloads (stored in the row); clearing keeps the row with the bumped
  generation, so a later `begin` never reuses a generation an old flow may still hold.
- An unreadable analysis row: kept aside before it is replaced; `load` reads nothing; `saveResult`
  answers stale; `begin` starts again from generation 1; `clear(gen)` refuses (cannot confirm the
  generation), `clear()` resets it.
- An unreadable capture row: `loadCapture` reads nothing; save and clear keep it aside first.
- A capture row is strict: its photo ids must be a list of strings, or the row is unreadable (an
  unreadable owner stops photo cleanup, which is the safe side).
- Unknown rows in `drafts` (another build) read as unreadable.

Our design differences / decisions:
- Generations are stored with the draft instead of living in screen memory, so they hold across
  tabs and reloads, and the stale check happens inside the writing transaction.
- The repository never deletes photos; it returns the ids so the caller releases them through the
  photo store's reference check (P02-07). This keeps Log's reuse of the draft's photos safe.
- Serialised through an in-process queue per database (call order), on top of IndexedDB's own
  ordering of overlapping write transactions.
- Names: rows `analysis` (`{ id, gen, result? }`) and `capture` (`{ id, photoIds, note,
  progressive }`); `CaptureDraft` type lives here (not in the domain model) until a feature needs it
  elsewhere.
- Reopening the review on start-up only when no newer flow began is the screen's rule (P06-04): it
  compares the loaded generation with its own.

Tests we will write:
- A result saved with an old generation is refused as stale (R02.10).
- `begin` returns the previous draft's photo ids (and its lines' photo ids).
- Reload → `load` returns the saved draft with its generation (D-16.46).
- Clear with an old generation does not clear a newer draft; clear with the current one returns
  its photo ids and makes an in-flight save of that generation stale.
- Capture draft survives a reopen; save returns the dropped ids; clear returns the held ids.
- Operations issued without awaiting land in call order.
- An unreadable analysis row is kept aside, loads as nothing and makes saves stale.

Compare checklist (filled after the rewrite; reopened `A/models/PendingFoodAnalysisDraft.kt`,
`A/ui/home/HomeViewModel.kt`, `T/ui/home/PendingReviewStateTest.kt`):
- [x] A late result for a flow that was replaced, logged or cancelled is not stored (the caller
  then deletes its own photos) (tested in `src/data/repos/draftsRepo.test.ts > analysis draft >
  refuses a result saved with an old generation as stale (R02.10)`, `> clearing makes a save still
  in flight for that generation stale (R02.10)`).
- [x] Starting an analysis discards the previous draft and hands back its photos, read from the
  stored record (`draftsRepo.test.ts > analysis draft > begin hands back the photos of the draft it
  replaces, lines included`).
- [x] A delayed cancel of an older flow cannot wipe a newer draft (`draftsRepo.test.ts > analysis
  draft > clear with an old generation leaves a newer draft alone`).
- [x] The draft (values, photos, source, saved-label flag) comes back after the app restarts
  (`draftsRepo.test.ts > analysis draft > a saved draft is there again after a reload, and
  generations go on from it (D-16.46)`).
- [x] Capture drafts survive a restart and their operations are serialised (`draftsRepo.test.ts >
  capture draft > survives a reopen`, `> save returns the photos it dropped and clear the photos it
  held, in call order`; `> analysis draft > runs calls in the order they were made, even when not
  awaited one by one`).
- [x] An unreadable stored draft is never silently replaced (`draftsRepo.test.ts > analysis draft >
  keeps an unreadable draft aside, reads nothing from it and refuses saves against it`, `> capture
  draft > keeps an unreadable capture row aside before replacing it`).
- Deliberate differences: the generation is stored with the draft (survives reloads, shared by
  tabs) instead of living in screen memory; the stale check runs inside the writing transaction
  instead of before and after the write; the repository never deletes photos (it returns ids for
  the caller to release through the reference-checked photo store); iOS keeps no draft, we keep
  one on every platform (D-16.46).
- Not taken: the screen's rule that a restored draft reopens review only when no newer flow began
  (P06-04, using the generation `load` returns), thumbnail pre-warming (P06-02), the logged-portion
  check of the review state test (P06 review), photo import batching and its failure cleanup for
  the capture sheet (P06-03).

## Decisions for the lead

- Row shapes in `drafts`: `{ id: 'analysis', gen, result? }` and `{ id: 'capture', photoIds, note,
  progressive }`; any other row is unreadable (and so stops photo cleanup until it is dealt with).
- Clearing keeps the analysis row with the next generation instead of deleting it, so a
  generation is never handed out twice; an unreadable analysis row restarts at generation 1 after
  it is kept aside.
- `clear()` without a generation always clears; `clear(gen)` only for the current generation.
- `CaptureDraft` is defined in `draftsRepo.ts`, not in `src/domain/model.ts` (domain is out of
  this slice); move it if a domain rule needs it.
- `saveCapture` and `clearCapture` return the photo ids the caller should release; the repository
  does not validate the 10-photo cap or the progressive rule (UI rules, P06-03).
- R02.10 is owned by P06-04 in the ledger; the two `R02.10` tests here cover its storage half.

## Status

Done (2026-10-26). Everything above is in place; no file outside the slice was changed.
