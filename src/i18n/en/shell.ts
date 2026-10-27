import type { MessageTree } from '../catalogue';

/**
 * Words of the app shell (src/app): the tab bar's name, the start-up skeleton, the card shown
 * when the stored data cannot be opened and the card shown after a crash. The tab names
 * themselves are shared words, in `common.tabs`. Also the update banner and the install card
 * (P09-17, P09-18), and the notice that some saved data could not be read (K9).
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
    update: {
      title: 'Update ready',
      body: 'A new version of Platewise is ready. Reload when it suits you.',
      reload: 'Reload',
    },
    install: {
      title: 'Install Platewise',
      body: 'Add it to your home screen to open it like an app, even offline.',
      install: 'Install',
      later: 'Not now',
      iosBody: 'In Safari, tap Share, then Add to Home Screen.',
      gotIt: 'Got it',
    },
    damagedData: {
      title: 'Some saved data could not be read',
      body: 'It was kept aside on this device, not deleted. The rest of your data shows as usual.',
      dismiss: 'Dismiss',
    },
  },
} as const satisfies MessageTree;
