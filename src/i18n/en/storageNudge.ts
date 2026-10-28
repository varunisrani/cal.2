import type { MessageTree } from '../catalogue';

/**
 * Words of the two storage nudges Home shows (src/features/settings/data/StorageNudge.tsx,
 * P09-15): keep your diary safe, and time for a backup. They come with the app; the rest of
 * Settings › Your data (`data`) is fetched with Settings (P18-00).
 */
export const storageNudge = {
  data: {
    nudge: {
      keepSafe: {
        title: 'Keep your diary safe',
        install:
          'Your diary is stored only in this browser, which may clear it. Install Platewise and make a backup now and then.',
        backUp:
          'This browser may clear Platewise’s data when space runs low. Make a backup now and then to keep your diary safe.',
      },
      backupDue: {
        title: 'Time for a backup',
        last: 'Your last backup was {days, plural, one {# day} other {# days}} ago.',
        never:
          'You haven’t made a backup yet. A backup file keeps your diary if this browser clears it.',
      },
      open: 'Back up',
      later: 'Not now',
    },
  },
} as const satisfies MessageTree;
