# Task: Dexie schema, open and upgrade safety (P02-01) · Phase: 02 · Owner: builder (wt-p02a0)

<!-- Save as platewise/docs/notes/P<nn>/<slug>.md. Write everything above "Compare checklist"
BEFORE writing code, in your own words. Never paste or paraphrase the reference line by line. -->

Read (reference @ `10e14b67`): `A/data/FudaiDataStore.kt` (all: the whole-store corruption
handler), `A/data/PreferencesStore.kt` lines 140–260 (the guarded list helpers and the profile
read and writes only), research spec `06-settings-data.md` §3.18 (local persistence, whole-store
corruption, migrations) and §5 (persistence guards re-designed for IndexedDB), §6 R06.4; phase
file P02 goal and row P02-01; `17-naming-and-glossary.md` §1.2 (table names). Dexie 4.4.6's own
open path (`node_modules/dexie`) to learn how it treats a newer database on disk. No Evidence ids.

What it does (own words): everything the person records lives in one IndexedDB database named
`platewise`, schema version 1, with fourteen tables and the indexes the repositories will query
by. The schema module names the tables and indexes once and keeps a numbered list of future
upgrade steps (empty today); every step must carry the data forward. `openDb()` builds the Dexie
instance and opens it. Opening must never cost the person their data: when the database on disk
was written by a newer Platewise, or an upgrade step fails, or IndexedDB is missing, the open
ends in a typed `DbOpenError` that the boot screen (P04-07) turns into a recovery card, and
nothing deletes or rewrites the database. When another tab upgrades or deletes the database, this
tab's connection closes itself at once (so the other tab is not blocked) and posts
`reload-needed` on the app bus. Test factories build every stored record with overridable
defaults so later tests start from valid data.

Inputs → outputs:
- `schema.ts`: `DB_NAME = 'platewise'`, `TABLES` (Dexie schema strings for version 1),
  `TableName`, row types (`ProfileRow`, `EntryRow`, `PhotoRow`, `QuarantineRow`, key/value rows),
  `PlatewiseDb` (the typed Dexie), `UpgradeStep {version, stores, migrate?}`, `UPGRADES` (empty),
  `schemaVersion(steps)`, `declareSchema(db, steps)`.
- `db.ts`: `openDb({name?, indexedDB?, IDBKeyRange?, steps?, bus?})` → `Promise<PlatewiseDb>`, or
  rejects with `DbOpenError {kind: 'newer' | 'upgrade' | 'unavailable' | 'failed', found?,
  expected, cause?}`.
- `src/test/factories.ts`: `makeEntry`, `makeSavedMeal`, `makeDraft`, `makeLine`, `makeProduct`,
  `makeProfile`, `makeProfileRow`, `makeWeighIn`, `makeBodyFat`, `makeWater`, `makeFast`,
  `makeCoachMessage`, `makePhoto`, `makeAnalysisDraft`, each `(overrides?) → record`.
- `src/test/db.ts`: `openTestDb(options?)` → `{db, factory, name, bus}`, a database on its own
  fake IndexedDB factory and name; `installedVersion(factory, name)` (db.ts) for the probe.

Files: created `src/data/schema.ts`, `src/data/schema.test.ts`, `src/data/db.ts`,
`src/data/db.test.ts`, `src/test/factories.ts`, `src/test/factories.test.ts`, `src/test/db.ts`
(`openTestDb`, and `countRuns` for P02-03), this note.

Edge cases / failure modes:
- A newer version on disk: Dexie 4 does not fail here. It reopens at whatever version is installed
  and, if our schema lacks something, silently patches the newer database (adds tables and indexes
  and bumps the version). So `openDb` probes the installed version with a bare `open()` first
  (aborting the creation when nothing is there, so the probe never creates a database) and refuses
  before Dexie touches anything; after the open it checks the connection's version once more in
  case another tab upgraded in between.
- Dexie's own schema patch (same version, extended schema) bumps the native version by one
  (10 → 11); that is still Dexie version 1, so "newer" compares whole Dexie versions
  (`floor(native / 10)`).
