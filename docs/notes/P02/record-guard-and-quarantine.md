# Task: record guard and quarantine (P02-02) · Phase: 02 · Owner: builder (wt-p02s0)

<!-- Save as platewise/docs/notes/P<nn>/<slug>.md. Write everything above "Compare checklist"
BEFORE writing code, in your own words. Never paste or paraphrase the reference line by line. -->

Read (reference @ `10e14b67`): `A/data/PersistedJsonGuard.kt` (all), `I/Services/PersistedBlobGuard.swift`
(all), `T/data/PersistedJsonGuardTest.kt` (all), `IT/DiaryPersistenceSafetyTests.swift` (the
guard, food, weight and fasting cases; the workout and import cases only for the rule they show);
research spec `06-settings-data.md` §3.18 (list guard, transactions), §6 R06.1; `02-food-logging.md`
§3.1 (decoding: missing meal is `other`, int or decimal numbers, unknown keys ignored); spec 05 §6
R05.6; `src/domain/model.ts` and its task note (codec follow-ups). No Evidence ids.

What it does (own words): a stored record can stop being readable (a bug, a newer build, a damaged
disk). The reference learnt the hard way that treating "cannot read" like "nothing there" lets the
next save write a list of one over the whole diary. Here every table is read through a codec that
turns an unknown stored value into one of our records or says it cannot. Codecs are lenient: fields
we do not know are left out, an unknown choice value (meal, source, activity…) falls back to that
field's default, whole and decimal numbers are both fine. A row that still cannot be read is left
out of the results but never deleted: its raw value is copied into the `quarantine` table (table,
key, time, raw, fingerprint) and the `meta` flag `unreadableData` is set, which the "some data
could not be read" banner (K9) watches. Writing over a key whose stored value cannot be read first
copies that value into quarantine in the same transaction; if the copy fails, the write is refused
with `WriteBlockedError` and nothing changes, so the only copy is never lost. The same raw value is
copied once, however often it is read.

Inputs → outputs:
- `Codec<T>` = `(raw: unknown) => T | null`.
- `readAll(db, table, codec, select?)` → `{items, dropped}`; `select` picks the rows (an index
  query), default the whole table.
- `readOne(db, table, key, codec)` → `{kind: 'missing'}` | `{kind: 'ok', value}` |
  `{kind: 'corrupt', raw}`.
- `writeOne(db, table, row, codec)` → puts the row; `WriteBlockedError` when an unreadable stored
  value could not be kept aside; `TypeError` when the row itself would not read back.
- `guardKey(db, table, key, codec)` (inside a read-write transaction) → keeps an unreadable stored
  value aside before the caller replaces or deletes it (bulk writes in later repositories).
- `keepAside(db, found)` → copies unreadable values (deduplicated) and sets the flag;
  `keptAside()` → waits for copies that had to be deferred (tests, wipe).
- `hasUnreadableData(db)`; `UNREADABLE_FLAG`.
- Codecs in `src/data/codecs.ts`: `decodeDraft`, `decodeEntry`, `decodeSavedMeal`,
  `decodeWeighIn`, `decodeBodyFat`, `decodeWater`, `decodeFast`, `decodeCoachMessage`,
  `decodeProfile`, `decodePhoto`, `decodeAnalysisDraft`.

Files: created `src/data/guard.ts`, `src/data/guard.test.ts`, `src/data/codecs.ts`,
`src/data/codecs.test.ts`, `src/data/values.ts` and `src/data/values.test.ts` (blob check, stable
text form and fingerprint of a raw value, structural equality for P02-03), this note.

Edge cases / failure modes:
- Missing (never written) is not corrupt: no copy, no flag.
- One bad row among good ones: the good rows read, the bad one is counted and copied.
- Every row unreadable: an empty result, the rows stay in their table; adding a new row never
  touches them (R05.6: an unreadable list is never replaced by an empty one).
