# P02 · Data layer (Dexie schema and repositories)

**Weeks:** 2 · **Tracks:** domain/data/AI · **Depends on:** P01 · **Status:** planned

Reference paths are relative to `$PLATEWISE_REF` (`/root/reference/fud-ai`, pinned at `10e14b67`). Prefixes: `A/` = `android/app/src/main/java/com/apoorvdarshan/calorietracker/`, `I/` = `ios/calorietracker/`, `T/` = `android/app/src/test/java/com/apoorvdarshan/calorietracker/`, `IT/` = `ios/calorietrackerTests/`. A number in brackets is the file's length in lines; read only the named part of a big file. Read the research spec section first, then the reference, then its tests.

## Goal

Everything the person records lives in one IndexedDB database (`platewise`) behind repositories in `src/data/`. Every change is one transaction that reads, changes and writes (R06.2); an active fast refuses food writes inside that same transaction (R05.1); unreadable records are kept aside in a quarantine table and never silently replaced (R06.1, R05.6, R01.17); every committed write reaches every live query and every open tab (R06.3). Keys sit in their own table, wrapped by a non-extractable WebCrypto key (Proposed D-16.51). Photos are blobs deleted only when nothing references them (R02.8, R06.18). No UI yet: hooks and repositories are tested with fake-indexeddb.

## Slices and waves

Each slice owns its files; no two slices in a wave touch the same path. A builder takes one slice, runs Read → note → Rewrite → Compare for each task, then the loop until green. The lead lands one commit per slice and writes any deviation back into this file.

- **Wave A:** S0 = P02-01..03 (`src/data/{db,schema,guard,live,useLive,bus}.ts`, `src/test/factories.ts`), one builder.
- **Wave B:** S1 = P02-04, P02-05 (`src/data/settingsSchema.ts`, `src/data/repos/{settingsRepo,profileRepo}.ts`) · S2 = P02-06, P02-07, P02-13 (`src/data/repos/{diaryRepo,photoRepo,draftsRepo}.ts`) · S3 = P02-08, P02-09 (`src/data/repos/{weightRepo,bodyFatRepo,waterRepo,fastRepo}.ts`) · S4 = P02-10, P02-11 (`src/data/repos/{savedMealsRepo,coachRepo}.ts`) · S5 = P02-12, P02-14 (`src/data/{crypto,wipe,storage}.ts`, `src/data/repos/secretsRepo.ts`).
- **Wave C:** P02-15 (`src/data/hooks.ts`) after every repository has landed.

## Tasks (15)

