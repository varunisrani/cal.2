# Task: photo store and reference-checked cleanup (P02-07) · Phase: 02 · Owner: builder (wt-p02s2)

<!-- Save as platewise/docs/notes/P<nn>/<slug>.md. Write everything above "Compare checklist"
BEFORE writing code, in your own words. Never paste or paraphrase the reference line by line. -->

Read (reference @ `10e14b67`): `A/services/FoodImageStore.kt` (store, load, thumbnail, delete,
restore generation, prune and usage parts; not compression or staging), the reference collector in
`A/data/PreferencesStore.kt` (`foodImageReferenceFilenames` only), `I/Services/FoodImageStore.swift`
(delete, delete-all, delete-not-in), `T/models/FoodEntryPhotoRemovalTest.kt` (all),
`IT/FoodPhotoRemovalTests.swift` (all); research spec `02-food-logging.md` §3.9 (capture drafts),
§3.10, §3.19, §6 R02.8; spec `06-settings-data.md` §3.18 (photo GC), §6 R06.18. No Evidence ids.

What it does (own words): photos are blobs in the `photos` table, one row per photo with its
thumbnail, size and pixel dimensions. Diary rows, ingredient lines, saved meals and the two drafts
(analysis and capture) point at photos by id, and one photo can be shared (a re-log, a saved meal
and the original row all show the same picture). So a photo is only ever deleted after checking
every owner. If any owner row cannot be read we do not know what it points at, and nothing is
deleted (R06.18). While a backup restore is replacing data (the `restoring` meta flag), nothing is
deleted either. Two kinds of cleanup: after an edit, only the ids that edit dropped are considered
(`releaseIfUnused`); after bigger changes (start-up, restore, import) everything unused goes
(`prune`). The storage card reads the total bytes from `usage`.

Inputs → outputs (plain functions, `db` first):
- `put(db, blob, {thumb?, width, height}, {clock?, newId?})` → new photo id.
- `get(db, id)` → the photo row or undefined (missing or unreadable); `getThumb(db, id)` → the
  thumbnail blob or undefined (none yet: the caller makes one and calls `setThumb`);
  `setThumb(db, id, thumb)` → false when the photo is gone or unreadable.
- `references(db)` → the set of every photo id in use, or `'unknown'`.
- `releaseIfUnused(db, ids)` → the ids it deleted; `prune(db)` → the ids it deleted. Both join an
  outer read-write transaction that covers `PHOTO_RELEASE_TABLES` (the diary repository releases
  inside its own write).
- `usage(db)` → `{ photos, photoBytes, thumbBytes }` over readable rows.
- `photoIdsOf(food)` → the ids a row with photos and lines uses, in order, without repeats.
- `RESTORING_FLAG` (`restoring`) and `PHOTO_RELEASE_TABLES` for callers.

Files: created `src/data/repos/photoRepo.ts`, `src/data/repos/photoRepo.test.ts`, this note.

Edge cases / failure modes:
- A photo shared by an entry and a saved meal: deleting the entry, or removing the photo from the
  entry, keeps it (the saved meal still names it).
- A photo used only by an ingredient line, or by the analysis draft (its own ids and its lines'
  ids), or by the capture draft, stays.
- Any unreadable entry, saved-meal or draft row → references unknown → no deletion; the unreadable
  row is kept aside by the guard as usual.
- `restoring` set to anything truthy → no deletion; a later prune collects what was skipped.
- An unreadable photo row that nothing references is kept aside before it is deleted (guard).
- Releasing an id that is not stored, or listing an id twice, is harmless.
- `setThumb` recomputes the stored byte count; a thumbnail is optional.

Our design differences / decisions:
- Blobs in IndexedDB rows instead of files: the photo and its thumbnail are one row, so an orphan
  thumbnail cannot exist and the "orphan thumbnail" sweep is not needed; usage sums `blob.size` and
  `thumb.size` instead of folder sizes.
- The restore guard is a `meta` flag read inside the deleting transaction instead of a
  read-write lock plus a generation number: the flag check, the reference read and the deletes are
  one transaction, so a restore cannot start between them.
- Capture-draft photos live in the same table as every other photo and are protected by being an
  owner (the reference keeps them in a separate folder).
- The analysis draft's ingredient-line photos also count as references (the reference only checks
  the draft's own photos); harmless and safer.
- Compression of existing photos, thumbnail decoding and the memory cache belong to P06-02 (and a
  later maintenance task); restore staging to P09-13.

