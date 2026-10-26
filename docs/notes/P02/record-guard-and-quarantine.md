# Task: record guard and quarantine (P02-02) · Phase: 02 · Owner: builder (wt-p02a0)

<!-- Save as platewise/docs/notes/P<nn>/<slug>.md. Write everything above "Compare checklist"
BEFORE writing code, in your own words. Never paste or paraphrase the reference line by line. -->

Read (reference @ `10e14b67`): `A/data/PersistedJsonGuard.kt` (all: the three-way decode result,
element-wise list decoding, the archive with unique names), `I/Services/PersistedBlobGuard.swift`
(all: write blocking until a copy exists, re-reading before a write, one copy per hash, a value
loaded only once), `T/data/PersistedJsonGuardTest.kt` (all), `IT/DiaryPersistenceSafetyTests.swift`
(all; the guard and food/weight store cases, the duplicate-id and import cases are for P02-06 and
P09), plus `A/data/PreferencesStore.kt` lines 140–260 from P02-01 (decode + transform + encode in
one edit, the profile's single-value backup, the atomic profile update that refuses unreadable
data). Research spec `06-settings-data.md` §3.18 (list guard), §6 R06.1; `05-home-progress.md` §6
R05.6; `02-food-logging.md` §3.1 (decoding: missing meal → other, int or decimal numbers, unknown
keys ignored). No Evidence ids.

What it does (own words): stored rows can be unreadable (an old or newer app version wrote a
different shape, an import went wrong, storage was damaged). The guard makes sure that such a row
is never mistaken for "nothing there" and never overwritten while it is the only copy. Each table
has a lenient codec that keeps what it can: unknown fields are dropped, an unknown or missing enum
value becomes the field's default (a missing meal reads as `other`), whole and decimal numbers are
both fine, optional parts that do not parse are left out; only a row whose identity, time or core
numbers cannot be read counts as unreadable. Reading a list drops unreadable rows from the result
but leaves them in their table, copies each one into the `quarantine` table and sets the
`unreadableData` flag in `meta` (the K9 banner reads it). Reading one record tells missing, ok and
corrupt apart. Writing over a corrupt record first copies its raw value into `quarantine` inside
the same transaction; if that copy fails, the transaction rolls back and the write is refused
(`WriteBlockedError`), so the raw value stays where it was. One raw value is copied once, however
often it is read (keyed by table, key and a fingerprint of the value).

Inputs → outputs:
- `codecs.ts`: `Codec<T> = (raw: unknown) => T | null`; `decodeEntry`, `decodeSavedMeal`,
  `decodeNutritionDraft`, `decodeAnalysisDraft`, `decodeProfile`, `decodeWeighIn`,
  `decodeBodyFat`, `decodeWater`, `decodeFast`, `decodeCoachMessage`, `decodePhoto`.
- `guard.ts`: `readAll(db, table, codec)` → `{items, dropped}`; `decodeRows(db, table, rows,
  codec)` → the same for rows a repository queried itself; `readOne(db, table, key, codec)` →
  `{kind: 'missing'} | {kind: 'ok', value} | {kind: 'corrupt', raw}`; `writeOne(db, table, row,
  codec)` → resolves, or rejects with `WriteBlockedError`; `removeRows(db, table, keys, codec)`
  (added at compare time) the same for deletes; `keepAside(db, table, key, raw)` for a
  repository's own transaction (which must include `GUARD_TABLES`); `settleQuarantine(db)` waits
  for copies scheduled by reads; `hasUnreadableData(db)`; `fingerprint(raw)`. Each takes an
  optional `Clock` for the quarantine time.

Files: created `src/data/codecs.ts`, `src/data/codecs.test.ts`, `src/data/guard.ts`,
`src/data/guard.test.ts`, this note.

Edge cases / failure modes:
- Reads run inside live queries, where Dexie forbids read-write transactions. So a read never
  writes in its own transaction: it schedules the quarantine copy on a fresh task (outside any
  live-query or transaction scope) and returns. If that copy fails nothing is lost, because a read
  never deletes the row; writes are the strict path.
- A corrupt record read twice → one quarantine row (the second copy is skipped by fingerprint);
  a different corrupt value under the same key → a second row.
- A corrupt record overwritten → the copy goes first in the same transaction; a failing copy
  aborts the transaction, so the stored value is untouched and the caller gets
  `WriteBlockedError` (with the cause).