| ID | Task | Read in reference | New files | Verify |
|---|---|---|---|---|
| P02-01 | **Dexie schema, open and upgrade safety.** `src/data/schema.ts` declares database `platewise`, version 1, with tables and indexes: `profile` (key `id`, one row `me`), `entries` (`id, dayKey, loggedAt, [dayKey+loggedAt], barcodeKey`), `photos` (`id`; blob, thumb, width, height, bytes, createdAt), `savedMeals` (`id, order, originEntryId`), `weighIns` (`id, at`), `bodyFat` (`id, at`), `water` (`id, at, dayKey`), `fasts` (`id, start, end`), `coachMessages` (`id, at`), `settings` (`key`), `secrets` (`id`), `drafts` (`id`), `quarantine` (`++seq, table, at`), `meta` (`key`). A registry of numbered upgrade steps (empty for now) and a test that every future step keeps data. `src/data/db.ts`: `openDb()` returns the Dexie instance; an open or upgrade failure (a newer schema on disk, a failed upgrade) becomes a typed `DbOpenError` and the database is never deleted (R06.4); `versionchange` closes the connection and posts "reload needed" on the bus. `src/test/factories.ts`: builders for every record with overridable defaults, used by every later test. | `A/data/PreferencesStore.kt` [1 739: lines 140–260 guarded lists only]; `A/data/FudaiDataStore.kt` [62]; spec 06 §3.18 and §5 | `src/data/schema.ts`, `src/data/schema.test.ts`, `src/data/db.ts`, `src/data/db.test.ts`, `src/test/factories.ts` | fresh open creates every table; reopen keeps rows; opening after another connection created version 2 yields `DbOpenError` and the version-2 data is still there; `versionchange` closes and posts the message; factories produce records that pass the codecs of P02-02. |
| P02-02 | **Record guard and quarantine.** `src/data/guard.ts` (06 §3.18, R06.1, R05.6). Each table has a lenient codec: unknown fields dropped, unknown enum values coerced to the field default, int or decimal numbers accepted; a record that cannot be read is dropped from results, never deleted. `readAll(table, codec)` → `{items, dropped}`; `readOne(table, key, codec)` → `missing \| ok(value) \| corrupt(raw)`. `writeOne` over a corrupt record first copies the raw value into `quarantine` (table, key, at, raw) in the same transaction; if that copy fails the write is refused (write-blocked) so the only copy is never lost. The same raw value is quarantined once (keyed by table, key and a hash). A `meta` flag `unreadableData` is set whenever anything is dropped or quarantined; the UI banner (K9) reads it. | `A/data/PersistedJsonGuard.kt` [131: all]; `I/Services/PersistedBlobGuard.swift` [302: all]; `T/data/PersistedJsonGuardTest.kt` [162]; `IT/DiaryPersistenceSafetyTests.swift` [502] | `src/data/guard.ts`, `src/data/guard.test.ts` | three entries with one unreadable → two items, one dropped, raw kept in quarantine, flag set; saving over a corrupt profile quarantines the raw value first; a failing quarantine write refuses the save and leaves the record untouched; reading the same corrupt record twice makes one quarantine copy. |
| P02-03 | **Change bus, live queries and other tabs.** `src/data/live.ts` wraps Dexie's `liveQuery` so a subscriber that starts while a write is in flight still ends on the committed value (R06.3), equal consecutive results are not re-emitted (structural compare), and errors are delivered as values. `src/data/useLive.ts`: a React hook on `useSyncExternalStore` with a loading state (no extra dependency). `src/data/bus.ts`: a `BroadcastChannel('platewise')` wrapper for app messages that are not table changes: `erase`, `reload-needed`, `goal-reached`, `settings-loaded`. Cross-tab table changes rely on Dexie's own propagation; the test proves it. | `A/data/ConsistentDataStore.kt` [43: all]; `T/data/ConsistentDataStoreTest.kt` [150] | `src/data/live.ts`, `src/data/live.test.ts`, `src/data/useLive.ts`, `src/data/useLive.test.ts`, `src/data/bus.ts`, `src/data/bus.test.ts` | subscribe during an open write transaction → the final value arrives; two Dexie instances on one fake database (two tabs): a write in one updates the other's live query; writing an identical row does not re-render; a thrown query surfaces as an error value; bus messages reach a second channel. |
| P02-04 | **Settings repository and schema.** `src/data/settingsSchema.ts` lists every v1 setting with key, default and validator (17-naming §1 has the key names): display appearance/accent/week start, units, grams first, meal times, Home pillars and sort, hidden tabs, add-menu layout, product block and hidden fields, count-today, water (on, goal ml, unit, quick-add ml), fasting (on, default goal min), reminders (master, breakfast/lunch/dinner/summary/water with on and `HH:MM`, fasting goal, goal reached), AI settings (non-secret), optional nutrient goals, rebuild baseline, tune-up (on, last check, saved plan), onboarding (done, terms), storage (persistence asked), backup (last at). Defaults per D-16.41 (every reminder off) and the specs. `src/data/repos/settingsRepo.ts`: `get`, `set` (validated), `update(key, fn)` as one read-modify-write transaction, `toggleHiddenTab(tab, hidden)` that reads the stored set inside the write and changes only that tab (R05.13), `snapshot()`, and `loaded`, a promise that resolves once the first snapshot is in memory (R06.22). An invalid stored value reads as its default and is quarantined, never overwritten silently. | `A/data/PreferencesStore.kt` [1 739: search `private object Keys` (lines 1588–1700) for the inventory of settings only]; spec 06 §2 and §3.2–3.10 | `src/data/settingsSchema.ts`, `src/data/settingsSchema.test.ts`, `src/data/repos/settingsRepo.ts`, `src/data/repos/settingsRepo.test.ts` | defaults when empty; invalid stored accent → default and quarantined; `update` from two concurrent callers keeps both changes; hiding Coach while a stale copy shows Progress hidden keeps both hidden; `loaded` resolves after the first read; every reminder defaults to off; the tune-up switch reads on when absent. |
| P02-05 | **Profile repository.** `src/data/repos/profileRepo.ts`: `get()` → missing / ok / corrupt through the guard; `save(profile)` quarantines a corrupt stored record first (R01.17); `update(fn)` refuses to run on a corrupt record instead of starting from defaults; birth dates are stored as local day keys. Profile changes reach live queries like any table. | `A/data/ProfileRepository.kt` [18]; `A/data/PreferencesStore.kt` [1 739: lines 230–260 profile only] | `src/data/repos/profileRepo.ts`, `src/data/repos/profileRepo.test.ts` | missing → `missing`; save then get round trip; corrupt stored JSON → `corrupt`, save quarantines then writes; `update` on corrupt rejects and changes nothing. |
| P02-06 | **Diary repository.** `src/data/repos/diaryRepo.ts` (02 §3.20, R02.24, R06.2). Writes: `add(entry)`, `addMany(entries)`, `update(entry)`, `remove(id)`, `combine(newEntry, removedIds)`, `endFastAndAdd(entry, now)` (D-16.35). Every write that creates a food row opens one read-write transaction over `entries` and `fasts`, reads for an active fast, and throws `FastActiveError` before writing anything when one exists (R05.1, R02.12); `endFastAndAdd` ends the fast and adds the entry in the same transaction. Reads: `byDay(dayKey)` newest first, `between(firstKey, lastKey)`, `since(ms)`, `latestLabelFor(barcodeKey)` (most recent label-sourced entry with that normalised barcode), `count()`. `dayKey` and `barcodeKey` are derived on write. Unreadable rows are dropped from reads and kept (P02-02). | `A/data/FoodRepository.kt` [428: all except the health-store retry]; `I/Stores/FoodStore.swift` [757: lines 1–186, 305–500]; `IT/FastingStoreTests.swift` [125: `activeFastBlocksFoodUntilItEnds`] | `src/data/repos/diaryRepo.ts`, `src/data/repos/diaryRepo.test.ts` | add during an active fast throws `FastActiveError` and nothing is written; `endFastAndAdd` ends the fast and adds atomically (a forced failure after the end leaves both unchanged); combine removes the originals and adds one row in one transaction; `byDay` across midnight in New York; `latestLabelFor` matches a UPC-A against its EAN-13 form. |
| P02-07 | **Photo store and reference-checked cleanup.** `src/data/repos/photoRepo.ts` (02 §3.19, R02.8, R06.18). `put(blob, {thumb, width, height})` → id; `get`, `getThumb`, `setThumb`; `references()` collects every photo id used by entries (including ingredient lines), saved meals and drafts (analysis and capture); if any row of those tables cannot be read the result is `unknown` and no photo is deleted. `releaseIfUnused(ids)` deletes only the given ids that nothing references (after an edit removed them); `prune()` deletes every unreferenced photo; both do nothing while the `restoring` meta flag is set. `usage()` sums photo and thumbnail bytes for the storage card. Coach thumbnails live in their own messages and are not shared. | `A/services/FoodImageStore.kt` [576: store, prune and reference parts]; `I/Services/FoodImageStore.swift` [383: prune]; `T/models/FoodEntryPhotoRemovalTest.kt` [147]; `IT/FoodPhotoRemovalTests.swift` [280] | `src/data/repos/photoRepo.ts`, `src/data/repos/photoRepo.test.ts` | a photo shared by an entry and a saved meal survives deleting the entry; removing it from one entry keeps the saved meal's copy; an unreadable saved-meal row makes `prune` delete nothing; `restoring` flag → no deletion; `usage` sums bytes. |
| P02-08 | **Weight and body-fat repositories.** `src/data/repos/weightRepo.ts` and `bodyFatRepo.ts` (05 §3.5.3–3.5.5, R05.8). `addWeighIn({at, kg})` runs in one transaction with `profile`: the profile weight becomes the latest weigh-in by date when it differs by more than 0.01 kg; it evaluates `crossesGoal` (P01-19) against the previous latest and returns `{entry, goalReached}`; when true it also posts `goal-reached` on the bus, so every caller path (Progress, Settings weight edit, Coach later) raises the dialog (R01.11). `deleteWeighIn(id)` re-syncs to the new latest when any remain. `seedFirst(kg, at)` is idempotent. Body fat: add/delete keep the profile's body fat on the latest reading; deleting the last reading leaves the profile value as it was. Queries by window for charts and history lists (newest first). | `A/data/WeightRepository.kt` [236: add, delete, profile sync, goal crossing; skip health import]; `A/data/BodyFatRepository.kt` [181]; `I/Stores/WeightStore.swift` [328]; `I/Stores/BodyFatStore.swift` [106]; `IT/WeightHistoryTests.swift` [318] | `src/data/repos/weightRepo.ts`, `src/data/repos/weightRepo.test.ts`, `src/data/repos/bodyFatRepo.ts`, `src/data/repos/bodyFatRepo.test.ts` | back-dated weigh-in does not change the profile weight and never posts `goal-reached`; a new latest crossing the lose target posts once; deleting the latest re-syncs; seeding twice adds one row; deleting the last body-fat reading keeps the profile value. |
| P02-09 | **Water and fasting repositories.** `src/data/repos/waterRepo.ts`: add (ml ≥ 1) and delete; queries by day. `src/data/repos/fastRepo.ts` (05 §3.7, R05.2, R05.3): `start(goalMin, now)`, `end(id, now)` (end never before start), `cancel(id)` (deletes the active fast), `edit(id, changes)`, `endNow(id, changes, now)` and `remove(id)`; every operation validates against the stored list with P01-19 inside one transaction and returns a refusal reason instead of throwing for overlaps. `setTracking(on, now)` writes the setting and, when turning off, ends (not deletes) an active fast in the same transaction. `settleOnOpen(now)` ends an active fast when tracking is off (after a restore or import). | `A/data/FastingRepository.kt` [91]; `A/data/WaterRepository.kt` [36]; `I/Stores/FastingStore.swift` [131]; `IT/FastingStoreTests.swift` [125: `disablingTrackingPreservesWaterAndCompletesActiveFast`] | `src/data/repos/waterRepo.ts`, `src/data/repos/waterRepo.test.ts`, `src/data/repos/fastRepo.ts`, `src/data/repos/fastRepo.test.ts` | second start refused; overlapping edit refused and data unchanged; `endNow` with a new start applies both or neither; tracking off ends the active fast and keeps water logs; `settleOnOpen` ends a restored active fast when tracking is off; cancel removes it from history. |
| P02-10 | **Saved meals repository.** `src/data/repos/savedMealsRepo.ts` (D-16.17). Saved meals are snapshots with their own ids and an `order`; `toggleFromEntry(entry)` removes the saved meal whose `originEntryId` is that entry, else appends a copy with a new id; `isSaved(entryId)`; `remove(id)`; `move(from, to)` removes at `from` and inserts at `to` clamped to the list; edits to the original entry never change the snapshot. | `A/data/PreferencesStore.kt` [1 739: search `favoriteFoodEntries` only]; spec 02 §3.16 | `src/data/repos/savedMealsRepo.ts`, `src/data/repos/savedMealsRepo.test.ts` | toggle twice returns to empty; two entries with the same name and kcal are saved separately (no key collision); move 0 → 9 in a list of 3 lands last; editing the original keeps the snapshot. |
| P02-11 | **Coach message repository.** `src/data/repos/coachRepo.ts` (04 §3.7, D-16.29, R04.7, R04.8): one record per message (`id, role, text, at, thumb?: Blob, state?`); appends go through an in-process queue so concurrent appends keep order; after each append only the newest 200 messages remain (the oldest are deleted in the same transaction); `list()` oldest first; `patch(id, changes)` for retry state; `reset()` deletes every message and increments the conversation generation in `meta`; `generation()`. Unreadable rows are quarantined and skipped, never overwritten. | `A/data/ChatRepository.kt` [65]; `I/Stores/ChatStore.swift` [103] | `src/data/repos/coachRepo.ts`, `src/data/repos/coachRepo.test.ts` | 205 appends keep the newest 200; two parallel appends land in call order; reset empties and bumps the generation; a corrupt row is quarantined and the rest still list. |
| P02-12 | **Secrets repository.** `src/data/crypto.ts`: generate a non-extractable AES-GCM 256 key once and keep it in `meta` (structured clone of a CryptoKey), encrypt and decrypt strings with a fresh 12-byte IV. `src/data/repos/secretsRepo.ts` (D-16.7, Proposed D-16.51, R03.27): `set(slot, value)` trims and stores `{iv, data}`; blank deletes; `get(slot)`; `slots()` lists slots that hold a key without returning values; slots are provider ids and `fdc`. If the wrapping key is missing or a value fails to decrypt, every slot reads as unset and the table is cleared so the person re-enters keys; nothing throws at start-up. `mask(value)` → first 4, "…", last 4 (8 characters or fewer → dots only). This table is never read by export or backup code (enforced by a P09 test). | `A/data/KeyStore.kt` [129: all]; `I/Services/KeychainHelper.swift` [42] | `src/data/crypto.ts`, `src/data/crypto.test.ts`, `src/data/repos/secretsRepo.ts`, `src/data/repos/secretsRepo.test.ts` | round trip; " sk-abc \n" stored as "sk-abc"; blank deletes; stored bytes do not contain the plain key; deleting the wrapping key → `get` returns null for all and the table is empty, no throw; mask of a 40-character key shows 4 + … + 4. |
| P02-13 | **Drafts repository.** `src/data/repos/draftsRepo.ts` (02 §3.10, D-16.46, R02.10). The analysis draft is one record with a generation counter: `begin()` increments it and returns the photo ids of the previous draft so the caller can release them; `saveResult(gen, payload)` stores only when `gen` is current, else returns `stale` (the caller then releases the blobs it wrote); `load()`; `clear(gen?)`. The capture draft (photo ids, note, progressive flag) has its own record with `save` and `clear`; operations are serialised. | `A/models/PendingFoodAnalysisDraft.kt` [21]; `A/ui/home/HomeViewModel.kt` [1 255: lines 440–700 draft handling]; `T/ui/home/PendingReviewStateTest.kt` [73] | `src/data/repos/draftsRepo.ts`, `src/data/repos/draftsRepo.test.ts` | a result saved with an old generation is refused as stale; `begin` returns the previous photo ids; reload → `load` returns the saved draft; capture draft survives reopen; clear with an old generation does not clear a newer draft. |
| P02-14 | **Erase, persistence and storage estimates.** `src/data/wipe.ts`: `eraseEverything()` posts `erase` on the bus (other tabs close their connection and show a notice), closes our connection, deletes the database, deletes Cache Storage entries with the `platewise-` prefix and `localStorage` keys with the same prefix; a `blocked` delete is retried once after the broadcast and then reported. `src/data/storage.ts` (D-16.8, R06.19): `requestPersistence()` calls `navigator.storage.persist()` once and records the answer; `persistenceStatus()`; `estimate()` (quota, usage) with graceful absence of the API. | spec 06 §3.15 and §5 (no reference counterpart for the web parts); `A/ui/settings/SettingsViewModel.kt` [1 727: lines 1469–1500 delete-all order] | `src/data/wipe.ts`, `src/data/wipe.test.ts`, `src/data/storage.ts`, `src/data/storage.test.ts` | erase deletes every table and our cache entries but not foreign ones; a second open connection receives `erase` and closes; blocked delete reports after one retry; `persist()` called once even when asked twice; missing `navigator.storage` → status `unknown`. |
| P02-15 | **Feature hooks.** `src/data/hooks.ts`: the only data API features use for reading: `useProfile`, `useSettings(keys)` (suspends until `loaded`), `useDayEntries(dayKey)`, `useEntriesBetween(a, b)`, `useDayWater(dayKey)`, `useFasts(a, b)`, `useActiveFast()`, `useWeighIns(a, b)`, `useBodyFat(a, b)`, `useSavedMeals()`, `useCoachMessages()`, `useTargets()` (profile + P01-13), `useUnreadableFlag()`. Each is a thin `useLive` call; no business rules. | none | `src/data/hooks.ts`, `src/data/hooks.test.ts` | `renderHook` with fake-indexeddb: a write after mount re-renders with new data; `useSettings` waits for `loaded`; `useTargets` follows a saved-target change; unmount stops the subscription. |