Tests we will write:
- put → get round trip (blob, dimensions, bytes), getThumb, setThumb.
- references collects entries, lines, saved meals, analysis draft (and its lines) and capture draft.
- A photo shared by an entry and a saved meal survives deleting the entry (ACC-D28-1, R02.8).
- Removing the photo from one entry keeps the saved meal's copy; removing it where nothing else uses
  it deletes it (R02.8).
- An unreadable saved-meal row makes `prune` and `releaseIfUnused` delete nothing (R06.18).
- `restoring` flag → no deletion (R06.18).
- prune deletes every unreferenced photo and keeps the rest; usage sums bytes.

Compare checklist (filled after the rewrite; reopened `A/services/FoodImageStore.kt`,
`I/Services/FoodImageStore.swift`, `T/models/FoodEntryPhotoRemovalTest.kt`,
`IT/FoodPhotoRemovalTests.swift`):
- [x] Every owner the reference checks (diary rows, their lines, saved meals, the analysis draft)
  plus the capture draft is in `references()` (tested in `src/data/repos/photoRepo.test.ts >
  references > collects the photos of entries, their lines, saved meals and both drafts`).
- [x] Any unreadable owner → unknown → nothing deleted (`photoRepo.test.ts > references > is
  unknown when any owner row cannot be read (R06.18)`, `> prune > deletes nothing when a saved-meal
  row cannot be read (R06.18, R02.8)`, `> releasing photos after a diary change > deletes nothing
  when a saved-meal row cannot be read (R06.18)`).
- [x] No deletion while a restore runs (`photoRepo.test.ts > prune > deletes nothing while a
  restore is running (R06.18)`).
- [x] Shared photos: deleting a row or removing a photo from it keeps a saved meal's or another
  row's copy (`photoRepo.test.ts > releasing photos after a diary change > a photo shared by an
  entry and a saved meal survives deleting the entry (ACC-D28-1, R02.8)`, `> removing a photo from
  one entry keeps the saved meal copy and deletes what nothing uses (R02.8)`, `> keeps photos that
  another entry line or a draft still uses (R02.8)`).
- [x] Only the photos an edit dropped are considered after an edit (`photoRepo.test.ts > releasing
  photos after a diary change > releaseIfUnused deletes only the given ids that nothing uses`).
- [x] A failed save keeps the photo of the previously saved row (`photoRepo.test.ts > releasing
  photos after a diary change > a failed edit keeps the photo it would have released (R02.8)`).
- [x] Full prune removes every unreferenced photo and keeps referenced ones (`photoRepo.test.ts >
  prune > deletes every photo nothing uses and keeps the rest`).
- [x] Thumbnail written at store time or later on first use; usage reports photo and thumbnail
  bytes (`photoRepo.test.ts > storing photos > stores a photo with its thumbnail and reads both
  back`, `> adds a thumbnail made later and counts its bytes`, `> usage sums the bytes of every
  photo and thumbnail`).
- Deliberate differences: one row holds photo and thumbnail (no orphan-thumbnail sweep, no
  thumbnail memory cache here); the restore guard is a `meta` flag checked in the deleting
  transaction instead of a lock plus generation; capture-draft photos are owners in the shared
  table instead of living in a separate folder; the analysis draft's line photos count as
  references; `usage` also returns the photo count.
- Not taken: compression of new and existing photos, decoding and EXIF handling (P06-02), restore
  staging and byte-identical restore writes (P09-13), clear-all (P02-14), clearing the thumbnail
  cache (a settings tool, later), workout and exercise photos (later phases), the entry-level
  "remove these photos and promote the next one" helper of the removal tests (an edit helper for
  P06-11; with one ordered `photoIds` list, removing an id is enough).

## Decisions for the lead

- `references()` returns a `Set` of ids or the string `'unknown'`.
- `RESTORING_FLAG = 'restoring'` (17-naming); any truthy value pauses deletion. P09-13 sets and
  clears it inside its own transactions.
- `PHOTO_RELEASE_TABLES` (`photos`, `entries`, `savedMeals`, `drafts`) is the scope a caller's
  transaction must cover to release photos inside it (the diary repository does).
- An unreferenced photo row that cannot be read is kept aside (quarantine) before it is deleted.
- `getThumb` returns undefined when no thumbnail exists yet; the caller makes one and calls
  `setThumb` (P06-02).
- Saved meals (P02-10) and the Coach (P02-11) call `releaseIfUnused` or `prune` after their own
  changes; the saved-meal toggle should release the removed snapshot's photos.

## Status

Done (2026-10-26). Everything above is in place; no file outside the slice was changed.
