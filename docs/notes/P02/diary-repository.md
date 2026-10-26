# Task: diary repository (P02-06) · Phase: 02 · Owner: builder (wt-p02s2)

<!-- Save as platewise/docs/notes/P<nn>/<slug>.md. Write everything above "Compare checklist"
BEFORE writing code, in your own words. Never paste or paraphrase the reference line by line. -->

Read (reference @ `10e14b67`): `A/data/FoodRepository.kt` (all except the health-store retry and
the health-store restore: add with the fast check, update with the removed-photo check, delete then
prune, combine, replace-all and import, recents and frequent), `I/Stores/FoodStore.swift` lines
1–186 (day queries newest first, meal grouping, the write-blocked flag) and 305–500 (recents,
frequent, favourites, add with the fast check and rollback of written files, update, delete,
combine), `IT/FastingStoreTests.swift` (`activeFastBlocksFoodUntilItEnds`). Research spec
`02-food-logging.md` §3.1 (record, day of an entry), §3.12 (saved-label memory and the barcode
comparison key), §3.20, §6 R02.12, R02.14, R02.24; `05-home-progress.md` §6 R05.1;
`06-settings-data.md` §6 R06.1, R06.2; decision D-16.35. No Evidence ids.

What it does (own words): the diary repository is the only code that writes food entries. Every
change runs as one read-write IndexedDB transaction that reads what it needs, changes it and
writes it, so two tabs or two quick taps never lose each other's changes and an unreadable row is
never replaced by a list rebuilt without it. Any write that creates a food row (add, add several,
combine, end-fast-and-add) also reads the fasts inside that same transaction and refuses with
`FastActiveError` before writing anything while a fast is running: the rule lives at the store,
so every caller path (review, re-log, copy day, combine, Coach, import) obeys it. "End fast and
log" (D-16.35) ends the running fast and adds the entry in one transaction, so either both happen
or neither does. The repository derives two stored keys on every write: the entry's local day
(`dayKey`, from its instant in the device zone) and a normalised barcode key (leading zeros
dropped from an all-digit code, so a UPC-A and its EAN-13 form meet) used to find the saved label
for a barcode. Reads drop unreadable rows and keep them (P02-02).

Inputs → outputs:
- `createDiaryRepo(db, {clock?, newId?})` → `DiaryRepo`.
- Writes: `add(entry)` → stored entry; `addMany(entries)` → stored entries (all or none);
  `update(entry)` → `{kind: 'updated', entry, releasedPhotoIds}` or `{kind: 'missing'}`;
  `remove(id)` → photo ids the removed entry held (empty when nothing was removed);
  `combine(newEntry, removedIds)` → `{entry, releasedPhotoIds}`; `endFastAndAdd(entry, now)` →
  `{entry, endedFast}` (`endedFast` null when no fast was running any more).
- Errors: `FastActiveError` (carries the running fast), `MissingEntriesError` (combine whose
  originals are no longer all stored), `RangeError` (combine of fewer than two distinct
  originals, added at compare time), `TypeError` for an entry the codec cannot read back,
  Dexie's `ConstraintError` for an add whose id is already stored, `WriteBlockedError` from the
  guard.
- Reads: `byDay(dayKey)` newest first, `between(firstKey, lastKey)` oldest first (both days
  included), `since(ms)` newest first, `latestLabelFor(code)` → the newest label-sourced entry
  whose normalised barcode matches (or null), `count()`.
- `src/data/barcodeKey.ts`: `barcodeKey(code)` → the comparison key, or undefined for a blank code.

Files: created `src/data/repos/diaryRepo.ts`, `src/data/repos/diaryRepo.test.ts`,
`src/data/barcodeKey.ts`, `src/data/barcodeKey.test.ts`, this note.

Edge cases / failure modes:
- A fast check done before the transaction would leave a race (the Android reference reads the
  fasts first and writes after); here the fasts are read inside the writing transaction.
- An unreadable fast row cannot be told apart from a running one; it does not block food (the
  codec already refuses to turn a damaged end into a running fast) and it is kept aside.
- `endFastAndAdd` when the fast was ended meanwhile (another tab): the entry is still added and
  `endedFast` is null. If any step fails after the fast was ended, the transaction rolls back and
  the fast is still running.
- Adding an id that is already stored fails (an add never overwrites, so an unreadable row under
  that id is never replaced); `addMany` is all or nothing.