## Files to create (47)

| Path (under `platewise/`) | What it holds | Task |
|---|---|---|
| `src/data/schema.ts` | Database name, version, tables, indexes, upgrade registry | P02-01 |
| `src/data/schema.test.ts` | Tests for `schema.ts`: the Verify cases of P02-01 | P02-01 |
| `src/data/db.ts` | Open, error mapping, versionchange handling | P02-01 |
| `src/data/db.test.ts` | Tests for `db.ts`: the Verify cases of P02-01 | P02-01 |
| `src/test/factories.ts` | Record builders for tests | P02-01 |
| `src/data/guard.ts` | Lenient decode, missing/ok/corrupt, quarantine, write block | P02-02 |
| `src/data/guard.test.ts` | Tests for `guard.ts`: the Verify cases of P02-02 | P02-02 |
| `src/data/live.ts` | Live query wrapper with dedupe | P02-03 |
| `src/data/live.test.ts` | Tests for `live.ts`: the Verify cases of P02-03 | P02-03 |
| `src/data/useLive.ts` | React hook over live queries | P02-03 |
| `src/data/useLive.test.ts` | Tests for `useLive.ts`: the Verify cases of P02-03 | P02-03 |
| `src/data/bus.ts` | App message bus across tabs | P02-03 |
| `src/data/bus.test.ts` | Tests for `bus.ts`: the Verify cases of P02-03 | P02-03 |
| `src/data/settingsSchema.ts` | Every v1 setting: key, default, validator | P02-04 |
| `src/data/settingsSchema.test.ts` | Tests for `settingsSchema.ts`: the Verify cases of P02-04 | P02-04 |
| `src/data/repos/settingsRepo.ts` | Typed settings access, RMW updates, load gate | P02-04 |
| `src/data/repos/settingsRepo.test.ts` | Tests for `settingsRepo.ts`: the Verify cases of P02-04 | P02-04 |
| `src/data/repos/profileRepo.ts` | Single profile record with corruption safety | P02-05 |
| `src/data/repos/profileRepo.test.ts` | Tests for `profileRepo.ts`: the Verify cases of P02-05 | P02-05 |
| `src/data/repos/diaryRepo.ts` | Food entries: transactional writes, fast check, queries | P02-06 |
| `src/data/repos/diaryRepo.test.ts` | Tests for `diaryRepo.ts`: the Verify cases of P02-06 | P02-06 |
| `src/data/repos/photoRepo.ts` | Photo blobs, thumbnails, reference-checked deletion | P02-07 |
| `src/data/repos/photoRepo.test.ts` | Tests for `photoRepo.ts`: the Verify cases of P02-07 | P02-07 |
| `src/data/repos/weightRepo.ts` | Weigh-ins with profile sync and goal events | P02-08 |
| `src/data/repos/weightRepo.test.ts` | Tests for `weightRepo.ts`: the Verify cases of P02-08 | P02-08 |
| `src/data/repos/bodyFatRepo.ts` | Body-fat readings with profile sync | P02-08 |
| `src/data/repos/bodyFatRepo.test.ts` | Tests for `bodyFatRepo.ts`: the Verify cases of P02-08 | P02-08 |
| `src/data/repos/waterRepo.ts` | Water logs | P02-09 |
| `src/data/repos/waterRepo.test.ts` | Tests for `waterRepo.ts`: the Verify cases of P02-09 | P02-09 |
| `src/data/repos/fastRepo.ts` | Fasts with atomic validation and tracking switch | P02-09 |
| `src/data/repos/fastRepo.test.ts` | Tests for `fastRepo.ts`: the Verify cases of P02-09 | P02-09 |
| `src/data/repos/savedMealsRepo.ts` | Saved meals with own ids and order | P02-10 |
| `src/data/repos/savedMealsRepo.test.ts` | Tests for `savedMealsRepo.ts`: the Verify cases of P02-10 | P02-10 |
| `src/data/repos/coachRepo.ts` | Per-message storage, 200 cap, generations | P02-11 |
| `src/data/repos/coachRepo.test.ts` | Tests for `coachRepo.ts`: the Verify cases of P02-11 | P02-11 |
| `src/data/crypto.ts` | Wrapping key and AES-GCM helpers | P02-12 |
| `src/data/crypto.test.ts` | Tests for `crypto.ts`: the Verify cases of P02-12 | P02-12 |
| `src/data/repos/secretsRepo.ts` | Per-slot keys, masking, recovery | P02-12 |
| `src/data/repos/secretsRepo.test.ts` | Tests for `secretsRepo.ts`: the Verify cases of P02-12 | P02-12 |
| `src/data/repos/draftsRepo.ts` | Analysis and capture drafts with generations | P02-13 |
| `src/data/repos/draftsRepo.test.ts` | Tests for `draftsRepo.ts`: the Verify cases of P02-13 | P02-13 |
| `src/data/wipe.ts` | Erase everything, across tabs | P02-14 |
| `src/data/wipe.test.ts` | Tests for `wipe.ts`: the Verify cases of P02-14 | P02-14 |
| `src/data/storage.ts` | Persistence request and estimates | P02-14 |
| `src/data/storage.test.ts` | Tests for `storage.ts`: the Verify cases of P02-14 | P02-14 |
| `src/data/hooks.ts` | Read hooks for features | P02-15 |
| `src/data/hooks.test.ts` | Tests for `hooks.ts`: the Verify cases of P02-15 | P02-15 |

