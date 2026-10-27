import type { MessageTree } from '../catalogue';

/**
 * Words of the backup section and the restore sheet (src/features/settings/data, P09-13): the
 * last backup line, Back up now and its problems, and every step and refusal of a restore.
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
  },
} as const satisfies MessageTree;
