import type { MessageTree } from '../catalogue';

/** Words every area shares: the app name, the tab names and the generic buttons. */
export const common = {
  common: {
    appName: 'Platewise',
    tabs: {
      home: 'Home',
      progress: 'Progress',
      coach: 'Coach',
      settings: 'Settings',
    },
    save: 'Save',
    cancel: 'Cancel',
    done: 'Done',
    delete: 'Delete',
    back: 'Back',
    retry: 'Retry',
    close: 'Close',
    edit: 'Edit',
    add: 'Add',
    // Built-in words of the UI primitives (src/ui): the stepper buttons and the date-time inputs.
    decrease: 'Decrease {name}',
    increase: 'Increase {name}',
    date: 'Date',
    time: 'Time',
  },
} as const satisfies MessageTree;
