# Task: Health service and data (P11-03) · Phase: 11 · Owner: builder (wt-p11s2, slice S2)

Read (reference @ `10e14b67`): `A/services/health/HealthConnectManager.kt` (which record types are
read and written, the per-day step and energy totals and how a day with no active energy reads as
no burn, how its own records are told apart by their client record id), `A/data/WeightRepository.kt`
(the external weigh-in import: a fixed id per outside record, an upsert when the value or time
changed, deleted ids never coming back, the profile weight following the newest reading afterwards).
Research spec `07-later-phases-and-web.md` §3.7 (health stores) and trap R07.22 (deletions must not
come back); `05-home-progress.md` §3.5.5 (deleted ids kept so a re-import cannot resurrect them);
`01-profile-goals.md` §3.10 (Energy Burn stays out of P11). Phase file P11 (Goal, D-16.89, budget,
days, plugin contract).

What it does (own words): on the Android app only, Platewise reads the phone's Health Connect data
through a native plugin (built by S1 to the contract in the phase file) and keeps a copy per local
day: steps, active and total energy, distance and the day's workouts. The copy is refreshed for the
last 30 days when the app starts, each time it comes back to the front, and when the person asks.
Weigh-ins other apps recorded are added to the weight history under an id made from their Health
Connect id, so reading them again never doubles them, a corrected value replaces the old one, and a
reading the person deleted here stays deleted. When "write back" is on, every diary entry and every
weigh-in typed into Platewise in the last 30 days is sent to Health Connect under its own id as the
client record id: an edit sends the record again (it replaces the old one) and a delete removes it.
Nothing here ever blocks the diary: every failure is caught, logged and shown as a status on the
Settings page. On the web the service is never built and its code is never fetched.

Inputs → outputs:
- `contract.ts`: the plugin contract types exactly as in the phase file, the kind lists, the error
  codes and `healthErrorCode(error)` (reads `code` off a rejection, `unknown` otherwise).
- `platform.ts`: `isHealthAvailable()` → true only when `globalThis.Capacitor?.getPlatform?.()` is
  `'android'`.
- `native.ts`: `nativeHealthPlugin()` → `registerPlugin<HealthConnectPlugin>('HealthConnect')`.
- `load.ts`: `loadHealth(base, setup?)` → undefined on the web without importing anything; on
  Android imports `setup.ts` (one dynamic import: the repository, the native adapter with
  @capacitor/core, the service and the watch) and returns `{service, activityRepo}`.
- `setup.ts`: `setUpHealth(base, plugin?)` builds those parts from the composition root's
  repositories; `plugin` defaults to the native one.
- `records.ts` (pure): `syncWindow(today)`, `activityDays(window, totals, sessions, now)` → rows,
  `importedWeighIns(weights)`, `nutritionRecord(entry)`, `weightRecord(weighIn)`,
  `writeBackPlan(entries, weighIns, ledger, window)` → what to write, delete and forget.
- `service.ts`: `createHealthService({plugin, healthRepo, settingsRepo, diaryRepo, weightRepo,
  clock, visibility, watch})` → `{start, stop, subscribe, getSnapshot, refresh, connect,
  disconnect, sync, setCountActiveCalories, setImportWeights, setWriteBack, openHealthConnect,
  idle}`; the snapshot is `{availability, granted, syncing, lastSyncAt, failure}`.
- `watch.ts`: `storedHealthWatch({diaryRepo, weightRepo, clock, live})` → a watch over the
  entries and weigh-ins (live queries) that calls back after every change, from any screen or tab.
  `live` is handed in by `main.tsx`, so the lazy health chunk never carries the database library.
- Data: `activity` table (key: day key) with `{day, steps, activeKcal, totalKcal, distanceM,
  sessions, syncedAt}` added by schema version 2; `healthRepo` (`between`, `putDays`,
  `importWeighIns`, the write-back ledger, the last sync time); the four settings
  `health.connected` (false), `health.countActiveCalories` (true), `health.writeBack` (false),
  `health.importWeights` (true); `useActivity(first, last)` read hook.

Files: created `src/services/health/{contract,platform,native,load,setup,records,service,watch}.ts`,
`src/services/health/testing/fakeHealthPlugin.ts`, `src/data/repos/healthRepo.ts` and tests next to
each. Changed (shared, only the lines needed): `src/data/schema.ts` (row types, upgrade step 2),
`src/data/guard.ts` (the guarded table type includes the added table), `src/data/repos/weightRepo.ts`
(exports the "profile weight follows the newest reading" step for the import),
`src/data/settingsSchema.ts` (four settings), `src/data/DataProvider.tsx` (optional
`activityRepo`), `src/data/hooks.ts` (`useActivity`), `src/services/context.tsx` (optional
`health`), `src/main.tsx` (build, start and hand out the service), and the tests of those files
whose fixed expectations change (`schema.test.ts`, `db.test.ts`, `settingsSchema.test.ts`).