- Reading the same bad row twice (or in every live-query re-run): one copy. A different raw value
  under the same key later is a new copy. The fingerprint only narrows the search; equality of the
  full stable text decides, so a hash collision can never skip a copy.
- Reads inside a live query or a read-only transaction cannot write: the copy is deferred to its
  own transaction on a fresh task. Inside a read-write transaction from `transact` it happens in
  that transaction (and rolls back with it).
- A failing copy while reading does not fail the read (the row is still on disk, and writes are
  guarded); a failing copy before a write refuses the write.
- Writing a record that its own codec cannot read is a programming error: refused before any
  change.
- Codec rules (from the model note and the spec): a grams basis only when grams is finite and
  above 0, else servings (count 1 when unknown); a missing or unknown meal reads as `other`; an
  unknown source as `manual`; unknown nutrient and extra keys are dropped and missing ones stay
  absent, never 0; at most four unit choices; whole kcal; an invalid day key is derived again from
  the instant; unreadable list items (ids, units, lines) are dropped while the record stays.
- Required fields per record (missing or not a finite number → the record cannot be read): entry
  `id`, `loggedAt`, `name`, `kcal`, `protein`, `carbs`, `fat`; weigh-in `id`, `at`, `kg > 0`; body
  fat `id`, `at`, fraction in (0, 1); water `id`, `at`, `ml > 0`; fast `id`, `start`, `goalMin >
  0`; coach message `id`, `text`, `at`; profile `birthDate` (a real day), `heightCm > 0`,
  `weightKg > 0`; photo `id`, a blob.
- Profile defaults for unknown choices follow spec 01 §3.1: sex `male`, activity `moderate`, goal
  `maintain`.

Our design differences / decisions:
- IndexedDB stores one row per record, so the unit of loss is a row, not a whole list: the guard
  works per row, and the quarantine is a table instead of files next to the store.
- Read-side copies are deduplicated in the database (survives reloads) plus a per-connection memory
  of committed copies so a live query does not open a transaction on every re-run.
- Lenient decoding that drops unknown fields means a later update writes the record without them
  (as in the reference). Not treated as unreadable.
- Blobs are recognised by shape (size, type, slice), not `instanceof Blob`, so a blob from another
  realm or a test runtime still reads.
- Our names: `guard.ts`, `readAll`, `readOne`, `writeOne`, `guardKey`, `keepAside`, quarantine
  rows `{seq, table, key, at, raw, hash}`.

Tests we will write:
- Three entries with one unreadable → two items, one dropped, the raw value in quarantine, the flag
  set; the bad row still in `entries` (R06.1, ACC-K9-1).
- Saving over a corrupt profile copies the raw value first, then writes (R06.1).
- A failing quarantine write refuses the save; the stored record and quarantine are unchanged.
- Reading the same corrupt record twice → one copy; a changed raw value → a second copy.
- All rows unreadable → empty read; adding an entry keeps both bad rows (R05.6).
- `readOne`: missing, ok, corrupt; a corrupt read from inside a live query is still copied.
- A copy made inside a read-write transaction rolls back with it.
- Codecs: each accepts the factory record unchanged; unknown fields dropped; unknown meal and
  source coerced; missing meal → `other`; decimal kcal rounded; grams basis rules; unknown
  nutrient keys dropped, missing ones absent; each required field missing → `null`.

Compare checklist (filled after the rewrite; reopened `A/data/PersistedJsonGuard.kt`,
`I/Services/PersistedBlobGuard.swift`, `T/data/PersistedJsonGuardTest.kt`,
`IT/DiaryPersistenceSafetyTests.swift`):
- [x] Missing, readable and unreadable stay apart; never written is not corrupt (tested in
  `src/data/guard.test.ts > readOne > tells a missing, a readable and a corrupt record apart`,
  `> readAll > keeps nothing aside and raises no flag when every row reads`).