- A failing upgrade step: IndexedDB rolls the upgrade transaction back, so the old version and its
  rows stay; Dexie rejects with the step's own error, so the kind (`upgrade`) is decided from the
  probe (a database existed below our version), not from the error name.
- A probe that finds no database must leave none behind (abort the version-1 creation).
- No IndexedDB at all (some private modes, very old browsers) → `unavailable`; any other open
  error → `failed`; never a delete in any branch.
- `versionchange` (another tab upgrades or deletes): close with auto-reopen off, so a later query
  does not reopen into the newer version; post `reload-needed`; stop Dexie's default handler,
  which would close with auto-reopen on.
- `fasts.end` is `null` while a fast runs: IndexedDB leaves such rows out of the `end` index,
  which is what a "finished fasts by end" query wants.
- Factories: a `dayKey` follows an overridden `loggedAt`/`at` unless the override sets it too.

Our design differences / decisions:
- The reference keeps one key/value file with JSON blobs; we have one object store per entity
  (spec 06 §5), so a single bad row costs one row, and whole-store "copy aside and start empty"
  is not needed: an open failure keeps the database and shows a recovery card (R06.4).
- One-shot migrations keyed by markers become numbered Dexie versions in one registry; each step
  may move data in its upgrade transaction. A step that deletes a table must move its rows first
  (the registry test checks that rows survive).
- `openDb` takes its IndexedDB factory and bus as options so tests use a fresh fake factory each;
  the app passes nothing.
- The row types for `secrets`, `drafts`, `settings` and `meta` are loose (`{id}` or `{key,
  value}`): their exact shapes belong to P02-12, P02-13 and P02-04, whose codecs narrow them.
- Codecs live in their own file (`src/data/codecs.ts`, P02-02) so the schema stays small.

Tests we will write:
- Schema: a fresh open creates exactly the fourteen tables with the listed keys and indexes;
  version 1; the registry is empty and ordered; `declareSchema` with a sample step 2 keeps every
  seeded row (the harness every future step runs through); a generic loop over `UPGRADES` seeds
  the previous version and checks no row is lost.
- Open: reopen keeps rows; a database created at version 2 by another connection → `DbOpenError`
  kind `newer`, version 2 and its rows untouched (no patch, version unchanged); a failing upgrade
  step → kind `upgrade`, version 1 and its rows still there; no IndexedDB → kind `unavailable`;
  the probe creates nothing when the database is missing; `versionchange` from another
  connection closes ours, posts `reload-needed`, and the other connection's upgrade goes through.
- Factories: every factory's record passes its codec unchanged; overrides apply; derived day keys
  follow overridden instants; ids are unique.

