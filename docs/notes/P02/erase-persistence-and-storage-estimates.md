# Task: erase, persistence and storage estimates (P02-14) · Phase: 02 · Owner: builder (wt-p02s5)

<!-- Save as platewise/docs/notes/P<nn>/<slug>.md. Write everything above "Compare checklist"
BEFORE writing code, in your own words. Never paste or paraphrase the reference line by line. -->

Read (reference @ `10e14b67`): `A/ui/settings/SettingsViewModel.kt` lines 1469–1500 (the order of
Delete All Data: remote challenge first, rest timer, backup session forgotten before the wipe,
then the settings store, the key store and the photo files). Research spec `06-settings-data.md`
§3.15 (Clear Food Log, Delete All Data), §3.16 (storage card), §3.18, §5 (the web equivalents:
delete the database, owned Cache Storage entries and `localStorage`, `blocked` handled through a
broadcast; `storage.estimate()`; `storage.persist()`), §6 R06.5 and R06.19; decision D-16.8. The
web parts have no reference counterpart. No reference tests cover Delete All Data. No Evidence ids.

What it does (own words):
- Erase everything: tells every other open tab first (`erase` on the bus; those tabs close their
  connection and show a notice), closes this tab's connection, deletes the whole `platewise`
  database (every table, the keys and the device key with it), then deletes the Cache Storage
  entries and `localStorage` keys that start with `platewise-` and leaves anything else on the
  origin alone. If another connection still holds the database open, the browser reports the
  delete as blocked: the tab broadcasts `erase` again and gives the delete one more short window;
  if it is still blocked it reports that, and the pending delete finishes by itself once the last
  connection closes. The caller (the P09 Settings flow) turns backup off and stops reminders
  before calling it, and routes to onboarding after.
- Persistence (R06.19, D-16.8): browsers may evict a site's storage; asking for persistent
  storage protects the diary. `requestPersistence()` asks the browser once, ever: the fact that it
  asked is stored in the `storage.persistAsked` setting, so later calls, reloads and other tabs do
  not ask again; the answer is kept for the status. `persistenceStatus()` reads the browser's
  current answer (`persistent`, `best-effort`) or `unknown` when the browser cannot say.
  `estimate()` gives usage and quota for the storage card and the restore space check, or null.
  Without `navigator.storage` nothing throws: status `unknown`, estimate null.

Inputs → outputs:
- `eraseEverything({db, bus?, indexedDB?, caches?, localStorage?, wait?})` →
  `{status: 'erased'}` | `{status: 'blocked', finished}` (`finished` resolves true once the delete
  went through, false if it failed) | `{status: 'failed', cause}`.
- `closeOnErase(db, onErased, bus?)` → stop function: in the other tabs, closes the connection and
  calls `onErased` once when another tab erases.
- `createStorageAccess({settings, storage?})` → `{requestPersistence(), persistenceStatus(),
  estimate()}`; `settings` is the settings repository (`update`/`set` of
  `storage.persistAsked`), `storage` the `navigator.storage` seam.

Files: created `src/data/wipe.ts`, `src/data/wipe.test.ts`, `src/data/storage.ts`,
`src/data/storage.test.ts`, this note.

Edge cases / failure modes:
- A tab of an older build (or anything) that ignores both the broadcast and `versionchange` keeps
  the delete blocked: one retry after a second broadcast, then `blocked` is reported; the delete
  stays queued and completes when that tab closes.
- The other tab lets go during the retry window → `erased`.
- The browser refuses the delete (`error`) → `failed`; the caches and storage keys are still
  cleared, since the person asked for everything to go.
- No Cache Storage (insecure origin, tests) or `localStorage` that throws on access → those steps
  are skipped, never a throw.
- Foreign Cache Storage entries and `localStorage` keys (other apps on the same origin in dev, a
  bare `platewise` key) are kept.
- Our own tab's `erase` post is ignored by `closeOnErase` (only other tabs react); our tab closes
  its own connection directly.
- `persist()` asked twice in a row, concurrently, or after a reload → one browser call.
- `persist()` rejects → status `unknown`, nothing recorded, a later call may ask again.
- `persisted()` missing but `persist()` answered → the status is the recorded answer.
- `estimate()` missing, throwing, or without numbers → null.

Our design differences / decisions:
- Everything lives in one database, so Delete All Data is one database delete instead of clearing
  each store; the key store goes with it (its device key sits in `meta`).
- The `blocked` retry gives the still-queued delete one more window after a second broadcast; an
  IndexedDB delete cannot be re-issued on its own (a second request queues behind the first), so
  waiting on the first is the retry. Window: 2 s, injectable (`wait`) so tests need no timers.
- Backup, reminders and routing to onboarding stay with the caller (P09); this module only wipes.
- Persistence is asked once ever (setting), not on every launch; status always comes from the
  browser's `persisted()` when it exists.

