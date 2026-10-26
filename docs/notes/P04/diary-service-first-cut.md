# Task: diary service, first cut (P04-08) · Phase: 04 · Owner: builder (wt-p04s4, slice S4)

Read (reference @ `10e14b67`): `T/ui/home/FoodSubmissionGateTest.kt` (the whole test: a second
begin is refused until the first finishes), `A/ui/home/HomeViewModel.kt` (the submission gate class
near the top, the save of a reviewed analysis, and the entry delete; behaviour only). Research spec
`02-food-logging.md` §3.1 (the record: whole kcal, unrounded macros, the local day of the instant),
§3.4 (single submission, the fasting block, errors on save), §3.8 (manual entry logs through the
same path), §6 R02.11, R02.12; `06-settings-data.md` R06.19; decision D-16.8. No Evidence ids.

What it does (own words): the diary service is what screens call to put food in the diary or take
it out; they never reach the repositories themselves. `logEntry` turns a nutrition draft plus where
it goes (instant, meal, how it was obtained, its photos) into a diary entry with a fresh id and the
local day of its instant, energy as a whole number of kcal and every other amount exactly as given,
and writes it through the diary repository. A gate lets one log run at a time: a second call that
arrives while the first is still writing (a double tap on Save or Log) is ignored, so one tap
never makes two rows (R02.11). The repository refuses food while a fast runs; the service turns that
refusal into a plain `fastActive` answer (carrying the running fast) for the "logging paused" dialog
(P07), and nothing is written. `deleteEntry` removes an entry and then hands the photos it held to
the photo store, which deletes only those nobody else uses. The first time this service logs an
entry it calls a hook once, which the composition root will point at the persistent-storage request
(D-16.8). P06 extends this file (update, combine, re-log, end fast and log).

Inputs → outputs:
- `createDiaryService({diaryRepo, photoRepo, newId?, onFirstEntry?})` → `DiaryService`.
- `logEntry(draft, {loggedAt, meal, source, photoIds?})` → `{kind: 'logged', entry}` |
  `{kind: 'fastActive', fast}` | `{kind: 'ignored'}` (a repeat call while one is in flight). Any
  other failure (storage) rejects, and the gate opens again.
- `deleteEntry(id)` → `{kind: 'deleted', releasedPhotoIds}` (the photos actually deleted; empty
  when the entry was already gone) | `{kind: 'ignored'}` (the same id is already being deleted).

Files: created `src/services/diary.ts`, `src/services/diary.test.ts`, this note.

Edge cases / failure modes:
- Two calls in the same tick: the gate is a plain flag set before the first await, so the second
  call sees it at once.
- The write fails (storage error, a draft the codec refuses): the error is passed on and the gate
  opens, so the person can try again; the first-entry hook is not called.
- A fast is running: `fastActive` with the running fast; nothing written; the hook not called.
- The hook throws or its promise rejects: the log still counts as done; the failure is dropped
  (asking for persistent storage is best effort).
- Delete of an entry that is already gone (another tab): nothing to release, no error.
- The photo cleanup fails after the entry was deleted: the delete still counts; the photos stay
  until the next prune (the photo store keeps anything it is not sure about).
- Delete of entry A while entry B is being deleted: both run (the gate is per entry id); a repeat
  delete of the same id while it runs is ignored.
- An entry at 23:59 belongs to that day, one at 00:01 to the next: the day key comes from the
  instant in the device zone (the repository derives it again on write).

Our design differences / decisions:
- The gate lives in the service, not in each screen: every caller of `logEntry` is single-flight
  for free (the reference keeps one gate in the view model and one in the manual sheet). Screens
  also use `Button`'s own busy gate; the service gate is the one that holds when two sheets or two
  code paths race.
- "Per action": `logEntry` has one gate for the whole service (one food write at a time, as in the
  reference); `deleteEntry` has one per entry id.
- A refused repeat call answers `ignored` instead of doing nothing silently, so a caller can tell it
  apart from a log.