## Files to update (0)

None.

## Migrations and fixtures (0)

None. The IndexedDB schema stays at version 1 until a later phase needs an upgrade step (P02-01 registry).

## Task notes (15)

`docs/notes/P02/<slug>.md`, one per task, from `docs/notes/_template.md`, written before the code:

- `docs/notes/P02/dexie-schema-open-and-upgrade-safety.md` (P02-01)
- `docs/notes/P02/record-guard-and-quarantine.md` (P02-02)
- `docs/notes/P02/change-bus-live-queries-and-other-tabs.md` (P02-03)
- `docs/notes/P02/settings-repository-and-schema.md` (P02-04)
- `docs/notes/P02/profile-repository.md` (P02-05)
- `docs/notes/P02/diary-repository.md` (P02-06)
- `docs/notes/P02/photo-store-and-reference-checked-cleanup.md` (P02-07)
- `docs/notes/P02/weight-and-body-fat-repositories.md` (P02-08)
- `docs/notes/P02/water-and-fasting-repositories.md` (P02-09)
- `docs/notes/P02/saved-meals-repository.md` (P02-10)
- `docs/notes/P02/coach-message-repository.md` (P02-11)
- `docs/notes/P02/secrets-repository.md` (P02-12)
- `docs/notes/P02/drafts-repository.md` (P02-13)
- `docs/notes/P02/erase-persistence-and-storage-estimates.md` (P02-14)
- `docs/notes/P02/feature-hooks.md` (P02-15)

