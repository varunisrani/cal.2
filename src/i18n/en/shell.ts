import type { MessageTree } from '../catalogue';

/**
 * Words of the app shell (src/app): the tab bar's name, the start-up skeleton, the card shown
 * when the stored data cannot be opened and the card shown after a crash. The tab names
 * themselves are shared words, in `common.tabs`.
 */
export const shell = {
  shell: {
    tabBar: {
      label: 'Sections',
    },
    loading: 'Opening your diary',
    recovery: {
      title: "Your data can't be opened",
      body: 'Nothing has been deleted: your diary is still in this browser. Close any other Platewise tabs or windows, then reload.',
      reload: 'Reload',
    },
    crash: {
      title: 'Something went wrong',
      body: 'Platewise ran into a problem it could not recover from. Your diary is safe on this device. Reload to carry on.',
      reload: 'Reload',
    },
  },
} as const satisfies MessageTree;
