import type { MessageTree } from '../catalogue';

/**
 * Words of the add menu (src/features/log/AddMenu.tsx): the default groups' names, the label a
 * group with a blank name shows, and one label per logging method. The "+" button's own name is
 * Home's (`home.add.label`).
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
  },
} as const satisfies MessageTree;
