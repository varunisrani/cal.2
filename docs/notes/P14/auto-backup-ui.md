# Task: the Automatic backup card in Settings › Your data (P14-02) · Phase: 14 · Owner: builder (wt-p14s1)

<!-- Save as platewise/docs/notes/P<nn>/<slug>.md. Write everything above "Compare checklist"
BEFORE writing code, in your own words. Never paste or paraphrase the reference line by line. -->

Read (reference @ `10e14b67`): `android/.../backup/CloudBackupCoordinator.kt` (the state the
backup section draws: on or off, the last backup, the account, busy, a message) and
`android/.../ui/settings/SettingsScreen.kt` (how its errors show), behaviour only; the research
spec `06-settings-data.md` §3.17 (the UI order of the backup section). Ours: the P14 phase file
(D-16.95), `src/features/settings/data/{DataPage,BackupSection,RestoreSheet,StorageCard}.tsx` and
their tests, `src/features/settings/health/HealthPage.tsx` (an Android-only page over a service
with `subscribe`/`getSnapshot`), `src/ui/{Switch,Segmented,Button,Card}.tsx`, the orange
redesign's tokens, `src/i18n/en/backup.ts`. No REA evidence for this task.

What it does (own words): in the Android app, Settings › Your data shows an "Automatic backup"
card under the Backup card. It has the switch (on by default), Daily or Weekly, the time of the
last automatic backup (or that there is none yet), where the files are (Documents › Platewise on
the phone; they stay after uninstalling; the newest 7 are kept), "Backing up…" while one is being
written, the list of the automatic backups this install wrote that are still in the folder (date
and time, size, Restore), and, when the last try failed, one line saying why and what to do. Restore
reads that file and opens the same restore sheet as Restore from a file: the same check, the same
summary and the same question before anything is replaced. On the web (no Android app) the card is
not drawn at all. Everything shown waits for the stored values (R06.22).

Inputs → outputs:
- `AutoBackupCard` (no props): `services.autoBackup` (absent → nothing); `useSettings(['backup.auto',
  'backup.autoEvery', 'backup.autoState'])`; the service's snapshot (`running`, `files`) through
  `useSyncExternalStore`; `refresh()` on mount.
- Its own sheet id `backup-restore-listed`, so it never opens alongside the Backup card's restore
  sheet; the file read by `open(name)` goes to `RestoreSheet`.
- Hooks: `data.autoBackup` (the card), `.switch`, `.every` (`.daily` / `.weekly` from the
  segmented control), `.last`, `.where`, `.running`, `.list`, `.restore` (one per row), `.problem`.
- Words: `backup.auto.*` in `src/i18n/en/backup.ts`.

Files: created `src/features/settings/data/AutoBackupCard.tsx` and its test, `autoBackup.module.css`;
changed `DataPage.tsx` (the card after the Backup card), `src/i18n/en/backup.ts` (`backup.auto`).
The card's test builds its own service over the fake folder and the real backup service. Docs:
`docs/user/backup.md` (Automatic backup (Android app)), `docs/user/android.md` (a line under
Privacy), `CHANGELOG.md` (Unreleased (1.2.0)).

Edge cases / failure modes:
- The settings not read yet: nothing of the card's state is drawn (no flash of "No automatic backup
  yet").
- Switch off: Daily/Weekly is disabled (the choice stays), the list and Restore stay (the files are
  still there).
- A file that can no longer be read (deleted in Files after the list was drawn): a toast, and the
  list is read again.
- A save of the switch or the frequency that fails: a toast, the control shows the stored value.
- Several rows: each Restore button has its own accessible name with the backup's date and time.
- The failure line is a status (`role="status"`), not an alert: it is there when the page opens,
  not news.

Our design differences / decisions:
- The reference has a cloud backup section (switch, account, last backup, buttons). Ours is a
  local folder: no account, a list of files with Restore, the folder's place, and a failure line
  with what to do (D-16.95).
- Daily / Weekly as a segmented control under the switch.

Tests we will write (`AutoBackupCard.test.tsx`, over the real backup service on the screen
harness's database and the fake folder):
- the web (no service): no card, and the Data page still draws;
- Android: the switch (on), Daily selected, no automatic backup yet, where the files are;
- turning off and choosing Weekly store the settings (Weekly disabled while off);
- the list (newest first, date and size), Restore opens the restore sheet on that file, which
  checks it and asks before replacing anything;
- the failure line for each problem, gone after a success;
- "Backing up…" while a run is in flight.

Compare checklist (filled after the rewrite; reopened `CloudBackupCoordinator.kt` (its UI state) and
`SettingsScreen.kt` (the backup section's errors)):
- [x] A switch that turns automatic backup on and off (`src/features/settings/data/AutoBackupCard.test.tsx
  > AutoBackupCard (P14-02) > turns automatic backup off and on, and keeps Daily or Weekly`)
- [x] The last backup's time (`AutoBackupCard.test.tsx > AutoBackupCard (P14-02) > shows the switch
  on, Daily, no automatic backup yet and where the files go (ACC-K3-3)`; `> lists this install’s
  automatic backups, newest first, with their date and size (ACC-K3-6)`)
- [x] Busy while a backup runs (`AutoBackupCard.test.tsx > AutoBackupCard (P14-02) > says it is
  backing up while a run is in flight, then shows the new backup`)
- [x] Errors shown (the reference: a dialog; ours: a status line with what to do, and toasts)
  (`AutoBackupCard.test.tsx > AutoBackupCard (P14-02) > says why the last automatic backup failed
  and what to do (%s, ACC-K3-5)`; `> says so when a listed file can no longer be opened`; `> says
  when a setting could not be saved`)
- [x] Restore goes through the check and the question (the reference restores without asking,
  R06.8) (`AutoBackupCard.test.tsx > AutoBackupCard (P14-02) > restores a listed backup through the
  restore sheet’s check and question (ACC-K3-6)`)
- [x] Only in the Android app (`AutoBackupCard.test.tsx > AutoBackupCard (P14-02) > draws nothing on
  the web, where there is no automatic backup`; `src/services/backup/autoLoad.test.ts >
  loadAutoBackup (P14-01, D-16.95) > fetches nothing and builds nothing on the web, where there is
  no Capacitor bridge`)
- Gaps found on reopening: none beyond the deliberate ones.
- Deliberate differences: no account rows, no Back up now / Restore now / Delete cloud backup
  buttons in this card (Back up now and Restore from a file stay in the Backup card above); a list
  of files instead.
- Not taken: the cloud account's sign-in, sign-out and switch account.

## Decisions for the lead

- The card sits right under the Backup card on Your data.
- The failure line is a status, not an alert.
- Each row's Restore is named "Restore the backup from <date and time>" for assistive tech.

## Status

Done (2026-10-28). Lines outside the task's files: none for this half.
