# Task: backup and restore (P09-13) · Phase: 09 · Owner: builder (wt-p09s13)

<!-- Save as platewise/docs/notes/P<nn>/<slug>.md. Write everything above "Compare checklist"
BEFORE writing code, in your own words. Never paste or paraphrase the reference line by line. -->

Read (reference @ `10e14b67`): `android/.../backup/CloudBackupCoordinator.kt` (local parts: the
upload order snapshot → hash → pack, the restore order, error text, the lock),
`android/.../backup/CloudBackupRestore.kt` (all: free-space sum, staging, the non-cancellable
commit), `ios/calorietracker/Services/CloudBackupService.swift` (restore order: stage, move in,
values, delete photos not in the archive, keep the onboarding flag for a Welcome restore), the
test list of `android/.../test/.../backup/CloudBackupRestoreTest.kt` (leaving mid-restore,
cancel before staging, corrupt archive, not enough / exactly enough storage, staging failures,
failed commit), `docs/cloud-backup.md` (behaviour only). Research spec `06-settings-data.md`
§3.15 (erase and backup), §3.17 (backup and restore), traps R06.5–R06.9; decisions D-16.29,
D-16.30, D-16.42; the P09-12 note (`backup-archive-codec.md`). No REA evidence for this task.

What it does (own words): Settings › Your data gets a Backup section. "Back up now" reads every
table the person owns in one read (not the keys, not rows kept aside, not this device's state),
makes one stored ZIP with a JSON document first and one file per photo after it, and hands it to
the browser's share sheet or, where that cannot take files, downloads it as
`platewise-backup-<yyyy-MM-dd>.zip`. Only when the file was handed over does `backup.lastAt`
change, and never for a backup that started before an erase (R06.5, the generation P09-15 uses).
"Restore from a file" opens the file, reads every entry to its end (CRC), checks the format id and
version (a newer one asks for a newer Platewise), every table row, every photo and the content
hash, and checks free space, all before anything changes. Then a sheet says when the backup was
made, how many entries, photos and Coach messages it holds, and that everything on this device
(but the keys) will be replaced, and waits for Restore (R06.8, D-16.42). Restore replaces the
tables in one IndexedDB transaction, so any failure leaves every row as it was (R06.6); after it,
a fast left running with fasting off is ended (R05.2), unused photos are pruned, and the reminder
hook runs. A restore that started finishes even when the sheet is closed or the page changes.

Inputs → outputs:
- `createBackupService(deps)` (`service.ts`, the Services entry; loads the heavy code on first
  use) → `{make, offer, inspect, apply, invalidate}`; one operation at a time.
- `makeBackup(deps)` (`backup.ts`) → `Result<MadeBackup, BackupProblem>` with the `File`;
  `offerBackup(made, deps)` → `'shared' | 'downloaded' | 'cancelled' | 'needsTap' |
  'invalidated'`, and records `backup.lastAt` on the first two.
- `inspectBackup(file, deps)` (`restore.ts`) → `Result<CheckedBackup, RestoreProblem>` (summary:
  made at, app version, entry / photo / message counts, has a profile, onboarding done);
  `applyBackup(checked, deps)` → `Result<BackupSummary, RestoreProblem>`.
- `payload.ts`: the document (`{format: 'platewise-backup', version: 1, exportedAt (ISO),
  appVersion, contentHash, payload: {tables}}`), the tables it carries, the row shaping shared by
  both directions, Blob ↔ base64 for Coach thumbnails.
- `src/data/repos/backupRepo.ts` (new repository): `read(tables)` in one read transaction (readable
  rows only), `restore({replace, upsert, keepSettings})` in one read-write transaction with the
  `restoring` flag, `endRestore()`.
- UI: `BackupSection` (last backup, Back up now, Save backup file when the share needs a fresh
  tap, Restore from a file) and `RestoreSheet` (checking → preview and Restore → restoring → done,
  or the problem).

Files: created `src/services/backup/{payload,backup,restore,service}.ts` with tests,
`src/data/repos/backupRepo.ts` with tests, `src/features/settings/data/{BackupSection,
RestoreSheet}.tsx` with tests and `backup.module.css`, `src/i18n/en/backup.ts`, test helpers
`src/services/backup/testing/seed.ts` and `src/features/settings/data/testing/openBackup.tsx`,
this note.
Shared, additive: `src/i18n/en.ts` (the partition), `src/services/context.tsx` (`backup?`),
`src/main.tsx` (wiring, and clearing a `restoring` flag a closed tab left behind).

Edge cases / failure modes:
- A photo that cannot be read while packing (gone, unreadable, its bytes no longer its size)
  fails the whole backup; nothing is offered or recorded. Its name and size are already in the
  hash, so a shorter archive must never be produced.
- Photo files are named `<id>.<ext>` by the stored type (JPEG → jpg, PNG → png, WebP → webp); an id
  that is not a plain name is named `photo-<n>.<ext>` instead (the document maps file → id).
- A photo of another type (GIF, HEIC, AVIF, no type at all) is written as a JPEG copy at its own
  size (decision below); if this browser cannot decode it, the backup fails as above.
- Share refused because the tap is too old (`NotAllowedError`): the file is kept and "Save backup
  file" offers it again on a fresh tap. Share cancelled (`AbortError`): nothing recorded, the file
  stays offered. Share failing otherwise: download instead.
- Erase everything during a backup (`invalidate`): the backup is not offered and never records
  `backup.lastAt` (R06.5).
- Restore refuses, changing nothing: not a ZIP / not ours / compressed / encrypted / ZIP64 /
  split → "not a Platewise backup"; CRC, structure, duplicate names, a bad row, a duplicate id, a
  listed photo missing, a hash that does not match → "damaged"; version above 1 → "needs a newer
  Platewise"; quota − usage < photo bytes + 64 KiB per photo + payload bytes + 16 MiB → "not
  enough storage" (checked when the file is read and again just before the commit; exactly
  enough is enough; no estimate from the browser → not checked); no WebCrypto → "needs https".
