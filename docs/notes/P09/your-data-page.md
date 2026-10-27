# Task: Your data page, storage card and persistence (P09-15) · Phase: 09 · Owner: builder (wt-p09s15)

<!-- Save as platewise/docs/notes/P<nn>/<slug>.md. Write everything above "Compare checklist"
BEFORE writing code, in your own words. Never paste or paraphrase the reference line by line. -->

Read (reference @ `10e14b67`): `android/.../ui/settings/StorageSettingsCard.kt` (all: rows, "…"
until measured, the busy gate, Clear Cache), `android/.../services/StorageMaintenance.kt` (the
measure and clear-cache parts; one action at a time; measured on open and after each action),
`android/.../ui/settings/SettingsViewModel.kt` lines 1469–1500 (Delete All Data order: backup
session forgotten before the wipe, then store, keys and photos; Clear Food Log empties the food log
and prunes photos), the Data Management section of `SettingsScreen.kt` (row order and the two
confirm dialogs, behaviour only), the test names of `StorageMaintenanceTest.kt`. Research spec
`06-settings-data.md` §3.15–3.16, §3.18, §5; traps R06.5, R06.15, R06.19; decision D-16.8. Our
own P02-14 note (`erase-persistence-and-storage-estimates.md`) and the P09-13 note
(`backup-and-restore.md`). No REA evidence for this task.

What it does (own words): Settings gets a "Your data" page that gathers everything about the
person's stored data. From the top: the Backup card (P09-13, with Restore from a file), a Diary
file card with Export and Import (the P09-10/11 sheets), the Storage card, then a card with the two
destructive actions. Clear diary asks first, then removes every diary entry and the photos nothing
else uses; the profile, weights, water, fasts, saved meals (with their photos) and settings stay.
Erase everything asks first, then makes any backup already running unable to record success,
stops the reminder timers, deletes the whole database (every tab is told), and restarts the app on
Welcome; another open tab hears the erase and restarts too. The Storage card shows the bytes of the
stored photos and of their thumbnails, how much the site uses of its quota, and whether the browser
keeps the data for good ("persistent") or may clear it; each value is "…" until measured; Clear
cache drops thumbnails only (they are made again when next shown); one action at a time. Behind
the page, the storage nudge asks the browser for persistent storage once, after the first logged
entry; when the answer is no (or unknown) or the app is not installed, Home shows one dismissible
card suggesting to install the app and to back up; and once the last backup (or the first entry,
when there is none) is more than 14 days old, Home shows a backup reminder. The card is worked out
as the app opens, never in the middle of a visit, and sits under the diary. A nudge counts as
done only when it was drawn and then dismissed or acted on (R06.15).

Inputs → outputs:
- `createYourDataService({transferRepo, photoRepo, storage, backup, reminders, erase, restart})`
  (`src/services/yourData.ts`) → `{measure(), clearCache(), clearDiary(), eraseEverything(),
  restart()}`. `measure` → `{photoBytes, thumbBytes, estimate: {usage, quota} | null,
  persistence}`; `clearCache` → thumbnails dropped (count); `clearDiary` → entries removed (count),
  photos released; `eraseEverything` → `{kind: 'erased' | 'blocked' | 'failed'}`, restarting by
  itself after `erased` and once a blocked delete went through.
- `createStorageNudge({storage, settingsRepo, clock, installed?, memory?})`
  (`src/services/storageNudge.ts`) → `{afterFirstEntry(), due(), check(), current(), shown(nudge),
  dismiss(nudge), subscribe(listener)}`; `due()` → `{kind: 'keepSafe', installed, persistence} |
  {kind: 'backupDue', lastBackupAt, days} | null`; `check()` stores it as this visit's card
  (`current()`), which `main.tsx` runs once at start.
- UI: `DataPage.tsx` (registered as `#/settings/data`), `StorageCard.tsx`, `StorageNudge.tsx`
  (the Home card, mounted by the shell).
- Data: one new repository call, `photoRepo.clearThumbs()` (approved by the lead); Clear diary
  goes through `transferRepo.rewriteDays` over every day, then `photoRepo.releaseIfUnused`.

Files: created `src/services/{yourData,storageNudge}.ts` with tests,
`src/features/settings/data/{DataPage,StorageCard,StorageNudge}.tsx` with tests,
`src/features/settings/data/{yourData,storageNudge}.module.css`, test helpers
`src/features/settings/data/testing/openDataPage.tsx` and `src/services/testing/yourData.ts`,
`src/i18n/en/data.ts`, this note. Shared, additive: `src/features/settings/registry.ts` (the `data`
page), `src/services/context.tsx` (`yourData?`, `storageNudge?`), `src/main.tsx` (wiring, the
first-entry hook goes through the nudge, other tabs restart on erase), `src/app/App.tsx` (the nudge
slot), `src/i18n/en.ts` (the partition), `src/data/repos/photoRepo.ts` + test (`clearThumbs`).

Edge cases / failure modes:
- Erase while a backup is being made or its share sheet is open: `backup.invalidate()` runs before
  anything is deleted, so the backup is neither offered nor recorded (R06.5).
