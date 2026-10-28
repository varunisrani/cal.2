# Task: Google Drive backup in the app (P15-04) · Phase: 15 · Owner: builder (wt-p15s3)

<!-- Save as platewise/docs/notes/P<nn>/<slug>.md. Write everything above "Compare checklist"
BEFORE writing code, in your own words. Never paste or paraphrase the reference line by line. -->

Read (reference @ `10e14b67`): `android/.../backup/DriveCloudBackupClient.kt` (which Drive calls it
makes, how it treats a failed lookup, a 404 on delete, the token), `android/.../backup/
CloudBackupCoordinator.kt` (when it uploads, the lock, sign-out, what Delete All Data does to the
session), `android/.../ui/onboarding/ReturningUser.kt` (the welcome-back restore from Drive),
`docs/cloud-backup.md` (the Google Cloud setup), and the client's JVM test, behaviour only.
Research spec `06-settings-data.md` §3.17 and traps R06.5 (erase vs a running backup), R06.7
(bookkeeping out of the backup), R06.8 (a restore asks first). Ours: the P15 phase file (D-16.97,
the DrivePlugin contract), `docs/notes/P14/*.md`, `src/services/backup/**` (auto, autoLoad,
autoSetup, folder, nativeFolder, service), `src/features/settings/data/**` (AutoBackupCard,
BackupSection, RestoreSheet), the Welcome restore (`src/features/onboarding/{OnboardingRoute,
RestoreFromFile}.tsx`, `steps/Welcome.tsx`), the CSP in `index.html` (`connect-src` allows
`https:`), the lint rule that keeps the global `fetch` behind a seam (`browserFetch` is handed in
by `main.tsx`). No REA evidence for this task.

What it does (own words): in the Android app the person can connect their Google Drive in
Settings › Your data. From then on every backup the app makes (each automatic backup once it is
written to Documents › Platewise, and each Back up now) is also copied into a "Platewise backups"
folder in their Drive. Platewise asks Google only for access to the files it made itself, so it
cannot see or touch anything else in the Drive. Each copy carries this phone's install id; the
phone keeps its own newest 7 and deletes its older ones, and never deletes a copy another phone
made (a lost phone's backups stay, listed and restorable). An upload that fails (no connection, Google no longer lets the app in, the
Drive is full) never stops the app or the local backup: the card says why, and the app tries
again the next time it starts or comes back to the front. The card shows the account, when the
last copy went up, Upload now, the copies in Drive (date, size, Restore) and Disconnect; Restore
downloads the copy and opens the same restore sheet as a file (same check, same question).
Welcome offers "Restore from Google Drive" next to "Restore from a backup file". The web app has
none of it: nothing is drawn and no Drive code is fetched.

Inputs → outputs:
- `drivePlugin.ts`: the phase file's `DrivePlugin` contract word for word, its error codes and
  `driveErrorCode(error)`; `driveNative.ts` registers the plugin (Android only, lazy).
- `driveClient.ts`: `createDriveClient({fetch, tokens})` → `{upload(name, file, install) →
  DriveFile, list() → DriveFile[] (every install's), download(file) → File, remove(id),
  prune(keep, install) → deleted ids (that install's own only), account() → email | null}`,
  `DriveFile = {id, name, size, createdAt, install}`; failures reject with `DriveError`
  (`offline | signIn | quota | missing | failed`). The token source is `{get(), refresh()}`; a
  401 refreshes once and repeats the request, a second 401 is `signIn`. Each request has a
  deadline (30 s for folder, list, about, delete; 120 s per upload request or 8 MiB piece and per
  download); a request past it is `failed`.
- `drive.ts`: `createDriveBackup(deps)` → `{connect, disconnect, afterBackup(made),
  afterCheck(written), uploadNow, refresh, open(id), subscribe, getSnapshot}`;
  `DRIVE_BACKUPS_KEPT = 7`. Snapshot: `{uploading, files (null until listed), listProblem}`.
- `driveLoad.ts`: `loadDriveBackup(base)` → the service, or undefined outside the Android app
  (nothing fetched); `driveSetup.ts` builds it over the native plugin.
- `testing/fakeDrive.ts`: an in-memory Drive behind a `fetch` (the endpoints the client uses, the
  `drive.file` rule that the app sees only what it made, quota, 401s, a dropped connection) and a
  fake `DrivePlugin` (answers, refusals, a count of calls).
