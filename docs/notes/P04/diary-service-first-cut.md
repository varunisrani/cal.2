# Task: diary service, first cut (P04-08) · Phase: 04 · Owner: builder (wt-p04s4, slice S4)

Read (reference @ `10e14b67`): `T/ui/home/FoodSubmissionGateTest.kt` [19] (the one rule it
proves: a second begin is refused until the first finishes), `A/ui/home/HomeViewModel.kt` [1 255]
(the gate class near the top of the file; the save of a reviewed analysis, whose body sits just
after the named 440–700 range in this pin; the delete call; the "food blocked by fast" report),
behaviour only. Research spec `02-food-logging.md` §3.1 (the logged record), §3.4 (single
submission, fasting block, errors on save), §3.19 (photo ownership and cleanup), §6 R02.11 and
R02.12; `16-what-we-change.md` D-16.8 (persistent storage after the first logged entry) and
D-16.35 (End fast and log); `06-settings-data.md` R06.19.

What it does (own words): the one place screens go through to put food in the diary or take it
out. `logEntry(draft, ctx)` turns the food values a screen has (manual form today; review,
re-log and copy later) into a diary row: a fresh id, the time and meal the caller chose, the
source, the photos, energy as a whole number of kcal and the macros as they are, unrounded. It
writes the row through the diary repository, which refuses while a fast is running; that
refusal comes back as a plain `fastActive` answer for the paused dialog (P07), not as an error.
Logging is single-flight: while one log is being written, another call is turned away at once
with `busy`, so a double tap on Save or Log writes one row (R02.11). `deleteEntry(id)` deletes a
row; the repository releases, in the same transaction, the photos nothing else uses (R02.8). The
first time a log succeeds the service calls a hook the shell gives it, which asks the browser to
keep our storage (D-16.8; P02-14 makes the real request). P06 adds edit, re-log and the rest.

Inputs → outputs:
- `createDiaryService({ db, ids?, requestPersistenceAfterFirstEntry? })` → `DiaryService`.
- `logEntry(draft: NutritionDraft, { loggedAt, meal, source, photoIds? })` →
  `{ kind: 'logged', entry }` | `{ kind: 'fastActive', fastId }` | `{ kind: 'busy' }`; any
  other failure (a full disk, values that would not read back) rejects, so the screen can say so
  and keep the form.
- `deleteEntry(id)` → `'deleted'` | `'missing'` (no readable row) | `'busy'` (the same row is
  already being deleted).

Files: created `src/services/diary.ts`, `src/services/diary.test.ts`.

Edge cases / failure modes:
- Two calls in the same tick, before any write: the gate is a plain in-memory set checked and
  set synchronously, so the second call sees it.
- The first call fails (fast running, storage error): the gate opens again, so the person can
  retry; nothing was written.
- A draft object with more fields than food values (a saved meal with `order`, an entry with an
  `id`): only the food values are copied, so no stray field is stored.
- `kcal` arriving as a decimal (an analysis, a kJ conversion): rounded half up to whole kcal;
  protein, carbs and fat stay as given.
- Day key: worked out from `loggedAt` in the device zone (the repository does it again and wins).
- The persistence hook throws or rejects: the log has already committed, so the answer is still
  `logged`; the failure is swallowed (the hook records its own outcome).
- The persistence hook is slow (a browser prompt): it is not awaited, so Save does not hang.
- Deleting a row whose photos are shared with a saved meal or another row: those photos stay.
- Deleting two different rows at once: each id has its own gate, both go ahead.

Our design differences / decisions:
- One service object per app (the shell creates it once and passes it down), so the gate is
  shared by every screen that logs, like the reference's one gate per Home model. A gate per
  action: logging has one, deleting one per row id.
- A turned-away call answers `busy` instead of doing nothing silently, so callers can tell.
- Fast refusal is a value, other failures reject: the paused dialog is an expected outcome, a
  storage error is not.
- `deleteEntry` relies on `diaryRepo.remove`, which already releases the dropped photos through
  `photoRepo.releaseIfUnused` inside its own transaction; calling the release again from the
  service would only repeat the owner scan. (Decision for the lead below.)
- The persistence hook fires once per service, after the first successful log of the session,
  not "only if the diary was empty": P02-14's `requestPersistence()` asks the browser at most
  once and records it (`storage.persistAsked`), so it decides whether anything happens.

