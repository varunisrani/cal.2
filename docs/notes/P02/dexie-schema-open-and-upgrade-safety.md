# Task: Dexie schema, open and upgrade safety (P02-01) · Phase: 02 · Owner: builder (wt-p02s0)

<!-- Save as platewise/docs/notes/P<nn>/<slug>.md. Write everything above "Compare checklist"
BEFORE writing code, in your own words. Never paste or paraphrase the reference line by line. -->

Read (reference @ `10e14b67`): `A/data/FudaiDataStore.kt` (all: the corruption handler around the
single settings file), `A/data/PreferencesStore.kt` lines 140–260 (the guarded list helpers and the
profile write path only); research spec `06-settings-data.md` §3.18 (local persistence, whole-store
corruption) and §5 (the IndexedDB redesign), §6 R06.4; `04-architecture.md` §2 rule 5 and §3;
`17-naming-and-glossary.md` §1.2 (table names). No Evidence ids. Dexie 4.4.6 source read for how it
opens, upgrades, falls back on a newer version and handles `versionchange`.

What it does (own words): everything the person records lives in one IndexedDB database called
`platewise`. `schema.ts` names the database, its first version (1) and the fourteen tables with
their indexes, and keeps a numbered list of upgrade steps for later versions (empty today). `db.ts`
opens the database through Dexie and returns the typed instance. Opening is the one place where a
mistake could cost the person everything, so it never deletes or rewrites what is on disk: a
database written by a newer build (a higher version than this build knows) is refused with a typed
`DbOpenError` before Dexie touches it, and an upgrade step that fails leaves the old version and its
rows as they were (IndexedDB rolls the upgrade back) and also ends in a `DbOpenError`. The app can
then offer a reload or an export instead of a crash loop. When another tab upgrades or deletes the
database, our connection gets `versionchange`: we close it at once (so the other tab is not
blocked) and post "reload needed" on the app bus. `transact()` is the one helper repositories use
for transactions; a read-write transaction always also covers `quarantine` and `meta`, so the guard
(P02-02) can keep unreadable rows aside inside the same transaction. `src/test/factories.ts` builds
a valid record of every kind for tests, with fixed ids and a fixed clock.

Inputs → outputs:
- `openDb({name?, indexedDB?, IDBKeyRange?, steps?, bus?})` → `Promise<PlatewiseDb>`; rejects with
  `DbOpenError` (`kind`: `newer-schema`, `upgrade-failed`, `unavailable`, `failed`; `cause`).
- `transact(db, 'r' | 'rw', tables, body)` → the body's result, in one Dexie transaction.
- `DB_NAME`, `BASE_STORES`, `TABLE_NAMES`, `UPGRADE_STEPS`, `schemaVersion(steps)`,
  `declareSchema(db, steps)`, `checkSteps(steps)` → list of problems; row types per table.
- Factories: `factories({now?, zone?})` → builders `draft`, `entry`, `savedMeal`, `weighIn`,
  `bodyFat`, `water`, `fast`, `coachMessage`, `profile`, `profileRow`, `photo`, `analysisDraft`,
  each taking overrides; fixed `FACTORY_NOW` (12:30 New York, 26 Oct 2026); `testBlob(text)`.
- Test helper `src/test/db.ts`: `freshDbOptions()` (new fake factory, unique name) and
  `openTestDb(options?)` (closed when the test ends).

Files: created `src/data/schema.ts`, `src/data/schema.test.ts`, `src/data/db.ts`,
`src/data/db.test.ts`, `src/test/factories.ts`, `src/test/factories.test.ts`, `src/test/db.ts`
(fresh fake database per test), this note.

Edge cases / failure modes:
- Fresh install: every table and index is created at version 1.
- Reopen: rows survive closing and opening again.
- Newer schema on disk (an older cached build opens after a newer one upgraded): refused before
  Dexie opens it. Dexie 4 would otherwise reopen the newer database at its own version and could
  even add missing tables to it. Checked twice: `indexedDB.databases()` before opening when the
  browser has it, and the opened connection's version afterwards (another tab may upgrade between
  the two).
- Upgrade step throws: IndexedDB aborts the upgrade, the old version and rows stay; we report
  `upgrade-failed`. `deleteDatabase` is never called on any path.
- No IndexedDB at all (some private modes, old browsers): `unavailable`.
- `versionchange` from another tab (upgrade or delete): close our connection (no auto reopen, which
  would bypass these checks) and post `reload-needed` with the reason.
- Dexie's own native version is ours times 10 and a schema patch can add one; "newer" therefore
  means a Dexie version above ours, not any native number above ours × 10.
- Tests: Dexie keeps a query cache per database name across instances, so each test database gets
  its own fake factory and its own name.

Our design differences / decisions:
- No reference counterpart for IndexedDB; the reference's lesson (a corrupt store must never be
  replaced by an empty one, and failing loudly is better than discarding the only copy) becomes:
  refuse to open, never delete, report a typed error.
- Upgrade steps are data (`{version, stores, migrate?, why}`) so a test can walk every step and
  prove that rows survive it; a step that drops a table or rows fails that test.
- `transact` adds `quarantine` and `meta` to every read-write transaction (cheap: IndexedDB
  locks per store, and these two are small).
- Row types: `profile` row is the profile plus `id: 'me'`; `entries` rows may carry the derived
  `barcodeKey` (P02-06 sets it); `photos` rows `{id, blob, thumb?, width, height, bytes,
  createdAt}`; `settings` and `meta` rows `{key, value}`; `secrets` and `drafts` rows are loose
  `{id, …}` until P02-12 and P02-13 narrow them.