## Run until green

```bash
cd platewise
pnpm install --frozen-lockfile
pnpm lint && pnpm fmt:check && pnpm typecheck && pnpm test   # fix and re-run until all pass
pnpm build && pnpm e2e                                        # browser tests, mobile viewport
PLATEWISE_REF=/root/reference/fud-ai pnpm check --require-ref # similarity, banned, assets, licences, traps, acceptance
```

Phase additions, inside the same loop:

```bash
pnpm test src/data --reporter=verbose
```

On any failure, fix the cause and run the whole loop again from `pnpm install`. Never skip a test, widen an allow-list without a written reason, or edit a recorded fixture to make a test pass. Real waits are banned in tests: use fake timers (`vi.useFakeTimers()`) and the clock helpers in `src/test/time.ts`.

## Compare checklist (reopen the reference after writing)

- [ ] Every reference write path that guarded against unreadable data (lists and the profile) has a quarantine test here.
- [ ] The fast check runs inside the writing transaction, not before it (the reference's Android read-then-write race is closed).
- [ ] Weight/body-fat profile sync: latest by date, 0.01 kg threshold, last-body-fat-delete keeps the profile value.
- [ ] Photo cleanup: every owner the reference checks (rows, lines, saved meals, drafts) is in `references()`; unknown → no delete.
- [ ] Coach storage: deliberate difference, per-message rows and a 200 cap (D-16.29) instead of one blob kept forever.
- [ ] Every task note's compare section is ticked, each tick naming its test.
- [ ] Trap rows owned by this phase in `docs/internals/traps-ledger.md` now carry `Test:` lines (the lead updates the ledger at land time).
- [ ] Acceptance rows owned by this phase in `docs/internals/acceptance-map.md` now carry `Test:` lines.

## Done when

All repositories pass their tests with fake-indexeddb; the cross-tab and in-flight-write tests pass; lint shows no `dexie` import outside `src/data`. **Demo (M1, part 2):** `pnpm test src/data --reporter=verbose` shows the fast-blocks-food, quarantine and cross-tab cases passing.