- Erase with reminder timers armed: `reminders.stop()` runs before the delete, so nothing fires
  against an empty store (R06.10).
- The delete blocked by another tab that does not let go: the dialog says to close other tabs and
  waits for the delete, then restarts. A refused delete: the dialog says so and offers Reload
  (the connection is closed by then, so the app cannot go on as it was).
- Erase or Clear diary pressed twice: the confirm answers once, and the service runs one at a time.
- Clear diary with saved meals that share photos with entries: those photos stay (the release
  checks every owner). Rows that cannot be read stay as they are (R06.1); photos are kept while any
  owner is unreadable (R06.18).
- Clear cache during a restore: nothing is changed (the restore writes photos without thumbnails
  anyway).
- A browser without `navigator.storage`: usage shows "Not available", persistence "Unknown".
- The persistence request fails or is refused: the request is claimed once (`storage.persistAsked`),
  never repeated; the nudge then shows.
- A nudge computed but never drawn (the page changed, another card won the slot) is not marked
  done; dismissing without having been drawn records nothing.
- The first entry is logged mid-visit: no card appears then (nothing jumps in while the person
  logs); the next visit shows it.
- A clock that moved back: a backup in the future counts as fresh, never as overdue.

Our design differences / decisions:
- Names are ours: Your data, Clear diary, Erase everything, Storage, Clear cache.
- No Compress Photos in v1 (not in the task row; photos are already stored at most 2 048 px by
  P06-02). No on-device models row (no on-device models, D-16.4 scope). No workout frames.
- Persistence status and the quota line are web-only additions (R06.19, D-16.8).
- Clear diary removes diary entries only (as the reference clears the food log only): water logs
  and fasts stay. A dedicated `diaryRepo.clear()` could replace the whole-span rewrite later.
- Erase everything restarts by reloading the page on `#/onboarding`: every service holds the closed
  connection, so a reload is the clean way to a fresh database; other tabs reload on the erase
  message (`closeOnErase`, wired in `main.tsx`).
- The keep-safe nudge is one-time (`storage.nudgeDone`, a device-local setting, so a restore or a
  new device re-arms it). The backup reminder's quiet time (last dismissal, or when the clock first
  started) is a device-local `platewise-` key in `localStorage`; Erase everything removes it.
- Both nudges show on Home only, under the diary, one at a time, keep-safe first; the card is
  worked out once as the app opens (`check`) and goes when dismissed. A first version put it above
  Home and re-checked after the first entry: the card then pushed the diary down under the
  person's finger (the Demo 1 and Demo 3 swipe and long-press e2e steps failed on it), so it moved
  under the diary and stopped appearing mid-visit.
- Decisions for the lead: (1) water and fasts are kept by Clear diary; (2) the backup reminder
  starts its 14 days at the first entry (or the first check after it) when there is no backup, and
  dismissing either card restarts them; (3) acting on a nudge (opening Your data) counts as
  finishing it, like dismissing; (4) erase restarts with a page reload on `#/onboarding`, and other
  tabs reload on the erase message; (5) `photoRepo.clearThumbs` (approved addition) skips while a
  restore runs; (6) the Home card sits under the diary and is worked out once per visit.

Tests we will write:
- storageNudge: the first logged entry asks the browser once, also across a reload and after a
  second entry (ACC-L4-1); keep-safe due when not persistent or not installed, not when both; not
  due before the first entry; never while the request is open; a nudge never drawn is not marked
  done by dismiss (R06.15); drawn then dismissed → done and never again; backup reminder after 14
  days, not at 13, not after a fresh backup, quiet for 14 days after a dismissal; a never-backed-up
  diary is reminded 14 days after the first check; one at a time, keep-safe first.
- yourData: measure gives photo and thumbnail bytes, the estimate and the status; Clear cache
  keeps photos and drops thumbnails; Clear diary removes entries but keeps saved meals and their
  photos, weights, water, the profile and settings (ACC-K5-1); erase order: invalidate, stop,
  erase, restart (R06.5); a backup made before the erase is never recorded (R06.5); another open
  tab restarts on the erase (ACC-K6-1); blocked and failed erases.
- StorageCard: "…" until measured, then photo bytes, thumbnails, usage of quota and the status
  (ACC-K7-1, R06.19); Clear cache keeps photos, re-measures, one action at a time.
- DataPage: the cards in order; the Export and Import sheets open; Clear diary asks first and
  Cancel keeps everything; Erase everything asks first and runs the steps.
- StorageNudge: the Home card shows and dismissing marks it done; it stays away from other tabs.
- photoRepo.clearThumbs: drops every thumbnail, keeps every photo, skips while restoring.

Compare checklist (filled after the rewrite; reopened `StorageSettingsCard.kt`,
`StorageMaintenance.kt`, `SettingsViewModel.kt` lines 1469–1500, the Data Management part and the
two dialogs of `SettingsScreen.kt`, the test names of `StorageMaintenanceTest.kt`):
- [x] Sizes show "…" until measured; measured on opening and again after each action
  (`StorageCard.test.tsx > StorageCard > shows … until measured, then photo and thumbnail bytes,
  usage of the quota and that the data may be cleared (ACC-K7-1, R06.19)`, `> clears the cache:
  thumbnails go, every photo stays, and the card measures again`)
