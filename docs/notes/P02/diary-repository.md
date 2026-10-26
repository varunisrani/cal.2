# Task: diary repository (P02-06) · Phase: 02 · Owner: builder (wt-p02s2)

<!-- Save as platewise/docs/notes/P<nn>/<slug>.md. Write everything above "Compare checklist"
BEFORE writing code, in your own words. Never paste or paraphrase the reference line by line. -->

Read (reference @ `10e14b67`): `A/data/FoodRepository.kt` (all but the health-store retry and the
health-store restore), `I/Stores/FoodStore.swift` (lines 1–186, 305–500), `IT/FastingStoreTests.swift`
(`activeFastBlocksFoodUntilItEnds`); research spec `02-food-logging.md` §3.1 (timestamps, day),
§3.15 (combined meal), §3.20, §6 R02.12, R02.14, R02.24; spec `05-home-progress.md` §6 R05.1; spec
`06-settings-data.md` §3.18 (transactions), §6 R06.2; decision D-16.35; the landed data core
(`src/data/{db,guard,codecs,live,schema}.ts`) and domain rules (`dates/dayKey`, `trackers/fasting`,
`food/combine`). No Evidence ids.

What it does (own words): the diary repository is the only door to logged food rows. Every change
is a single IndexedDB read-write transaction that reads what it needs, decides, and writes, so two
callers can never interleave a read and a write (R06.2, R02.24). Any write that creates a food row
(add, add many, combine, end-fast-and-add) reads the fasts table inside that same transaction and
refuses with `FastActiveError` before writing anything when a fast is running (R05.1, R02.12): the
rule lives at the store, so every caller path (review, manual, copy a day, combine, Coach later)
is covered, not only the menu. D-16.35 adds "End fast and log": the running fast is ended at `now`
and the entry added in one transaction, so either both happen or neither. Rows that cannot be read
are left out of every read and kept aside by the guard (P02-02); writes never replace them. The day
key and the barcode comparison key are worked out on write, so day queries and saved-label lookups
run on indexes.

Inputs → outputs (plain functions, `db` first):
- `add(db, entry)` → the stored entry; `addMany(db, entries)` → the stored entries (one
  transaction, one fast check); both throw `FastActiveError` during a fast.
- `update(db, entry)` → `'updated' | 'missing' | 'unreadable'` (never writes over an unreadable
  row); photos the edit dropped are released in the same transaction (reference-checked, P02-07).
- `remove(db, id)` → `true` when a row was deleted; its photos are released the same way.
- `combine(db, newEntry, removedIds)` → `'combined' | 'stale'` (an original is gone or unreadable:
  nothing written); `FastActiveError` during a fast.
- `endFastAndAdd(db, entry, now)` → `{ entry, endedFast }` (`endedFast` null when none was running).
- Reads: `byDay(db, dayKey)` newest first; `between(db, firstKey, lastKey)` inclusive, oldest first;
  `since(db, ms)` newest first; `latestLabelFor(db, barcode)` → the newest label-sourced entry whose
  barcode compares equal, or undefined; `count(db)` readable rows.
- Live feeds for the P02-15 hooks: `liveByDay(db, dayKey)`, `liveBetween(db, firstKey, lastKey)`.
- `barcodeKeyOf(code)`: trimmed; all digits → leading zeros removed ("0" when nothing is left);
  otherwise lower-case; blank → no key.

Files: created `src/data/repos/diaryRepo.ts`, `src/data/repos/diaryRepo.test.ts`, this note.

Edge cases / failure modes:
- A fast being started in another transaction while an add waits: the add's own transaction reads
  the fasts after that commit and refuses.
- An unreadable fast row cannot be told apart from a finished one; the codec already makes a
  damaged end unreadable rather than "running", so it never blocks food on its own.
- End fast and log when the fast already ended elsewhere: just add. When ending would overlap
  another fast (domain `endNow` refuses): food stays blocked (`FastActiveError`), nothing written.
- A failure after the fast was ended (the entry write fails) rolls the end back too.
- Combine when an original was deleted or became unreadable in the meantime: `stale`, nothing
  written (the combined values would count a row that is gone).
