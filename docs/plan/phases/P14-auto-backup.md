# P14 · Automatic backup in the Android app

**Weeks:** 0.5 · **Tracks:** backup service, native files, Settings › Your data · **Depends on:** P00–P13 · **Status:** 📋 planned (2026-10-28, at the owner's request)

## Goal

The owner asked (2026-10-28) for automatic backup. Today a backup is a file the person makes by hand (Settings › Your data › Back up now); Android's cloud backup is off for Platewise (P11-01), so uninstalling the app or clearing its data loses everything not backed up. P14 makes the Android app save a full backup by itself, into a folder that survives uninstalling, and keeps the last few.

## Decisions

- **D-16.95** Automatic backup (Android app): on by default; Daily (default) or Weekly; runs when the app starts or comes back to the front and a backup is due (the app cannot run while closed: the data lives in the WebView); writes the same ZIP as Back up now (`platewise-backup-YYYY-MM-DD-HHmm.zip`) into the public `Documents/Platewise/` folder through `@capacitor/filesystem` 7.x, which survives uninstalling and which Files or Google Drive can reach; keeps the newest 7 automatic backups and deletes older ones it wrote (never a file it did not write); a failed run (no space, no permission) shows on the page and never blocks the app; "Last backup" and the 14-day nudge count automatic backups. Settings › Your data lists the automatic backups this install wrote, each with its date, size and Restore (the existing restore check and confirmation). The web app keeps manual backups only (a browser cannot write a file silently). Backups stay unencrypted, as today.

- **Keyboard (the owner, 2026-10-28):** in the Android app the keyboard covered the Coach composer: the activity had no
  `windowSoftInputMode` and, edge-to-edge on API 35, the WebView was never resized. P14 resizes it natively above the
  keyboard (IME insets), hides the tab bar while the keyboard is open, and keeps focused sheet fields visible.

## Tasks (3)

| ID | Task | Verify |
|---|---|---|
| P14-01 | **Auto backup service and native files.** `@capacitor/filesystem` (7.x, exact), a files port with a native adapter (lazy, Android only) and a fake; the schedule (due check from the last backup and the frequency, on start and on return to the front, one run at a time); write, list, prune to 7, read back for restore; Android 8–9 storage permission (`WRITE_EXTERNAL_STORAGE` with maxSdkVersion 28), none from Android 10. | unit tests with the fake: due/not due, daily/weekly, prune keeps 7 and never touches other files, a failure is reported and retried next time, restore from a listed file goes through the existing check. |
| P14-02 | **Settings › Your data.** An Automatic backup card (Android only): switch, Daily/Weekly, last automatic backup, the folder, the list with Restore, a failure line. Strings through i18n, hooks, accessible names. Docs: `docs/user/backup.md` and `android.md`, CHANGELOG 1.2.0 (unreleased). | unit tests for the card; the web shows no card; a11y in both themes. |
| P14-03 | **Keyboard above the composer.** `adjustResize` and an IME insets listener in MainActivity; a keyboard-open hook that hides the tab bar and + button; focused sheet fields kept in view. | e2e with a shrunk viewport: the composer and the manual entry field stay fully visible, the tab bar hides and returns; the APK builds. |