- The service returns the running fast with `fastActive` (the repository's error carries it), so
  P07's dialog does not need a second read.
- `onFirstEntry` fires once per service instance (once per page load). The storage module records
  that it already asked (P02-14), so asking again in a later session does nothing.
- Photo cleanup goes through `photoRepo.releaseIfUnused` after the delete commits, as the diary
  repository's note asks.

Tests we will write (`src/services/diary.test.ts`):
- builds the entry: new id, local day of the instant, whole kcal, other values unrounded, meal,
  source, photos (empty when not given); stored and read back by day.
- two rapid `logEntry` calls write one entry (R02.11, ACC-D26-1); after the first finishes the gate
  opens; a failed write passes its error on and opens the gate.
- an active fast returns `fastActive` with the fast and writes nothing (R02.12's service side).
- delete removes the entry and releases only the photos nothing else uses; a missing entry releases
  nothing; a repeat delete of the same id while it runs is ignored, another id is not.
- the first successful log calls the hook once (D-16.8); a refused or failed log does not; a
  throwing hook does not fail the log.

Compare checklist (filled after the rewrite; reopened `FoodSubmissionGateTest.kt`, the gate class,
the reviewed-analysis save and the entry delete in `HomeViewModel.kt`):
- [x] A second submission is refused until the first finishes, then accepted again
      (`diary.test.ts > logEntry > writes one entry for two rapid calls (R02.11, ACC-D26-1)`,
      `> opens the gate again once the first log has finished`)
- [x] The gate is released whatever happens to the write (`> passes a storage failure on and opens
      the gate again`; and after a refusal: `> answers fastActive with the running fast and writes
      nothing (R02.12)`, whose last step logs once the fast has ended)
- [x] A write refused during a fast surfaces the paused state and writes nothing (`> answers
      fastActive with the running fast and writes nothing (R02.12)`, `> turns only the fast refusal
      into an answer`)
- [x] Whole kcal, unrounded macros and nutrients, a fresh id, the entry's own instant and day
      (`> builds the entry with a new id, its local day, whole kcal and the other values as given`,
      `> files an entry at 23:59 and one at 00:01 under their own days`, `> keeps the photos it is
      given, primary first`)
- [x] Delete removes the entry, then photos only when no other owner uses them (`deleteEntry >
      removes the entry and deletes only the photos nothing else uses`, `> releases nothing for an
      entry that is already gone`, `> keeps the delete when the photo cleanup fails`, `> ignores a
      repeat delete of the same entry while it runs, but not another entry`)
- [x] Persistence is asked after the first logged entry (`first entry hook > calls the hook once,
      after the first successful log (D-16.8)`, `> does not call it for a refused or failed log`,
      `> keeps the log when the hook fails`)
- Deliberate differences: the gate sits in the service for every caller (the reference has one in
  the view model and one in the manual sheet); a repeat call answers `ignored`; deletes are gated
  per entry id; the running fast comes back with `fastActive`; photo cleanup is the photo store's
  reference-checked release after the delete commits; a failed photo cleanup does not fail the
  delete.
- Not taken: writing photo files, gallery export, clearing the analysis draft, health-store sync
  and the store-review prompt of the reference's save path (P06, later phases, or not applicable).

## Decisions for the lead

- Names: `createDiaryService`, `DiaryService`, `LogContext {loggedAt, meal, source, photoIds?}`,
  `LogResult` (`logged` | `fastActive` | `ignored`), `DeleteResult` (`deleted` | `ignored`).
  Storage failures reject (P04-11 shows its own message); only the fast refusal becomes a value.
- `onFirstEntry` is a dependency of the service (not a React context value): `main.tsx` passes
  nothing for now; when `src/data/storage.ts` lands, pass `() => requestPersistence()`.

## Status

Done (2026-10-26). `src/services/diary.ts` and its 15 tests, all passing. No file outside the
slice changed for this task.