- Settings: `backup.drive` = `{connected, email, lastUploadAt, problem: {kind, at} | null,
  installId}` (the install id is made at the first upload and kept through Disconnect),
  device state in `LOCAL_SETTINGS` (never in a backup or its hash, kept on this device by a
  restore).
- `auto.ts` (P14) gains `onChecked(written)`: after every check that ran, with the backup it
  wrote or null; `main.tsx` passes the Drive service's `afterCheck`.
- UI: `DriveCard` (Settings › Your data, after the Automatic backup card), `RestoreFromDrive`
  (a Welcome screen, lazy), Welcome's `wizard.restoreDrive` button; hooks `data.drive.*`,
  `welcomeDrive.*`; words `backup.drive.*` and `onboarding.restoreDrive.*`.

Files: created `src/services/backup/{drivePlugin,driveNative,driveClient,drive,driveLoad,
driveSetup}.ts` with tests, `src/services/backup/testing/fakeDrive.ts`,
`src/features/settings/data/{DriveCard.tsx,DriveCard.test.tsx,drive.module.css}`,
`src/features/onboarding/{RestoreFromDrive.tsx,RestoreFromDrive.test.tsx}`; changed
`src/data/settingsSchema.ts` (+test), `src/services/backup/hash.ts` (+test lines),
`src/services/backup/auto.ts` (the `onChecked` hook, shared), `src/services/context.tsx`,
`src/main.tsx`, `DataPage.tsx`, `BackupSection.tsx`, `OnboardingRoute.tsx`, `steps/Welcome.tsx`,
`WizardPage.tsx` (passes the new prop), `src/i18n/en/{backup,onboarding}.ts`,
`docs/user/backup.md`, `CHANGELOG.md`, `scripts/android/build-apk.sh`.

Edge cases / failure modes:
- Not connected: nothing is uploaded, ever; a backup made before connecting is not sent later.
- Offline (fetch throws, or the silent sign-in fails while the page says it is offline):
  `offline`, kept, retried at the next start or return.
- A 401: the token is refreshed once (`authorize({interactive:false})`) and the request repeated;
  a second 401, or a silent sign-in Google refuses: `signIn` ("connect again").
- A full Drive (403 `storageQuotaExceeded`): `quota`. Rate limits, 5xx: `failed`, retried.
- The folder deleted while the app runs (404 on upload): looked up or made again, then one more
  try. The folder is looked up once per run and made only when none is found.
- Files over 5 MiB go up in a resumable session, in pieces of 8 MiB; a connection that drops
  during a piece asks the session how far it got and goes on from there, once per upload. A
  piece Drive answers without a `Range` header counts as arrived whole.
- No answer in time (30 s for small calls, 120 s per upload request or piece and per download):
  the request is stopped and counts as a plain failure, retried at the next start or return.
- Prune: only this install's tagged copies (`appProperties.platewise` = backup and
  `platewiseInstall` = this install) are counted or deleted; the newest 7 by creation time stay.
  Another install's copies and copies without an install are listed but never deleted. A delete
  that fails (or a 404) is not an upload failure.
- Two uploads at once (an automatic backup and Back up now): one at a time, in order.
- Everything erased while an upload waits (R06.5): a backup made before the erase is not
  uploaded, and nothing is recorded; after the erase the device state is gone (not connected).
- Retry and an automatic backup at the same start: the retry runs only after the automatic
  backup's check (through `onChecked`), and only when no upload succeeded since the failure; a
  written file is uploaded instead of making a second one.
- Before setup is finished (Welcome) and while a restore runs: no upload; connecting on Welcome
  to restore never uploads the empty phone.
- Disconnect: Google's grant is dropped (`signOut`, best effort), the device state forgotten;
  the copies stay in Drive (the card says so).
- Connect refused: `notConfigured` says plainly that this copy of Platewise is not registered
  with Google yet and points to docs/user/backup.md; `cancelled` changes nothing; `unavailable`
  names Google Play services; anything else asks to try again.
- A copy that cannot be downloaded (offline, deleted in Drive): a toast, the list is read again.

Our design differences / decisions:
- `drive.file` scope and a visible "Platewise backups" folder holding up to 7 dated copies (the
  reference: the hidden appData space, one file overwritten each time, plus an email scope).
  D-16.97.
- Uploads follow each backup the app makes (automatic and Back up now), not "going to the
  background, on Wi-Fi, every 15 minutes, skipped when unchanged"; failures are shown and
  retried (the reference fails silently).