- A missing or readable record is overwritten with no copy.
- The fingerprint walks plain data, arrays, dates, byte buffers and blobs (size and type: the bytes
  cannot be read inside a transaction) and survives cycles.
- Codec rules from earlier waves: a grams basis only when grams is finite and above 0 (else one
  serving); a missing meal reads as `other`; Home pillars are stored as an array (P02-04 decodes
  them with `decodePillars`).
- Day keys missing or malformed on a stored row are re-derived from its instant.
- Blobs are recognised by shape (`size`, `type`, `arrayBuffer`), not `instanceof`, so a blob from
  another realm still reads.

Our design differences / decisions:
- Per-record tables replace whole-list blobs, so "drop one row, keep the rest" is the table's
  natural state and the "partially decoded list must be preserved before overwrite" case becomes
  "an unreadable row is never deleted by a read and is copied aside once".
- The quarantine is a table (`++seq, table, at` plus `key`, `raw`, `hash`), not files; there is no
  file fallback because the copy and the write share one transaction.
- A failed quarantine refuses only that write (the reference's iOS store blocks every write to the
  key until a copy exists; with one transaction per write the same guarantee holds per write).
- Numbers: required core values (kcal and macros, weights, instants) must be finite and not
  negative, else the row is unreadable (kept aside, not zeroed); optional nutrients that do not
  parse are left out (unknown, never 0); kcal decimals round to whole kcal.
- Enum defaults: meal `other`, source `manual`, sex `male`, activity `moderate`, goal `maintain`;
  a Coach message with an unknown role has no safe default and is unreadable.
- A fast with an `end` that is present but not a number, or before its start, is unreadable rather
  than "still running" (a phantom running fast would block food logging).

Tests we will write:
- Three entries with one unreadable → two items, one dropped, the raw row still in `entries`, one
  quarantine row with the raw value, flag set (R06.1, ACC-K9-1).
- Saving a new entry next to an unreadable one leaves the unreadable row in place (R05.6).
- `readOne`: missing, ok, corrupt; saving over a corrupt profile quarantines the raw value first
  (same transaction); a failing quarantine copy (a test middleware makes the add fail) refuses the
  save with `WriteBlockedError` and leaves the stored record and the quarantine as they were.
- Reading the same corrupt record twice → one copy; a changed corrupt value → a second copy.
- Codecs: unknown fields dropped, unknown enum → default, missing meal → `other`, int and decimal
  numbers accepted, grams basis only when grams > 0, a bad optional part left out, missing
  identity or time → unreadable, a fast with a bad end → unreadable; fingerprint is stable across
  key order and differs for different values.

Compare checklist (filled after the rewrite; reopened `A/data/PersistedJsonGuard.kt`,
`I/Services/PersistedBlobGuard.swift`, `T/data/PersistedJsonGuardTest.kt`,
`IT/DiaryPersistenceSafetyTests.swift`, `A/data/PreferencesStore.kt` lines 140–260):
- [x] Missing, readable and unreadable stay apart; a bad row costs that row only
  (`src/data/guard.test.ts > readOne > tells missing, readable and corrupt apart`, `> readAll >
  drops an unreadable entry, keeps it in its table and aside, and sets the flag (R06.1,
  ACC-K9-1)`, `> readAll > reports nothing dropped and leaves the flag alone when every row
  reads`, `> decodeRows > sorts rows a repository queried itself and keeps the unreadable ones
  aside`).
- [x] An unreadable list never becomes "empty" that a save then replaces (`guard.test.ts > readAll
  > never lets an unreadable row turn into an empty list that a save replaces (R05.6)`).
- [x] Unknown enum values coerce to the field default, unknown fields are ignored, int and decimal
  numbers read (`src/data/codecs.test.ts > decodeEntry > reads a missing or unknown meal as other
  and an unknown source as manual`, `> drops fields it does not know`, `> accepts whole and decimal
  numbers, rounding kcal to whole kcal`, `> decodeProfile > coerces unknown enum values to their
  defaults and drops the row key`); rows without identity or core values are unreadable
  (`decodeEntry > cannot read a row without id, instant, name or core numbers`, `decodeProfile >
  cannot read a profile without a birth date, height or weight`, `tracker codecs > read weigh-ins,
  body fat and water, and refuse missing values`).