Tests we will write:
- erase deletes every table (reopen → each table empty) and our cache entries and storage keys
  but not foreign ones.
- `erase` is posted before the delete; a second open connection receives `erase`, closes and
  calls its notice; our own post does not trigger `closeOnErase` here.
- a connection that never lets go: two `erase` broadcasts, `blocked` reported after one retry;
  closing it finishes the delete (`finished` → true, database gone).
- a connection that lets go after the second broadcast → `erased`.
- the browser refuses the delete → `failed`, caches still cleared.
- no Cache Storage and no `localStorage` → database still erased, no throw.
- `persist()` called once even when asked twice (sequential, concurrent, after a reload); the
  answer shows in the status; status from `persisted()`; a rejected `persist()` is not recorded.
- missing `navigator.storage` → status `unknown`, estimate null, request `unknown`, no throw.
- `estimate()` returns usage and quota; missing numbers or a throw → null.

Compare checklist (filled after the rewrite; reopened `A/ui/settings/SettingsViewModel.kt` lines
1469–1500):
- [x] Delete All Data clears every store the app keeps: settings, records, keys, photos
  (`src/data/wipe.test.ts > eraseEverything > deletes every table and our cache entries and
  storage keys, but not foreign ones`: every table, the secrets and their device key included,
  is empty after a reopen).
- [x] Only what the app owns is removed (same test: foreign cache entries and storage keys stay;
  `> uses the browser's localStorage and skips Cache Storage where there is none`).
- [x] Other open copies of the app stop using the data (web only: `wipe.test.ts > eraseEverything
  > posts erase before it lets go of the database`, `> makes a second open connection hear erase
  and close`; `wipe.test.ts > closeOnErase > closes on an erase from another tab and gives the
  notice once`, `> ignores this tab's own erase and other messages`).
- [x] A delete that cannot finish is reported, never claimed (web only: `wipe.test.ts >
  eraseEverything > reports a blocked delete after one retry, and finishes once the other
  connection lets go`, `> erases when the other connection lets go after the second broadcast`,
  `> reports a refused delete and still clears our cache entries and storage keys`, `> reports a
  cache that cannot be cleared, after the database is gone`).
- [x] Persistent storage is asked once and its status shown (R06.19, D-16.8; web only:
  `src/data/storage.test.ts > requestPersistence (R06.19, D-16.8) > asks the browser once even
  when asked twice, and shows the answer`, `> asks once when two calls overlap, and both get the
  answer`, `> does not ask again after a reload or from another tab`, `> keeps the answer for the
  status when the browser cannot be asked later`, `> records nothing when the browser fails to
  answer, so a later call asks again`, `> gives status unknown without navigator.storage, and
  never throws`, `> reads the browser status even when it was never asked here`; `storage.test.ts
  > estimate > returns usage and quota`, `> returns null when the browser leaves out a number or
  fails`).
- Deliberate differences: one database delete instead of clearing each store in turn; the steps
  the reference runs before the wipe (backup session forgotten, rest timer stopped, remote
  challenge prepared) belong to the caller (P09) or to later phases.
- Not taken: keeping a challenge token through the wipe (no remote challenge in v1), restarting
  into onboarding (the caller routes), cancelling notifications (P08's reminders, called by P09).

## Decisions for the lead

- The retry for a blocked delete is a second `erase` broadcast plus one more window (2 s,
  `RETRY_WINDOW_MS`) for the delete that is still queued; then `blocked` is reported with
  `finished`, which resolves once the queued delete goes through.
- Cache Storage entries and `localStorage` keys are cleared even when the database delete failed
  or is blocked; the first failure is reported as `failed` and the other steps still run.
- Backup off, reminders cancelled and the route to onboarding stay with the P09 caller (R06.5,
  R06.10); `eraseEverything` only wipes.
- The service worker (P10) must name its caches with the `platewise-` prefix, or Erase everything
  leaves them (a default `workbox-…` name would survive).
- Boot (P04) wires `closeOnErase(db, showNotice)` next to `openDb`. A tab that gets the delete's
  versionchange before the broadcast also hears `reload-needed` from `db.ts`; the notice should
  let the erase message win.
- Persistence: the request is claimed in one settings transaction (`storage.persistAsked` set
  before asking, given back when `persist()` rejects), so two tabs never both ask. The answer is
  not stored: `persisted()` reports it after a reload; a browser with `persist()` but no
  `persisted()` shows `unknown` after a reload.
- `createStorageAccess` takes the settings repository; the lead wires `requestPersistence` into
  the diary service after the first entry (D-16.8). A failing settings write makes the request
  return the status without asking, never throw.

## Status

Done (2026-10-26). Erase, the other-tab close, persistence and estimates in place; nothing outside
the task's files changed. `wipe.test.ts` 10, `storage.test.ts` 9, all passing.