- Update of an unreadable row: refused, the raw value stays and is kept aside.
- Day key: on create it is the local day of `loggedAt` in the device zone at write time (a caller's
  `dayKey` is not trusted); on update it is kept when `loggedAt` did not change, so editing a name
  abroad does not move the row to another day; a changed time derives it again.
- Barcode key: only when the entry has product info with a barcode; UPC-A `036000291452` and its
  EAN-13 form `0036000291452` get the same key.
- Ties in time keep a stable order (index order by id).
- Malformed day keys in reads throw `RangeError` (same rule as the domain).

Our design differences / decisions:
- Rows are stored one per entry (not one list blob), so "decode the list, append, encode" becomes
  "read what the rule needs, write the row" inside one transaction.
- The fast check runs inside the writing transaction (the reference reads the fast list just before
  its write, which leaves a race; R05.1).
- The repository releases the photos a change dropped inside the same transaction, through the
  photo store's reference check (only those ids, never a full prune), so a photo still used by a
  saved meal, another entry, a line or a draft stays (R02.8). The P04-08 service needs no extra
  release call.
- The barcode comparison key lives here until P06-17 lands `src/domain/food/barcode.ts`; then this
  module should import it from there (lead follow-up).
- No health-store sync, no store-review prompt, no favourites (P02-10 owns saved meals), no
  Recents/Frequent grouping (P06-12 builds them on `since`).

Tests we will write:
- Add during a running fast throws `FastActiveError`, nothing written; after the fast ends the same
  add works (ACC-D27-2, R05.1, R02.12).
- addMany and combine are refused during a fast and change nothing (ACC-D27-2, R02.12).
- An add issued while a fast is being started (open write transaction) ends refused (R05.1).
- endFastAndAdd ends the fast and adds the entry; a forced failure after the end leaves both
  unchanged; with no running fast it just adds (D-16.35).
- Combine removes the originals and adds one row in one transaction; a forced failure keeps the
  originals; a missing original → `stale` (R02.24, R06.2).
- Update refuses an unreadable stored row and leaves it; add never replaces unreadable rows
  (R02.24).
- Day and barcode keys derived on write; update keeps the day unless the time changed.
- byDay splits at local midnight in New York, newest first; a row written in another zone keeps
  the day it was written on; between and since; latestLabelFor matches a UPC-A against its EAN-13
  form and ignores non-label rows; count leaves unreadable rows out; a live day feed shows an add.