- [x] A raw value is preserved before any overwrite, in the same transaction (the reference's
  in-store backup key) (`guard.test.ts > writeOne > keeps a corrupt profile aside before saving
  over it (R06.1)`); a value written behind our back and never read through the guard is checked
  at write time too (that test plants the value directly, with no read first).
- [x] Writes are refused while the copy cannot be made, and the stored bytes stay (`guard.test.ts
  > writeOne > refuses the save and leaves the record untouched when the copy fails (R06.1)`);
  readable or missing records are replaced without copies (`> writeOne > saves over a missing or
  readable record without a copy`).
- [x] Removal over unreadable data (the iOS guard refuses `remove()`, Android preserves before a
  clear): gap found in the compare, closed with `removeRows` (`guard.test.ts > removeRows > keeps
  an unreadable row aside before deleting it, and deletes readable rows plainly`, `> deletes
  nothing when an unreadable row cannot be kept aside`).
- [x] Repeated loads of the same bytes make one copy; a different value makes another and never
  overwrites the first (`guard.test.ts > readAll > keeps one copy when the same unreadable row is
  read twice, and a new copy when it changes`, `> readOne > keeps one copy of a corrupt record read
  twice`, `> writeOne > does not keep a second copy when a read already kept the corrupt record
  aside`; `> fingerprint > is the same for equal values in any key order`, `> differs for different
  values and types`, `> survives a value that contains itself`).
- [x] A repository's own transaction can keep a value aside atomically with its other work
  (`guard.test.ts > keepAside > joins the transaction of its caller, so a later failure there
  undoes the copy too`).
- [x] Earlier-wave codec rules (`codecs.test.ts > decodeEntry > makes a grams basis only when the
  grams are finite and above 0`, `> reads a missing or unknown meal as other and an unknown source
  as manual`); optional parts left out, never zeroed (`> leaves out optional parts that do not
  parse instead of failing the row`); a damaged fast end never becomes a running fast
  (`tracker codecs > reads a running fast only from a missing or null end`).
- [x] Never writing what cannot be read back (`guard.test.ts > writeOne > refuses to store a row
  its own codec cannot read back`).
- Deliberate differences: per-record tables instead of whole-list blobs; the quarantine is a table
  in the same database (no files, no file fallback), written in the same transaction as the
  write it protects; the copy dedupe persists across sessions (the reference's is per process);
  reads keep unreadable rows aside on a later task because Dexie forbids writes inside live
  queries (a read never deletes, so a failed copy loses nothing); refusal is per write instead of
  a standing write block on the key.
- Not taken: the reference's corrupt-file names with timestamps and `-1`, `-2` suffixes (rows have
  their own sequence); the duplicate-id merge and import cases of the iOS safety tests (P02-06,
  P09); the newer-schema-version marker inside a value (the whole database carries its version,
  P02-01); the profile's "update refuses on unreadable data" is P02-05 on top of `readOne`.

## Decisions for the lead

- Unknown entry source decodes as `manual`; unknown Coach role makes the message unreadable.
- Required numbers that are negative make a row unreadable instead of being clamped.
- `meta.unreadableData` holds `true` once anything was dropped or kept aside; nothing clears it
  yet (the K9 banner's dismiss is a later UI decision).
- Codecs are in their own file, `src/data/codecs.ts` (a file the plan did not list), with
  `codecs.test.ts`. Not written here: codecs for `settings` values (P02-04's schema), `secrets`
  (P02-12) and the `drafts` rows' generation wrapper (P02-13, which can reuse
  `decodeAnalysisDraft` and `decodeNutritionDraft`).
- `removeRows(db, table, keys, codec)` added after the compare (deleting over unreadable data);
  P02-06 `remove`/`combine`, P02-11 trimming and P09's Clear Food Log should delete through it.
- Repository transactions that call `writeOne`, `removeRows` or `keepAside` must include
  `GUARD_TABLES` (`quarantine`, `meta`).

## Notes for later waves

- Reads schedule their quarantine copy with `setTimeout(0)` (to leave Dexie's live-query scope);
  `settleQuarantine(db)` waits for those copies. Under fake timers, advance the timers first.
- Fingerprints describe blobs by size and type only (their bytes cannot be read inside a
  transaction), so two different unreadable blobs of the same size and type under the same key
  are kept once.

## Status

Done (2026-10-26). `codecs.ts`, `guard.ts` and their tests are in place; nothing outside the
task's files changed. Unit tests: `codecs.test.ts` 19, `guard.test.ts` 18, all passing.
