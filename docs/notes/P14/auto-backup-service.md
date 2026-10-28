# Task: automatic backup service and native files (P14-01) · Phase: 14 · Owner: builder (wt-p14s1)

<!-- Save as platewise/docs/notes/P<nn>/<slug>.md. Write everything above "Compare checklist"
BEFORE writing code, in your own words. Never paste or paraphrase the reference line by line. -->

Read (reference @ `10e14b67`): `android/.../MainActivity.kt` (`onStop`: when the automatic backup
is asked for) and `android/.../backup/CloudBackupCoordinator.kt` (`autoBackupIfNeeded` and the
lock around every backup operation), behaviour only. Research spec `06-settings-data.md` §3.17
(the auto-backup bullet) and traps R06.5 (erase vs a running backup) and R06.7 (backup bookkeeping
out of the backup). Ours: the P14 phase file (D-16.95), `docs/notes/P09/backup-and-restore.md`,
`src/services/backup/**`, `src/services/{health,reminders}/load.ts` (the lazy Android pattern),
`src/services/storageNudge.ts` (it counts `backup.lastAt`), `@capacitor/filesystem` 7.1.9's
definitions, README (Android permissions) and its Android plugin source (permission gating, error
codes, `readdir` fields). No REA evidence for this task.

What it does (own words): in the Android app, Platewise saves a full backup by itself. When the
app starts or comes back to the front, and automatic backup is on, setup is finished, no restore is
running and the newest backup (made by hand or automatically: `backup.lastAt`) is a day old (Daily)
or a week old (Weekly), it makes the same ZIP as Back up now through the backup service (so it
queues behind any other backup or restore), and writes it as
`platewise-backup-YYYY-MM-DD-HHmm.zip` into `Documents/Platewise` in the phone's shared storage,
which stays when the app is uninstalled and which Files or Google Drive can reach. Then "Last
backup" moves to that time (so the 14-day card on Home counts it) and the automatic backups this
install wrote are pruned to the newest 7; a file it did not write is never deleted. A failure (no
space, storage access refused, a write error, a backup that could not be made) is stored with its
time for the card and the next start or return tries again; nothing ever throws into the app. A
listed file can be read back and handed to the existing restore sheet (same check, same question).
The web app has none of this: the platform is checked before anything is fetched.

Inputs → outputs:
- `folder.ts` (the files port): `BackupFolder` with `access(ask)` → `'granted' | 'denied'`,
  `write(name, blob)`, `list()` → `{name, size, modifiedAt}[]` (empty when the folder does not
  exist yet), `remove(name)` (a missing file is fine), `read(name)` → `File`; failures reject with
  `FolderError` (`noSpace | denied | missing | failed`).
- `nativeFolder.ts` (Android only, lazy): the port over the `Filesystem` plugin registered by
  name (its web stand-in is never bundled): `Documents/Platewise/<name>`; writes in 3 MiB base64
  pieces (`writeFile`, then `appendFile`) so no single bridge message holds the whole ZIP; reads
  back through the WebView's own file route (`getUri` → `convertFileSrc` → `fetch`), streamed, no
  base64; every call checks the permission first without asking, so the plugin never pops
  Android's question on its own; errors mapped from the plugin's codes and messages.
- `testing/fakeFolder.ts`: an in-memory folder for tests (seeded foreign files, refusals, a full
  disk, a permission that is or is not granted, a count of questions asked).
- `auto.ts`: `createAutoBackup(deps)` → `{start, check, setOn, setEvery, refresh, open,
  subscribe, getSnapshot}`; `isAutoBackupDue(...)`, `autoBackupFileName(madeAt)`,
  `AUTO_BACKUPS_KEPT = 7`.
- `autoLoad.ts`: `loadAutoBackup(base)` → the service, or undefined outside the Android app
  (nothing fetched); `autoSetup.ts` builds it over the native folder.
- Settings: `backup.auto` (true), `backup.autoEvery` (`'daily'`), and the device state
  `backup.autoState` = `{files: [{name, madeAt}], lastAt, problem: {kind, at} | null, asked}` in
  `LOCAL_SETTINGS` (never in a backup, never in its hash, kept on this device by a restore).
- `BackupService` gains `restoring()` (true from `apply` until it settles) and `isCurrent(made)`
  (false once an erase happened after it started, R06.5).

Files: created `src/services/backup/{folder,nativeFolder,auto,autoLoad,autoSetup}.ts`,
`src/services/backup/testing/fakeFolder.ts`, tests `src/services/backup/{nativeFolder,auto,
autoLoad}.test.ts`; changed `src/services/backup/service.ts` (+2 methods) and its test,
`src/services/backup/hash.ts` (`LOCAL_SETTINGS`), `src/data/settingsSchema.ts` and its test,
`src/main.tsx` (wiring), `src/services/context.tsx` (`autoBackup?`, shared), `package.json` /
`pnpm-lock.yaml` (`@capacitor/filesystem` 7.1.9), `android/` (cap sync and the storage
permission).

Edge cases / failure modes:
- Two triggers at once (start and a quick return, or the switch): one run at a time; a trigger
  while a run is in flight is dropped (the run in flight answers it).
