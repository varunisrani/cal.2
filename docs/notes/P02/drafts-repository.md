# Task: drafts repository (P02-13) · Phase: 02 · Owner: builder (wt-p02s2)

<!-- Save as platewise/docs/notes/P<nn>/<slug>.md. Write everything above "Compare checklist"
BEFORE writing code, in your own words. Never paste or paraphrase the reference line by line. -->

Read (reference @ `10e14b67`): `A/models/PendingFoodAnalysisDraft.kt` (all: the stored shape),
`A/ui/home/HomeViewModel.kt` lines 440–700 (every analysis start discards the previous draft's
files first) plus, from the spec's file map for the same file, the draft save, restore and
discard functions (two counters, photos written before the record, re-checks after each step),
`T/ui/home/PendingReviewStateTest.kt` (all: the saved-label flag survives a round trip and an
older draft without it reads as false). Research spec `02-food-logging.md` §3.9 (capture drafts),
§3.10, §6 R02.10; decision D-16.46. No Evidence ids.

What it does (own words): a finished analysis that the person has not logged yet must survive a
reload (D-16.46), and so must the photos and note gathered in the capture sheet before Analyze.
Each lives in its own record of the `drafts` table (`analysis` and `capture`). Analysis results
arrive late and may race with the person logging, cancelling or starting another analysis, so the
analysis record carries a generation counter: starting an analysis increments it, drops the
previous draft and hands back that draft's photo ids so the caller can release them; a result is
stored only when its generation is still current, otherwise the caller hears `stale` and releases
the photos it wrote; clearing with an old generation leaves a newer draft alone. Clearing also
moves the counter on, so a save still in flight for the cleared attempt turns stale. Every
operation is one transaction on the `drafts` table, so operations take effect one at a time in
call order; the counter lives in the database, so a reloaded or second tab sees the same
generation.