- [x] Photos and the regenerable cache measured apart (`yourData.test.ts >
  createYourDataService: the storage card > measures photo and thumbnail bytes, the site’s usage
  of its quota and the persistence (ACC-K7-1, R06.19)`)
- [x] Clear cache deletes thumbnails only, never photos; a failure is swallowed and the card
  measures again (`yourData.test.ts > … > clears the cache: thumbnails go, every photo stays`,
  `photoRepo.test.ts > clearThumbs > drops every thumbnail and keeps every photo with its bytes`)
- [x] One action at a time (`StorageCard.test.tsx > StorageCard > runs one Clear cache at a time`)
- [x] Clear the food log behind a destructive confirm: entries go, unused photos pruned; profile,
  weights, saved meals and settings stay (`DataPage.test.tsx > DataPage > asks before clearing
  the diary, and Cancel keeps everything`, `> clears the diary: entries go; saved meals with their
  photos, weights, water and settings stay (ACC-K5-1)`, `yourData.test.ts > createYourDataService:
  Clear diary > removes every entry and the photos only they used; …(ACC-K5-1)`)
- [x] Delete all behind a destructive confirm, in order: backup forgotten first, then the store,
  keys and photos, then back to onboarding (`yourData.test.ts > createYourDataService: Erase
  everything > tells the backup, stops the reminders, erases, then starts again, in that order
  (R06.5, R06.10)`, `DataPage.test.tsx > DataPage > asks before erasing everything, then tells the
  backup, stops the reminders, erases and starts again (R06.5, ACC-K6-1)`)
- [x] A backup running at the wipe never records success (`yourData.test.ts > … > never offers or
  records a backup that was being made when everything was erased (R06.5)`, `DataPage.test.tsx >
  DataPage > never records a backup whose share sheet was open when everything was erased (R06.5)`)
- [x] Pending reminders cancelled on the wipe (iOS cancels notifications; R06.10): the engine's
  `stop` runs before the delete (same order test)
- [x] Web additions (R06.19, D-16.8): persistence asked once after the first entry
  (`storageNudge.test.ts > createStorageNudge: the persistence request (D-16.8) > asks the browser
  once, after the first logged entry, and not again after a reload (ACC-L4-1)`), status shown
  (`StorageCard.test.tsx > … (ACC-K7-1)` tests), install-and-backup card and backup reminder
  (`storageNudge.test.ts > createStorageNudge: keep your diary safe (R06.19, R06.15)` and
  `> createStorageNudge: time for a backup (R06.19)`), marked done only once drawn and dismissed
  (`> is not marked done when it was never drawn, so it comes back (R06.15)`,
  `StorageNudge.test.tsx > StorageNudge > draws nothing away from Home, so a card never drawn is
  never marked done (R06.15)`)
- [x] Other open tabs (web): they let go and start again on Welcome (`yourData.test.ts > … >
  deletes everything, the nudge’s key too, and another open tab starts again on Welcome
  (ACC-K6-1)`), a tab that holds on is waited for (`> waits for a tab that holds on, then starts
  again once the delete went through`; `DataPage.test.tsx > … > says another tab holds the data
  and waits, with no way to press Erase again`)
- Gaps found on reopening: the reference prunes every orphaned photo after clearing the log; we
  release the photos the removed entries held (photos orphaned earlier wait for the next prune).
  The reference closes the clear dialog at once; ours closes when the clear is done and says so.
- Mutation check (run, then reverted): Clear diary without the photo release fails 2 tests; erase
  without `invalidate` fails 8; `dismiss` without the drawn check fails 3; `clearThumbs` touching
  unreadable rows fails 1.
- Deliberate differences: thumbnails shown as their own row (the reference adds them into
  "Cache"); usage of the quota and the persistence status (web only, R06.19); Erase restarts by a
  page reload and other tabs follow; Clear diary keeps water and fasts; the Home storage cards
  (D-16.8); dialogs stay until their work is done.
- Not taken: Compress Photos (not in the v1 row; photos are stored at most 2 048 px by P06-02),
  on-device models, workout frames, the weekly-challenge and health-store steps of Delete All,
  the rest timer.

## Status

Done (2026-10-27). Your data page, Storage card, Home storage card, the two services, the
`data` catalogue partition and this note; tests: storageNudge 18, yourData 12, StorageCard 12,
DataPage 9, StorageNudge 5, photoRepo +2. Shared, additive lines: `src/features/settings/registry.ts`
(the `data` page), `src/services/context.tsx` (`yourData?`, `storageNudge?`), `src/main.tsx`
(wiring; the two `onFirstEntry` hooks now go through the nudge; `closeOnErase` for other tabs),
`src/app/App.tsx` (the Home card under the screen), `src/i18n/en.ts` (the partition). Outside the
task's set, approved by the lead: `src/data/repos/photoRepo.ts` (`clearThumbs`) and its test.
Handed on: P09-19 can drive Erase everything through `data.erase` / `data.eraseDialog.confirm`;
P09-01 places `data` in the hub order (after App settings).