Compare checklist (filled after the rewrite; reopened `A/data/FudaiDataStore.kt`,
`A/data/PreferencesStore.kt` lines 140–260, and Dexie's open path):
- [x] An unreadable or unusable store never costs the only copy: no branch of `openDb` deletes,
  and a failed open leaves the database as it was (`src/data/db.test.ts > openDb > refuses a
  database a newer version wrote and leaves it exactly as it was (R06.4)`, `> turns a failing
  upgrade into DbOpenError and keeps version 1 with its rows (R06.4)`).
- [x] The failure is visible, not a crash loop: every failure is one typed `DbOpenError`
  (`db.test.ts > openDb > reports unavailable when the browser has no IndexedDB`, `> reports
  unavailable when the browser refuses to open any database`, and the two R06.4 tests above).
- [x] A newer schema on disk stays untouched (the reference keeps newer persisted state
  write-blocked): Dexie would patch it, the probe refuses first (`db.test.ts > openDb > refuses a
  database a newer version wrote and leaves it exactly as it was (R06.4)` checks native version 20
  and the newer build's rows; with the probe removed it fails at 21); the probe itself creates
  nothing (`db.test.ts > installedVersion > finds no version and creates nothing when the database
  is missing`, `> reads the Dexie version of an existing database`).
- [x] Fresh open creates every table and index (`src/data/schema.test.ts > schema version 1 >
  creates every table with its key and indexes on a fresh open`, `> lists the same tables in
  TABLES as the database holds`, `> names the database platewise and declares fourteen tables`;
  `db.test.ts > openDb > creates the platewise database at version 1 on a first run`); reopen
  keeps rows (`db.test.ts > openDb > keeps rows across a reopen`).
- [x] Migrations keep data: the registry is ordered and refuses deletes that move nothing
  (`schema.test.ts > upgrade registry > is empty and usable today`, `> flags steps out of order, at
  version 1 or below, and deletes without a move`, `> refuses to declare bad steps`, `> reports the
  version the last step leads to`); every registered step runs through the row-keeping harness
  (`schema.test.ts > upgrade steps keep data > runs every registered step without losing a row`),
  which is shown to pass a good step and to catch a lossy one (`> keeps every row through a sample
  step that adds an index and a table and moves data`, `> catches a step that deletes a table and
  moves nothing`).
- [x] Another tab's upgrade or delete is never blocked by this tab and this tab never reopens into
  it (`db.test.ts > versionchange > closes this connection, posts reload-needed here, and lets the
  other tab upgrade`, `> lets another tab delete the database`).
- [x] Factories build every record and pass the codecs (`src/test/factories.test.ts > factories >
  %s builds a record its codec reads back unchanged`, `> builds the stored profile row under the
  key me`, `> applies overrides`, `> derives day keys from an overridden instant unless the day key
  is given too`, `> gives every record its own id and starts again after a reset`).
- Deliberate differences: one object store per entity instead of one key/value file, so there is
  no whole-store "copy aside and start empty": an open failure keeps the database untouched and
  the boot screen shows a recovery card (R06.4, P04-07); migrations are numbered Dexie versions in
  one registry instead of per-feature version markers.
- Not taken: the reference's corrupt-file copy with sibling and fallback folders and the length
  check (no file to copy; IndexedDB rolls a failed upgrade back by itself); the one-shot settings
  migrations (AI model ids, base URLs, add-menu v1→v2, favourites to copies): v1 starts clean, and
  the settings schema (P02-04) owns defaults.

## Decisions for the lead

- `DbOpenError.kind` values: `newer`, `upgrade`, `unavailable`, `failed` (with `expected`, `found`
  and the browser's error as `cause`).
- `openDb` options: `name`, `indexedDB`, `IDBKeyRange`, `steps`, `bus` (default `appBus()`); no
  database singleton yet: the boot code (P04-07) owns the one instance and hands it to
  repositories.
- `openDb` probes the installed version with a bare `open()` before Dexie opens: Dexie 4 opens a
  newer database as it is and patches missing tables or indexes into it (observed: native version
  20 → 21). An open blocked by an old tab that does not close is not handled (every tab of this
  build closes on `versionchange`).
- Row types for `secrets`, `drafts` (`OwnedRow`) and `settings`, `meta` (`KeyValueRow`) are loose
  on purpose, so P02-04, P02-12 and P02-13 never need to edit `schema.ts`.
- New test helpers beside the factories: `src/test/db.ts` with `openTestDb()` (own fake factory
  and unique name per call: Dexie's live-query cache is keyed by database name, so two tests on
  the same name could share cached results) and `countRuns()` (P02-03).

## Notes for later waves

- Blobs do not survive fake-indexeddb under jsdom: a jsdom `Blob` is cloned into a plain object.
  P02-07 (photos) and P02-11 (thumbnails) need a test workaround (for example storing and reading
  blob-shaped values, or checking blobs before the put); the codecs accept any blob-shaped value.
- To leave a Dexie transaction from a test (to resolve a promise the test awaits), call the
  resolver inside `Dexie.ignoreTransaction(() => …)`: otherwise the test continues inside the
  finished transaction's scope and its next write fails with `TransactionInactiveError`.

## Status

Done (2026-10-26). Schema, open, upgrade registry, factories and the test-database helper are in
place; nothing outside the task's files changed. Unit tests: `schema.test.ts` 10, `db.test.ts`
10, `factories.test.ts` 17 (13 cases in the codec table), all passing.