- A row a newer build may add under a setting key this build does not know is skipped, as the
  settings repository ignores it; device-local settings in a file are skipped; tables outside
  the backup's list (keys, kept-aside rows, device state) are never written, even when a crafted
  file carries them.
- Rows on this device that cannot be read are copied aside before the replace deletes them, in
  the same transaction (R06.1); if that copy fails, nothing changes.
- This device's own settings (`storage.persistAsked`, `storage.nudgeDone`, later the reminder
  times) survive the restore; `backup.lastAt` becomes the backup's own time.
- Photos are upserted, not cleared: the prune after the commit removes every photo nothing uses
  (and keeps one a kept-aside row still names, as cleanup always does).
- Fasting off in the backup with a fast running in it → the fast is ended at restore time.
- Two operations never overlap (one queue); the sheet cannot be dismissed while restoring, but
  if it is unmounted the restore still finishes.

Our design differences / decisions:
- A local file, made and picked by the person (D-16.30); a preview and a Restore button before
  anything is replaced (D-16.42, R06.8); the Coach chat with its thumbnails is in it (D-16.29).
  No account, no auto-backup, no "skip if unchanged" (the hash is for integrity here).
- One document of table rows (shaped through the same codecs both ways) instead of typed
  key/value pairs; Coach thumbnails as tagged base64 inside it; photo metadata (id, file, size in
  pixels, creation time) as the `photos` table of the document, photo thumbnails left out (a
  cache the photo service rebuilds on demand).
- The restore checks the content hash against the rows and photos it read (the reference stored
  it only to skip uploads), so a hand-edited or cut-down file is refused as damaged.
- No staging table: IndexedDB writes the photos and every row in one transaction, so the
  "staging" is building every row in memory from the checked file first; a failure anywhere rolls
  the whole transaction back. The `restoring` flag is written inside that transaction and cleared
  after the fast is settled, so a failed commit never leaves it set; `main.tsx` clears one a tab
  closed mid-way left behind.
- Decision on GIF / HEIC (open question from P09-12): a photo whose stored type is not JPEG, PNG
  or WebP goes into the backup as a JPEG copy at its own size (quality 0.9), named `.jpg`. The
  safe-name list stays as it is, the archive never holds a name that lies about its bytes, and a
  HEIC kept on Safari opens after a restore on any browser. Cost: those few photos are not
  byte-identical after a round trip. If the lead widens the list later, `photoFileType` in
  `backup.ts` is the one place to change.
