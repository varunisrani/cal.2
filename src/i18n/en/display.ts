import type { MessageTree } from '../catalogue';

/** Words the display primitives show on their own (src/ui: Menu, SwipeRow). */
export const display = {
  display: {
    menu: {
      back: 'Back',
    },
    swipeRow: {
      delete: 'Delete',
    },
  },
} as const satisfies MessageTree;
