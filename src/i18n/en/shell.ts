import type { MessageTree } from '../catalogue';

/** The shell's own words: the start-up skeleton, the tab bar, recovery and crash cards. */
export const shell = {
  shell: {
    loading: 'Loading',
    tabs: 'Tabs',
    reload: 'Reload',
    startOver: 'Set up again',
    problem: {
      newerData: {
        title: 'Update needed',
        body: 'Your data was saved by a newer version of Platewise. Reload to get it.',
      },
      upgradeFailed: {
        title: 'Your data could not be updated',
        body: 'Platewise could not bring your data up to date. Nothing was deleted; reload to try again.',
      },
      noStorage: {
        title: 'Storage is turned off',
        body: 'This browser is not letting Platewise keep data here. Private windows often block it; try a normal window.',
      },
      openFailed: {
        title: 'Your data could not be opened',
        body: 'Something stopped Platewise from opening its storage. Nothing was deleted; reload to try again.',
      },
      readFailed: {
        title: 'Your data could not be read',
        body: 'Platewise could not read its storage just now. Nothing was deleted; reload to try again.',
      },
      profileUnreadable: {
        title: 'Your profile could not be read',
        body: 'The saved profile is damaged, so it was set aside. Your diary is untouched. You can set up a new profile.',
      },
    },
    crash: {
      title: 'Something went wrong',
      body: 'Platewise ran into a problem it could not get past. Reloading usually fixes it, and your data stays on this device.',
    },
  },
} as const satisfies MessageTree;