- Decisions for the lead: (1) `appVersion` comes from `main.tsx` as `'0.1.0'` until P09-16's build
  constant exists; (2) the reminder engine (P09-08) is not wired yet: `afterRestore` is the hook
  for "re-evaluate reminders"; (3) leaving a now-hidden tab is the tab bar's existing rule
  (`TabBar.tsx`, ACC-A3-1) and a restore always runs from Settings or Welcome, which cannot be
  hidden; (4) `backup.lastAt` after a restore is the backup's export time; (5) a Coach reply still
  running during a restore may land in the restored chat (no generation bump): follow-up if wanted.

Tests we will write:
- backupRepo: read gives readable rows of the named tables only and keeps unreadable ones aside;
  restore replaces, upserts, keeps the named settings, sets and clears the flag; a failing write
  leaves every table as it was; an unreadable row is kept aside before it is deleted.
- backup: the file's name, its document fields, every kept table, Coach thumbnails as bytes, no
  `secrets`/`quarantine`/`meta`, no device-local setting, the hash equals `contentHash` of the
  rows and photo sizes; the bytes never contain a stored key (ACC-E14-2); a photo that cannot be
  read fails everything and records nothing; a GIF goes in as a JPEG copy, an undecodable one
  fails; share, download, cancel, stale tap, invalidated.
- restore: backup → erase → restore gives identical tables (ids, photos, chat) and no secrets;
  every refusal leaves the tables untouched (bad CRC, not a backup, newer version, bad row, hash
  mismatch, missing photo); not enough storage refused before anything changes, exactly enough
  restores; a failure inside the commit leaves everything as it was and no flag; a running fast
  with fasting off is ended; unused photos pruned; local settings kept; the hook runs.
- RestoreSheet: the preview shows date and counts and changes nothing until Restore; restoring
  cannot be dismissed and finishes when the sheet goes away; each problem shows its message.
- BackupSection: "No backup yet" then the time; Back up now offers the file and records the time;
  a stale tap shows "Save backup file"; a failure shows the message.

Compare checklist (filled after the rewrite; reopened `CloudBackupRestore.kt`,
`CloudBackupCoordinator.kt`, `CloudBackupService.swift` (restore order), `CloudBackupRestoreTest.kt`,
`docs/cloud-backup.md`):
- [x] Snapshot, then hash over what goes in, then pack; a photo gone or unreadable while packing
  fails the whole backup (`backup.test.ts > makeBackup > fails whole, with nothing to offer, when
  a photo can no longer be read`, `> fails whole when a photo’s bytes no longer match its size`,
  `> carries the hash of exactly the rows and photo files inside it`)
- [x] Included: every stored table and setting, the Coach chat, every photo; never keys, rows kept
  aside, device state or backup bookkeeping (`backup.test.ts > makeBackup > makes one file with
  the diary, its photos and the Coach chat (ACC-K3-1)`, `> never holds a key, the rows kept aside
  or this device’s state (ACC-E14-2, R06.7)`, `> gives the same hash again after the last backup
  time was recorded (R06.7)`)