Compare checklist (filled after the rewrite; reopened `A/data/FoodRepository.kt`,
`I/Stores/FoodStore.swift`, `IT/FastingStoreTests.swift`):
- [x] Food is refused while a fast runs and logs again once it ends (the iOS test's sequence)
  (tested in `src/data/repos/diaryRepo.test.ts > writes during a fast (D-16.35) > add throws
  FastActiveError and writes nothing; once the fast ends it logs (ACC-D27-2, R05.1, R02.12)`).
- [x] Combine is blocked during a fast like add; so is the bulk add Copy a day uses
  (`diaryRepo.test.ts > writes during a fast (D-16.35) > addMany and combine are refused as a whole
  and change nothing (ACC-D27-2, R02.12)`).
- [x] The fast check runs inside the writing transaction, closing the Android read-then-write gap
  (`diaryRepo.test.ts > writes during a fast (D-16.35) > an add issued while a fast is being
  started ends refused once that start commits (R05.1)`).
- [x] D-16.35 End fast and log is all-or-nothing (`diaryRepo.test.ts > writes during a fast
  (D-16.35) > endFastAndAdd ends the fast at now and logs the entry together`, `> endFastAndAdd
  leaves both as they were when the entry write fails after the end`, `> endFastAndAdd only logs
  when no fast is running any more`).
- [x] Combine removes the originals and appends the merged row in the same write (`diaryRepo.test.ts
  > changing the diary > combine removes the originals and adds one row in one transaction (R02.24,
  R06.2)`, `> combine keeps the originals when the combined row cannot be written`); fewer
  originals than asked (one deleted meanwhile) → nothing changes (`> combine is stale and writes
  nothing when an original is gone or unreadable`).
- [x] Update of a row that is gone changes nothing; an unreadable stored diary is never replaced
  by the new row (`diaryRepo.test.ts > changing the diary > update never writes over an unreadable
  row and says when the row is gone (R02.24)`, `> adding never replaces unreadable rows, and reads
  leave them out and keep them aside (R02.24)`).
- [x] Delete, update and combine clean up only photos nothing else uses, and skip cleanup when an
  owner cannot be read (`src/data/repos/photoRepo.test.ts > releasing photos after a diary change >
  a photo shared by an entry and a saved meal survives deleting the entry (ACC-D28-1, R02.8)`,
  `> removing a photo from one entry keeps the saved meal copy and deletes what nothing uses
  (R02.8)`, `> deletes nothing when a saved-meal row cannot be read (R06.18)`).
- [x] A failed update keeps the photo it would have released (iOS failed-persistence case)
  (`photoRepo.test.ts > releasing photos after a diary change > a failed edit keeps the photo it
  would have released (R02.8)`).
- [x] Day lists are the local day, newest first (`diaryRepo.test.ts > reading the diary > byDay
  splits the days at local midnight in New York, newest first`); Recents' "from an instant on,
  newest first" base (`> since lists entries from an instant on, newest first`).
- [x] Saved-label lookup takes the newest label row and compares barcodes without leading zeros
  (`diaryRepo.test.ts > reading the diary > latestLabelFor matches a UPC-A against its EAN-13 form
  and only reads label entries`).
- Deliberate differences: the fast check is inside the write transaction (the reference reads
  first); the stored day key is frozen at write time instead of being worked out from the current
  zone on every read (`an entry keeps the day of the zone it was logged in`); after delete and
  combine only the photos the change dropped are considered, never a full prune (a full prune
  could delete photos just written for a review whose draft is not saved yet; the start-up and
  post-restore prunes collect leftovers); combine takes a combined entry built by the caller and
  answers `stale` when any original is gone, where the reference combines whatever subset of at
  least two it still finds.
- Not taken: health-store sync and its retry queue, the health-store restore, the store-review
  prompt, favourites and their legacy migration (P02-10), replace-all and import (P09), clear-all
  (P02-14), Frequent grouping (P06-12), iOS's inline photo bytes and gallery export.

## Decisions for the lead

- Repositories are modules of plain functions with `db` first (`diaryRepo.add(db, entry)`), in
  the style of `guard.ts`; callers import them as namespaces (`import * as diaryRepo`).
- Day key: derived from `loggedAt` in the device zone on create (the caller's `dayKey` is not
  trusted); kept on update when `loggedAt` is unchanged, derived again when it changes.
- `barcodeKeyOf` lives in `diaryRepo.ts` until P06-17 lands `src/domain/food/barcode.ts`; P06-17
  should move it there and this module should import it (rules taken from the P06-17 row).
- Results instead of throws for expected states: `update` → `updated | missing | unreadable`,
  `remove` → boolean (false for missing or unreadable rows: the diary never deletes what it
  cannot read), `combine` → `combined | stale`. Throws: `FastActiveError` (with `fastId`),
  `TypeError` for a row its codec would refuse, `RangeError` for two entries with one id in
  `addMany` and for malformed day keys.
- `update`, `remove` and `combine` release dropped photos inside their own transaction, so the
  P04-08 service needs no separate release call; when an add fails, the caller releases the photos
  it wrote for it (the iOS "remove files written for a failed save" rule).
- Live feeds `liveByDay` and `liveBetween` are exported for the P02-15 hooks.
- Found while building (affects every slice): a `transact` body must be an `async` function. A
  plain arrow that returns another async function's promise (`() => helper(db)`) loses Dexie's
  transaction zone after a few awaits, and later operations then run outside the transaction (in
  tests: `PrematureCommitError`, or `guardKey` saying it is not inside `transact`). Suggest the
  lead either documents it on `transact` or makes `transact` wrap `body` in an async function.

## Status

Done (2026-10-26). Everything above is in place; no file outside the slice was changed.