Edge cases / failure modes:
- Web or iOS build: no Capacitor global or another platform → no service, no import of the
  adapter, no table reads; the settings exist but nothing shows them.
- Health Connect missing, needing an update or unsupported: no reads; the status says which.
- Connect refused (nothing granted): `health.connected` stays off.
- Some kinds granted: the plugin answers null for the others; those values are stored as null.
- Every read permission revoked after connecting: no reads, stored days kept, status "revoked".
- A day Health Connect has nothing for: no row is made; an existing row is overwritten with empty
  values (so data removed in Health Connect goes away here too).
- A second sync with the same answers writes no row (rows are compared without `syncedAt`).
- Bad values from the plugin (negative, not finite, a day outside the window, an unreadable time):
  dropped value by value; a session without a readable start and end is dropped.
- Weigh-ins: id `health-<Health Connect id>`; same value and time → nothing written; a changed value
  or time → replaced; an id imported before and no longer stored → the person deleted it → skipped
  (R07.22). A non-positive weight or unreadable time is skipped. The profile weight follows the
  newest reading, as for any weigh-in; no goal-reached check (an import is history, not a new
  reading typed in).
- Write-back: only entries whose day is in the window and weigh-ins typed here (not imported);
  unchanged records (same fingerprint as last sent) are not sent again; a record whose day left the
  window is forgotten, not deleted; a failed call leaves the ledger as it was, so the next pass
  retries; nothing is sent for a kind without write permission.
- Overlapping triggers: one sync and one write-back pass at a time; a change during a pass runs one
  more pass after it.
- The plugin rejects (`rateLimited`, `permissionDenied`, …): caught; the status keeps the code; the
  diary is never touched by the failure.

Our design differences / decisions:
- Names, structure and words are ours. The native side does the per-day aggregation (S1); the web
  side only stores and shows what it is given, in the diary's day keys.
- The activity copy lives in its own table added by schema version 2 and stays out of backups (it is
  read again from Health Connect); the write-back ledger, the imported weigh-in ids and the last sync
  time are device state in `meta` (never in a backup, removed by Erase everything).
- Tombstones are "imported once" ids: an imported weigh-in that is no longer stored was deleted here
  and is never imported again (R07.22). A backup restored after an import cannot bring such a
  reading back by sync either; it comes back only by typing it.
- Write-back reconciles instead of hooking every writer: a watch over the entries and weigh-ins
  starts a pass after any change (add, edit, delete, copy a day, combine, Coach, import, restore),
  and the pass compares what is stored with what was last sent. This also sends a 30-day backlog
  when write-back is turned on.
- Turning write-back off keeps what was sent in Health Connect and the ledger; turning it on again
  sends what changed meanwhile and removes what was deleted meanwhile.
- Disconnect only stops reading and counting; access is removed in Health Connect itself (the page
  says so and opens it).

Tests we will write:
- `contract.test.ts`: the kind lists match the contract; `healthErrorCode` reads the codes.
- `platform.test.ts`: true only for an Android Capacitor global.
- `load.test.ts`: on the web nothing is imported and no service comes back; on Android both modules
  are imported and a service comes back.
- `records.test.ts`: days in the window only, bad values dropped, sessions by day; weigh-in ids;
  nutrition and weight records; the write-back plan writes new and changed, deletes removed,
  forgets old, skips unchanged and imported weigh-ins.
- `healthRepo.test.ts`: `putDays` writes changed rows only; `between`; `importWeighIns` adds,
  replaces a changed one, never doubles, never brings back a deleted one, moves the profile weight;
  the ledger and last sync time round-trip; damaged rows are kept aside.
- `service.test.ts` (fake plugin, real repositories over a test database): sync fills 30 days; a
  second sync changes nothing; weigh-ins imported once; revoked permissions show and skip reads;
  start and visibility trigger syncs; failures never throw and show in the status; write-back calls
  follow add, edit and delete and weigh-ins, only when on; connect, refusal and write permission
  requests.
- `watch.test.ts`: the watch calls back after an entry or weigh-in change.
- `schema.test.ts`, `db.test.ts`: version 2 adds the empty activity table and keeps every row.
- `settingsSchema.test.ts`: the four settings and their defaults.
- `hooks.test.tsx`: `useActivity` reads the days, and is empty without an activity source.

Decisions for the lead:
- `health.connected` is a setting, so a backup carries it to another device, where the page then
  shows the access as removed with "Grant access". Adding it to the backup's device-local settings
  (`src/services/backup/hash.ts`) would keep it home; not done here (not my file).
- The exercise `type` strings come from S1's plugin; the Home card names a few common ones and
  falls back to "Workout" (see the UI note).
- Weigh-in times and nutrition times are sent as ISO 8601 instants in UTC (`toISOString()`).