- [x] Ids preserved; photos keep their names' ids and bytes (`restore.test.ts > inspectBackup and
  applyBackup > gives back identical tables after backup, erase everything and restore, and no
  keys (R06.6)`, `> keeps a restored photo’s bytes and type, and its thumbnail is left to be
  rebuilt`)
- [x] Validate the whole file before anything changes: CRC, format id, newer version fails closed
  (`restore.test.ts > … > refuses a damaged file, changing nothing (ACC-K4-2, R06.6)`, `> refuses
  a newer version, changing nothing (R06.6)`, `> refuses %s as not a backup`, `> refuses %s as
  damaged, changing nothing`)
- [x] Free space: photos + 64 KiB each + document + 16 MiB, before anything changes; exactly enough
  restores (`restore.test.ts > … > refuses for lack of storage before anything changes, and
  restores with exactly enough (R06.6)`; `RestoreSheet.test.tsx > RestoreSheet > says when there
  is not enough storage, before anything changes`)
- [x] A failure while staging or committing leaves photos and values untouched and does not leave
  deletions paused (`restore.test.ts > … > leaves everything as it was, flag included, when a write
  inside the restore fails (R06.6)`, `backupRepo.test.ts > createBackupRepo > restore > changes
  nothing, flag included, when one write fails (R06.6)`)
- [x] Cleanup waits while the restore replaces data and runs after it; photos the restored diary
  does not use are removed (`backupRepo.test.ts > … > replaces the named tables, writes photos over
  their ids and keeps the named settings`, `restore.test.ts > … > removes photos nothing uses
  afterwards, clears the flag and runs the follow-up`)
- [x] Leaving the screen mid-restore still restores (`RestoreSheet.test.tsx > RestoreSheet from the
  Backup card > cannot be dismissed while restoring, and the restore finishes when the sheet is
  gone (R06.6)`); cancelling before the restore leaves everything (`RestoreSheet.test.tsx >
  RestoreSheet > closes on Cancel and leaves everything as it was`)
- [x] Bookkeeping after a restore: last backup = the backup's export time
  (`restore.test.ts > … > keeps this device’s own settings and takes the backup’s time as the last
  backup`)
- [x] Reminders follow the restored settings (`restore.test.ts > … > removes photos nothing uses
  afterwards, clears the flag and runs the follow-up`: the hook; the engine wires in with P09-08)
- [x] Entries outside the photo folder never reach the store, and nothing device-local is written
  from a file (`restore.test.ts > … > never writes keys, kept-aside rows or device state, even from
  a file that carries them`; the archive side is P09-12's `archive.test.ts`)
- [x] One operation at a time (`service.test.ts > createBackupService > checks a file only after
  the backup being made has finished`); a backup that started before Delete All Data never records
  success (`service.test.ts > … > never offers or records a backup that started before everything
  was erased (R06.5)`, `backup.test.ts > offerBackup > records nothing when everything was erased
  while the share sheet was open (R06.5)`)
- [x] No-space and other failures get their own plain messages, never raw error text
  (`RestoreSheet.test.tsx > RestoreSheet > says a file is not a backup and changes nothing
  (ACC-K4-2)`, `> says a damaged file changed nothing (ACC-K4-2)`, `BackupSection.test.tsx >
  BackupSection > says why no backup was made, and records nothing`)
- [x] Deliberate (R06.8, D-16.42): a confirmation with the backup's date, counts and what is
  replaced (`RestoreSheet.test.tsx > RestoreSheet > shows when the backup was made and what it
  holds, and changes nothing before Restore (R06.8, ACC-K4-1)`, `restore.test.ts > … > shows what
  the file holds before anything changes (R06.8, ACC-K4-1)`)
- [x] R05.2 after a restore (`restore.test.ts > … > ends a fast that runs in the backup while
  fasting is off in it (R05.2)`)
- Gaps found on reopening: none in behaviour. The reference re-reads the archive while staging; we
  build every row from the checked file before the one transaction, so a file that changes on disk
  after the check makes the transaction fail as a whole (covered by the failing-write tests).
- Mutation check: no hash check fails 1 test; local settings kept in the file fails 3; no space
  re-check fails 1; no fast settle fails 1; recording after an erase fails 1; no keep-aside before
  the replace fails 1; a photo read error swallowed fails 3.
- Deliberate differences: a local file instead of Drive / iCloud, picked and shared by the person
  (D-16.30); a confirmation before restoring (D-16.42, R06.8); the chat with thumbnails inside
  (D-16.29); one IndexedDB transaction instead of staging files and moving them in; the content
  hash checked on restore; photos of other types as JPEG copies; thumbnails of photos not carried
  (rebuilt on demand); this device's own settings kept through a restore; unknown setting keys
  skipped instead of written.
- Not taken: account sign-in, auto-backup on going to the background, "skip if unchanged", the
  cloud file id and account bookkeeping, deleting a cloud copy, the health-store tokens and
  "restore done" flags, temp-file cleanup of killed processes (no files on the web), the smoke test.

## Status

Done (2026-10-27). Backup and restore services, the backup repository, the Backup card and the
restore sheet with tests (backupRepo 6, backup 20, restore 21, service 4, RestoreSheet 6,
BackupSection 4), the `backup` catalogue partition and this note. Shared, additive lines:
`src/i18n/en.ts` (the partition), `src/services/context.tsx` (`backup?`), `src/main.tsx` (the
service and clearing a stale `restoring` flag at start). Handed on: P09-15 mounts `BackupSection`
on Your data and calls `backup.invalidate()` before Erase everything; P09-14 reuses `RestoreSheet`
(`onRestored` gives the summary with `hasProfile` and `onboardingDone`); P09-08 wires
`afterRestore` to re-evaluate reminders; P09-16's build constant replaces `appVersion: '0.1.0'`.
