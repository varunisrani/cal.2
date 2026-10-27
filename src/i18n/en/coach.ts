import type { MessageTree } from '../catalogue';

/**
 * Words of the Coach tab (src/features/coach). The chips are questions a tap sends as the
 * person's own message, four per goal (P08-12); the copy words belong to the button on each
 * reply (P08-13); `photoOnly` is the question a photo sent without words carries (P08-09). The
 * page's other words join this partition with P08-10.
 */
export const coach = {
  coach: {
    chips: {
      label: 'Suggested questions',
      lose: {
        projection: 'Project my weight 30 days ahead',
        faster: 'Is there a safe way to speed up my loss?',
        intake: 'Is my intake too high for my goal?',
        dinner: 'Suggest a dinner that fits my day',
      },
      gain: {
        projection: 'Project my weight 30 days ahead',
        healthy: 'Help me gain weight in a healthy way',
        intake: 'Is my intake high enough to gain?',
        protein: 'Which foods would raise my protein?',
      },
      maintain: {
        stable: 'Has my weight stayed stable lately?',
        average: 'How much do I eat on an average day?',
        macros: 'How could I balance my macros better?',
        trend: 'Which way is my weight trending?',
      },
    },
    /** Stored and sent as the question when a photo goes without words (P08-09). */
    photoOnly: 'Have a look at this photo.',
    copy: {
      label: 'Copy reply',
      done: 'Reply copied',
      failed: "Couldn't copy the reply",
    },
  },
} as const satisfies MessageTree;