Tests we will write:
- Two rapid `logEntry` calls write one entry; the second answers `busy` (R02.11, ACC-D26-1).
- After the first log finishes (logged, refused or failed), the next call logs again.
- A delete runs while a log is in flight (separate gates); two deletes of one row run once.
- The built row: new id from the id source, day key of `loggedAt`, kcal rounded, macros and
  optional nutrients kept, photos in order, stray draft fields not stored.
- An active fast answers `fastActive` with the fast's id and writes nothing (R02.12 at the
  service).
- A storage failure rejects and writes nothing; the gate opens again.
- Delete removes the row, releases a photo only it used, keeps a photo a saved meal shares;
  deleting a row that is gone answers `missing`.
- The persistence hook: not called on a refused log, called once after the first successful
  log, not again after the second; a hook that throws or rejects does not fail the log.

Compare checklist (filled after the rewrite; reopened `T/ui/home/FoodSubmissionGateTest.kt`,
`A/ui/home/HomeViewModel.kt` gate, save and delete parts):
- [x] Repeated submission refused until the first finishes, then allowed again (tested in
      `src/services/diary.test.ts > logEntry: one log at a time (R02.11) > writes one entry for
      two rapid calls; the second answers busy (ACC-D26-1, R02.11)`, `> logs again once the
      first log has finished`)
- [x] The gate opens again whatever way the first save ended (tested in
      `src/services/diary.test.ts > logEntry: one log at a time (R02.11) > opens again after a
      failed write, which rejects and writes nothing`; `> logEntry during a fast (R02.12,
      D-16.35) > answers fastActive with the running fast and writes nothing`)
- [x] A fast refusal reports "blocked" and writes nothing; the caller keeps its form (tested in
      `src/services/diary.test.ts > logEntry during a fast (R02.12, D-16.35) > answers
      fastActive with the running fast and writes nothing`)
- [x] Entry built with a new id, kcal whole (half up, as the reference's rounding), macros
      unrounded, photos primary first (tested in `src/services/diary.test.ts > logEntry: the
      entry it builds > stores a new id, the day of its time, whole kcal and the macros
      unrounded`, `> keeps only the food values of what it is given, and a fresh id`)
- [x] Delete removes the row; photo cleanup checks every owner (tested in
      `src/services/diary.test.ts > deleteEntry > deletes the entry and releases a photo only it
      used, keeping one a saved meal shares (R02.8)`, `> answers missing for an entry that is not
      there`)
- [x] Gap closed our way: the reference's delete has no gate; ours has one per row (tested in
      `src/services/diary.test.ts > logEntry: one log at a time (R02.11) > runs two deletes of
      one row once, and deletes of two rows both`, `> gives deleting a gate of its own: a delete
      goes ahead while a log is in flight`)
- [x] D-16.8 hook (ours; the reference prompts for a store review after the first log, which we
      do not build, D-16.43) (tested in `src/services/diary.test.ts > asking to keep storage
      after the first entry (D-16.8) > calls the hook once, after the first successful log
      only`, `> logs anyway when the hook throws, rejects or never answers`)
- Deliberate differences: one gate shared by every log path of the app (the reference has one
  in its Home model and a second one inside the manual dialog); a turned-away call answers
  `busy`; the fast refusal is a value and other failures reject instead of setting an error
  message on screen state; the time, meal and source come from the caller (the reference picks
  the selected day's time and the current meal itself); scaling a reviewed draft stays with the
  review (P06), so this cut takes the values as given.
- Not taken: saving the photo bytes, clearing the pending draft and the gallery export after a
  log (P06 and later phases); the store-review prompt (D-16.43).

## Decisions for the lead

- **Service shape.** `createDiaryService(deps)` returns `{ logEntry, deleteEntry }`; the shell
  creates it once (with the app's database and, once P02-14 lands, `requestPersistence` from
  `src/data/storage.ts` as `requestPersistenceAfterFirstEntry`) and hands it to screens.
- **`busy` answers** for calls the gate turns away; fast refusal is `{ kind: 'fastActive',
  fastId }`; other failures reject.
- **No second photo release in the service** (see above); the lead's prompt named
  `photoRepo.releaseIfUnused`, which `diaryRepo.remove` already calls in its transaction.

## Status

Done (2026-10-26). `src/services/diary.ts` and its 12 tests; no lines changed outside the task's
files. Handed on: the shell (lead, at land time) creates the service once and passes it to Home
and the manual sheet (P04-11, P04-12); P02-14 supplies `requestPersistence` for the hook; P06
extends the file; P07's paused dialog reads `fastActive`.
