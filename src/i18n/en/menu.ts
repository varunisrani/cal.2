import type { MessageTree } from '../catalogue';

/**
 * Words of the add menu (src/features/log/AddMenu.tsx): the default groups' names, the label a
 * group with a blank name shows, one label per logging method, and the water, fasting and walk
 * rows under the food. The "+" button's own name is Home's (`home.add.label`).
 */
export const menu = {
  menu: {
    group: {
      snapScan: 'Snap & scan',
      describe: 'Describe',
      reuse: 'Reuse',
      unnamed: 'Group',
    },
    method: {
      camera: 'Camera',
      library: 'Photo library',
      barcode: 'Barcode',
      describe: 'Describe',
      manual: 'Enter manually',
      recent: 'Recent',
      often: 'Often eaten',
      saved: 'Saved',
      copyDay: 'Copy a day',
    },
    // The trackers' rows under the food (P07-08); the water page's own words are `trackers.water`.
    tracker: {
      water: 'Water',
      startFast: 'Start fast',
      fasting: 'Fasting',
      endFast: 'End fast',
      cancelFast: 'Cancel fast',
      gone: 'That fast had already ended, so nothing changed.',
      failed: "The fast couldn't be changed. Please try again.",
      // P15: the walk recorder, in the Android app only.
      walk: 'Walk',
      backToWalk: 'Back to your walk',
    },
  },
} as const satisfies MessageTree;