- The account email comes from the plugin (no extra userinfo request, no email scope).
- Connecting uploads nothing by itself (it would put an empty phone's backup into Drive when
  connecting on Welcome to restore); the next backup, or Upload now, sends the first copy.
- Restore asks first, through the same restore sheet (R06.8); the reference restores at once.
- Upload now makes a fresh backup; it counts as "Last backup" like any backup made by hand.
- No "Delete cloud backup" button: the copies are ordinary files in the person's Drive.

Tests we will write:
- `driveClient.test.ts` (fake Drive): the folder found or made once; multipart at 5 MiB and
  below with the metadata and the bytes; resumable above, and a dropped connection resumed;
  list (ours only, newest first, sizes as numbers); download as a File; delete (404 fine); prune
  keeps 7 and never deletes a foreign or untagged file; 401 → refresh once → success; 401 twice
  → `signIn`; offline; quota; the folder deleted mid-run.
- `drive.test.ts` (fake Drive, fake plugin, real settings repository): connect stores the
  account; notConfigured / cancelled / unavailable / unknown; disconnect; after an automatic
  backup and after Back up now, upload when connected, nothing when not; failures kept as the
  status and retried at the next check (offline then back online); a retry makes no second
  upload when a file was written in the same check; nothing before setup, during a restore or
  after an erase; Upload now; open a listed copy; never rejects.
- `driveLoad.test.ts`: nothing fetched on the web; built in the Android app.
- `drivePlugin.test.ts`: the contract's methods and codes.
- `DriveCard.test.tsx`: no card on the web; Connect (account shown), the notConfigured message;
  last upload and the problem line; Upload now; the list with Restore through the restore
  sheet's check and question; Disconnect.
- `RestoreFromDrive.test.tsx` and Welcome: the button only with the service; connect, list,
  Restore goes through the same check; notConfigured message.
- `settingsSchema.test.ts`, `hash.test.ts`: the device state's reader and default; kept out of
  the backup and its hash.
- `auto.test.ts`: `onChecked` gets the written backup, and null after a check that wrote none.