Inputs → outputs:
- `createDraftsRepo(db, {clock?})` → `DraftsRepo`.
- Analysis: `begin()` → `{generation, previousPhotoIds}`; `saveResult(generation, draft)` →
  `'saved' | 'stale'`; `load()` → `{generation, draft}` or null; `clear(generation?)` →
  `{cleared, photoIds}` (the cleared draft's photos, empty when nothing was cleared).
- Capture: `saveCapture({photoIds, note, progressive})` → ids the previous capture held that the
  new one does not; `loadCapture()` → the capture or null; `clearCapture()` → its photo ids.
- `decodeDraftRow`, `draftRowPhotoIds` for the photo repository's reference scan.

Files: created `src/data/repos/draftsRepo.ts`, `src/data/repos/draftsRepo.test.ts`, this note.

Edge cases / failure modes:
- `saveResult` with an old generation (the person logged, cancelled or began again) → `stale`,
  nothing written.
- `clear(old)` while a newer draft exists → nothing cleared; `clear()` without a generation always
  clears.
- A reload in the middle: the record and its generation are read back from the database, so a
  result saved before the reload loads after it, and a late save from before a newer `begin` is
  still stale.
- An unreadable stored record: `load` returns null; the next write keeps the raw value aside
  first (guard), so a damaged draft is never silently lost; its photos stay referenced through
  the quarantine copy (photo repository).
- Calls made without awaiting each other take effect in call order: each is one read-write
  transaction on `drafts`, and IndexedDB runs transactions on the same table in the order they
  were opened; a failed call does not stop later ones.
- The generation never goes backwards: a record whose counter cannot be read restarts from 0 only
  when the whole record is unreadable, and that record is kept aside.

Our design differences / decisions:
- One persisted counter instead of the reference's two in-memory counters plus an object identity
  check; the caller compares nothing itself, it passes the generation it got from `begin`.
- `begin` both clears the stored draft and returns its photos, so "a new analysis discards the
  previous draft's files" is one step for the caller.
- `clear` returns the cleared photos even on Log; the caller may release them all, because the
  photo repository keeps any photo the new entry now uses.
- The capture record replaces the reference's separate folder and saved-state list; photos it
  names are owners for the photo cleanup like any other.
- Stored shapes: analysis `{id: 'analysis', generation, draft?}`; capture `{id: 'capture',
  photoIds, note, progressive}`.

Tests we will write:
- a result saved with an old generation is refused as stale (R02.10).
- `begin` returns the previous draft's photo ids (lines too) and clears it.
- reload → `load` returns the saved draft with its generation (D-16.46); a second connection sees
  it too.
- capture draft survives reopen; save reports the photos it dropped; clear returns them.
- clear with an old generation does not clear a newer draft; a save in flight for a cleared
  attempt is stale.
- calls fired without awaiting run in call order.
- an unreadable stored record loads as null and is kept aside when overwritten.

Compare checklist (filled after the rewrite; reopened `A/models/PendingFoodAnalysisDraft.kt`,
`A/ui/home/HomeViewModel.kt` (analysis starts, draft save, restore and discard),
`T/ui/home/PendingReviewStateTest.kt`):
- [x] A late result (logged, dismissed or superseded meanwhile) is not kept, and its photos can be
  released without touching the newer draft's (`src/data/repos/draftsRepo.test.ts > analysis
  draft > refuses a result saved with an old generation as stale (R02.10)`, `> lets the caller
  delete the photos a late result wrote while the newer draft keeps its own (R02.10)`).
- [x] A cancel or log while the save is still running makes that save stale (the reference
  re-checks after writing; here the check and the write share one transaction) (`draftsRepo.test.ts
  > analysis draft > turns a save still running for a cleared attempt stale (R02.10)`, `> clears
  whatever is stored when no generation is given`).
- [x] A new analysis discards the previous draft and its photos, without the UI knowing the ids
  (`draftsRepo.test.ts > analysis draft > drops the previous draft on begin and returns its photos,
  parts included (R02.10)`).
- [x] Cleanup of an attempt only touches its own draft (`draftsRepo.test.ts > analysis draft > does
  not clear a newer draft when an older attempt clears (R02.10)`).
- [x] Restore after the app was closed returns the draft and yields to a newer attempt
  (`draftsRepo.test.ts > analysis draft > loads a saved draft again after a reload, with its
  generation (D-16.46)`, `> shares one counter between tabs, so a late result from one tab is stale
  in both (R02.10)`).
- [x] The saved-label flag survives a round trip and a draft stored without it reads false
  (`draftsRepo.test.ts > analysis draft > keeps the saved-label flag across a reload, and reads a
  draft stored without it as false`).
- [x] Operations in call order (`draftsRepo.test.ts > analysis draft > runs calls made without
  waiting for each other in call order`).
- [x] An unreadable stored draft is not lost (`draftsRepo.test.ts > analysis draft > loads an
  unreadable record as nothing and keeps it aside when it is replaced`, `> capture draft > keeps
  an unreadable capture record aside before clearing it`).
- [x] Capture photos and note survive a reopen; removed photos and a clear report their ids for
  release (`draftsRepo.test.ts > capture draft > survives a reopen (D-16.46)`, `> reports the
  photos a new save no longer lists and returns them all on clear`, `> keeps the analysis draft
  apart from the capture draft`); capture photos are owners for cleanup (`photoRepo.test.ts >
  prune > keeps the photos of both drafts`).
- Deliberate differences: one persisted counter instead of two in-memory counters and an
  object-identity check; begin, save and clear each check and write in one transaction, so the
  reference's second check after writing the record is not needed; the capture draft is a record,
  not a folder plus saved-state list.
- Not taken: thumbnail pre-warming after a save (P06-02/P06-04), reading the photo bytes back for
  the restored review (the UI loads photos by id), the "do not restore over a running analysis or
  open review" check (UI state, P06-04: `load` returns the generation so the caller can compare),
  `createdAt` expiry (the reference has none either).

## Decisions for the lead

- The capture draft has no generation: "a clear invalidates in-flight imports" (spec §3.9) is left
  to the capture flow (P06-03), which can keep its own counter or check `loadCapture` after an
  import; `saveCapture` and `clearCapture` return the photo ids to release.
- `clear` moves the counter on even when the generation matches, so a save still running for that
  attempt turns stale; `clear()` without a generation always clears (Cancel analysis, Log).
- An unreadable analysis record restarts the counter at 1 (it is kept aside first). A caller still
  holding a generation from before the damage could collide with the new counter; this needs
  damaged storage and a running analysis at once, so it is left as is.
- The phase row asked for serialised operations; no in-process queue was added because IndexedDB
  already orders read-write transactions on one table (a queue was tried and the order test could
  not tell it apart).

## Status

Done (2026-10-26). Drafts repository and tests in place; nothing outside the task's files changed.
`draftsRepo.test.ts` 15, all passing.
