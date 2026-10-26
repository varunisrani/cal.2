# Task: photo store and reference-checked cleanup (P02-07) · Phase: 02 · Owner: builder (wt-p02s2)

<!-- Save as platewise/docs/notes/P<nn>/<slug>.md. Write everything above "Compare checklist"
BEFORE writing code, in your own words. Never paste or paraphrase the reference line by line. -->

Read (reference @ `10e14b67`): `A/services/FoodImageStore.kt` (store, load, thumbnails, delete,
storage usage, the restore counter and generation, prune of unreferenced photos and orphan
thumbnails), `I/Services/FoodImageStore.swift` (store, load, thumbnail, delete, delete-all, the
restore's delete-everything-not-kept), `A/data/PreferencesStore.kt` (search
`foodImageReferenceFilenames`: the owners collected and the "any owner unreadable → no answer"
rule), `I/Stores/FoodStore.swift` (the still-referenced check used by update and delete),
`T/models/FoodEntryPhotoRemovalTest.kt` (all), `IT/FoodPhotoRemovalTests.swift` (all). Research
spec `02-food-logging.md` §3.19, §6 R02.8; `06-settings-data.md` §6 R06.18. No Evidence ids.

What it does (own words): photos are stored as blobs in their own table, one row per photo with
its thumbnail, size in pixels, byte count and creation time; entries, ingredient lines, saved
meals and the two drafts hold only photo ids. Several owners can share one photo (a saved meal
copied from an entry, a re-log, a combined meal, a draft), so a photo may be deleted only when no
owner refers to it any more. The repository collects every id the owners use; if any owner row
cannot be read the answer is "unknown" and nothing is deleted, because the unreadable row may be
the one that needs the photo. Cleanup comes in two forms: release the photos an edit or delete
just dropped (only those, and only the ones nothing else uses), and prune every unreferenced
photo. Both stand still while a backup restore is replacing data (the `restoring` flag in
`meta`). It also reports how many bytes photos and thumbnails take for the storage card.

Inputs → outputs:
- `createPhotoRepo(db, {clock?, newId?})` → `PhotoRepo`.
- `put(blob, {thumb?, width, height})` → new id; `get(id)` → the photo row or null; `getThumb(id)`
  → thumbnail blob or null; `setThumb(id, thumb)` → true when stored.
- `references()` → `{kind: 'known', ids}` or `{kind: 'unknown'}`.
- `releaseIfUnused(ids)` → the ids it deleted; `prune()` → the ids it deleted.
- `usage()` → `{count, photoBytes, thumbBytes}`.
- `photoIdsOf(record)` → a record's photos then its lines' photos, without repeats (diary and
  drafts use it to say which photos a change dropped).

Files: created `src/data/repos/photoRepo.ts`, `src/data/repos/photoRepo.test.ts`,
`src/test/blobs.ts` (test helper, see below), this note.

Edge cases / failure modes:
- A photo shared by an entry and a saved meal survives deleting or editing the entry.
- An ingredient line's photo counts as a reference like the entry's own.
- Any unreadable entry, saved meal or draft row → unknown → nothing deleted (R06.18). A row that
  was unreadable and has been moved into the quarantine table (a write or delete over it) still
  counts: every string inside a quarantined raw value from those tables is treated as a possible
  photo id, so a photo is never deleted out from under a row someone may still recover.
- `restoring` set → release and prune delete nothing.
- The check, the reference scan and the delete run in one read-write transaction, so a new entry
  or a restore that starts in another tab cannot slip in between "nobody uses it" and the delete
  (the reference needs a restore generation counter for this; one transaction is enough here).
- A photo written moments ago is not yet listed by its owner (the capture or analysis flow puts
  the blob, then saves the draft): `prune` leaves photos created in the last 10 minutes alone.
  `releaseIfUnused` names its ids explicitly, so it has no such window.
- Deletes go through the guard's `removeRows`, so an unreadable photo row is copied aside before
  it is removed.
- `setThumb` on a missing or unreadable photo writes nothing.
- Blobs in tests: a jsdom `Blob` does not survive fake-indexeddb (it comes back as a plain object
  and the photo codec refuses it). The tests store Node's own `Blob` (from `node:buffer`, loaded
  through a variable specifier because the app's tsconfig has no Node types), which IndexedDB's
  structured clone keeps as a real blob, and compare its bytes after reading it back.

