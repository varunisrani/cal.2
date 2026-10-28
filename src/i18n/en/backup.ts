import type { MessageTree } from '../catalogue';

/**
 * Words of the backup section and the restore sheet (src/features/settings/data, P09-13): the
 * last backup line, Back up now and its problems, and every step and refusal of a restore; and
 * the Android app's Automatic backup card (P14-02) and Google Drive card (P15-04).
 */
export const backup = {
  backup: {
    heading: 'Backup',
    intro:
      'One file with your diary, photos, saved meals, weights, water, fasts, Coach chat and settings. Your API keys are never in it.',
    when: '{day} at {time}',
    lastAt: 'Last backup: {when}',
    never: 'No backup yet',
    now: 'Back up now',
    ready: 'Your backup file is ready.',
    save: 'Save backup file',
    saved: 'Backup saved',
    restore: 'Restore from a file',
    problem: {
      photoUnreadable: "A photo couldn't be read, so no backup was made. Please try again.",
      tooLarge: 'There is too much to fit in one backup file.',
      insecure: 'Backups need a secure (https) address.',
      failed: "The backup couldn't be made. Please try again.",
    },
    restoreSheet: {
      title: 'Restore backup',
      checking: 'Checking the file…',
      madeAt: 'Backup from {when}',
      entries: '{count, plural, one {# diary entry} other {# diary entries}}',
      photos: '{count, plural, one {# photo} other {# photos}}',
      messages: '{count, plural, one {# Coach message} other {# Coach messages}}',
      replaces:
        'Restoring replaces everything on this device: your diary, photos, saved meals, weights, water, fasts, Coach chat and settings. Your API keys stay as they are.',
      confirm: 'Restore',
      restoring: 'Restoring your backup…',
      done: 'Your backup is restored.',
      problem: {
        notBackup: "This file isn't a Platewise backup.",
        damaged: 'This backup file is damaged. Nothing was changed.',
        newer: 'This backup needs a newer Platewise. Nothing was changed.',
        noSpace:
          "There isn't enough storage on this device to restore this backup. Nothing was changed.",
        insecure: 'Restoring needs a secure (https) address.',
        failed: "The restore couldn't finish. Nothing was changed.",
      },
    },
    // The Automatic backup card, in the Android app only (P14-02, D-16.95).
    auto: {
      heading: 'Automatic backup',
      switch: 'Back up automatically',
      switchHint: 'When you open Platewise and a backup is due, it saves one on this phone.',
      every: 'How often',
      daily: 'Daily',
      weekly: 'Weekly',
      lastAt: 'Last automatic backup: {when}',
      never: 'No automatic backup yet',
      where:
        'Saved in Documents › Platewise on this phone, where Files and Google Drive can reach them. They stay if you uninstall Platewise. The newest 7 are kept.',
      running: 'Backing up…',
      list: 'Automatic backups',
      restore: 'Restore',
      restoreLabel: 'Restore the backup from {when}',
      openFailed: "This backup file couldn't be opened. It may have been moved or deleted.",
      saveFailed: "The setting couldn't be saved. Please try again.",
      problem: {
        noSpace:
          'The last automatic backup failed: this phone is out of storage. Free up some space; Platewise tries again the next time you open it.',
        denied:
          'The last automatic backup failed: Platewise may not save files on this phone. Allow storage for Platewise in Android Settings › Apps › Platewise › Permissions; it tries again the next time you open it.',
        photoUnreadable:
          "The last automatic backup failed: a photo couldn't be read. Platewise tries again the next time you open it.",
        tooLarge:
          'The last automatic backup failed: there is too much to fit in one backup file. Export your diary below to keep a copy of your entries.',
        failed:
          "The last automatic backup couldn't be saved. Platewise tries again the next time you open it.",
      },
    },
    // The Google Drive card, in the Android app only (P15-04, D-16.97); Welcome's Drive restore
    // reuses its words.
    drive: {
      heading: 'Google Drive',
      intro:
        'Each backup is also copied to a Platewise backups folder in your Google Drive. Platewise sees only the files it made there. It keeps the newest 7 from this phone and never deletes another phone’s.',
      connect: 'Connect Google Drive',
      connecting: 'Connecting…',
      account: 'Connected as {email}',
      connected: 'Connected',
      lastUploadAt: 'Last upload: {when}',
      never: 'No upload yet',
      uploading: 'Uploading…',
      uploadNow: 'Upload now',
      list: 'Backups in Google Drive',
      empty: 'No backups in your Google Drive yet.',
      restore: 'Restore',
      restoreLabel: 'Restore the Google Drive backup from {when}',
      thisPhone: 'This phone',
      downloading: 'Downloading the backup…',
      reconnect: 'Connect again',
      disconnect: 'Disconnect',
      disconnected: 'Google Drive is disconnected. Your backups stay in your Drive.',
      listProblem: "Your backups in Google Drive couldn't be listed. Check your connection.",
      connectProblem: {
        notConfigured:
          "This copy of Platewise isn't registered with Google yet, so it can't use Google Drive. Whoever built it can register it with the steps in docs/user/backup.md (Google Drive).",
        unavailable:
          'Google Drive needs Google Play services, which are missing or out of date on this phone.',
        failed: "Google Drive couldn't be connected. Please try again.",
      },
      problem: {
        offline:
          'The last upload failed: no connection. Platewise tries again the next time you open it.',
        signIn: 'The last upload failed: Google no longer lets Platewise in. Connect again.',
        quota:
          'The last upload failed: your Google Drive is full. Free up space there; Platewise tries again the next time you open it.',
        failed: 'The last upload failed. Platewise tries again the next time you open it.',
      },
      openProblem: {
        offline: "This backup couldn't be downloaded: no connection.",
        signIn: 'Google no longer lets Platewise in. Connect again, then try once more.',
        missing: 'This backup is no longer in your Google Drive.',
        failed: "This backup couldn't be downloaded. Please try again.",
      },
    },
  },
} as const satisfies MessageTree;