- A restore running or queued: no run; after it, the next trigger decides (the restore sets
  "Last backup" to the backup's time, which may make one due).
- Everything erased while a run makes its file: the file is neither written nor recorded (R06.5).
  After an erase the app starts on Welcome: no backup until setup is done again.
- Before setup is finished (Welcome, onboarding): no backup, so a fresh install never writes an
  empty backup next to the person's real ones in the folder.
- The switch turned off while the file is being made: nothing is written.
- "Last backup" in the future (a changed clock, a restored backup from a phone whose clock ran
  ahead): due, so a wrong clock can never stop backups for good.
- Android 8–10: the storage permission is asked once, at the first run there (and again when the
  person turns the switch on); refused → the "allow storage" problem, retried silently.
- A file of the same name that this install did not write: a `-2`, `-3` … name, never overwritten.
- A file the person deleted in Files: dropped from the list; the newest 7 count only files that
  are still there.
- A listing that fails: no pruning that run (names are kept, so nothing is forgotten).
- A write that fails halfway: the partial file is removed (best effort) and the failure stored.
- The same minute twice (a run right after a restore moved "Last backup" back): the same name, our
  own file, written over.

Our design differences / decisions:
- Local files, not a cloud account: D-16.95 (the owner's request); the reference uploads to a
  cloud drive while the app goes to the background, on Wi-Fi, at most every 15 minutes, skipping
  an unchanged diary, and fails silently. Ours: when the app starts or returns to the front
  (a WebView cannot work after it has gone to the background), daily or weekly, never skips, keeps
  7 files, and shows a failure.
- Not after setup is finished (the reference's iOS side has the same rule; Android does not).
- The permission question on Android 8–10 (`maxSdkVersion 29`, not 28: see the decisions below).

Tests we will write:
- `auto.test.ts` (fake folder, fake clock, a held `make`): due and not due for Daily and Weekly;
  a backup by hand counts; a future "Last backup" is due; off, before setup, during a restore: no
  run; the name and the folder; "Last backup" and the state recorded; prune keeps the newest 7
  and leaves foreign files and files of the same pattern it did not write; a foreign file of the
  same name is not overwritten; failures stored (no space, refused, write error, a backup that
  could not be made) and retried at the next trigger, the problem cleared by a success; an erase
  during the run records nothing; one run at a time; start and return-to-front triggers; the
  permission asked once; `open` reads a listed file and refuses another; `refresh` lists the
  folder for the card; never rejects.
- `nativeFolder.test.ts` (a mocked plugin): the path and directory; the base64 pieces and their
  order; the listing mapping; remove; read through the WebView route; permission check and ask;
  errors mapped (`OS-PLUG-FILE-0007`, ENOSPC, does not exist, anything else); a missing folder is
  an empty list; no question without `ask`.
- `autoLoad.test.ts`: nothing fetched on the web; built in the Android app.
- `settingsSchema.test.ts`: the two settings' defaults and readers, the device state's reader.
- `hash.test.ts` / `backup.test.ts`: the device state stays out of a backup and its hash; a
  restore keeps this device's state.

Compare checklist (filled after the rewrite; reopened `MainActivity.kt` (`onStop`) and
`CloudBackupCoordinator.kt` (`autoBackupIfNeeded`, the lock, `upload`)):
- [x] Automatic backup only while it is on, and "on" checked again after waiting for the queue
  (`src/services/backup/auto.test.ts > automatic backup: when it runs (P14-01) > does nothing while
  automatic backup is off`; `> automatic backup: one at a time (P14-01) > writes nothing when the
  switch goes off while the file is being made`)
- [x] Only after an interval since the last backup, one made by hand included (`auto.test.ts >
  automatic backup: when it runs (P14-01) > is due a day after the newest backup when Daily, and not
  before`; `> is due a week after the newest backup when Weekly, and not before`; `> counts a backup
  made by hand`; `> runs when the last backup is in the future, so a clock set back never stops
  backups`; `> isAutoBackupDue and autoBackupFileName (P14-01) > is due with no backup, after a day
  or a week, and when the last one is in the future`)
- [x] The reference's iOS side waits for setup; ours too (`auto.test.ts > automatic backup: when it
  runs (P14-01) > waits until setup is finished, so a fresh install never saves an empty backup`)
- [x] One backup operation at a time (`auto.test.ts > automatic backup: one at a time (P14-01) > runs
  one backup at a time and drops a trigger that comes during it`; the shared queue and a restore:
  `> automatic backup: when it runs (P14-01) > does not run while a restore is running or waiting`,
  `src/services/backup/service.test.ts > createBackupService > reports a restore from the moment it
  is asked for until it settles (P14)`)
- [x] Erase vs a running backup (R06.5) (`auto.test.ts > automatic backup: one at a time (P14-01) >
  neither writes nor records a backup that started before everything was erased (R06.5)`;
  `service.test.ts > createBackupService > says whether a made backup is still current, false once
  everything was erased (P14, R06.5)`)
- [x] Backup bookkeeping out of the backup and its hash (R06.7) (`src/services/backup/hash.test.ts >
  contentHash > keeps the automatic backup’s switch and frequency in the hash, and this device’s
  state out (P14)`; `src/services/backup/backup.test.ts > makeBackup > leaves this device’s automatic
  backup state out of the file, and keeps the switch and frequency in it (P14)`;
  `src/services/backup/restore.test.ts > inspectBackup and applyBackup > keeps this device’s
  automatic backup state, even from a file that carries one, and takes the switch and frequency from
  the backup (P14)`)
- [x] The same archive as a backup by hand (`auto.test.ts > automatic backup: when it runs (P14-01) >
  saves the same file as Back up now into the folder and moves Last backup (ACC-K3-3)`)
- [x] Failures never reach the app (the reference: silent; ours: stored for the card and retried)
  (`auto.test.ts > automatic backup: failures (P14-01) > keeps %s as the problem, changes no Last
  backup, and tries again next time (ACC-K3-5)`; `> keeps a backup that could not be made (%s) as
  %s`; `> never rejects, even when the settings cannot be read`)
- [x] Ours only: keep 7, never another file (`auto.test.ts > automatic backup: keeping 7 (P14-01) >
  keeps the newest 7 it wrote and never deletes a file it did not write (ACC-K3-4)`, `> writes next
  to a file of the same name it did not write, never over it`, `> forgets a file deleted in Files,
  and counts only the files still there`, `> keeps the name of a file it could not delete, and
  deletes it the next time`, `> prunes nothing when the folder cannot be listed, and forgets no
  name`); the storage question (`> automatic backup: failures (P14-01) > asks Android for storage
  access once by itself, then only when the person turns it on`); the triggers (`> automatic backup:
  triggers and the card (P14-01) > checks when it starts and each time the app comes back to the
  front`); the native folder (`src/services/backup/nativeFolder.test.ts > nativeBackupFolder
  (P14-01) > *`); lazy on Android only (`src/services/backup/autoLoad.test.ts > loadAutoBackup
  (P14-01, D-16.95) > *`)
- Gaps found on reopening: none beyond the deliberate ones.
- Deliberate differences: a local folder instead of a cloud drive; start and return instead of
  going to the background; daily or weekly instead of 15 minutes; no Wi-Fi rule (nothing leaves
  the phone); no "skip if unchanged" (each file stands alone and only 7 are kept); failures shown
  on the card instead of silent.
- Not taken: the cloud account, its sign-in and the "restore first?" question when it is turned on
  (there is nothing to look up: the folder is on the phone).

## Decisions for the lead

- **Android 10 needs the permission too.** The prompt says `WRITE_EXTERNAL_STORAGE` up to Android 9
  (`maxSdkVersion 28`) and none from Android 10. The plugin's own docs and code say otherwise:
  below Android 11 (API 30) every call into `Documents` needs `READ_EXTERNAL_STORAGE` and
  `WRITE_EXTERNAL_STORAGE` (it asks for both under one alias and Capacitor refuses an alias whose
  permissions are not in the manifest), and on Android 10 the public `Documents` folder is reachable
  only with `android:requestLegacyExternalStorage="true"` on `<application>`. With `maxSdkVersion
  28` every automatic backup on Android 10 would fail. So the manifest declares both permissions
  with `maxSdkVersion="29"` and sets `requestLegacyExternalStorage` (ignored from Android 11); the
  app asks on Android 8, 9 and 10 and never from Android 11. To go back to the prompt's text:
  change both `29` to `28` and drop the attribute (Android 10 then shows the "allow storage"
  problem for good).
- A third setting, `backup.autoState` (device state: the files this install wrote, the last
  automatic backup, the last failure, whether the permission was asked), in `LOCAL_SETTINGS`. One
  record so that a run updates it in one transaction.
- `backup.auto` and `backup.autoEvery` travel in backups (they are the person's choices, like the
  other settings); only the device state stays out.
- No automatic backup before setup is finished (`onboarding.done`): a fresh install, or the app
  after Erase everything, would otherwise put an empty, newest backup into the folder next to the
  person's real ones, right when they may be looking for one to restore.
- The interval is exact (24 h or 7 × 24 h after the newest backup), as the prompt says; a
  "Last backup" in the future counts as due.
- Turning the switch on, or choosing Daily, checks at once (and may ask the permission on Android
  8–10); the frequency does not ask anything.

## Status

Done (2026-10-28). Lines outside the task's files: `src/services/context.tsx` (the `autoBackup?`
entry, shared, additive); `android/app/src/main/AndroidManifest.xml` (the two permission lines and
`requestLegacyExternalStorage` on `<application>`; the `MainActivity` entry is untouched);
`THIRD_PARTY_NOTICES.md` and `src/generated/notices.json` (regenerated by `pnpm build` for the new
dependency); `android/capacitor.settings.gradle` and `android/app/capacitor.build.gradle` (written
by `cap sync`). Follow-up for the lead: Home's 14-day card is worked out as the app opens, at the
same moment as the first automatic check, so on the first start after 14 days without opening the
app it may still show while that backup is being written (it counts the backup from the next start
on).