- [x] One bad row costs that row, not the list; it is kept aside, flagged and stays in its table
  (`guard.test.ts > readAll > leaves out a damaged entry, keeps it aside and still shows the
  others (ACC-K9-1, R06.1)`).
- [x] Nothing readable is never treated as empty and saved over (`guard.test.ts > readAll > never
  replaces unreadable rows: adding to a table nobody can read keeps them (R05.6)`).
- [x] An unreadable value is copied before it is replaced, with no earlier read needed (the "write
  before any load" and "changed behind the store's back" cases: the guard reads the stored value
  inside the writing transaction) (`guard.test.ts > writeOne > keeps a corrupt profile aside
  before saving over it (R06.1)`, `> keeping values aside inside other work > keeps an unreadable
  value aside before a delete in the same transaction`).
- [x] When the copy cannot be made the write is refused and the stored bytes stay (`guard.test.ts
  > writeOne > refuses the save and changes nothing when the copy cannot be written (R06.1)`).
- [x] A readable value replaced by another readable one makes no copy (`guard.test.ts > writeOne
  > writes over a readable record without copying anything`).
- [x] Repeated reads of the same bad value make one copy; a new bad value makes a new copy and
  never overwrites the earlier one (`guard.test.ts > readAll > copies the same unreadable value
  once, also after a reload`, `> copies the value again when the unreadable row changes`).
- [x] Lenient decoding: unknown fields ignored, an unknown meal coerced instead of dropping the
  row, missing meal is `other`, int or decimal numbers (`src/data/codecs.test.ts > decodeEntry >
  reads a stored entry unchanged and leaves unknown fields out`, `> reads a missing or unknown meal
  as other and an unknown source as manual`, `> accepts whole and decimal numbers and keeps kcal
  whole`, `> cannot read an entry without its id, instant, name, kcal or macros`).
- [x] Model follow-ups: grams basis rules, nutrients absent rather than 0 (`codecs.test.ts >
  decodeDraft > makes a grams basis only from finite grams above 0`, `> keeps known nutrients,
  drops unknown keys and never fills a missing one with 0`).
- [x] A running fast survives an unreadable neighbour row (per-row storage), and a damaged end
  never turns into a running fast (`codecs.test.ts > tracker codecs > reads a fast without an end
  as running, but a damaged end as unreadable`).
- Deliberate differences: the unit is a row, not a whole list blob, so "partly readable list" and
  "corrupt list" become rows left out one by one; copies go to the `quarantine` table instead of
  files with unique names; the per-process hash set becomes a check against the stored copies
  (survives reloads) plus a per-connection memory; reads keep values aside too (the banner flag
  needs it), deferred to a fresh task when found inside a live query; a newer schema is refused
  for the whole database at open (P02-01) rather than per value.
- Not taken: the archive-file helpers (sibling copy, length check, temp-file rename), the in-store
  backup key fallback, the workout and import cases of the iOS tests (later phases; the import
  duplicate-id rule belongs to P09).

## Decisions for the lead

- Codecs live in a new `src/data/codecs.ts` (not in the phase table) so every wave-B repository
  imports the same ones. Defaults for unknown values: source `manual`, Coach role `assistant`,
  profile sex `male`, activity `moderate`, goal `maintain` (spec 01 §3.1); missing saved-meal order
  0; a damaged fast end makes the fast unreadable.
- Quarantine rows carry a `hash` (fingerprint of the raw value) besides table, key, time and raw.
- Reads keep unreadable values aside as well as writes; inside a live query the copy runs on a
  fresh task, and `keptAside()` waits for those copies (tests, later the wipe).
- `writeOne` refuses (TypeError) a row its own codec cannot read, to catch bugs before they
  reach the disk.
- `guardKey(db, table, key, codec)` is the building block for repositories that write or delete
  in bulk; it must run inside `transact`.
- The `unreadableData` flag is only ever raised here; clearing it belongs to the banner (K9).

## Status

Done (2026-10-26). Everything in this note is in place; no file outside the slice was changed.