Compare checklist (filled after the rewrite; reopened `DriveCloudBackupClient.kt`,
`CloudBackupCoordinator.kt`, `ReturningUser.kt` and the client's JVM test):
- [x] Every Drive request carries the bearer token; a failed request is a failure, never "no
  backup" (`src/services/backup/driveClient.test.ts > the Drive client: tokens (P15-04) > refreshes
  the token once on a 401 and repeats the request (ACC-M16-3)`; `src/services/backup/drive.test.ts
  > Google Drive copies: the list and restoring from it (P15-04) > says why the list could not be
  read`; `src/features/settings/data/DriveCard.test.tsx > DriveCard (P15-04) > says when the list
  cannot be read`)
- [x] Upload with a known length (a Blob body), the backup as `application/zip`
  (`driveClient.test.ts > the Drive client: uploads (P15-04) > sends a backup of 5 MiB or less in
  one multipart request, tagged as a backup (ACC-M16-1)`, `> sends a larger backup through a
  resumable session (ACC-M16-1)`, `> asks a resumable session how far it got after the connection
  dropped, then sends the rest`)
- [x] Download of a backup by id (`driveClient.test.ts > the Drive client: listing, downloading,
  deleting and keeping 7 (P15-04) > downloads a backup as a File named after it`, `> says a backup
  deleted in Drive is missing`)
- [x] Delete tolerates a file already gone (404) (`driveClient.test.ts > … > deletes a file, and one
  already gone is fine`)
- [x] One backup operation at a time (`drive.test.ts > Google Drive copies: uploads (P15-04,
  D-16.97) > runs one upload at a time, in the order they were asked for`)
- [x] Erase vs a running upload (R06.5): nothing sent or recorded for a backup made before the
  erase, nothing recorded for one erased while it went up (`drive.test.ts > … > neither sends nor
  records a backup made before everything was erased (R06.5)`)
- [x] Sign-out / disable leaves the Drive files in place and forgets the session
  (`drive.test.ts > Google Drive copies: connecting (P15-04) > disconnects: signs out of Google,
  forgets the account and leaves the copies in Drive`; `DriveCard.test.tsx > DriveCard (P15-04) >
  disconnects and says the backups stay in Google Drive`)
- [x] Sign-in only when the person asks (Connect, or Restore from Google Drive on Welcome); nothing
  asked at install (`src/features/onboarding/RestoreFromDrive.test.tsx > RestoreFromDrive on
  Welcome (P15-04) > is offered next to the backup file in the Android app, asking Google nothing
  yet`; `src/services/backup/driveLoad.test.ts > loadDriveBackup (P15-04, D-16.97) > fetches the
  module and builds the service inside the Android app`)
- [x] Welcome-back restore: sign in, find the backups, confirm before replacing; "no backup",
  "unreachable" and "not a backup" each say so; Try again goes back (`RestoreFromDrive.test.tsx >
  … > connects, lists the Drive backups and restores the one picked through the same check and
  question (ACC-M16-4)`, `> says when the Drive holds no backups, and Back returns to Welcome`, `>
  after a refused file, Try again returns to the Drive list`, `> says when a backup could not be
  downloaded`)
- [x] A misconfigured OAuth client says so (the reference's docs list the console steps; ours say it
  on the card and in docs/user/backup.md) (`DriveCard.test.tsx > … > says plainly when this copy
  of Platewise is not registered with Google (ACC-M16-5)`; `RestoreFromDrive.test.tsx > … > says
  plainly when this copy of Platewise is not registered with Google`)
- [x] Ours only: keep this phone's 7 and never touch another phone's copies or another file
  (`drive.test.ts > … > keeps this phone’s newest 7 copies and never deletes a file it did not
  make (ACC-M16-2)`, `> a new phone’s uploads never push out the old phone’s copies (ACC-M16-2)`,
  `> makes this install’s id once, keeps it through Disconnect, and stamps every copy with it`;
  `driveClient.test.ts > … > keeps this phone’s newest 7 and never deletes another phone’s copies
  or a file it did not make (ACC-M16-2)`, `> lists only the backups it made, newest first, across
  pages`; `DriveCard.test.tsx > … > Upload now sends a backup and lists it with its date, size,
  This phone and Restore`); request deadlines (`driveClient.test.ts > the Drive client: requests
  that get no answer (P15-04) > gives up on a small call after 30 s, as a plain failure`, `> gives
  up on an upload piece or a download after 120 s, as a plain failure`; `drive.test.ts > … >
  counts an upload that gets no answer in 120 s as a plain failure, retried next start`); pieces
  of 8 MiB (`driveClient.test.ts > … > sends a backup larger than one piece in pieces of 8 MiB`); the folder made once (`driveClient.test.ts > the
  Drive client: the folder (P15-04) > *`); failures shown and retried (`drive.test.ts > Google
  Drive copies: failures and retries (P15-04) > *`; `DriveCard.test.tsx > … > shows the last
  upload and why the last one failed (%s, ACC-M16-3)`); the hook into both backups
  (`drive.test.ts > … > copies a backup made by Back up now into Drive, and lists it (ACC-M16-1)`,
  `> copies the file an automatic backup wrote, without making another (onChecked, ACC-M16-1)`;
  `src/services/backup/auto.test.ts > automatic backup: triggers and the card (P14-01) > tells the
  Google Drive copy after each check that ran: the backup it wrote, or none (P15-04)`;
  `DriveCard.test.tsx > … > copies a backup made with Back up now to Google Drive (ACC-M16-1)`);
  device state out of backups (`src/services/backup/hash.test.ts > contentHash > keeps this
  device’s Google Drive connection out of the hash (P15-04)`, `backup.test.ts > makeBackup >
  leaves this device’s Google Drive connection out of the file (P15-04)`, `restore.test.ts >
  inspectBackup and applyBackup > keeps this device’s Google Drive connection through a restore
  (P15-04)`); the web shows nothing (`DriveCard.test.tsx > … > draws nothing on the web, where
  there is no Google Drive backup (ACC-M16-5)`, `RestoreFromDrive.test.tsx > … > is not offered
  on the web (ACC-M16-5)`, `driveLoad.test.ts > … > fetches nothing and builds nothing on the web,
  where there is no Capacitor bridge (ACC-M16-5)`)
- Gaps found on reopening: the reference reads the account's email itself when Google gives none
  (it asks for an email scope); ours reads it from Drive's `about` (allowed under `drive.file`, no
  extra scope) (`drive.test.ts > … > reads the account from Drive when Google signed in without
  naming it`). The reference's HTTP timeouts (30 s connect, 120 s read and write) became our own
  deadlines per request (30 s small calls, 120 s per upload piece and per download).
- Deliberate differences: `drive.file` and a visible folder with up to 7 dated copies instead of
  the hidden app-data space with one file overwritten; uploads after each backup instead of on
  going to the background, on Wi-Fi, every 15 minutes, skipped when unchanged; failures shown and
  retried instead of silent; the email from the plugin or Drive's `about` instead of an email
  scope; Restore asks first (R06.8); Connect uploads nothing by itself.
- Not taken: the account picker of the reference (Google's screen picks the account), the
  "Restore backup? / Keep this phone" question when turning backup on (connecting changes no
  data here), Delete cloud backup (the copies are ordinary files in the person's Drive), revoking
  the token over HTTP (the plugin's `signOut` does it).

## Decisions for the lead

- **Plugin name `Drive`**, matching S1's `@CapacitorPlugin(name = "Drive")` (seen read-only in
  `/root/wt/wt-p15s1`); `src/services/backup/driveNative.ts` holds it as `DRIVE_PLUGIN_NAME`.
- **The retry runs from the automatic backup's check** (`AutoBackupDeps.onChecked`, a few lines
  in P14's `auto.ts`): the check hands over the backup it wrote (uploaded instead of making a
  second one) or null (then a copy still owed is made fresh and sent). This orders the two at
  start and on return, so no start makes two backups. Without the automatic backup service (it
  always exists in the Android app) nothing retries.
- **Silent sign-in failures:** `cancelled` / `notConfigured` → "connect again"; `unavailable` /
  `unknown` → a plain failure, retried; any of them while `navigator.onLine` is false → offline.
  A retry checks the connection and the token before making a backup, so an offline phone does not
  build a ZIP at every return.
- **Upload now and a retry count as "Last backup"** (`backup.lastAt`): a backup was made and kept,
  like Back up now. So they also push the next automatic local backup a day (or week) on.
- **Keep 7 per install (the lead's decision):** each copy carries this install's id
  (`appProperties.platewiseInstall`, a UUID kept in `backup.drive.installId`, device state out of
  backups); pruning counts only this install's copies. Other installs' copies, and copies without
  an install, are listed (this phone's are marked "This phone") and restorable, never pruned. The
  id survives Disconnect; Erase everything wipes it, so copies made before an erase are never
  pruned automatically afterwards.
- **Request deadlines (the lead's decision):** 30 s for folder, list, about and delete, 120 s per
  upload request, per 8 MiB resumable piece and per download (the body read included), through
  an `AbortController`; a late request is a plain `failed`, shown and retried. To keep each piece
  inside 120 s the resumable upload now goes in 8 MiB pieces instead of one PUT (about 70 s per
  piece at 1 Mbit/s). A piece answered without a readable `Range` header is taken as arrived whole
  (a device check: whether Drive's upload server exposes `Range` to the page).
- **Acceptance rows (landed as M16, the inventory's cloud backup feature, now P1 on Android):**
  - ACC-M16-1 In the Android app, with Google Drive connected, each automatic backup and Back up
    now is also uploaded to "Platewise backups" in Drive (multipart up to 5 MiB, resumable above).
  - ACC-M16-2 Only the newest 7 copies this phone made are kept; copies from another phone and
    other files are never deleted.
  - ACC-M16-3 A failed upload (offline, sign-in, a full Drive) says why on the card and is retried
    at the next start or return, never blocking the app or the local backup; a refused token is
    refreshed once.
  - ACC-M16-4 A Drive copy restores through the same check and question, from Settings and from
    Welcome.
  - ACC-M16-5 Connect on a copy not registered with Google says so plainly and points to
    docs/user/backup.md; the web app shows no Drive card or Welcome option and loads none of its
    code.

## Status

Done (2026-10-28). Lines outside the task's files: `src/services/backup/auto.ts` and
`auto.test.ts` (the `onChecked` hook and its test, shared with P14), `src/services/backup/hash.ts`
(`backup.drive` in `LOCAL_SETTINGS`) and the `backup.test.ts` / `restore.test.ts` /
`hash.test.ts` additions, `src/features/onboarding/WizardPage.tsx` (passes the new Welcome prop).
Handed on: S1's native plugin is coded to the same contract and name; only a device can check the
Google sign-in, the CORS answers of Drive's upload server (the resumable session's `Location`) and
a real OAuth client.