Compare checklist (filled after the rewrite; reopened `A/services/health/HealthConnectManager.kt`
(permissions list, own-record tagging, weight write and delete, daily steps and energy reads),
`A/data/WeightRepository.kt` (import, merge, deleted ids, profile sync), `A/FudAIApp.kt` (the
read sync: when it runs, retry on failure) and `A/ui/home/HomeScreen.kt` (re-read on resume)):
- [x] the read kinds and the write kinds are the contract's, requested together on Connect and
      writes only when write-back is turned on (`service.test.ts > connect and disconnect >
      connects when access is allowed and syncs at once`; `> write-back (D-16.89) > asks for write
      access when turned on, and stays off when it is refused`)
- [x] daily totals stored per diary day key, last 30 days, a day with nothing as nulls, bad values
      dropped, workouts on their day once (`records.test.ts > activityDays > makes one row per
      day of the window, oldest first, with the totals of each day`, `> drops days outside the
      window, bad day keys and unusable values`, `> puts each workout on its day once, in start
      order, and drops unreadable ones`; `service.test.ts > sync (P11-03) > fills the last 30 days
      from Health Connect and keeps the sync time`)
- [x] a second sync with the same answers writes nothing; no duplicate weigh-ins
      (`service.test.ts > sync (P11-03) > changes nothing on a second sync with the same answers`;
      `healthRepo.test.ts > putDays > writes nothing for the same values again, whatever the sync
      time`; `healthRepo.test.ts > importWeighIns (R07.22) > never doubles a reading read again,
      and replaces one whose value changed`)
- [x] an imported reading deleted here never comes back (R07.22) (`healthRepo.test.ts >
      importWeighIns (R07.22) > never brings back a reading the person deleted here`)
- [x] the profile weight follows the newest reading after an import; no goal-reached check
      (`healthRepo.test.ts > importWeighIns (R07.22) > adds readings under their import ids and
      moves the profile weight to the newest`; `service.test.ts > sync (P11-03) > imports weigh-ins
      once under their Health Connect ids, and none while importing is off`)
- [x] a kind not granted reads as null; all reads revoked → nothing read, status shows it
      (`service.test.ts > sync (P11-03) > stores null for a kind that is not allowed`, `> shows
      revoked permissions and reads nothing`)
- [x] sync on start and every return to the front (`service.test.ts > triggers > syncs when
      started and each time the page comes back to the front`)
- [x] a failed read is retried by the next sync and never blocks anything (`service.test.ts >
      sync (P11-03) > keeps a failure in the status without rejecting, and clears it on the next
      success`)
- [x] write-back under our own ids: an edit sends the same client id again, a delete removes it;
      weigh-ins typed here only (`service.test.ts > write-back (D-16.89) > sends the window's
      entries when turned on, then follows add, edit and delete`, `> sends weigh-ins typed here and
      removes deleted ones, never imported ones`)
- [x] a failed write is sent again later (`service.test.ts > write-back (D-16.89) > sends a change
      again after a failed send`)
- [x] the web build never loads the adapter (`load.test.ts > loadHealth > fetches nothing and
      builds nothing on the web, where there is no Capacitor bridge`; `platform.test.ts >
      isHealthAvailable > is true only inside the Android shell`; `pnpm check:bundle`: Capacitor is
      only in the lazy `setup` chunk)
- [x] schema version 2 keeps every row and adds an empty table (`schema.test.ts > schema version 2
      (P11-03) > moves a version 1 database with rows in every table to version 2, every row kept
      and the activity table empty`; `schema.test.ts > upgrade steps keep data > runs every
      registered step without losing a row`)
- Deliberate differences: the reference reads weigh-ins through change tokens with a long first
  backfill and also body fat; we read the last 30 days of weigh-ins each sync (the phase's window)
  and no body fat (not in the contract). The reference queues failed writes in a background worker
  with retries; we keep a ledger of what was sent and reconcile on the next pass (start, return,
  any change), which also covers every writer without hooks. The reference subtracts its own
  workout burns from the energy totals; we write no burns, and own records are left out by the
  plugin (contract).
- Not taken: importing nutrition from other apps, body fat sync, the reference's restore of its
  own records after a reinstall (backups cover that here), Energy Burn for Adaptive Goals (later
  item, phase file).

## Status

Done (2026-10-27). P11-03 finished: contract, platform check, native adapter behind one dynamic
import, fake plugin, sync service, activity table (schema version 2), health settings, write-back.
Lines changed outside the task's own files: `src/data/guard.ts` (guarded table type),
`src/data/repos/weightRepo.ts` (exported `followNewestWeighIn`, same rule as before),
`src/data/DataProvider.tsx` and `src/data/hooks.ts` (optional activity source, `useActivity`),
`src/data/schema.test.ts`, `src/data/db.test.ts` (version-dependent expectations),
`src/data/settingsSchema.test.ts`, `src/services/context.tsx`, `src/main.tsx`. Handed on to S3
(P11-05): the M11 acceptance rows, D-16.89 in 16-what-we-change, the new setting keys and the
`activity` table in the naming table (17 §1.3).