- `update` of an entry deleted meanwhile (another tab) does not bring it back: `missing`. Updating
  over an unreadable stored row keeps the raw value aside first (the guard's `writeOne`).
- `remove` and `combine` delete through the guard's `removeRows`, so an unreadable original is
  copied aside before it goes.
- `combine` whose originals changed meanwhile: if any original is no longer stored, nothing is
  written (`MissingEntriesError`), because the new entry was built from rows that are gone.
- Day keys come from the instant in the device zone at write time: an entry at 23:59 belongs to
  that day, 00:01 to the next; a 23- or 25-hour DST day still holds its own entries.
- Unreadable rows are dropped from reads and kept; `count()` counts stored rows, readable or not.

Our design differences / decisions:
- One row per entry (no whole-list blob); "decode + change + encode in one transaction" becomes one
  IndexedDB transaction per change.
- The fast check covers add, add several, combine and end-fast-and-add; `update` and `remove` are
  not blocked (the reference also lets an existing entry be edited or deleted during a fast).
- Photo cleanup is not done here: writes return the photo ids they dropped and the caller hands
  them to the photo repository's reference-checked `releaseIfUnused` (P02-07) after the commit.
  The reference deletes files from the store itself; here the repositories stay independent and
  the photo check reads every owner anyway.
- The stored row is the codec's own reading of the entry (unknown fields left behind, kcal whole)
  plus the derived keys; an entry the codec cannot read is refused before any write.
- `combine` takes the entry `combineEntries` built (no id) and assigns a fresh id.
- `latestLabelFor` normalises its argument, so a raw scanned code or a key both work.
- No recents/frequent queries here: `since(ms)` serves them and the grouping is P06's.

Tests we will write:
- add during an active fast → `FastActiveError`, nothing written (R05.1, R02.12, ACC-D27-2); after
  the fast ends, the same add succeeds; addMany and combine refused during a fast too.
- `endFastAndAdd` ends the fast and adds; a forced failure while adding (after the fast was
  ended) leaves the fast running and no entry (D-16.35); with no fast running it just adds.
- add derives `dayKey` and `barcodeKey`; an id already stored is refused and the stored row kept.
- addMany all or nothing.
- update: changes the row in one transaction, returns the photo ids it dropped (lines too), never
  resurrects a removed entry, keeps an unreadable stored row aside first (R02.24, R06.2).
- concurrent updates of two entries both land (no lost write).
- remove returns the removed entry's photos; an unreadable row is kept aside before removal.
- combine removes the originals and adds one row in one transaction; refused when an original
  is gone; a failing step leaves everything as it was.
- byDay across midnight and across a DST day in New York, newest first; between and since;
  unreadable rows dropped from reads and kept (R06.1).
- latestLabelFor matches a UPC-A against its EAN-13 form, prefers the newest label row, ignores
  non-label rows.
- barcodeKey: leading zeros, all zeros, letters, blank.

Compare checklist (filled after the rewrite; reopened `A/data/FoodRepository.kt`,
`I/Stores/FoodStore.swift` lines 1–186 and 305–500, `IT/FastingStoreTests.swift`):
- [x] An active fast refuses a new entry and nothing is written; after the fast ends the same add
  works (`src/data/repos/diaryRepo.test.ts > food during a fast > refuses an add while a fast runs
  and writes nothing (R05.1, R02.12, ACC-D27-2)`).
- [x] Combine is refused during a fast too, and so is adding several entries
  (`diaryRepo.test.ts > food during a fast > refuses adding several entries and combining during a
  fast (R05.1, R02.12, ACC-D27-2)`).
- [x] The fast is read inside the writing transaction, not before it (the Android race): a fast
  committed while the add waits still blocks it (`diaryRepo.test.ts > food during a fast > refuses
  an add that was waiting while another transaction started a fast (R05.1)`).
- [x] Edits and deletes of existing entries stay allowed during a fast, as in both references
  (`diaryRepo.test.ts > food during a fast > lets an existing entry be edited or deleted during a
  fast`).
- [x] End fast and log is both or neither (`diaryRepo.test.ts > endFastAndAdd > ends the running
  fast at now and adds the entry together (D-16.35)`, `> leaves the fast running and adds nothing
  when the add fails after the end (D-16.35)`, `> just adds when no fast is running any more`).
- [x] Append is one transaction and a stored row that cannot be read is never replaced by the new
  one (`diaryRepo.test.ts > add > never replaces a stored row, readable or not, with a new one under
  the same id (R02.24)`, `> add > adds several entries all together or not at all`).
- [x] Update of an entry that is gone changes nothing (reference: index not found → unchanged)
  (`diaryRepo.test.ts > update > does not bring back an entry that was deleted meanwhile`).
- [x] Update reports exactly the photos the edit removed, parts included, for the reference-checked
  cleanup (`diaryRepo.test.ts > update > rewrites the entry with fresh keys and returns the photos
  it dropped (R02.24)`; the cleanup itself: `photoRepo.test.ts > releaseIfUnused > keeps the saved
  meal’s copy when an edit removes the photo from the entry (R02.8)`).
- [x] A failed save keeps the photo the stored entry still uses (iOS rollback case)
  (`photoRepo.test.ts > releaseIfUnused > keeps the photo when the edit that dropped it fails to
  save`).
- [x] Unreadable rows are copied aside before an overwrite or delete (`diaryRepo.test.ts > update >
  keeps an unreadable stored row aside before writing over it (R06.1, R02.24)`, `> remove > keeps an
  unreadable row aside before deleting it (R06.1)`), dropped from reads and kept (`> reads > drops
  an unreadable row from reads and keeps it (R06.1)`).
- [x] Concurrent changes do not lose each other (`diaryRepo.test.ts > update > keeps both of two
  edits made at the same time to different entries (R06.2)`).
- [x] Combine needs at least two originals, removes them and adds one row atomically (reference:
  fewer than two selected → nothing) (`diaryRepo.test.ts > combine > deletes the originals and adds
  one entry in one transaction (R02.24)`, `> refuses to combine fewer than two entries`, `> writes
  nothing when an original is no longer stored`, `> keeps the originals when adding the combined
  entry fails`, `> returns the photos the originals held and the combined entry does not`).
- [x] A day's entries newest first, split at local midnight, DST day whole (`diaryRepo.test.ts >
  reads > splits days at local midnight in New York, newest first`, `> keeps all 25 hours of the day
  the clocks go back on that day`); recents base (`> lists the entries since an instant, newest
  first`); ranges (`> lists a range of days oldest first, both ends included`).
- [x] Saved-label lookup by normalised barcode, newest label row (`diaryRepo.test.ts >
  latestLabelFor > matches a UPC-A against its EAN-13 form and picks the newest label entry
  (R02.14)`, `> forgets the label once its entries are deleted`; key rule:
  `src/data/barcodeKey.test.ts > barcodeKey > gives a UPC-A and its EAN-13 form the same key
  (R02.14)` and the other four cases there).
- Deliberate differences: one row per entry and one transaction per change instead of a list
  blob; refusals are thrown errors (`FastActiveError`, `MissingEntriesError`) instead of `false` /
  null; combine takes the entry built by the domain and refuses when an original vanished instead
  of combining whatever is left; photo cleanup is the caller's next step with the ids a write
  returns, not done inside the diary.
- Not taken: the health-store sync and its retry queue, the health-store restore, the
  store-review prompt, the legacy favourites migration, replace-all and import (P09), the
  recents/frequent grouping (P06 over `since`), meal grouping (P01-08 `groupDiary`), the iOS
  inline-image offload.

## Decisions for the lead

- After a delete, combine or edit the caller (P06 services) passes the returned photo ids to
  `photoRepo.releaseIfUnused`; a full `prune` belongs at start-up and after import or restore
  (P09). The reference prunes after every delete; release is the same check limited to the ids
  that change dropped.
- `update` and `remove` are not blocked by a running fast (reference behaviour).
- The barcode key lives in `src/data/barcodeKey.ts` because this slice may not touch
  `src/domain/**`; P06-17 plans `src/domain/food/barcode.ts` (`barcodeKey`) with the same rule: it
  should move this function there (or re-export it) rather than write a second one.
- `count()` counts stored rows, readable or not (cheap; an unreadable row still exists).
- Reads return Dexie's own promise chain so live queries (P02-15) take results over at once.

## Status

Done (2026-10-26). Diary repository, barcode key and tests in place; nothing outside the task's
files changed. `diaryRepo.test.ts` 30 and `barcodeKey.test.ts` 5, all passing. Photo cleanup after
diary writes is handed to the P06 services (see above).