- Factories take their ids from `withIdSequence` (one counter per record kind) and their times
  from `fixedClock`; a photo blob in tests is made with a Blob that survives fake-indexeddb's
  structured clone (jsdom's own Blob does not).

Tests we will write:
- Schema: the fourteen tables and their index lists exactly; version 1; the step registry is
  empty, `checkSteps` accepts it and rejects out-of-order or non-integer versions; every step in
  the registry keeps every row (a harness that seeds the previous version, upgrades, compares
  keys), with the harness itself proven on a sample step that keeps rows and one that loses them.
- Open: fresh open creates every table; reopen keeps rows; a version-2 database written by another
  connection → `DbOpenError` `newer-schema`, its rows and version unchanged, no delete; a failing
  upgrade step → `upgrade-failed`, version-1 rows still there, no delete; no IndexedDB →
  `unavailable`; `versionchange` closes the connection and posts `reload-needed`.
- `transact`: read-write covers `quarantine` and `meta`; a throw rolls everything back.
- Factories: every builder's record passes its P02-02 codec unchanged; overrides win; ids count.

Compare checklist (filled after the rewrite; reopened `A/data/FudaiDataStore.kt`,
`A/data/PreferencesStore.kt` lines 140–260):
- [x] A store that cannot be opened is never deleted or replaced; the failure is visible instead
  of a crash loop (tested in `src/data/db.test.ts > openDb > refuses a database a newer version
  wrote and leaves its rows and version as they were (R06.4)`, `> refuses a newer database after
  opening it when the browser cannot list databases`, `> reports a failed upgrade and keeps
  version 1 with its rows (R06.4)`; both failure tests also assert `deleteDatabase` was never
  called).
- [x] The guarded-list helper's rule "read, change and write in one transaction, with the copy of
  unreadable data in that same transaction" is `transact` plus the guard (`db.test.ts > transact >
  covers quarantine and meta in every read-write transaction`, `> rolls every change back when the
  body throws`; the copy itself in `src/data/guard.test.ts > writeOne > keeps a corrupt profile
  aside before saving over it (R06.1)`).
- [x] Fresh open creates every table and index; reopen keeps rows (`db.test.ts > openDb > creates
  every table and index on a fresh open`, `> keeps rows when the database is closed and opened
  again`).
- [x] Another tab's upgrade or delete closes our connection for good and asks for a reload
  (`db.test.ts > versionchange > closes the connection and posts reload-needed when another tab
  upgrades`, `> posts reload-needed with the reason deleted when another tab deletes the
  database`).
- [x] Upgrade steps keep data, and the check is proven to catch a step that does not
  (`src/data/schema.test.ts > upgrade steps > keep every row: each registered step is checked
  against every table`, `> the check passes a step that adds an index and rewrites rows`, `> the
  check catches a step that deletes rows or removes a table`; `db.test.ts > openDb > upgrades
  through a step that keeps rows`).
- [x] Factories build records the codecs read back unchanged (`src/test/factories.test.ts >
  factories > build records that read back unchanged through their codecs`).
- Deliberate differences: the reference copies an unreadable store file aside and starts empty;
  IndexedDB gives us no file to copy, so an open failure is a typed `DbOpenError` and nothing is
  started over (the app decides later what to offer: reload, export). Version checks and
  `versionchange` handling have no reference counterpart (the native stores have one process).
- Not taken: the reference's one-shot migration markers (each later phase adds an upgrade step or
  a `meta` key instead), the sibling-file and backup-key fallbacks (the quarantine table replaces
  both).

## Decisions for the lead

- `openDb` asks `indexedDB.databases()` for the version on disk when the browser has it, and checks
  the opened connection's version too; "newer" means a Dexie version above ours (native ÷ 10), so
  a Dexie schema patch (+1) of our own version never counts as newer.
- `versionchange` closes the connection without Dexie's auto-reopen and posts `reload-needed`
  (`reason: 'upgrade' | 'deleted'`) on the bus passed to `openDb`, else on `appBus()`.
- `transact(db, mode, tables, body)` adds `quarantine` and `meta` to every read-write transaction;
  repositories should do every write through it (explicit transactions also keep Dexie from
  showing a write in live queries before it commits, which it does for a lone `table.put`).
- Row types live in `schema.ts` (`Rows`); `secrets` and `drafts` rows are loose (`{id, …}`) for
  P02-12 and P02-13 to narrow; `photos` rows are `{id, blob, thumb?, width, height, bytes,
  createdAt}`.
- New test helpers outside the phase table: `src/test/db.ts` (one fake factory and a unique name
  per test database, because Dexie shares its live-query cache between instances with the same
  name) and `testBlob` in `src/test/factories.ts` (jsdom's Blob comes back from fake-indexeddb as a
  plain object; Node's Blob survives). P02-07 and P02-11 should build blobs with `testBlob`.
- Follow-up: fake timers stall Dexie (the first live-query run is on a timer, fake-indexeddb
  schedules with `setImmediate`); data tests run on real timers and wait on events.

## Status

Done (2026-10-26). Everything in this note is in place; no file outside the slice was changed.
Handed on: P02-14 (wipe) is the only code that may call `deleteDatabase`; P02-05's `update` should
refuse when `readOne` answers `corrupt`.