Our design differences / decisions:
- Blobs in IndexedDB instead of files; no folder walk, no orphan-thumbnail pass (a thumbnail lives
  in its photo's row and goes with it).
- No restore counter: the `restoring` flag is read inside the deleting transaction.
- The fresh-photo window in `prune` (10 minutes, from the row's `createdAt`) is ours.
- No compression, decoding or thumbnail generation here: those are `src/services/photos.ts`
  (P06-02); this repository stores what it is given.
- Coach thumbnails live in their own messages and are not owners.
- The `restoring` key is exported from here (`RESTORING_FLAG`) until the restore code (P09) needs a
  shared home for it.

Tests we will write:
- put/get round trip with bytes, thumbnail get and set, set on a missing photo.
- references collect entries, ingredient lines, saved meals, the analysis draft (and its lines)
  and the capture draft; an unreadable entry, saved meal or draft row → unknown.
- a photo shared by an entry and a saved meal survives deleting the entry (ACC-D28-1, R02.8).
- removing it from one entry keeps the saved meal's copy; releasing an id nothing uses deletes it.
- an unreadable saved-meal row makes prune and release delete nothing (R06.18).
- a quarantined raw entry still keeps its photo.
- `restoring` → no deletion.
- prune deletes every unreferenced photo but leaves fresh ones.
- usage sums photo and thumbnail bytes.

Compare checklist (filled after the rewrite; reopened `A/services/FoodImageStore.kt`,
`I/Services/FoodImageStore.swift`, `A/data/PreferencesStore.kt` (`foodImageReferenceFilenames`),
`I/Stores/FoodStore.swift` (still-referenced check), `T/models/FoodEntryPhotoRemovalTest.kt`,
`IT/FoodPhotoRemovalTests.swift`):
- [x] Every owner the reference checks is collected: diary rows, ingredient-line photos, saved
  meals, the pending draft, the capture photos (`src/data/repos/photoRepo.test.ts > references >
  collects the photos of entries, their parts, saved meals and both drafts`, `> prune > keeps the
  photos of both drafts`).
- [x] Any owner that cannot be decoded → no answer → nothing deleted (`photoRepo.test.ts >
  references > is unknown while an entry cannot be read (R06.18)`, `> is unknown while a saved meal
  cannot be read (R06.18)`, `> is unknown while the analysis draft cannot be read (R06.18)`, `> is
  unknown while a drafts row of no known kind cannot be read (R06.18)`, `> releaseIfUnused >
  deletes nothing while a saved-meal row cannot be read (R06.18)`, `> prune > deletes nothing while
  an unreadable saved-meal row exists (R06.18, R02.8)`).
- [x] Deleting a log entry keeps a photo a saved meal shares (`photoRepo.test.ts > releaseIfUnused
  > keeps a photo shared by an entry and a saved meal when the entry is deleted (ACC-D28-1,
  R02.8)`).
- [x] Removing a photo from one entry keeps the saved meal's copy, and a photo another entry uses
  on a part (`stagedRemovalLeavesOriginalAndSharedSavedMealUnchanged`,
  `savedRemovalKeepsFilesSharedWithAnotherLogOrFavorite` both ways) (`photoRepo.test.ts >
  releaseIfUnused > keeps the saved meal’s copy when an edit removes the photo from the entry
  (R02.8)`, `> keeps a photo another entry uses on one of its parts (R02.8)`).
- [x] After an edit only the photos that edit removed are considered; a failed save keeps the
  removed photo (`failedPersistenceKeepsRemovedFileForThePreviouslySavedLog`) (`photoRepo.test.ts >
  releaseIfUnused > releases only the ids it is given, and skips ids that are not stored`, `> keeps
  the photo when the edit that dropped it fails to save`).
- [x] Deletion stops while a restore runs (`photoRepo.test.ts > prune > deletes nothing while a
  restore runs (R06.18)`).
- [x] Prune removes every unreferenced photo (`photoRepo.test.ts > prune > deletes every photo
  nothing uses, but not one stored moments ago`).
- [x] Storage usage: photo bytes and thumbnail bytes (`photoRepo.test.ts > storing photos > adds
  up photo and thumbnail bytes for the storage card`).
- [x] Store under a fresh id, read back byte for byte, thumbnail written later (lazy thumbnail)
  (`photoRepo.test.ts > storing photos > stores a blob under a new id and reads it back with its
  details`, `> sets a thumbnail on a stored photo only`, `> refuses something that is not a
  blob`).
- [x] Unreadable rows are never lost: a quarantined owner keeps its photos, an unreadable photo is
  copied aside before deletion (`photoRepo.test.ts > prune > keeps photos a row kept aside in
  quarantine still names`, `> keeps an unreadable photo row aside before deleting it`).
- Deliberate differences: blobs in IndexedDB rows instead of files; one transaction for flag check,
  owner scan and delete instead of a restore counter and generation; quarantined owners count as
  references; `prune` spares photos younger than 10 minutes.
- Not taken: compression and decoding (P06-02), the thumbnail memory cache, orphan-thumbnail files
  (a thumbnail lives in its photo's row), restore staging and "delete every photo not kept"
  (P09), delete-all (P02-14), "clear thumbnail cache" (a Settings tool, not in this row: a later
  task can drop `thumb` from every row), workout photos (no workouts in v1), the entry-side photo
  removal and primary-photo promotion of `FoodEntryPhotoRemovalTest` (entry editor, P06).

## Decisions for the lead

- `RESTORING_FLAG = 'restoring'` (`meta` key, value `true` while a restore replaces data) is
  exported from `photoRepo.ts`; the restore (P09) sets and clears it. It could move beside
  `UNREADABLE_FLAG` in `guard.ts` later.
- `FRESH_PHOTO_MS` (10 minutes) is our own guard for a photo whose owner is not saved yet (the
  capture and analysis flows put the blob first). `releaseIfUnused` has no such window.
- `get(id)` returns the whole photo row (blob, size, dimensions); `getThumb` returns null when no
  thumbnail is stored yet, and the caller (P06-02) makes one and calls `setThumb`.
- Test blobs: `src/test/blobs.ts` (new) builds Node's own `Blob`, which fake-indexeddb keeps as a
  blob; P02-11 (Coach thumbnails) can use it too.

## Status

Done (2026-10-26). Photo repository and tests in place; one new test helper `src/test/blobs.ts`;
nothing else outside the task's files changed. `photoRepo.test.ts` 22, all passing.
