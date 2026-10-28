import type { MessageTree } from '../catalogue';

/**
 * Words of Settings › Your data (src/features/settings/data, P09-15): the page's own cards, the
 * Storage card, Clear diary and Erase everything with their questions. The two storage nudges
 * Home shows (`storageNudge`), the Backup card and the diary-file sheets keep their own words
 * (`backup`, `transfer`).
 */
export const data = {
  data: {
    page: {
      title: 'Your data',
      unavailable: "This page can't be shown right now.",
    },
    file: {
      heading: 'Diary file',
      exportHint: 'Save your diary as JSON, Markdown or CSV.',
      importHint: 'Bring back a diary file saved by Platewise.',
    },
    storage: {
      heading: 'Storage',
      photos: 'Photos',
      thumbs: 'Thumbnails',
      used: 'Used on this device',
      usedOf: '{used} of {quota}',
      persistence: 'Kept by the browser',
      persistent: 'Yes',
      bestEffort: 'Not guaranteed',
      unknown: 'Unknown',
      unavailable: 'Not available',
      measuring: '…',
      atRisk:
        'This browser may clear Platewise’s data when space runs low or the app goes unused. Installing Platewise and backing up now and then keeps your diary safe.',
      clearCache: 'Clear cache',
      cleared: 'Cache cleared',
      footer:
        'Clear cache removes the small thumbnails only. They are made again when needed; your photos stay.',
    },
    reset: {
      heading: 'Start over',
    },
    clear: {
      row: 'Clear diary',
      hint: 'Removes every diary entry. Saved meals, weights, water, fasts, your profile and settings stay.',
      title: 'Clear your diary?',
      message:
        'Every diary entry, and every photo only an entry used, will be removed. Saved meals, weights, water, fasts, your profile and settings stay. This can’t be undone.',
      confirm: 'Clear',
      done: 'Diary cleared',
      failed: 'The diary couldn’t be cleared. Nothing was removed.',
    },
    erase: {
      row: 'Erase everything',
      hint: 'Deletes all your data on this device, API keys included, and starts again.',
      title: 'Erase everything?',
      message:
        'Your diary, photos, saved meals, weights, water, fasts, Coach chat, settings and API keys will be deleted from this device, and Platewise starts again from the beginning. Backup files you saved stay where they are. This can’t be undone.',
      confirm: 'Erase',
      blocked: 'Platewise is open in another tab. Close it there to finish erasing.',
      failed: 'Not everything could be erased. Reload Platewise and try again.',
      reload: 'Reload',
    },
  },
} as const satisfies MessageTree;
